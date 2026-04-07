/**
 * ResultViewer3D — Analytical smocking geometry
 *
 * Approach: pre-compute flat and smocked positions analytically,
 * then morph between them based on stitch strength (1-gary).
 * No physics simulation — purely geometric.
 *
 * Smocked geometry algorithm (per stitch pair A→B):
 *   For each cloth vertex v near the pair line:
 *     1. Project v onto line A→B → parameter t ∈ [0,1]
 *     2. Perpendicular distance d_perp → Gaussian weight
 *     3. XZ: compress projected position toward midpoint M=(A+B)/2
 *     4. Y: sinusoidal arch  Y = h * sin(t·π), h = pairDist/2
 *   Contributions from all stitch pairs are averaged by weight.
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThreeScene } from '../../hooks/useThreeScene';
import { useAppStore } from '../../store/useAppStore';
import type { TiledPattern } from '../../types';

const SUBDIV    = 5;
const RELAX_ITER = 40;   // PBD iterations — more = more inextensible
const STRUCT_K  = 0.9;   // stiffness → 1.0 = perfectly inextensible

interface ClothData {
  N: number;
  fineNx: number; fineNy: number;
  flatPos: Float32Array<ArrayBuffer>;
  smockedPos: Float32Array<ArrayBuffer>;
  displayPos: Float32Array<ArrayBuffer>;
  pinSet: Set<number>;               // stitch vertex indices (pinned during relax)
  strBuf: Float32Array<ArrayBuffer>; nStr: number;
  indices: Uint32Array<ArrayBuffer>;
  colors: Float32Array<ArrayBuffer>;
  clothW: number; clothH: number; centerX: number; centerZ: number;
}

const PLEAT_H    = 0.7;  // pleat height multiplier (pairLen × H = arch peak)
const PLEAT_SIGMA = 1.2;  // Gaussian radius (world units) — controls pleat width
const SMOOTH_ITER = 30;   // PBD smoothing passes AFTER analytical shape (safe: arch≈satisfied)

// ── Universal smocking solver — pure analytical, no PBD ──────────────────────
//
// Why no PBD here:
//   PBD tries to restore flat rest-lengths. When stitch vertices are moved to
//   centroid (XZ compressed), stitch↔neighbor constraints become stretched and
//   pull non-stitch vertices TOWARD the stitch at Y=0 — destroying any Y lift.
//
// Algorithm (2 steps, deterministic):
//  1. Connected-component centroid: stitch vertices to exact centroid XZ, Y=0
//     → stitchDist = 0 for ALL patterns (verified in test)
//  2. Gaussian pair-field for non-stitch vertices:
//     For each pair (ia,ib), project v onto the pair line (flat coords).
//     Only vertices within t∈[0,1] are influenced (strictly inside pair).
//     XZ: move toward pair midpoint (compressed to form pleat)
//     Y:  h × sin(t·π) × Gaussian(d_perp, σ) — arch profile for any angle
//     → Works for horizontal, diagonal, V-shape, mixed patterns
//
// Runtime: O(N × nPairs) ≈ 1ms for 1891 vertices. No iteration needed.
// Light PBD (8 iters, stitch pinned) runs later in animation loop for organic feel.
function computeSmockedPos(
  flatPos: Float32Array<ArrayBuffer>, N: number, _fineNx: number,
  stPairs: Int32Array<ArrayBuffer>, nSt: number,
  strBuf: Float32Array<ArrayBuffer>, nStr: number
): { sm: Float32Array<ArrayBuffer>; pinSet: Set<number> } {
  const sm = flatPos.slice();

  // ── Step 1: connected components → exact centroid ─────────────────────────
  const adj = new Map<number, number[]>();
  for (let i = 0; i < nSt; i++) {
    const a = stPairs[i*2], b = stPairs[i*2+1];
    if (!adj.has(a)) adj.set(a, []); if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push(b); adj.get(b)!.push(a);
  }
  const visited = new Set<number>();
  const pinSet  = new Set<number>();
  for (const [v] of adj) {
    if (visited.has(v)) continue;
    const comp: number[] = [], q: number[] = [v];
    while (q.length) {
      const u = q.shift()!; if (visited.has(u)) continue;
      visited.add(u); comp.push(u);
      for (const w of adj.get(u)!) q.push(w);
    }
    let cx = 0, cz = 0;
    for (const u of comp) { cx += flatPos[u*3]; cz += flatPos[u*3+2]; }
    cx /= comp.length; cz /= comp.length;
    for (const u of comp) {
      sm[u*3] = cx; sm[u*3+1] = 0; sm[u*3+2] = cz;
      pinSet.add(u);
    }
  }

  // ── Step 2: Gaussian pair-field for non-stitch vertices ───────────────────
  const dispX = new Float32Array(N);
  const dispY = new Float32Array(N);
  const dispZ = new Float32Array(N);
  const wTot  = new Float32Array(N);
  const sig2  = PLEAT_SIGMA * PLEAT_SIGMA;

  for (let i = 0; i < nSt; i++) {
    const ia  = stPairs[i*2], ib = stPairs[i*2+1];
    const ax  = flatPos[ia*3], az = flatPos[ia*3+2];
    const bx  = flatPos[ib*3], bz = flatPos[ib*3+2];
    const pdx = bx - ax, pdz = bz - az;
    const pLen = Math.sqrt(pdx*pdx + pdz*pdz);
    if (pLen < 1e-6) continue;
    const ux = pdx/pLen, uz = pdz/pLen;
    const mx = (ax+bx)*0.5, mz = (az+bz)*0.5;
    const h  = pLen * PLEAT_H;

    for (let v = 0; v < N; v++) {
      if (pinSet.has(v)) continue;
      const vx = flatPos[v*3], vz = flatPos[v*3+2];
      const rx = vx - ax, rz = vz - az;
      const t  = (rx*ux + rz*uz) / pLen;
      if (t < 0 || t > 1) continue;  // strictly inside pair only
      const perpX = rx - t*pLen*ux, perpZ = rz - t*pLen*uz;
      const w = Math.exp(-(perpX*perpX + perpZ*perpZ) / sig2);
      if (w < 1e-4) continue;
      const projX = ax + t*pdx, projZ = az + t*pdz;
      dispX[v] += (mx - projX) * w;   // XZ: compress toward midpoint
      dispZ[v] += (mz - projZ) * w;
      dispY[v] += h * Math.sin(t * Math.PI) * w;  // Y: sinusoidal arch
      wTot[v]  += w;
    }
  }

  for (let v = 0; v < N; v++) {
    if (pinSet.has(v)) continue;
    const w = wTot[v];
    if (w > 0.01) {
      sm[v*3]   = flatPos[v*3]   + dispX[v] / w;
      sm[v*3+1] = Math.max(0, dispY[v] / w);
      sm[v*3+2] = flatPos[v*3+2] + dispZ[v] / w;
    }
  }

  // ── Step 3: PBD smoothing on analytical shape (safe: arch ≈ satisfied) ────
  // Starting from the arch, consecutive arch vertices are ~0.2 apart (rest length).
  // PBD only makes small corrections → smooths Gaussian artifacts without collapsing.
  // Stitch vertices are re-pinned every iteration.
  const centX2 = new Float32Array(N), centZ2 = new Float32Array(N);
  for (const v of pinSet) { centX2[v] = sm[v*3]; centZ2[v] = sm[v*3+2]; }
  for (let it = 0; it < SMOOTH_ITER; it++) {
    for (let i = 0; i < nStr; i++) {
      const b3 = i*3;
      const ia = strBuf[b3]|0, ib = strBuf[b3+1]|0, r = strBuf[b3+2];
      const pA = pinSet.has(ia), pB = pinSet.has(ib);
      if (pA && pB) continue;
      const wa = pA ? 0 : 1, wb = pB ? 0 : 1;
      const ia3 = ia*3, ib3 = ib*3;
      const dx = sm[ib3]-sm[ia3], dy = sm[ib3+1]-sm[ia3+1], dz = sm[ib3+2]-sm[ia3+2];
      const d  = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (d < 1e-9) continue;
      const c = (d - r) / d * 0.5 * 0.5;
      sm[ia3]   += wa*c*dx; sm[ia3+1] += wa*c*dy; sm[ia3+2] += wa*c*dz;
      sm[ib3]   -= wb*c*dx; sm[ib3+1] -= wb*c*dy; sm[ib3+2] -= wb*c*dz;
    }
    for (let v = 0; v < N; v++) if (sm[v*3+1] < 0) sm[v*3+1] = 0;
    for (const v of pinSet) { sm[v*3] = centX2[v]; sm[v*3+1] = 0; sm[v*3+2] = centZ2[v]; }
  }

  return { sm, pinSet };
}

// ── Build cloth ───────────────────────────────────────────────────────────────
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
  const centerX = (minX+maxX)/2, centerZ = (minZ+maxZ)/2;
  const clothW  = maxX - minX, clothH = maxZ - minZ;

  // Flat positions
  const flatPos = new Float32Array(N * 3);
  for (let fy = 0; fy < fineNy; fy++) {
    for (let fx = 0; fx < fineNx; fx++) {
      const i3 = (fy*fineNx+fx)*3;
      flatPos[i3]   = minX + (fx/(fineNx-1)) * clothW;
      flatPos[i3+1] = 0;
      flatPos[i3+2] = minZ + (fy/(fineNy-1)) * clothH;
    }
  }

  // Stitch pairs
  const p2f = (idx: number) => {
    const v = verts[idx];
    return (Math.round(v.y-minZ)*SUBDIV)*fineNx + Math.round(v.x-minX)*SUBDIV;
  };
  const rawSt: number[] = [];
  for (const group of pattern.stitchingLines) {
    for (let a = 0; a < group.length-1; a++)
      for (let b = a+1; b < group.length; b++)
        if (group[a] < verts.length && group[b] < verts.length)
          rawSt.push(p2f(group[a]), p2f(group[b]));
  }
  const stPairs = new Int32Array(rawSt);
  const nSt     = rawSt.length/2;
  const stitchSet = new Set<number>(rawSt);

  // Structural edges [a, b, restLen]  — computed from flat positions (needed by smocked solver)
  const rawStr: number[] = [];
  const seen = new Set<number>();
  const addEdge = (a: number, b: number) => {
    const lo = a<b?a:b, hi = a<b?b:a, key = lo*N+hi;
    if (seen.has(key)) return; seen.add(key);
    const dx = flatPos[hi*3]-flatPos[lo*3];
    const dz = flatPos[hi*3+2]-flatPos[lo*3+2];
    const r  = Math.sqrt(dx*dx+dz*dz);
    if (r<1e-9) return;
    rawStr.push(lo, hi, r);
  };
  for (let fy=0; fy<fineNy; fy++) for (let fx=0; fx<fineNx; fx++) {
    const v = fy*fineNx+fx;
    if (fx+1<fineNx) addEdge(v,v+1);
    if (fy+1<fineNy) addEdge(v,v+fineNx);
    if (fx+1<fineNx&&fy+1<fineNy){ addEdge(v,v+fineNx+1); addEdge(v+1,v+fineNx); }
  }
  const strBuf = new Float32Array(rawStr), nStr = rawStr.length/3;

  // Analytical smocked positions (universal: horizontal, diagonal, V-shape, mixed)
  const { sm: smockedPos, pinSet } = computeSmockedPos(
    flatPos, N, fineNx, stPairs, nSt, strBuf, nStr
  );

  // Display buffer (will be updated each frame)
  const displayPos = flatPos.slice();

  // Triangles
  const indices = new Uint32Array((fineNy-1)*(fineNx-1)*6);
  let ip = 0;
  for (let fy=0; fy<fineNy-1; fy++) for (let fx=0; fx<fineNx-1; fx++) {
    const bl=fy*fineNx+fx, br=bl+1, tl=bl+fineNx, tr=tl+1;
    indices[ip++]=bl;indices[ip++]=br;indices[ip++]=tr;
    indices[ip++]=bl;indices[ip++]=tr;indices[ip++]=tl;
  }

  // Colors
  const colors = new Float32Array(N*3);
  for (let i=0; i<N; i++) {
    const i3=i*3;
    if (stitchSet.has(i)) {
      colors[i3]=0.10;colors[i3+1]=0.45;colors[i3+2]=0.90;   // blue: stitch
    } else if (smockedPos[i*3+1] > 0.05) {
      colors[i3]=0.98;colors[i3+1]=0.60;colors[i3+2]=0.30;   // orange: pleat
    } else {
      colors[i3]=0.95;colors[i3+1]=0.45;colors[i3+2]=0.65;   // pink: base
    }
  }

  return { N, fineNx, fineNy, flatPos, smockedPos, displayPos, pinSet,
           strBuf, nStr, indices, colors, clothW, clothH, centerX, centerZ };
}

// ── Light PBD relaxation — stitch vertices pinned to smocked position ────────
function relax(
  pos: Float32Array<ArrayBuffer>,
  smocked: Float32Array<ArrayBuffer>,
  pinSet: Set<number>,
  strBuf: Float32Array<ArrayBuffer>, nStr: number
) {
  for (let iter = 0; iter < RELAX_ITER; iter++) {
    for (let i = 0; i < nStr; i++) {
      const b3 = i*3;
      const ia = strBuf[b3]|0, ib = strBuf[b3+1]|0, r = strBuf[b3+2];
      const pinA = pinSet.has(ia), pinB = pinSet.has(ib);
      if (pinA && pinB) continue;
      const wa = pinA ? 0 : 1, wb = pinB ? 0 : 1;
      const ia3 = ia*3, ib3 = ib*3;
      const dx = pos[ib3]-pos[ia3], dy = pos[ib3+1]-pos[ia3+1], dz = pos[ib3+2]-pos[ia3+2];
      const d = Math.sqrt(dx*dx+dy*dy+dz*dz);
      if (d < 1e-9) continue;
      const corr = (d-r)/d * STRUCT_K * 0.5;
      pos[ia3]   += wa*corr*dx; pos[ia3+1] += wa*corr*dy; pos[ia3+2] += wa*corr*dz;
      pos[ib3]   -= wb*corr*dx; pos[ib3+1] -= wb*corr*dy; pos[ib3+2] -= wb*corr*dz;
    }
    // Floor + re-pin stitch vertices
    for (let v = 0; v < pos.length/3; v++) {
      if (pos[v*3+1] < 0) pos[v*3+1] = 0;
    }
    for (const v of pinSet) {
      pos[v*3] = smocked[v*3]; pos[v*3+1] = smocked[v*3+1]; pos[v*3+2] = smocked[v*3+2];
    }
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
// ── OBJ export helper ─────────────────────────────────────────────────────────
function exportOBJ(
  pos: Float32Array<ArrayBuffer>,
  indices: Uint32Array<ArrayBuffer>,
  N: number
) {
  const lines: string[] = ['# SmockingCAD export'];
  for (let i = 0; i < N; i++) {
    lines.push(`v ${pos[i*3].toFixed(4)} ${pos[i*3+1].toFixed(4)} ${pos[i*3+2].toFixed(4)}`);
  }
  for (let i = 0; i < indices.length; i += 3) {
    lines.push(`f ${indices[i]+1} ${indices[i+1]+1} ${indices[i+2]+1}`);
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'smocking-export.obj';
  a.click(); URL.revokeObjectURL(url);
}

export function ResultViewer3D() {
  const { containerRef, scene, camera, controls } = useThreeScene();
  const { tiledPattern, gary, exportTrigger } = useAppStore();
  const indicesRef = useRef<Uint32Array<ArrayBuffer>>(new Uint32Array(0));

  const garyRef       = useRef(gary);
  const flatPosRef    = useRef<Float32Array<ArrayBuffer> | null>(null);
  const smockedPosRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const displayPosRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const pinSetRef     = useRef<Set<number>>(new Set());
  const strBufRef     = useRef<Float32Array<ArrayBuffer>>(new Float32Array(0));
  const nStrRef       = useRef(0);
  const nRef          = useRef(0);
  const clothRef      = useRef<THREE.Mesh | null>(null);
  const rafRef        = useRef<number | null>(null);
  // Smooth animation toward target gary
  const currentGaryRef = useRef(gary);

  useEffect(() => { garyRef.current = gary; }, [gary]);

  // ── Morph step ─────────────────────────────────────────────────────────────
  const step = () => {
    const flat    = flatPosRef.current;
    const smocked = smockedPosRef.current;
    const display = displayPosRef.current;
    if (!flat || !smocked || !display) return;

    // Smooth transition toward target
    const targetGary = garyRef.current;
    currentGaryRef.current += (targetGary - currentGaryRef.current) * 0.06;
    const t = 1.0 - currentGaryRef.current;  // 0=flat, 1=full smocking

    const N = nRef.current;
    // Lerp flat → smocked
    for (let v=0; v<N; v++) {
      const v3=v*3;
      display[v3]   = flat[v3]   + (smocked[v3]   - flat[v3])   * t;
      display[v3+1] = flat[v3+1] + (smocked[v3+1] - flat[v3+1]) * t;
      display[v3+2] = flat[v3+2] + (smocked[v3+2] - flat[v3+2]) * t;
    }

    // Light PBD relaxation (stitch vertices pinned)
    if (t > 0.01) {
      relax(display, smocked, pinSetRef.current, strBufRef.current, nStrRef.current);
    }
  };

  // ── Initialize ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!scene.current || !tiledPattern) return;

    if (clothRef.current) {
      scene.current.remove(clothRef.current);
      clothRef.current.geometry.dispose();
      (clothRef.current.material as THREE.Material).dispose();
      clothRef.current = null;
    }

    const d = buildCloth(tiledPattern);
    flatPosRef.current    = d.flatPos;
    smockedPosRef.current = d.smockedPos;
    displayPosRef.current = d.displayPos;
    pinSetRef.current     = d.pinSet;
    strBufRef.current     = d.strBuf;
    nStrRef.current       = d.nStr;
    nRef.current          = d.N;
    indicesRef.current    = d.indices;
    currentGaryRef.current = gary;
    garyRef.current        = gary;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(d.displayPos.slice(), 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(d.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(d.indices, 1));
    geo.computeVertexNormals();

    clothRef.current = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      shininess: 60,
    }));
    scene.current.add(clothRef.current);

    if (camera.current && controls.current) {
      const size = Math.max(d.clothW, d.clothH);
      camera.current.position.set(d.centerX, size*0.9, d.centerZ+size*0.6);
      camera.current.lookAt(d.centerX, size*0.2, d.centerZ);
      controls.current.target.set(d.centerX, size*0.2, d.centerZ);
      controls.current.update();
    }
  }, [tiledPattern, scene, camera, controls]);

  // ── Export trigger ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (exportTrigger === 0) return;
    const pos = displayPosRef.current;
    const idx = indicesRef.current;
    if (pos && idx) exportOBJ(pos, idx, nRef.current);
  }, [exportTrigger]);

  // ── RAF loop ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      if (!clothRef.current || !displayPosRef.current) return;
      step();
      const attr = clothRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
      attr.array.set(displayPosRef.current);
      attr.needsUpdate = true;
      clothRef.current.geometry.computeVertexNormals();
    };
    animate();
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  return <div ref={containerRef} className="w-full h-full" />;
}
