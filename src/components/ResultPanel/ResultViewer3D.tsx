/**
 * ResultViewer3D — Pure PBD cloth simulation (position-only, no velocity)
 *
 * Design:
 *   - No Verlet / no velocity accumulation → cloth doesn't drift or gather to center
 *   - Each frame: apply ITERATIONS rounds of constraint projection
 *   - Constraints: structural distance (cloth stiffness) + XZ-only stitch (smocking)
 *   - Floor constraint (Y ≥ 0) keeps cloth above table
 *   - Pre-deformed initial Y seeds fold direction upward
 *   - Stitch strength ramps up over RAMP_FRAMES to avoid startup chaos
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThreeScene } from '../../hooks/useThreeScene';
import { useAppStore } from '../../store/useAppStore';
import type { TiledPattern } from '../../types';

// ── Simulation constants ───────────────────────────────────────────────────────
const SUBDIV        = 5;
const ITERATIONS    = 20;          // PBD constraint iterations per frame
const STRUCT_K      = 0.3;         // structural constraint stiffness (0–1)
const BEND_K        = 0.05;        // bending constraint stiffness
const RAMP_FRAMES   = 240;         // frames to ramp stitch from 0 → target
const PREDEFORM_H   = 0.4;         // initial Y lift height for excess fabric
const DAMPING       = 0.98;        // gentle position damping each frame

interface ClothData {
  N: number;
  pos: Float32Array;               // current positions (3N)
  prev: Float32Array;              // previous positions = initial (for reset)
  // Structural constraints: packed [a, b, restLen] Float32Array
  strBuf: Float32Array; nStr: number;
  bendBuf: Float32Array; nBend: number;
  // Stitch pairs: Int32Array [a, b, a, b, ...]
  stPairs: Int32Array; nSt: number;
  indices: Uint32Array;
  colors: Float32Array;
  clothW: number; clothH: number; centerX: number; centerZ: number;
}

// ── Build cloth mesh & constraints ────────────────────────────────────────────
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

  // Pattern vertex → fine grid index
  const p2f = (idx: number) => {
    const v  = verts[idx];
    const gx = Math.round(v.x - minX);
    const gy = Math.round(v.y - minZ);
    return (gy * SUBDIV) * fineNx + (gx * SUBDIV);
  };

  // Stitch pairs
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
  const stitchFineSet = new Set<number>(rawSt);

  // Pre-deform: "excess fabric" between stitch pairs gets upward Y bias
  const initY = new Float32Array(N);
  for (let i = 0; i < nSt; i++) {
    const ia = stPairs[i*2], ib = stPairs[i*2+1];
    const fxa = ia % fineNx, fya = (ia / fineNx) | 0;
    const fxb = ib % fineNx, fyb = (ib / fineNx) | 0;
    const steps = Math.max(Math.abs(fxb - fxa), Math.abs(fyb - fya));
    if (steps < 2) continue;
    for (let t = 1; t < steps; t++) {
      const fx = Math.round(fxa + (fxb - fxa) * t / steps);
      const fy = Math.round(fya + (fyb - fya) * t / steps);
      const fi = fy * fineNx + fx;
      if (!stitchFineSet.has(fi)) {
        initY[fi] = Math.max(initY[fi], PREDEFORM_H * Math.sin((t / steps) * Math.PI));
      }
    }
  }

  // Initialize positions
  const pos  = new Float32Array(N * 3);
  const prev = new Float32Array(N * 3);  // used as reset snapshot

  for (let fy = 0; fy < fineNy; fy++) {
    for (let fx = 0; fx < fineNx; fx++) {
      const i  = fy * fineNx + fx;
      const i3 = i * 3;
      pos[i3]     = minX + (fx / (fineNx - 1)) * clothW;
      pos[i3 + 1] = initY[i];
      pos[i3 + 2] = minZ + (fy / (fineNy - 1)) * clothH;
      prev[i3] = pos[i3]; prev[i3+1] = pos[i3+1]; prev[i3+2] = pos[i3+2];
    }
  }

  // Build structural & bending constraints
  const rawStr: number[] = [], rawBend: number[] = [];
  const seen = new Set<number>();
  const addEdge = (buf: number[], a: number, b: number) => {
    const lo = a < b ? a : b, hi = a < b ? b : a;
    const key = lo * N + hi;
    if (seen.has(key)) return; seen.add(key);
    const dx = pos[hi*3] - pos[lo*3];
    const dy = pos[hi*3+1] - pos[lo*3+1];
    const dz = pos[hi*3+2] - pos[lo*3+2];
    const r  = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (r < 1e-9) return;
    buf.push(lo, hi, r);
  };

  for (let fy = 0; fy < fineNy; fy++) {
    for (let fx = 0; fx < fineNx; fx++) {
      const v = fy * fineNx + fx;
      if (fx + 1 < fineNx) addEdge(rawStr, v, v + 1);
      if (fy + 1 < fineNy) addEdge(rawStr, v, v + fineNx);
      if (fx + 1 < fineNx && fy + 1 < fineNy) {
        addEdge(rawStr, v, v + fineNx + 1);
        addEdge(rawStr, v + 1, v + fineNx);
      }
      if (fx + 2 < fineNx) addEdge(rawBend, v, v + 2);
      if (fy + 2 < fineNy) addEdge(rawBend, v, v + 2 * fineNx);
    }
  }
  const strBuf  = new Float32Array(rawStr);  const nStr  = rawStr.length  / 3;
  const bendBuf = new Float32Array(rawBend); const nBend = rawBend.length / 3;

  // Triangle mesh
  const indices = new Uint32Array((fineNy - 1) * (fineNx - 1) * 6);
  let ip = 0;
  for (let fy = 0; fy < fineNy - 1; fy++) {
    for (let fx = 0; fx < fineNx - 1; fx++) {
      const bl = fy * fineNx + fx, br = bl + 1;
      const tl = bl + fineNx,     tr = tl + 1;
      indices[ip++]=bl; indices[ip++]=br; indices[ip++]=tr;
      indices[ip++]=bl; indices[ip++]=tr; indices[ip++]=tl;
    }
  }

  // Colors
  const colors = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const i3 = i * 3;
    if (stitchFineSet.has(i)) {
      colors[i3]=0.10; colors[i3+1]=0.45; colors[i3+2]=0.90;
    } else if (initY[i] > 0.05) {
      colors[i3]=0.98; colors[i3+1]=0.60; colors[i3+2]=0.30;
    } else {
      colors[i3]=0.95; colors[i3+1]=0.45; colors[i3+2]=0.65;
    }
  }

  return { N, pos, prev, strBuf, nStr, bendBuf, nBend,
           stPairs, nSt, indices, colors, clothW, clothH, centerX, centerZ };
}

// ── Apply a single distance constraint (PBD projection) ───────────────────────
function projectDist(pos: Float32Array, ia: number, ib: number, rest: number, k: number) {
  const ia3 = ia * 3, ib3 = ib * 3;
  const dx = pos[ib3]   - pos[ia3];
  const dy = pos[ib3+1] - pos[ia3+1];
  const dz = pos[ib3+2] - pos[ia3+2];
  const d  = Math.sqrt(dx*dx + dy*dy + dz*dz);
  if (d < 1e-9) return;
  const corr = (d - rest) / d * k * 0.5;
  pos[ia3]   += corr * dx; pos[ia3+1] += corr * dy; pos[ia3+2] += corr * dz;
  pos[ib3]   -= corr * dx; pos[ib3+1] -= corr * dy; pos[ib3+2] -= corr * dz;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function ResultViewer3D() {
  const { containerRef, scene, camera, controls } = useThreeScene();
  const { tiledPattern, gary } = useAppStore();

  const garyRef      = useRef(gary);
  const posRef       = useRef<Float32Array | null>(null);
  const initPosRef   = useRef<Float32Array | null>(null);
  const strBufRef    = useRef(new Float32Array(0)); const nStrRef  = useRef(0);
  const bendBufRef   = useRef(new Float32Array(0)); const nBendRef = useRef(0);
  const stPairsRef   = useRef(new Int32Array(0));   const nStRef   = useRef(0);
  const nRef         = useRef(0);
  const frameRef     = useRef(0);
  const clothRef     = useRef<THREE.Mesh | null>(null);
  const rafRef       = useRef<number | null>(null);

  const resetSimulation = () => {
    const initPos = initPosRef.current;
    const pos     = posRef.current;
    if (!initPos || !pos) return;
    pos.set(initPos);
    frameRef.current = 0;
  };

  useEffect(() => {
    garyRef.current = gary;
    resetSimulation();
  }, [gary]);

  // ── PBD step ────────────────────────────────────────────────────────────────
  const step = () => {
    const pos = posRef.current;
    if (!pos || nRef.current === 0) return;

    const N       = nRef.current;
    const frame   = frameRef.current++;
    const ramp    = Math.min(frame / RAMP_FRAMES, 1.0);
    const g       = garyRef.current;
    // Stitch stiffness: 0 when g=1 (no stitch), ramps to (1-g) * ramp
    const stitchK  = (1.0 - g) * ramp;
    const doStitch = stitchK > 0.001;

    const strBuf  = strBufRef.current;  const nStr  = nStrRef.current;
    const bendBuf = bendBufRef.current; const nBend = nBendRef.current;
    const stPairs = stPairsRef.current; const nSt   = nStRef.current;

    for (let iter = 0; iter < ITERATIONS; iter++) {
      // 1. Structural distance constraints
      for (let i = 0; i < nStr; i++) {
        const b3 = i * 3;
        projectDist(pos, strBuf[b3]|0, strBuf[b3+1]|0, strBuf[b3+2], STRUCT_K);
      }
      // 2. Bending constraints (softer)
      for (let i = 0; i < nBend; i++) {
        const b3 = i * 3;
        projectDist(pos, bendBuf[b3]|0, bendBuf[b3+1]|0, bendBuf[b3+2], BEND_K);
      }
      // 3. XZ-only stitch constraint: pull pairs toward same XZ point
      if (doStitch) {
        for (let i = 0; i < nSt; i++) {
          const ia  = stPairs[i*2], ib = stPairs[i*2+1];
          const ia3 = ia * 3, ib3 = ib * 3;
          const dx  = pos[ib3]   - pos[ia3];
          const dz  = pos[ib3+2] - pos[ia3+2];
          const d   = Math.sqrt(dx*dx + dz*dz);
          if (d < 1e-9) continue;
          // restLen=0 in XZ: move both toward midpoint by stitchK
          const corr = d * stitchK * 0.5;
          const nx_  = dx / d, nz_ = dz / d;
          pos[ia3]   += corr * nx_;  pos[ia3+2] += corr * nz_;
          pos[ib3]   -= corr * nx_;  pos[ib3+2] -= corr * nz_;
        }
      }
      // 4. Floor constraint: Y ≥ 0
      for (let v = 0; v < N; v++) {
        const y = v * 3 + 1;
        if (pos[y] < 0) pos[y] = 0;
      }
    }

    // Gentle position damping toward initPos (prevents long-term drift)
    const initPos = initPosRef.current!;
    for (let v = 0; v < N; v++) {
      const v3 = v * 3;
      // Damp velocity implicitly: blend slightly toward initial Y (keeps cloth grounded)
      pos[v3+1] = pos[v3+1] * DAMPING + initPos[v3+1] * (1 - DAMPING);
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
    posRef.current     = d.pos;
    initPosRef.current = d.prev;      // prev stores initial snapshot
    strBufRef.current  = d.strBuf;    nStrRef.current  = d.nStr;
    bendBufRef.current = d.bendBuf;   nBendRef.current = d.nBend;
    stPairsRef.current = d.stPairs;   nStRef.current   = d.nSt;
    nRef.current       = d.N;
    frameRef.current   = 0;

    // Sync gary ref in case it changed while tab was inactive
    garyRef.current = gary;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(d.pos.slice(), 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(d.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(d.indices, 1));
    geo.computeVertexNormals();

    clothRef.current = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      shininess: 50,
    }));
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
