/**
 * ResultViewer3D — Smocking cloth simulation
 *
 * Stability strategy:
 *  1. Pre-deform: stitch vertices start at Y=0 (flat), "excess fabric" between them
 *     gets initial upward Y bias computed from stitch topology → folds go UP, not random
 *  2. XZ-only stitch: pull stitch pairs together in the XZ plane only, Y is free
 *     → excess fabric is forced upward by floor + structural constraints, not twisted
 *  3. Floor friction: when vertex touches Y=0, XZ velocity is damped → table holds base flat
 *  4. Stitch ramp: compliance goes from 1.0→STITCH_C over RAMP_FRAMES → no initial chaos
 *  5. SUBSTEPS=30, TypedArray constraints for speed
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThreeScene } from '../../hooks/useThreeScene';
import { useAppStore } from '../../store/useAppStore';
import type { TiledPattern } from '../../types';

const SUBDIV      = 5;
const SUBSTEPS    = 30;
const GRAVITY     = -1.0;
const VDAMP       = 0.998;
const FLOOR_FRICTION = 0.85;   // XZ velocity multiplier when touching floor (0=frozen, 1=frictionless)
const STRETCH_C   = 1e-5;
const BEND_C      = 1e-3;
const STITCH_C    = 1e-6;      // stiff stitch (closes to 0 distance)
const RAMP_FRAMES = 180;       // 3 s warm-up at 60 fps
const PREDEFORM_H = 0.4;       // initial Y lift for excess fabric between stitches

interface ClothData {
  N: number;
  fineNx: number; fineNy: number;
  pos: Float32Array; prev: Float32Array; w: Float32Array;
  consBuf: Float32Array; nCons: number;
  // XZ-only stitch: stored as [ia, ib] pairs (Int32Array)
  stPairs: Int32Array; nSt: number;
  indices: Uint32Array; colors: Float32Array;
  clothW: number; clothH: number; centerX: number; centerZ: number;
}

// ── Build fine cloth mesh ─────────────────────────────────────────────────────
function buildCloth(pattern: TiledPattern): ClothData {
  const verts  = pattern.vertices;
  const nx     = pattern.tangram.nx;
  const ny     = pattern.tangram.ny;
  const fineNx = (nx - 1) * SUBDIV + 1;
  const fineNy = (ny - 1) * SUBDIV + 1;
  const N      = fineNx * fineNy;

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const v of verts) {
    if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
    if (v.y < minZ) minZ = v.y; if (v.y > maxZ) maxZ = v.y;
  }
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const clothW  = maxX - minX;
  const clothH  = maxZ - minZ;

  // ── Pattern vertex → fine grid index ──────────────────────────────────────
  const p2f = (idx: number) => {
    const v  = verts[idx];
    const gx = Math.round(v.x - minX);
    const gy = Math.round(v.y - minZ);
    return (gy * SUBDIV) * fineNx + (gx * SUBDIV);
  };

  // ── Stitch pairs (XZ-only, so just store index pairs) ─────────────────────
  const rawSt: number[] = [];
  for (const group of pattern.stitchingLines) {
    for (let a = 0; a < group.length - 1; a++) {
      for (let b = a + 1; b < group.length; b++) {
        if (group[a] < verts.length && group[b] < verts.length) {
          rawSt.push(p2f(group[a]), p2f(group[b]));
        }
      }
    }
  }
  const stPairs = new Int32Array(rawSt);
  const nSt     = rawSt.length / 2;

  // ── Pre-compute initial Y bias from stitch topology ────────────────────────
  // Stitch vertices → Y=0. Vertices "between" stitch pairs → Y=PREDEFORM_H.
  const stitchFineSet = new Set<number>(rawSt);
  const initY = new Float32Array(N);  // default 0

  for (let i = 0; i < nSt; i++) {
    const ia = stPairs[i*2], ib = stPairs[i*2+1];
    const fxa = ia % fineNx, fya = (ia / fineNx) | 0;
    const fxb = ib % fineNx, fyb = (ib / fineNx) | 0;
    // Mark vertices on the line segment between ia and ib as "excess fabric"
    const steps = Math.max(Math.abs(fxb - fxa), Math.abs(fyb - fya));
    if (steps < 2) continue;
    for (let t = 1; t < steps; t++) {
      const fx = Math.round(fxa + (fxb - fxa) * t / steps);
      const fy = Math.round(fya + (fyb - fya) * t / steps);
      const fi = fy * fineNx + fx;
      if (!stitchFineSet.has(fi)) {
        // Tent shape: peak in the middle
        const tNorm = t / steps;  // 0..1
        const tent  = Math.sin(tNorm * Math.PI);  // 0→1→0
        initY[fi] = Math.max(initY[fi], PREDEFORM_H * tent);
      }
    }
  }

  // ── Initialize positions ───────────────────────────────────────────────────
  const pos  = new Float32Array(N * 3);
  const prev = new Float32Array(N * 3);
  const w    = new Float32Array(N).fill(1);

  for (let fy = 0; fy < fineNy; fy++) {
    for (let fx = 0; fx < fineNx; fx++) {
      const i  = fy * fineNx + fx;
      const i3 = i * 3;
      pos[i3]     = minX + (fx / (fineNx - 1)) * clothW;
      pos[i3 + 1] = initY[i];   // structured initial bias
      pos[i3 + 2] = minZ + (fy / (fineNy - 1)) * clothH;
      prev[i3] = pos[i3]; prev[i3+1] = pos[i3+1]; prev[i3+2] = pos[i3+2];
    }
  }

  // ── Structural constraints ─────────────────────────────────────────────────
  const rawCons: number[] = [];
  const seen = new Set<number>();
  const addEdge = (a: number, b: number, c: number) => {
    const lo = a < b ? a : b, hi = a < b ? b : a;
    if (seen.has(lo * N + hi)) return;
    seen.add(lo * N + hi);
    const dx = pos[hi*3] - pos[lo*3];
    const dy = pos[hi*3+1] - pos[lo*3+1];
    const dz = pos[hi*3+2] - pos[lo*3+2];
    const r  = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (r < 1e-9) return;
    rawCons.push(lo, hi, r, c);
  };

  for (let fy = 0; fy < fineNy; fy++) {
    for (let fx = 0; fx < fineNx; fx++) {
      const v = fy * fineNx + fx;
      if (fx + 1 < fineNx) addEdge(v, v + 1, STRETCH_C);
      if (fy + 1 < fineNy) addEdge(v, v + fineNx, STRETCH_C);
      if (fx + 1 < fineNx && fy + 1 < fineNy) {
        addEdge(v, v + fineNx + 1, STRETCH_C);
        addEdge(v + 1, v + fineNx, STRETCH_C);
      }
      if (fx + 2 < fineNx) addEdge(v, v + 2, BEND_C);
      if (fy + 2 < fineNy) addEdge(v, v + 2 * fineNx, BEND_C);
    }
  }
  const consBuf = new Float32Array(rawCons);
  const nCons   = rawCons.length / 4;

  // ── Triangle mesh ──────────────────────────────────────────────────────────
  const indices = new Uint32Array((fineNy - 1) * (fineNx - 1) * 6);
  let iPtr = 0;
  for (let fy = 0; fy < fineNy - 1; fy++) {
    for (let fx = 0; fx < fineNx - 1; fx++) {
      const bl = fy * fineNx + fx, br = bl + 1;
      const tl = bl + fineNx,     tr = tl + 1;
      indices[iPtr++]=bl; indices[iPtr++]=br; indices[iPtr++]=tr;
      indices[iPtr++]=bl; indices[iPtr++]=tr; indices[iPtr++]=tl;
    }
  }

  // ── Colors ─────────────────────────────────────────────────────────────────
  const colors = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const i3 = i * 3;
    if (stitchFineSet.has(i)) {
      colors[i3]=0.10; colors[i3+1]=0.45; colors[i3+2]=0.90;  // blue = stitch
    } else if (initY[i] > 0.05) {
      colors[i3]=0.98; colors[i3+1]=0.60; colors[i3+2]=0.30;  // orange = excess/pleat
    } else {
      colors[i3]=0.95; colors[i3+1]=0.45; colors[i3+2]=0.65;  // pink = base
    }
  }

  return { N, fineNx, fineNy, pos, prev, w, consBuf, nCons,
           stPairs, nSt, indices, colors, clothW, clothH, centerX, centerZ };
}

// ── Component ─────────────────────────────────────────────────────────────────
export function ResultViewer3D() {
  const { containerRef, scene, camera, controls } = useThreeScene();
  const { tiledPattern, gary } = useAppStore();

  const garyRef     = useRef(gary);
  useEffect(() => { garyRef.current = gary; }, [gary]);

  const posRef      = useRef<Float32Array | null>(null);
  const prevRef     = useRef<Float32Array | null>(null);
  const wRef        = useRef<Float32Array | null>(null);
  const consBufRef  = useRef(new Float32Array(0));
  const nConsRef    = useRef(0);
  const stPairsRef  = useRef(new Int32Array(0));
  const nStRef      = useRef(0);
  const nRef        = useRef(0);
  const cx0Ref      = useRef(0);
  const cz0Ref      = useRef(0);
  const frameRef    = useRef(0);
  const clothRef    = useRef<THREE.Mesh | null>(null);
  const rafRef      = useRef<number | null>(null);

  // ── Simulation step ────────────────────────────────────────────────────────
  const step = () => {
    const pos  = posRef.current;
    const prev = prevRef.current;
    const w    = wRef.current;
    if (!pos || !prev || !w || nRef.current === 0) return;

    const N    = nRef.current;
    const subDt = (1 / 60) / SUBSTEPS;
    const sd2   = subDt * subDt;

    const frame   = frameRef.current++;
    const ramp    = Math.min(frame / RAMP_FRAMES, 1.0);
    const g       = garyRef.current;
    const doStitch = g < 0.99;
    // Compliance: starts very soft (1.0), ramps to STITCH_C * (1 + g²)
    const stitchC = STITCH_C * (1 + g * g * 500) + (1.0 - ramp) * 1.0;

    const cons   = consBufRef.current;
    const nCons  = nConsRef.current;
    const stPairs = stPairsRef.current;
    const nSt    = nStRef.current;
    const cx0    = cx0Ref.current;
    const cz0    = cz0Ref.current;

    for (let sub = 0; sub < SUBSTEPS; sub++) {
      // 1. Verlet predict
      for (let v = 0; v < N; v++) {
        if (w[v] === 0) continue;
        const v3 = v * 3;
        const vx = (pos[v3]   - prev[v3])   * VDAMP;
        const vy = (pos[v3+1] - prev[v3+1]) * VDAMP;
        const vz = (pos[v3+2] - prev[v3+2]) * VDAMP;
        prev[v3]   = pos[v3];   pos[v3]   += vx;
        prev[v3+1] = pos[v3+1]; pos[v3+1] += vy + GRAVITY * sd2;
        prev[v3+2] = pos[v3+2]; pos[v3+2] += vz;
      }

      // 2. Floor constraint + friction
      for (let v = 0; v < N; v++) {
        const v3 = v * 3;
        if (pos[v3 + 1] < 0) {
          pos[v3 + 1] = 0;
          if (prev[v3 + 1] > 0) prev[v3 + 1] = 0;
          // XZ friction: damp the XZ velocity component
          prev[v3]   = pos[v3]   - (pos[v3]   - prev[v3])   * FLOOR_FRICTION;
          prev[v3+2] = pos[v3+2] - (pos[v3+2] - prev[v3+2]) * FLOOR_FRICTION;
        }
      }

      // 3. Structural constraints (XPBD, full 3D)
      for (let i = 0; i < nCons; i++) {
        const base = i << 2;
        const ia   = cons[base]     | 0;
        const ib   = cons[base + 1] | 0;
        const r    = cons[base + 2];
        const c    = cons[base + 3];
        const wa   = w[ia], wb = w[ib], wS = wa + wb;
        if (wS === 0) continue;
        const ia3 = ia * 3, ib3 = ib * 3;
        const dx = pos[ib3]   - pos[ia3];
        const dy = pos[ib3+1] - pos[ia3+1];
        const dz = pos[ib3+2] - pos[ia3+2];
        const d  = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (d < 1e-9) continue;
        const lam = -(d - r) / (wS + c / sd2);
        const inv = lam / d;
        pos[ia3]   -= wa*dx*inv; pos[ia3+1] -= wa*dy*inv; pos[ia3+2] -= wa*dz*inv;
        pos[ib3]   += wb*dx*inv; pos[ib3+1] += wb*dy*inv; pos[ib3+2] += wb*dz*inv;
      }

      // 4. XZ-only stitch constraint (pull together in XZ plane, Y is free)
      //    This ensures excess fabric goes UP, not sideways or twisted
      if (doStitch) {
        for (let i = 0; i < nSt; i++) {
          const ia  = stPairs[i*2];
          const ib  = stPairs[i*2+1];
          const wa  = w[ia], wb = w[ib], wS = wa + wb;
          if (wS === 0) continue;
          const ia3 = ia * 3, ib3 = ib * 3;
          const dx  = pos[ib3]   - pos[ia3];   // X only
          const dz  = pos[ib3+2] - pos[ia3+2]; // Z only
          const d2  = dx*dx + dz*dz;
          if (d2 < 1e-18) continue;
          const d   = Math.sqrt(d2);
          // restLen=0 in XZ
          const lam = -d / (wS + stitchC / sd2);
          const inv = lam / d;
          // Only apply correction in XZ
          pos[ia3]   -= wa * dx * inv;
          pos[ia3+2] -= wa * dz * inv;
          pos[ib3]   += wb * dx * inv;
          pos[ib3+2] += wb * dz * inv;
        }
      }

      // 5. COM-XZ correction (prevent lateral drift)
      let cx = 0, cz = 0;
      for (let v = 0; v < N; v++) { cx += pos[v*3]; cz += pos[v*3+2]; }
      cx /= N; cz /= N;
      const dX = cx - cx0, dZ = cz - cz0;
      for (let v = 0; v < N; v++) {
        pos[v*3]   -= dX; prev[v*3]   -= dX;
        pos[v*3+2] -= dZ; prev[v*3+2] -= dZ;
      }
    }
  };

  // ── Initialize when pattern changes ───────────────────────────────────────
  useEffect(() => {
    if (!scene.current || !tiledPattern) return;

    if (clothRef.current) {
      scene.current.remove(clothRef.current);
      clothRef.current.geometry.dispose();
      (clothRef.current.material as THREE.Material).dispose();
      clothRef.current = null;
    }

    const d = buildCloth(tiledPattern);
    posRef.current    = d.pos;
    prevRef.current   = d.prev;
    wRef.current      = d.w;
    consBufRef.current = d.consBuf;
    nConsRef.current   = d.nCons;
    stPairsRef.current = d.stPairs;
    nStRef.current     = d.nSt;
    nRef.current      = d.N;
    cx0Ref.current    = d.centerX;
    cz0Ref.current    = d.centerZ;
    frameRef.current  = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(d.pos.slice(), 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(d.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(d.indices, 1));
    geo.computeVertexNormals();

    const mat = new THREE.MeshPhongMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      shininess: 50,
      specular: new THREE.Color(0.2, 0.2, 0.2),
    });
    clothRef.current = new THREE.Mesh(geo, mat);
    scene.current.add(clothRef.current);

    if (camera.current && controls.current) {
      const size = Math.max(d.clothW, d.clothH);
      camera.current.position.set(d.centerX, size * 1.0, d.centerZ + size * 0.6);
      camera.current.lookAt(d.centerX, size * 0.2, d.centerZ);
      controls.current.target.set(d.centerX, size * 0.2, d.centerZ);
      controls.current.update();
    }
  }, [tiledPattern, scene, camera, controls]);

  // ── RAF loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      if (!clothRef.current || !posRef.current) return;
      step();
      const attr = clothRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
      attr.array.set(posRef.current);
      attr.needsUpdate = true;
      clothRef.current.geometry.computeVertexNormals();
    };
    animate();
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  return <div ref={containerRef} className="w-full h-full" />;
}
