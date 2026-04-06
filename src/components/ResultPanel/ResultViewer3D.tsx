/**
 * ResultViewer3D — Cloth simulation: flat cloth on table, pinched upward at stitch points
 *
 * Mesh: pattern grid subdivided SUBDIV× for smooth folds.
 * Stitch constraints applied at fine-grid vertices matching pattern stitch points.
 *
 * Physics: Position Verlet + XPBD, TypedArray constraints for speed.
 *   gary=0 → strong stitch (smocked), gary=1 → no stitch (flat)
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThreeScene } from '../../hooks/useThreeScene';
import { useAppStore } from '../../store/useAppStore';
import type { TiledPattern } from '../../types';

// ── Physics constants ─────────────────────────────────────────────────────────
const SUBDIV    = 5;    // Fine grid: Arrow 3×3 → 61×31 = 1891 verts (≈Test tab)
const SUBSTEPS  = 20;
const GRAVITY   = -1.0;
const VDAMP     = 0.998;
const STRETCH_C = 1e-5;
const BEND_C    = 1e-3;
const Y_NOISE   = 0.02;

// Packed constraint buffers: [a0,b0,r0,c0, a1,b1,r1,c1, ...]
interface ClothData {
  N: number;
  pos: Float32Array;
  prev: Float32Array;
  w: Float32Array;
  // structural constraints as packed Float32Array [a,b,r,c, ...]
  consBuf: Float32Array;
  nCons: number;
  // stitch constraints
  stBuf: Float32Array;
  nSt: number;
  indices: Uint32Array;
  colors: Float32Array;
  clothW: number;
  clothH: number;
  centerX: number;
  centerZ: number;
}

// ── Build fine cloth mesh ──────────────────────────────────────────────────────
function buildCloth(pattern: TiledPattern): ClothData {
  const verts  = pattern.vertices;
  const nx     = pattern.tangram.nx;
  const ny     = pattern.tangram.ny;

  const fineNx = (nx - 1) * SUBDIV + 1;
  const fineNy = (ny - 1) * SUBDIV + 1;
  const N      = fineNx * fineNy;

  // Pattern bounds
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const v of verts) {
    if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
    if (v.y < minZ) minZ = v.y; if (v.y > maxZ) maxZ = v.y;
  }
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const clothW  = maxX - minX;
  const clothH  = maxZ - minZ;

  // Positions
  const pos  = new Float32Array(N * 3);
  const prev = new Float32Array(N * 3);
  const w    = new Float32Array(N);

  for (let fy = 0; fy < fineNy; fy++) {
    for (let fx = 0; fx < fineNx; fx++) {
      const i      = fy * fineNx + fx;
      const i3     = i * 3;
      pos[i3]      = minX + (fx / (fineNx - 1)) * clothW;
      pos[i3 + 1]  = Math.random() * Y_NOISE;
      pos[i3 + 2]  = minZ + (fy / (fineNy - 1)) * clothH;
      prev[i3]     = pos[i3];
      prev[i3 + 1] = pos[i3 + 1];
      prev[i3 + 2] = pos[i3 + 2];
      w[i] = 1;
    }
  }

  // Structural constraints (packed Float32Array: a,b,r,c per entry)
  const rawCons: number[] = [];
  const seen = new Set<number>(); // encode pair as a*N+b (a<b)

  const addEdge = (a: number, b: number, c: number) => {
    const lo = a < b ? a : b, hi = a < b ? b : a;
    const key = lo * N + hi;
    if (seen.has(key)) return;
    seen.add(key);
    const dx = pos[hi*3]   - pos[lo*3];
    const dz = pos[hi*3+2] - pos[lo*3+2];
    const r  = Math.sqrt(dx*dx + dz*dz);
    if (r < 1e-6) return;
    rawCons.push(lo, hi, r, c);
  };

  for (let fy = 0; fy < fineNy; fy++) {
    for (let fx = 0; fx < fineNx; fx++) {
      const v = fy * fineNx + fx;
      if (fx + 1 < fineNx) { addEdge(v, v + 1, STRETCH_C); }
      if (fy + 1 < fineNy) { addEdge(v, v + fineNx, STRETCH_C); }
      if (fx + 1 < fineNx && fy + 1 < fineNy) {
        addEdge(v,     v + fineNx + 1, STRETCH_C);
        addEdge(v + 1, v + fineNx,     STRETCH_C);
      }
      if (fx + 2 < fineNx) { addEdge(v, v + 2,           BEND_C); }
      if (fy + 2 < fineNy) { addEdge(v, v + 2 * fineNx,  BEND_C); }
    }
  }
  const consBuf = new Float32Array(rawCons);
  const nCons   = rawCons.length / 4;

  // Pattern vertex → fine grid index
  const p2f = (idx: number) => {
    const v  = verts[idx];
    const gx = Math.round(v.x - minX);
    const gy = Math.round(v.y - minZ);
    return (gy * SUBDIV) * fineNx + (gx * SUBDIV);
  };

  // Stitch constraints
  const rawSt: number[] = [];
  for (const group of pattern.stitchingLines) {
    for (let a = 0; a < group.length - 1; a++) {
      for (let b = a + 1; b < group.length; b++) {
        if (group[a] < verts.length && group[b] < verts.length) {
          rawSt.push(p2f(group[a]), p2f(group[b]), 0, 1e-4);
        }
      }
    }
  }
  const stBuf = new Float32Array(rawSt);
  const nSt   = rawSt.length / 4;

  // Triangle indices
  const indices = new Uint32Array((fineNy - 1) * (fineNx - 1) * 6);
  let iPtr = 0;
  for (let fy = 0; fy < fineNy - 1; fy++) {
    for (let fx = 0; fx < fineNx - 1; fx++) {
      const bl = fy * fineNx + fx, br = bl + 1;
      const tl = bl + fineNx,     tr = tl + 1;
      indices[iPtr++] = bl; indices[iPtr++] = br; indices[iPtr++] = tr;
      indices[iPtr++] = bl; indices[iPtr++] = tr; indices[iPtr++] = tl;
    }
  }

  // Colors
  const stitchSet = new Set<number>();
  for (const group of pattern.stitchingLines) {
    for (const idx of group) {
      if (idx < verts.length) stitchSet.add(p2f(idx));
    }
  }
  const colors = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const i3 = i * 3;
    if (stitchSet.has(i)) {
      colors[i3] = 0.20; colors[i3+1] = 0.55; colors[i3+2] = 0.95;
    } else {
      colors[i3] = 0.95; colors[i3+1] = 0.45; colors[i3+2] = 0.65;
    }
  }

  return { N, pos, prev, w, consBuf, nCons, stBuf, nSt,
           indices, colors, clothW, clothH, centerX, centerZ };
}

// ── XPBD constraint solver (inlined for speed) ────────────────────────────────
function solveConstraints(
  pos: Float32Array, w: Float32Array,
  buf: Float32Array, nCons: number,
  compliance: number | null,   // null = use per-constraint c from buf[i*4+3]
  sd2: number
) {
  for (let i = 0; i < nCons; i++) {
    const base = i * 4;
    const ia = buf[base]     | 0;
    const ib = buf[base + 1] | 0;
    const r  = buf[base + 2];
    const c  = compliance !== null ? compliance : buf[base + 3];
    const wa = w[ia], wb = w[ib], wS = wa + wb;
    if (wS === 0) continue;
    const ia3 = ia * 3, ib3 = ib * 3;
    const dx = pos[ib3]   - pos[ia3];
    const dy = pos[ib3+1] - pos[ia3+1];
    const dz = pos[ib3+2] - pos[ia3+2];
    const d  = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (d < 1e-9) continue;
    const lam = -(d - r) / (wS + c / sd2);
    const inv = lam / d;
    const cx_ = dx * inv, cy_ = dy * inv, cz_ = dz * inv;
    pos[ia3]   -= wa * cx_; pos[ia3+1] -= wa * cy_; pos[ia3+2] -= wa * cz_;
    pos[ib3]   += wb * cx_; pos[ib3+1] += wb * cy_; pos[ib3+2] += wb * cz_;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export function ResultViewer3D() {
  const { containerRef, scene, camera, controls } = useThreeScene();
  const { tiledPattern, gary } = useAppStore();

  const garyRef = useRef(gary);
  useEffect(() => { garyRef.current = gary; }, [gary]);

  const posRef    = useRef<Float32Array | null>(null);
  const prevRef   = useRef<Float32Array | null>(null);
  const wRef      = useRef<Float32Array | null>(null);
  const consBufRef = useRef<Float32Array>(new Float32Array(0));
  const nConsRef   = useRef(0);
  const stBufRef   = useRef<Float32Array>(new Float32Array(0));
  const nStRef     = useRef(0);
  const nRef      = useRef(0);
  const cx0Ref    = useRef(0);
  const cz0Ref    = useRef(0);
  const clothRef  = useRef<THREE.Mesh | null>(null);
  const rafRef    = useRef<number | null>(null);

  // ── Simulation step ────────────────────────────────────────────────────────
  const step = () => {
    const pos  = posRef.current;
    const prev = prevRef.current;
    const w    = wRef.current;
    if (!pos || !prev || !w || nRef.current === 0) return;

    const N       = nRef.current;
    const subDt   = (1 / 60) / SUBSTEPS;
    const sd2     = subDt * subDt;
    const g       = garyRef.current;
    const stitchC = g * g * 0.5 + 1e-4;
    const doStitch = g < 0.99;

    for (let sub = 0; sub < SUBSTEPS; sub++) {
      // 1. Verlet
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
      // 2. Floor
      for (let v = 0; v < N; v++) {
        const y = v * 3 + 1;
        if (pos[y] < 0) { if (prev[y] > 0) prev[y] = 0; pos[y] = 0; }
      }
      // 3. Structural
      solveConstraints(pos, w, consBufRef.current, nConsRef.current, null, sd2);
      // 4. Stitch
      if (doStitch) {
        solveConstraints(pos, w, stBufRef.current, nStRef.current, stitchC, sd2);
      }
      // 5. COM-XZ correction
      let cx = 0, cz = 0;
      for (let v = 0; v < N; v++) { cx += pos[v*3]; cz += pos[v*3+2]; }
      cx /= N; cz /= N;
      const dX = cx - cx0Ref.current, dZ = cz - cz0Ref.current;
      for (let v = 0; v < N; v++) {
        const v3 = v * 3;
        pos[v3]   -= dX; prev[v3]   -= dX;
        pos[v3+2] -= dZ; prev[v3+2] -= dZ;
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
    stBufRef.current   = d.stBuf;
    nStRef.current     = d.nSt;
    nRef.current      = d.N;
    cx0Ref.current    = d.centerX;
    cz0Ref.current    = d.centerZ;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(d.pos.slice(), 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(d.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(d.indices, 1));
    geo.computeVertexNormals();

    const mat = new THREE.MeshPhongMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      shininess: 30,
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.current.add(mesh);
    clothRef.current = mesh;

    if (camera.current && controls.current) {
      const size = Math.max(d.clothW, d.clothH);
      camera.current.position.set(d.centerX, size * 0.9, d.centerZ + size * 0.7);
      camera.current.lookAt(d.centerX, 0, d.centerZ);
      controls.current.target.set(d.centerX, 0, d.centerZ);
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
