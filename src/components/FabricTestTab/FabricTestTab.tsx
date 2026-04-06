import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Button } from '../ui/Button';
import { Slider } from '../ui/Slider';

// ── Constants ────────────────────────────────────────────────────────────────
const RES     = 30;                        // 30×30 cells → 31×31 = 961 vertices
const N       = (RES + 1) * (RES + 1);
const SPACING = 0.5;                       // 15×15 unit cloth
const SUBSTEPS = 15;
const GRAVITY  = -6.0;                     // downward acceleration (world-Y)

// Compliance values
const STRETCH_C = 1e-8;                    // almost inextensible
const BEND_C    = 5e-5;                    // resist folding flat

// Cloth is hung from the top row (j=0).
// Vertices hang downward in -Y.

function vidx(i: number, j: number) {
  return j * (RES + 1) + i;
}

interface Constraint {
  a: number;
  b: number;
  restLen: number;
  compliance: number;
}

export function FabricTestTab() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef     = useRef<THREE.Scene | null>(null);
  const cameraRef    = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef  = useRef<OrbitControls | null>(null);
  const rafRef       = useRef<number | null>(null);
  const clothRef     = useRef<THREE.Mesh | null>(null);
  const rcRef        = useRef<THREE.Raycaster>(new THREE.Raycaster());

  // Physics arrays
  const posRef  = useRef(new Float32Array(N * 3));
  const prevRef = useRef(new Float32Array(N * 3));
  const velRef  = useRef(new Float32Array(N * 3));
  const wRef    = useRef(new Float32Array(N));      // inverse mass (0 = pinned)
  const conRef  = useRef<Constraint[]>([]);

  // Stitch state (live refs so animate closure always has latest)
  const pARef  = useRef<number | null>(null);
  const pBRef  = useRef<number | null>(null);
  const strRef = useRef(0.5);

  const [pointA,      setPointA]      = useState<number | null>(null);
  const [pointB,      setPointB]      = useState<number | null>(null);
  const [pullStrength, setPullStrength] = useState(0.5);

  // Keep refs in sync
  useEffect(() => { pARef.current = pointA; },       [pointA]);
  useEffect(() => { pBRef.current = pointB; },       [pointB]);
  useEffect(() => { strRef.current = pullStrength; }, [pullStrength]);

  // Visual spheres
  const sphARef = useRef<THREE.Mesh | null>(null);
  const sphBRef = useRef<THREE.Mesh | null>(null);

  // ── Init cloth ─────────────────────────────────────────────────────────────
  const initCloth = useCallback(() => {
    const pos  = posRef.current;
    const prev = prevRef.current;
    const vel  = velRef.current;
    const w    = wRef.current;
    const half = (RES * SPACING) / 2;

    for (let j = 0; j <= RES; j++) {
      for (let i = 0; i <= RES; i++) {
        const v = vidx(i, j);
        pos[v*3]     =  i * SPACING - half;
        pos[v*3 + 1] = -j * SPACING;          // hangs downward in -Y
        // Small Z-noise to break planar symmetry → triggers natural folding
        pos[v*3 + 2] = (Math.random() - 0.5) * 0.04;

        prev[v*3]     = pos[v*3];
        prev[v*3 + 1] = pos[v*3 + 1];
        prev[v*3 + 2] = pos[v*3 + 2];

        vel[v*3]     = 0;
        vel[v*3 + 1] = 0;
        vel[v*3 + 2] = 0;

        // Top row pinned
        w[v] = j === 0 ? 0 : 1;
      }
    }
  }, []);

  // ── Build constraints ──────────────────────────────────────────────────────
  const buildConstraints = useCallback(() => {
    const pos  = posRef.current;
    const cons: Constraint[] = [];

    const dist = (a: number, b: number) => {
      const dx = pos[b*3]   - pos[a*3];
      const dy = pos[b*3+1] - pos[a*3+1];
      const dz = pos[b*3+2] - pos[a*3+2];
      return Math.sqrt(dx*dx + dy*dy + dz*dz);
    };

    for (let j = 0; j <= RES; j++) {
      for (let i = 0; i <= RES; i++) {
        const v = vidx(i, j);
        // Structural (stretch)
        if (i < RES) cons.push({ a: v, b: vidx(i+1, j),   restLen: dist(v, vidx(i+1,j)),   compliance: STRETCH_C });
        if (j < RES) cons.push({ a: v, b: vidx(i, j+1),   restLen: dist(v, vidx(i,j+1)),   compliance: STRETCH_C });
        // Shear
        if (i < RES && j < RES) {
          cons.push({ a: v,             b: vidx(i+1,j+1), restLen: dist(v, vidx(i+1,j+1)), compliance: STRETCH_C });
          cons.push({ a: vidx(i+1,j), b: vidx(i,j+1),   restLen: dist(vidx(i+1,j), vidx(i,j+1)), compliance: STRETCH_C });
        }
        // Bend (skip-1 constraints)
        if (i + 2 <= RES) cons.push({ a: v, b: vidx(i+2, j),   restLen: dist(v, vidx(i+2,j)),   compliance: BEND_C });
        if (j + 2 <= RES) cons.push({ a: v, b: vidx(i, j+2),   restLen: dist(v, vidx(i,j+2)),   compliance: BEND_C });
      }
    }

    conRef.current = cons;
  }, []);

  // ── Simulate one frame ─────────────────────────────────────────────────────
  const simulateFrame = useCallback(() => {
    const pos  = posRef.current;
    const prev = prevRef.current;
    const vel  = velRef.current;
    const w    = wRef.current;
    const cons = conRef.current;
    const pA   = pARef.current;
    const pB   = pBRef.current;

    const dt    = 1 / 60;
    const subDt = dt / SUBSTEPS;
    const sd2   = subDt * subDt;

    for (let sub = 0; sub < SUBSTEPS; sub++) {
      // 1. Integrate velocity → predict positions
      for (let v = 0; v < N; v++) {
        if (w[v] === 0) continue;
        vel[v*3 + 1] += GRAVITY * subDt;          // gravity
        prev[v*3]     = pos[v*3];
        prev[v*3 + 1] = pos[v*3 + 1];
        prev[v*3 + 2] = pos[v*3 + 2];
        pos[v*3]     += vel[v*3]     * subDt;
        pos[v*3 + 1] += vel[v*3 + 1] * subDt;
        pos[v*3 + 2] += vel[v*3 + 2] * subDt;
      }

      // 2. Solve structural + bend constraints (XPBD)
      for (const c of cons) {
        const wa = w[c.a], wb = w[c.b];
        const wSum = wa + wb;
        if (wSum === 0) continue;

        const dx = pos[c.b*3]   - pos[c.a*3];
        const dy = pos[c.b*3+1] - pos[c.a*3+1];
        const dz = pos[c.b*3+2] - pos[c.a*3+2];
        const d  = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (d < 1e-6) continue;

        const alpha  = c.compliance / sd2;
        const C      = d - c.restLen;
        const lambda = -C / (wSum + alpha);
        const nx = dx/d, ny = dy/d, nz = dz/d;

        pos[c.a*3]   -= wa * lambda * nx;
        pos[c.a*3+1] -= wa * lambda * ny;
        pos[c.a*3+2] -= wa * lambda * nz;
        pos[c.b*3]   += wb * lambda * nx;
        pos[c.b*3+1] += wb * lambda * ny;
        pos[c.b*3+2] += wb * lambda * nz;
      }

      // 3. Stitch constraint
      if (pA !== null && pB !== null) {
        const strength = strRef.current;
        if (strength > 0 && w[pA] !== 0 && w[pB] !== 0) {
          const dx = pos[pB*3]   - pos[pA*3];
          const dy = pos[pB*3+1] - pos[pA*3+1];
          const dz = pos[pB*3+2] - pos[pA*3+2];
          const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
          const mx = (pos[pA*3]   + pos[pB*3])   / 2;
          const my = (pos[pA*3+1] + pos[pB*3+1]) / 2;
          const mz = (pos[pA*3+2] + pos[pB*3+2]) / 2;

          const SNAP = 0.08; // weld threshold (world units)
          if (dist < SNAP) {
            // Welded: force exact same position, zero relative velocity
            pos[pA*3]   = pos[pB*3]   = mx;
            pos[pA*3+1] = pos[pB*3+1] = my;
            pos[pA*3+2] = pos[pB*3+2] = mz;
            // Kill relative velocity so they don't spring apart
            const rvx = (vel[pA*3]   - vel[pB*3])   * 0.5;
            const rvy = (vel[pA*3+1] - vel[pB*3+1]) * 0.5;
            const rvz = (vel[pA*3+2] - vel[pB*3+2]) * 0.5;
            vel[pA*3]   -= rvx; vel[pB*3]   += rvx;
            vel[pA*3+1] -= rvy; vel[pB*3+1] += rvy;
            vel[pA*3+2] -= rvz; vel[pB*3+2] += rvz;
          } else {
            // Lerp: 3% per substep at strength=1
            const rate = strength * 0.03;
            pos[pA*3]   += (mx - pos[pA*3])   * rate;
            pos[pA*3+1] += (my - pos[pA*3+1]) * rate;
            pos[pA*3+2] += (mz - pos[pA*3+2]) * rate;
            pos[pB*3]   += (mx - pos[pB*3])   * rate;
            pos[pB*3+1] += (my - pos[pB*3+1]) * rate;
            pos[pB*3+2] += (mz - pos[pB*3+2]) * rate;
          }
        }
      }

      // 4. Derive velocities from position delta
      for (let v = 0; v < N; v++) {
        if (w[v] === 0) continue;
        vel[v*3]     = (pos[v*3]   - prev[v*3])   / subDt;
        vel[v*3+1]   = (pos[v*3+1] - prev[v*3+1]) / subDt;
        vel[v*3+2]   = (pos[v*3+2] - prev[v*3+2]) / subDt;
      }
    }

    // 5. Damping once per frame
    for (let v = 0; v < N; v++) {
      vel[v*3]   *= 0.99;
      vel[v*3+1] *= 0.99;
      vel[v*3+2] *= 0.99;
    }
  }, []);

  // ── Create geometry ────────────────────────────────────────────────────────
  const makeGeometry = useCallback(() => {
    const geo = new THREE.BufferGeometry();
    const indices: number[] = [];
    for (let j = 0; j < RES; j++) {
      for (let i = 0; i < RES; i++) {
        const v0 = vidx(i,   j);
        const v1 = vidx(i+1, j);
        const v2 = vidx(i,   j+1);
        const v3 = vidx(i+1, j+1);
        indices.push(v0, v2, v1,  v1, v2, v3);
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(posRef.current, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, []);

  // ── Three.js setup ─────────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const W = container.clientWidth, H = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1d24);
    sceneRef.current = scene;

    // Camera: front-ish view of hanging cloth
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 500);
    camera.position.set(0, -RES * SPACING * 0.4, RES * SPACING * 1.6);
    camera.lookAt(0, -RES * SPACING * 0.5, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, -RES * SPACING * 0.5, 0);
    controls.enableDamping = true;
    controls.update();
    controlsRef.current = controls;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(8, 12, 10);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.3);
    fill.position.set(-8, 0, -6);
    scene.add(fill);

    // Cloth
    initCloth();
    buildConstraints();
    const geo = makeGeometry();
    const mat = new THREE.MeshPhongMaterial({
      color: 0xF0E8D8,
      side: THREE.DoubleSide,
      shininess: 25,
    });
    const cloth = new THREE.Mesh(geo, mat);
    scene.add(cloth);
    clothRef.current = cloth;

    // Selection spheres
    const sphGeo = new THREE.SphereGeometry(0.18, 12, 12);
    const sphA = new THREE.Mesh(sphGeo, new THREE.MeshBasicMaterial({ color: 0xff8c00 }));
    const sphB = new THREE.Mesh(sphGeo, new THREE.MeshBasicMaterial({ color: 0x4a90e2 }));
    sphA.visible = sphB.visible = false;
    scene.add(sphA); scene.add(sphB);
    sphARef.current = sphA; sphBRef.current = sphB;

    // Hanging bar at top
    const barGeo = new THREE.CylinderGeometry(0.08, 0.08, RES * SPACING + 1, 8);
    const barMat = new THREE.MeshPhongMaterial({ color: 0x555555 });
    const bar = new THREE.Mesh(barGeo, barMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.y = 0.05;
    scene.add(bar);

    // ── Animation loop ──────────────────────────────────────────────────────
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);

      simulateFrame();

      // Upload positions to GPU
      const geom = clothRef.current!.geometry;
      const attr = geom.getAttribute('position') as THREE.BufferAttribute;
      attr.array.set(posRef.current);
      attr.needsUpdate = true;
      geom.computeVertexNormals();

      // Update selection spheres
      const pos = posRef.current;
      const pA = pARef.current, pB = pBRef.current;
      if (sphARef.current) {
        sphARef.current.visible = pA !== null;
        if (pA !== null) sphARef.current.position.set(pos[pA*3], pos[pA*3+1], pos[pA*3+2]);
      }
      if (sphBRef.current) {
        sphBRef.current.visible = pB !== null;
        if (pB !== null) sphBRef.current.position.set(pos[pB*3], pos[pB*3+1], pos[pB*3+2]);
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize
    const onResize = () => {
      const w = container.clientWidth, h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    return () => {
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [initCloth, buildConstraints, makeGeometry, simulateFrame]);

  // ── Click to select vertices ───────────────────────────────────────────────
  const handleClick = useCallback((e: MouseEvent) => {
    const container = containerRef.current;
    const cloth     = clothRef.current;
    const camera    = cameraRef.current;
    if (!container || !cloth || !camera) return;

    const rect = container.getBoundingClientRect();
    const ndc  = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    rcRef.current.setFromCamera(ndc, camera);
    const hits = rcRef.current.intersectObject(cloth);
    if (!hits.length) return;

    const face = hits[0].face;
    if (!face) return;
    const pt  = hits[0].point;
    const pos = posRef.current;

    let closest = face.a, bestDist = Infinity;
    for (const vi of [face.a, face.b, face.c]) {
      const dx = pos[vi*3]-pt.x, dy = pos[vi*3+1]-pt.y, dz = pos[vi*3+2]-pt.z;
      const d2 = dx*dx + dy*dy + dz*dz;
      if (d2 < bestDist) { bestDist = d2; closest = vi; }
    }

    // Don't pick pinned top-row vertices
    if (wRef.current[closest] === 0) return;

    if (pARef.current === null) {
      setPointA(closest);
    } else if (pBRef.current === null && closest !== pARef.current) {
      setPointB(closest);
    }
  }, []);

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    c.addEventListener('click', handleClick);
    return () => c.removeEventListener('click', handleClick);
  }, [handleClick]);

  // ── Reset ─────────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setPointA(null);
    setPointB(null);
    initCloth();
    buildConstraints();
  }, [initCloth, buildConstraints]);

  // ── UI ───────────────────────────────────────────────────────────────────
  const step = pointA === null ? '① Click cloth: select Point A'
             : pointB === null ? '② Click cloth: select Point B'
             : '③ Drag Pull Strength →';

  return (
    <div className="relative w-full h-full bg-[var(--bg-darkest)]">
      <div ref={containerRef} className="w-full h-full" />

      <div className="absolute top-4 left-4 bg-[var(--bg-panel)] bg-opacity-90 p-4 rounded-lg shadow-lg w-64">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
          🧪 Cloth Test
        </h3>
        <p className="text-xs text-[var(--accent)] mb-3">{step}</p>

        <Slider
          label="Pull Strength"
          value={pullStrength}
          min={0}
          max={1}
          step={0.01}
          onChange={setPullStrength}
        />

        <div className="mt-3">
          <Button onClick={handleReset} variant="secondary" size="sm" className="w-full">
            Reset
          </Button>
        </div>

        {(pointA !== null || pointB !== null) && (
          <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-1 text-xs text-[var(--text-secondary)]">
            {pointA !== null && <div><span className="inline-block w-2 h-2 rounded-full bg-orange-400 mr-1.5" />A: v{pointA}</div>}
            {pointB !== null && <div><span className="inline-block w-2 h-2 rounded-full bg-blue-400 mr-1.5" />B: v{pointB}</div>}
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-[var(--border)] text-[10px] text-[var(--text-muted)] space-y-0.5">
          <div>RES {RES}×{RES} · {N} verts · {SUBSTEPS} substeps</div>
          <div>Cloth hangs from top bar. Pick 2 points.</div>
        </div>
      </div>
    </div>
  );
}
