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
const SIGMA     = 0.9;   // Gaussian influence radius (world units) for stitch pairs
const PLEAT_H   = 0.55;  // multiplier for pleat height (1.0 = semicircle, <1 = flatter)
const RELAX_ITER = 8;    // PBD relaxation iterations on the morphed mesh (organic feel)
const STRUCT_K  = 0.25;  // structural constraint stiffness for relaxation

interface ClothData {
  N: number;
  fineNx: number; fineNy: number;
  flatPos: Float32Array;    // flat rest positions
  smockedPos: Float32Array; // analytically smocked positions
  displayPos: Float32Array; // current display (lerped + relaxed)
  strBuf: Float32Array; nStr: number;  // structural edges [a,b,rest]
  indices: Uint32Array;
  colors: Float32Array;
  clothW: number; clothH: number; centerX: number; centerZ: number;
}

// ── Analytically compute smocked vertex positions ─────────────────────────────
function computeSmockedPos(
  flatPos: Float32Array, N: number,
  stPairs: Int32Array, nSt: number
): Float32Array {
  const smocked = flatPos.slice();
  const dispX = new Float32Array(N);
  const dispY = new Float32Array(N);
  const dispZ = new Float32Array(N);
  const wTot  = new Float32Array(N);

  for (let i = 0; i < nSt; i++) {
    const ia = stPairs[i*2], ib = stPairs[i*2+1];
    const ax = flatPos[ia*3],   az = flatPos[ia*3+2];
    const bx = flatPos[ib*3],   bz = flatPos[ib*3+2];
    const pdx = bx - ax, pdz = bz - az;
    const pLen = Math.sqrt(pdx*pdx + pdz*pdz);
    if (pLen < 1e-6) continue;
    const ux = pdx/pLen, uz = pdz/pLen;
    const mx = (ax+bx)*0.5, mz = (az+bz)*0.5;
    const h = pLen * PLEAT_H;  // pleat peak height

    for (let v = 0; v < N; v++) {
      const vx = flatPos[v*3], vz = flatPos[v*3+2];
      const rx = vx - ax, rz = vz - az;
      // Parameter along pair line
      const t = (rx*ux + rz*uz) / pLen;
      // Perpendicular distance
      const px = rx - t*pLen*ux, pz = rz - t*pLen*uz;
      const dPerp2 = px*px + pz*pz;
      const w = Math.exp(-dPerp2 / (SIGMA*SIGMA));
      if (w < 1e-4) continue;

      const tc = t < 0 ? 0 : t > 1 ? 1 : t;
      // XZ: projected position on line → midpoint
      const projX = ax + tc*pdx, projZ = az + tc*pdz;
      dispX[v] += (mx - projX) * w;
      dispZ[v] += (mz - projZ) * w;
      // Y: sinusoidal arch
      dispY[v] += h * Math.sin(tc * Math.PI) * w;
      wTot[v]  += w;
    }
  }

  for (let v = 0; v < N; v++) {
    const w = wTot[v];
    if (w > 0.01) {
      smocked[v*3]   = flatPos[v*3]   + dispX[v]/w;
      smocked[v*3+1] = Math.max(0, dispY[v]/w);
      smocked[v*3+2] = flatPos[v*3+2] + dispZ[v]/w;
    }
  }
  return smocked;
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

  // Analytical smocked positions
  const smockedPos = computeSmockedPos(flatPos, N, stPairs, nSt);

  // Display buffer (will be updated each frame)
  const displayPos = flatPos.slice();

  // Structural edges [a, b, restLen]  — computed from flat positions
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

  return { N, fineNx, fineNy, flatPos, smockedPos, displayPos,
           strBuf, nStr, indices, colors, clothW, clothH, centerX, centerZ };
}

// ── Light PBD relaxation on morphed mesh (smooths stretching artifacts) ───────
function relax(pos: Float32Array, strBuf: Float32Array, nStr: number) {
  for (let iter=0; iter<RELAX_ITER; iter++) {
    for (let i=0; i<nStr; i++) {
      const b3=i*3;
      const ia=strBuf[b3]|0, ib=strBuf[b3+1]|0, r=strBuf[b3+2];
      const ia3=ia*3, ib3=ib*3;
      const dx=pos[ib3]-pos[ia3], dy=pos[ib3+1]-pos[ia3+1], dz=pos[ib3+2]-pos[ia3+2];
      const d=Math.sqrt(dx*dx+dy*dy+dz*dz);
      if (d<1e-9) continue;
      const corr=(d-r)/d*STRUCT_K*0.5;
      pos[ia3]  +=corr*dx; pos[ia3+1]+=corr*dy; pos[ia3+2]+=corr*dz;
      pos[ib3]  -=corr*dx; pos[ib3+1]-=corr*dy; pos[ib3+2]-=corr*dz;
    }
    // Floor
    for (let v=0; v<pos.length/3; v++) if (pos[v*3+1]<0) pos[v*3+1]=0;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export function ResultViewer3D() {
  const { containerRef, scene, camera, controls } = useThreeScene();
  const { tiledPattern, gary } = useAppStore();

  const garyRef       = useRef(gary);
  const flatPosRef    = useRef<Float32Array | null>(null);
  const smockedPosRef = useRef<Float32Array | null>(null);
  const displayPosRef = useRef<Float32Array | null>(null);
  const strBufRef     = useRef(new Float32Array(0));
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

    // Light PBD relaxation to remove stretching artifacts from the lerp
    if (t > 0.01) {
      relax(display, strBufRef.current, nStrRef.current);
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
    strBufRef.current     = d.strBuf;
    nStrRef.current       = d.nStr;
    nRef.current          = d.N;
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
