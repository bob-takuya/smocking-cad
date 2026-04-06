/**
 * ResultViewer3D — Real-time Verlet+XPBD cloth simulation
 *
 * Physics validated by headless tests (test_smocking3.mjs):
 *   xpbdBend2 config: stretchC=1e-5, bendC=1e-3, stitchC=1e-4
 *   → vel=0.00 at f480, zRange=4.23 (deep smocking folds) ✅
 *
 * Coordinate system:
 *   - Cloth hangs in XY plane (pole = X axis, cloth hangs in -Y)
 *   - Z = fold direction (perpendicular to cloth)
 *   - Small Z-noise breaks symmetry → folds form naturally
 *   - Top row (min pattern-y) pinned to pole
 *
 * Stitch constraint:
 *   - XPBD distance constraint with restLen=0 (NOT lerp/weld)
 *   - Compliance based on gary: gary=0 → stiff (full stitch), gary=1 → soft (open)
 *   - No energy injection; converges to equilibrium naturally
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThreeScene } from '../../hooks/useThreeScene';
import { useAppStore } from '../../store/useAppStore';
import type { TiledPattern } from '../../types';

// ── Physics constants ─────────────────────────────────────────────────────────
const SUBSTEPS    = 20;
const GRAVITY     = -3.0;        // light gravity for gentle sag
const VDAMP       = 0.998;       // Verlet damping per substep
const STRETCH_C   = 1e-5;        // structural compliance (soft enough for stitch to work)
const BEND_C      = 1e-3;        // bending compliance (stiffer = deeper folds)
const TOP_EPS     = 0.01;        // tolerance for top-row pin detection
const Z_NOISE     = 0.05;        // initial Z perturbation to seed fold direction

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

  // Find min Y in pattern space (= top row)
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
  for (const v of verts) {
    minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
  }

  for (let i = 0; i < N; i++) {
    pos[i*3]   = verts[i].x;                          // X: horizontal (parallel to pole)
    pos[i*3+1] = -(verts[i].y - minY);               // Y: hanging downward from 0
    pos[i*3+2] = (Math.random() - 0.5) * Z_NOISE;    // Z: fold direction + noise
    prev[i*3]   = pos[i*3];
    prev[i*3+1] = pos[i*3+1];
    prev[i*3+2] = pos[i*3+2];
    w[i] = (verts[i].y - minY) < TOP_EPS ? 0 : 1;    // pin top row
  }

  // Structural constraints from edges
  const cons: Con[] = [];
  const seen = new Set<string>();
  const addEdge = (a: number, b: number, c: number) => {
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (seen.has(k)) return;
    seen.add(k);
    const dx = pos[b*3] - pos[a*3], dy = pos[b*3+1] - pos[a*3+1];
    const r = Math.sqrt(dx*dx + dy*dy);   // rest length from initial XY (ignore Z noise)
    if (r < 1e-6) return;
    cons.push({ a, b, r, c });
  };

  for (const edge of pattern.edges) {
    if (edge.type === 'stitch') continue;
    addEdge(edge.a, edge.b, STRETCH_C);
  }

  // Bend (skip-1) constraints
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const v = j * nx + i;
      if (i + 2 < nx) addEdge(v, j * nx + (i + 2), BEND_C);
      if (j + 2 < ny) addEdge(v, (j + 2) * nx + i, BEND_C);
    }
  }

  // Build triangle index list
  const indices: number[] = [];
  for (const face of pattern.faces) {
    if (face.vertices.length === 3) indices.push(...face.vertices);
  }

  // Vertex colors (underlay=blue, pleat=pink)
  const colors = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    if (verts[i].type === 'underlay') {
      colors[i*3] = 0.29; colors[i*3+1] = 0.56; colors[i*3+2] = 0.85;
    } else {
      colors[i*3] = 0.91; colors[i*3+1] = 0.40; colors[i*3+2] = 0.60;
    }
  }

  const clothWidth  = maxX - minX;
  const clothHeight = maxY - minY;
  const centerX = minX + clothWidth  / 2;
  const centerY = clothHeight / 2;  // world Y center (hangs from 0 to -clothHeight)

  return { N, pos, prev, w, cons, indices, colors, clothWidth, clothHeight, centerX, centerY };
}

// ── Component ─────────────────────────────────────────────────────────────────
export function ResultViewer3D() {
  const { containerRef, scene, camera, controls } = useThreeScene();
  const { tiledPattern, gary } = useAppStore();

  // Sync gary to ref (avoid stale closure in RAF)
  const garyRef = useRef(gary);
  useEffect(() => { garyRef.current = gary; }, [gary]);

  // Simulation state
  const posRef   = useRef<Float32Array | null>(null);
  const prevRef  = useRef<Float32Array | null>(null);
  const wRef     = useRef<Float32Array | null>(null);
  const consRef  = useRef<Con[]>([]);
  const stConRef = useRef<Con[]>([]);   // stitch constraints (restLen=0, compliance varies)
  const clothRef = useRef<THREE.Mesh | null>(null);
  const rafRef   = useRef<number | null>(null);
  const nRef     = useRef(0);

  // ── Simulation step ────────────────────────────────────────────────────────
  const step = () => {
    const pos    = posRef.current;
    const prev   = prevRef.current;
    const w      = wRef.current;
    const cons   = consRef.current;
    const stCons = stConRef.current;
    if (!pos || !prev || !w || nRef.current === 0) return;

    const N     = nRef.current;
    const subDt = (1 / 60) / SUBSTEPS;
    const sd2   = subDt * subDt;

    // Stitch compliance from gary: gary=0 → stiff (1e-4), gary=1 → very soft (disabled)
    const stitchC = Math.pow(garyRef.current, 2) * 0.5 + 1e-4;

    for (let sub = 0; sub < SUBSTEPS; sub++) {
      // Verlet predict
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

      // XPBD structural constraints
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

      // XPBD stitch constraints (restLen=0, varying compliance)
      if (garyRef.current < 0.99) {
        for (const c of stCons) {
          const wa = w[c.a], wb = w[c.b], wS = wa + wb;
          if (wS === 0) continue;
          const dx = pos[c.b*3]   - pos[c.a*3];
          const dy = pos[c.b*3+1] - pos[c.a*3+1];
          const dz = pos[c.b*3+2] - pos[c.a*3+2];
          const d  = Math.sqrt(dx*dx + dy*dy + dz*dz);
          if (d < 1e-6) continue;
          const lam = -d / (wS + stitchC / sd2);  // restLen=0: C = d
          const nx = dx/d, ny = dy/d, nz = dz/d;
          pos[c.a*3]   -= wa * lam * nx;
          pos[c.a*3+1] -= wa * lam * ny;
          pos[c.a*3+2] -= wa * lam * nz;
          pos[c.b*3]   += wb * lam * nx;
          pos[c.b*3+1] += wb * lam * ny;
          pos[c.b*3+2] += wb * lam * nz;
        }
      }
    }
  };

  // ── Initialize cloth mesh when pattern changes ────────────────────────────
  useEffect(() => {
    if (!scene.current || !tiledPattern) return;

    // Remove old mesh
    if (clothRef.current) {
      scene.current.remove(clothRef.current);
      clothRef.current.geometry.dispose();
      (clothRef.current.material as THREE.Material).dispose();
      clothRef.current = null;
    }

    const { N, pos, prev, w, cons, indices, colors, clothWidth, clothHeight, centerX, centerY } =
      buildCloth(tiledPattern);

    posRef.current  = pos;
    prevRef.current = prev;
    wRef.current    = w;
    consRef.current = cons;
    nRef.current    = N;

    // Build stitch constraints (restLen=0) from stitchingLines
    const stCons: Con[] = [];
    for (const group of tiledPattern.stitchingLines) {
      for (let a = 0; a < group.length - 1; a++) {
        for (let b = a + 1; b < group.length; b++) {
          stCons.push({ a: group[a], b: group[b], r: 0, c: 1e-4 });
        }
      }
    }
    stConRef.current = stCons;

    // Build geometry
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos.slice(), 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshPhongMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      shininess: 20,
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.current.add(mesh);
    clothRef.current = mesh;

    // Position camera to look at hanging cloth from slightly in front
    if (camera.current && controls.current) {
      const camDist = Math.max(clothWidth, clothHeight) * 1.4;
      camera.current.position.set(centerX, -centerY, camDist);
      camera.current.lookAt(centerX, -centerY, 0);
      controls.current.target.set(centerX, -centerY, 0);
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
