/**
 * ResultViewer3D — Cloth simulation: flat cloth on table, pinched upward at stitch points
 *
 * Coordinate system:
 *   - Cloth lies flat in XZ plane (Y=0 is table surface)
 *   - world X = pattern.x, world Z = pattern.y, world Y = 0 + tiny noise
 *   - NO pinned vertices (eliminates the "fixed edge can't fold" problem)
 *   - Center-of-mass XZ correction prevents cloth from drifting
 *   - Floor constraint (Y >= 0) forces excess fabric upward
 *
 * Stitch physics:
 *   - XPBD distance constraint (restLen=0) pulls stitch groups together in 3D
 *   - Stitch vertices + excess fabric forced up through floor constraint
 *   - gary=0 → stiff stitch (cloth pinched up), gary=1 → no stitch (flat cloth)
 *
 * Validated by test_table.mjs:
 *   base config: maxY=5.4, vel=0.88 at f480, stitchDist=0.15 (92% closure) ✅
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThreeScene } from '../../hooks/useThreeScene';
import { useAppStore } from '../../store/useAppStore';
import type { TiledPattern } from '../../types';

// ── Physics constants ─────────────────────────────────────────────────────────
const SUBSTEPS  = 20;
const GRAVITY   = -1.0;   // light gravity: non-stitched parts stay near table
const VDAMP     = 0.998;  // Verlet damping per substep
const STRETCH_C = 1e-5;   // structural compliance (soft enough for stitch to work)
const BEND_C    = 1e-3;   // bending compliance
const Y_NOISE   = 0.02;   // initial Y perturbation (seeds upward fold direction)

interface Con { a: number; b: number; r: number; c: number }

// ── Build cloth data from TiledPattern ───────────────────────────────────────
function buildCloth(pattern: TiledPattern) {
  const verts = pattern.vertices;
  const N     = verts.length;
  const nx    = pattern.tangram.nx;
  const ny    = pattern.tangram.ny;

  const pos  = new Float32Array(N * 3);
  const prev = new Float32Array(N * 3);
  const w    = new Float32Array(N);

  // Compute cloth bounds and center (for camera + COM correction)
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const v of verts) {
    minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
    minZ = Math.min(minZ, v.y); maxZ = Math.max(maxZ, v.y);
  }
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const clothW  = maxX - minX;
  const clothH  = maxZ - minZ;

  // Initialize: flat in XZ plane with tiny positive Y noise
  for (let i = 0; i < N; i++) {
    pos[i*3]   = verts[i].x;
    pos[i*3+1] = Math.random() * Y_NOISE;  // tiny Y (seeds upward fold)
    pos[i*3+2] = verts[i].y;
    prev[i*3]   = pos[i*3];
    prev[i*3+1] = pos[i*3+1];
    prev[i*3+2] = pos[i*3+2];
    w[i] = 1; // NO pinned vertices
  }

  // Structural constraints (skip stitch-type edges)
  const cons: Con[] = [];
  const seen = new Set<string>();
  const addEdge = (a: number, b: number, c: number) => {
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (seen.has(k)) return;
    seen.add(k);
    // Rest length from XZ distance only (initial flat state)
    const dx = verts[b].x - verts[a].x;
    const dz = verts[b].y - verts[a].y;
    const r = Math.sqrt(dx*dx + dz*dz);
    if (r < 1e-6) return;
    cons.push({ a, b, r, c });
  };

  for (const edge of pattern.edges) {
    if (edge.type === 'stitch') continue;
    addEdge(edge.a, edge.b, STRETCH_C);
  }

  // Bend (skip-1) constraints via grid indices
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const v = j * nx + i;
      if (v >= N) continue;
      if (i + 2 < nx && j * nx + (i + 2) < N) addEdge(v, j * nx + (i + 2), BEND_C);
      if (j + 2 < ny && (j + 2) * nx + i < N)  addEdge(v, (j + 2) * nx + i, BEND_C);
    }
  }

  // Stitch constraints (restLen=0) from stitchingLines
  const stCons: Con[] = [];
  for (const group of pattern.stitchingLines) {
    for (let a = 0; a < group.length - 1; a++) {
      for (let b = a + 1; b < group.length; b++) {
        if (group[a] < N && group[b] < N) {
          stCons.push({ a: group[a], b: group[b], r: 0, c: 1e-4 });
        }
      }
    }
  }

  // Build triangle mesh
  const indices: number[] = [];
  for (const face of pattern.faces) {
    if (face.vertices.length === 3) indices.push(...face.vertices);
  }

  // Vertex colors
  const colors = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    if (verts[i].type === 'underlay') {
      colors[i*3] = 0.30; colors[i*3+1] = 0.58; colors[i*3+2] = 0.88;  // blue
    } else {
      colors[i*3] = 0.95; colors[i*3+1] = 0.45; colors[i*3+2] = 0.65;  // pink
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

  const posRef   = useRef<Float32Array | null>(null);
  const prevRef  = useRef<Float32Array | null>(null);
  const wRef     = useRef<Float32Array | null>(null);
  const consRef  = useRef<Con[]>([]);
  const stConRef = useRef<Con[]>([]);
  const nRef     = useRef(0);
  const cx0Ref   = useRef(0);  // original center X
  const cz0Ref   = useRef(0);  // original center Z
  const clothRef = useRef<THREE.Mesh | null>(null);
  const rafRef   = useRef<number | null>(null);

  // ── Simulation step ────────────────────────────────────────────────────────
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

    // gary=0 → strong stitch (stitchC small); gary=1 → minimal stitch
    const stitchC = Math.pow(garyRef.current, 2) * 0.5 + 1e-4;
    const doStitch = garyRef.current < 0.99;

    for (let sub = 0; sub < SUBSTEPS; sub++) {
      // 1. Verlet predict with gravity
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

      // 2. Floor constraint: Y >= 0 (table surface)
      for (let v = 0; v < N; v++) {
        if (pos[v*3+1] < 0) {
          pos[v*3+1] = 0;
          if (prev[v*3+1] > 0) prev[v*3+1] = 0;  // stop downward velocity
        }
      }

      // 3. Structural constraints (XPBD)
      for (const c of cons) {
        const wa = w[c.a], wb = w[c.b], wS = wa + wb;
        if (wS === 0) continue;
        const dx = pos[c.b*3]   - pos[c.a*3];
        const dy = pos[c.b*3+1] - pos[c.a*3+1];
        const dz = pos[c.b*3+2] - pos[c.a*3+2];
        const d  = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (d < 1e-6) continue;
        const lam = -(d - c.r) / (wS + c.c / sd2);
        const nx = dx/d, ny = dy/d, nz = dz/d;
        pos[c.a*3]   -= wa * lam * nx;
        pos[c.a*3+1] -= wa * lam * ny;
        pos[c.a*3+2] -= wa * lam * nz;
        pos[c.b*3]   += wb * lam * nx;
        pos[c.b*3+1] += wb * lam * ny;
        pos[c.b*3+2] += wb * lam * nz;
      }

      // 4. Stitch constraints (XPBD, restLen=0)
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
          const nx = dx/d, ny = dy/d, nz = dz/d;
          pos[c.a*3]   -= wa * lam * nx;
          pos[c.a*3+1] -= wa * lam * ny;
          pos[c.a*3+2] -= wa * lam * nz;
          pos[c.b*3]   += wb * lam * nx;
          pos[c.b*3+1] += wb * lam * ny;
          pos[c.b*3+2] += wb * lam * nz;
        }
      }

      // 5. Center-of-mass XZ correction (prevent lateral drift without edge-pinning)
      let cx = 0, cz = 0;
      for (let v = 0; v < N; v++) { cx += pos[v*3]; cz += pos[v*3+2]; }
      cx /= N; cz /= N;
      const dX = cx - cx0, dZ = cz - cz0;
      for (let v = 0; v < N; v++) {
        pos[v*3]   -= dX;  prev[v*3]   -= dX;
        pos[v*3+2] -= dZ;  prev[v*3+2] -= dZ;
      }
    }
  };

  // ── Initialize when pattern changes ───────────────────────────────────────
  useEffect(() => {
    if (!scene.current || !tiledPattern) return;

    // Remove old mesh
    if (clothRef.current) {
      scene.current.remove(clothRef.current);
      clothRef.current.geometry.dispose();
      (clothRef.current.material as THREE.Material).dispose();
      clothRef.current = null;
    }

    const { N, pos, prev, w, cons, stCons, indices, colors,
            clothW, clothH, centerX, centerZ } = buildCloth(tiledPattern);

    posRef.current  = pos;
    prevRef.current = prev;
    wRef.current    = w;
    consRef.current = cons;
    stConRef.current = stCons;
    nRef.current    = N;
    cx0Ref.current  = centerX;
    cz0Ref.current  = centerZ;

    // Build Three.js mesh
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

    // Camera: slightly above and in front, looking down at the table cloth
    if (camera.current && controls.current) {
      const size = Math.max(clothW, clothH);
      camera.current.position.set(centerX, size * 0.9, centerZ + size * 0.7);
      camera.current.lookAt(centerX, 0, centerZ);
      controls.current.target.set(centerX, 0, centerZ);
      controls.current.update();
    }

  }, [tiledPattern, scene, camera, controls]);

  // ── RAF loop: simulate + render ───────────────────────────────────────────
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
