/**
 * ResultViewer3D — Cloth simulation: flat cloth on table, pinched upward at stitch points
 *
 * Mesh: pattern grid is subdivided SUBDIV× for smoother cloth folds.
 * Stitch constraints are applied at the subdivided vertices that correspond
 * to original pattern stitch points.
 *
 * Coordinate system:
 *   - Cloth lies flat in XZ plane (Y=0 is table surface)
 *   - NO pinned vertices (eliminates the "fixed edge can't fold" problem)
 *   - Center-of-mass XZ correction prevents cloth from drifting
 *   - Floor constraint (Y >= 0) forces excess fabric upward
 *
 * Physics: Position Verlet + XPBD distance constraints
 *   - gary=0 → stiff stitch (cloth pinched up), gary=1 → no stitch (flat cloth)
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThreeScene } from '../../hooks/useThreeScene';
import { useAppStore } from '../../store/useAppStore';
import type { TiledPattern } from '../../types';

// ── Physics constants ─────────────────────────────────────────────────────────
const SUBDIV    = 3;    // Mesh subdivision factor per pattern grid step (3x resolution)
const SUBSTEPS  = 15;
const GRAVITY   = -1.0;
const VDAMP     = 0.998;
const STRETCH_C = 1e-5;
const BEND_C    = 1e-3;
const Y_NOISE   = 0.02;

interface Con { a: number; b: number; r: number; c: number }

// ── Build fine cloth mesh from TiledPattern ───────────────────────────────────
function buildCloth(pattern: TiledPattern) {
  const verts = pattern.vertices;
  const nx    = pattern.tangram.nx;
  const ny    = pattern.tangram.ny;

  // Pattern vertices are on an integer grid [0..nx-1] x [0..ny-1]
  // We build a finer grid by inserting SUBDIV-1 points between each grid step.
  const fineNx = (nx - 1) * SUBDIV + 1;
  const fineNy = (ny - 1) * SUBDIV + 1;
  const N      = fineNx * fineNy;

  // Cloth bounds (from pattern vertex coords)
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const v of verts) {
    minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
    minZ = Math.min(minZ, v.y); maxZ = Math.max(maxZ, v.y);
  }
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const clothW  = maxX - minX;
  const clothH  = maxZ - minZ;

  // ── Initialize fine grid positions ──────────────────────────────────────
  const pos  = new Float32Array(N * 3);
  const prev = new Float32Array(N * 3);
  const w    = new Float32Array(N);

  for (let fy = 0; fy < fineNy; fy++) {
    for (let fx = 0; fx < fineNx; fx++) {
      const i  = fy * fineNx + fx;
      const px = minX + (fx / (fineNx - 1)) * clothW;
      const pz = minZ + (fy / (fineNy - 1)) * clothH;
      pos[i*3]     = px;
      pos[i*3 + 1] = Math.random() * Y_NOISE;
      pos[i*3 + 2] = pz;
      prev[i*3]    = pos[i*3];
      prev[i*3+1]  = pos[i*3+1];
      prev[i*3+2]  = pos[i*3+2];
      w[i] = 1;
    }
  }

  // ── Structural constraints on fine grid ──────────────────────────────────
  const cons: Con[] = [];
  const seen = new Set<string>();
  const addEdge = (a: number, b: number, c: number) => {
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (seen.has(k)) return;
    seen.add(k);
    const dx = pos[b*3]   - pos[a*3];
    const dz = pos[b*3+2] - pos[a*3+2];
    const r  = Math.sqrt(dx*dx + dz*dz);
    if (r < 1e-6) return;
    cons.push({ a, b, r, c });
  };

  for (let fy = 0; fy < fineNy; fy++) {
    for (let fx = 0; fx < fineNx; fx++) {
      const v = fy * fineNx + fx;
      // Horizontal / vertical stretch
      if (fx + 1 < fineNx) addEdge(v, v + 1,       STRETCH_C);
      if (fy + 1 < fineNy) addEdge(v, v + fineNx,  STRETCH_C);
      // Diagonal stretch (shear resistance)
      if (fx + 1 < fineNx && fy + 1 < fineNy) {
        addEdge(v, v + fineNx + 1, STRETCH_C);
        addEdge(v + 1, v + fineNx, STRETCH_C);
      }
      // Bend (skip-2)
      if (fx + 2 < fineNx) addEdge(v, v + 2,           BEND_C);
      if (fy + 2 < fineNy) addEdge(v, v + 2 * fineNx,  BEND_C);
    }
  }

  // ── Map pattern vertex index → fine grid index ──────────────────────────
  // Pattern vertex at (gx, gy) in integer grid → fine index (gy*SUBDIV)*fineNx + (gx*SUBDIV)
  const patternToFine = (patIdx: number): number => {
    const v  = verts[patIdx];
    const gx = Math.round(v.x - minX);   // integer grid col (0..nx-1)
    const gy = Math.round(v.y - minZ);   // integer grid row (0..ny-1)
    return (gy * SUBDIV) * fineNx + (gx * SUBDIV);
  };

  // ── Stitch constraints (XPBD restLen=0) ─────────────────────────────────
  const stCons: Con[] = [];
  for (const group of pattern.stitchingLines) {
    for (let a = 0; a < group.length - 1; a++) {
      for (let b = a + 1; b < group.length; b++) {
        if (group[a] < verts.length && group[b] < verts.length) {
          const fa = patternToFine(group[a]);
          const fb = patternToFine(group[b]);
          stCons.push({ a: fa, b: fb, r: 0, c: 1e-4 });
        }
      }
    }
  }

  // ── Triangle mesh from fine grid ─────────────────────────────────────────
  const indices: number[] = [];
  for (let fy = 0; fy < fineNy - 1; fy++) {
    for (let fx = 0; fx < fineNx - 1; fx++) {
      const bl = fy * fineNx + fx;
      const br = bl + 1;
      const tl = bl + fineNx;
      const tr = tl + 1;
      indices.push(bl, br, tr,  bl, tr, tl);
    }
  }

  // ── Vertex colors (stitch points blue, rest pink) ─────────────────────────
  const stitchSet = new Set<number>();
  for (const group of pattern.stitchingLines) {
    for (const idx of group) {
      if (idx < verts.length) stitchSet.add(patternToFine(idx));
    }
  }
  const colors = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    if (stitchSet.has(i)) {
      colors[i*3] = 0.20; colors[i*3+1] = 0.55; colors[i*3+2] = 0.95; // blue
    } else {
      colors[i*3] = 0.95; colors[i*3+1] = 0.45; colors[i*3+2] = 0.65; // pink
    }
  }

  return { N, pos, prev, w, cons, stCons, indices, colors,
           clothW, clothH, centerX, centerZ };
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
  const consRef   = useRef<Con[]>([]);
  const stConRef  = useRef<Con[]>([]);
  const nRef      = useRef(0);
  const cx0Ref    = useRef(0);
  const cz0Ref    = useRef(0);
  const clothRef  = useRef<THREE.Mesh | null>(null);
  const rafRef    = useRef<number | null>(null);

  // ── Simulation step (Position Verlet + XPBD) ──────────────────────────────
  const step = () => {
    const pos  = posRef.current;
    const prev = prevRef.current;
    const w    = wRef.current;
    const cons = consRef.current;
    const st   = stConRef.current;
    if (!pos || !prev || !w || nRef.current === 0) return;

    const N     = nRef.current;
    const subDt = (1 / 60) / SUBSTEPS;
    const sd2   = subDt * subDt;
    const cx0   = cx0Ref.current;
    const cz0   = cz0Ref.current;

    // gary=0 → strong stitch; gary=1 → no stitch
    const stitchC  = Math.pow(garyRef.current, 2) * 0.5 + 1e-4;
    const doStitch = garyRef.current < 0.99;

    for (let sub = 0; sub < SUBSTEPS; sub++) {
      // 1. Verlet integrate with gravity
      for (let v = 0; v < N; v++) {
        if (w[v] === 0) continue;
        const vx = (pos[v*3]   - prev[v*3])   * VDAMP;
        const vy = (pos[v*3+1] - prev[v*3+1]) * VDAMP;
        const vz = (pos[v*3+2] - prev[v*3+2]) * VDAMP;
        prev[v*3]   = pos[v*3];
        prev[v*3+1] = pos[v*3+1];
        prev[v*3+2] = pos[v*3+2];
        pos[v*3]   += vx;
        pos[v*3+1] += vy + GRAVITY * sd2;
        pos[v*3+2] += vz;
      }

      // 2. Floor constraint (Y ≥ 0)
      for (let v = 0; v < N; v++) {
        if (pos[v*3+1] < 0) {
          pos[v*3+1] = 0;
          if (prev[v*3+1] > 0) prev[v*3+1] = 0;
        }
      }

      // 3. Structural XPBD constraints
      for (const c of cons) {
        const wa = w[c.a], wb = w[c.b], wS = wa + wb;
        if (wS === 0) continue;
        const dx = pos[c.b*3]   - pos[c.a*3];
        const dy = pos[c.b*3+1] - pos[c.a*3+1];
        const dz = pos[c.b*3+2] - pos[c.a*3+2];
        const d  = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (d < 1e-6) continue;
        const lam = -(d - c.r) / (wS + c.c / sd2);
        const nx_ = dx/d, ny_ = dy/d, nz_ = dz/d;
        pos[c.a*3]   -= wa * lam * nx_; pos[c.a*3+1] -= wa * lam * ny_; pos[c.a*3+2] -= wa * lam * nz_;
        pos[c.b*3]   += wb * lam * nx_; pos[c.b*3+1] += wb * lam * ny_; pos[c.b*3+2] += wb * lam * nz_;
      }

      // 4. Stitch XPBD constraints (restLen=0)
      if (doStitch) {
        for (const c of st) {
          const wa = w[c.a], wb = w[c.b], wS = wa + wb;
          if (wS === 0) continue;
          const dx = pos[c.b*3]   - pos[c.a*3];
          const dy = pos[c.b*3+1] - pos[c.a*3+1];
          const dz = pos[c.b*3+2] - pos[c.a*3+2];
          const d  = Math.sqrt(dx*dx + dy*dy + dz*dz);
          if (d < 1e-6) continue;
          const lam = -d / (wS + stitchC / sd2);
          const nx_ = dx/d, ny_ = dy/d, nz_ = dz/d;
          pos[c.a*3]   -= wa * lam * nx_; pos[c.a*3+1] -= wa * lam * ny_; pos[c.a*3+2] -= wa * lam * nz_;
          pos[c.b*3]   += wb * lam * nx_; pos[c.b*3+1] += wb * lam * ny_; pos[c.b*3+2] += wb * lam * nz_;
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

    const { N, pos, prev, w, cons, stCons, indices, colors,
            clothW, clothH, centerX, centerZ } = buildCloth(tiledPattern);

    posRef.current   = pos;
    prevRef.current  = prev;
    wRef.current     = w;
    consRef.current  = cons;
    stConRef.current = stCons;
    nRef.current     = N;
    cx0Ref.current   = centerX;
    cz0Ref.current   = centerZ;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos.slice(), 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
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
      const size = Math.max(clothW, clothH);
      camera.current.position.set(centerX, size * 0.9, centerZ + size * 0.7);
      camera.current.lookAt(centerX, 0, centerZ);
      controls.current.target.set(centerX, 0, centerZ);
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
