import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Button } from '../ui/Button';
import { Slider } from '../ui/Slider';

// Grid & simulation constants
const RES = 20;                         // grid resolution
const N = (RES + 1) * (RES + 1);        // vertex count = 441
const SPACING = 1.0;
const SUBSTEPS = 20;
const STRETCH_COMPLIANCE = 1e-8;        // stiff cloth
const BEND_COMPLIANCE = 1e-4;           // resist folding
const FLOOR_Y = 0.0;                    // table surface

// Distance constraint type
interface DistConstraint {
  a: number;
  b: number;
  restLen: number;
  compliance: number;
}

// Convert grid (i, j) to vertex index
function idx(i: number, j: number): number {
  return j * (RES + 1) + i;
}

// State machine states
type SimState = 'idle' | 'selected1' | 'ready' | 'stitching';

export function FabricTestTab() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const clothMeshRef = useRef<THREE.Mesh | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());

  // Simulation arrays
  const posRef = useRef<Float32Array>(new Float32Array(N * 3));
  const prevRef = useRef<Float32Array>(new Float32Array(N * 3));
  const velRef = useRef<Float32Array>(new Float32Array(N * 3));
  const constraintsRef = useRef<DistConstraint[]>([]);

  // Selection state
  const [pointA, setPointA] = useState<number | null>(null);
  const [pointB, setPointB] = useState<number | null>(null);
  const [pullStrength, setPullStrength] = useState(0.5);
  const [showWireframe, setShowWireframe] = useState(false);
  const sphereARef = useRef<THREE.Mesh | null>(null);
  const sphereBRef = useRef<THREE.Mesh | null>(null);
  const wireframeMeshRef = useRef<THREE.LineSegments | null>(null);

  // Use refs for simulation to avoid stale closure issues
  const pointARef = useRef<number | null>(null);
  const pointBRef = useRef<number | null>(null);
  const pullStrengthRef = useRef<number>(0.5);

  // Keep refs in sync with state
  useEffect(() => { pointARef.current = pointA; }, [pointA]);
  useEffect(() => { pointBRef.current = pointB; }, [pointB]);
  useEffect(() => { pullStrengthRef.current = pullStrength; }, [pullStrength]);

  // Derive state machine state
  const simState: SimState = pointA === null ? 'idle'
    : pointB === null ? 'selected1'
    : 'ready';

  // Initialize cloth positions flat on table
  const initializeCloth = useCallback(() => {
    const pos = posRef.current;
    const prev = prevRef.current;
    const vel = velRef.current;

    // Center the cloth
    const offset = (RES * SPACING) / 2;

    for (let j = 0; j <= RES; j++) {
      for (let i = 0; i <= RES; i++) {
        const v = idx(i, j);
        pos[v * 3]     = i * SPACING - offset;  // x
        pos[v * 3 + 1] = FLOOR_Y;                // y (on table)
        pos[v * 3 + 2] = j * SPACING - offset;  // z

        prev[v * 3]     = pos[v * 3];
        prev[v * 3 + 1] = pos[v * 3 + 1];
        prev[v * 3 + 2] = pos[v * 3 + 2];

        vel[v * 3]     = 0;
        vel[v * 3 + 1] = 0;
        vel[v * 3 + 2] = 0;
      }
    }
  }, []);

  // Build distance constraints (stretch + bend)
  const buildConstraints = useCallback(() => {
    const constraints: DistConstraint[] = [];
    const pos = posRef.current;

    const getDist = (a: number, b: number): number => {
      const dx = pos[b * 3] - pos[a * 3];
      const dy = pos[b * 3 + 1] - pos[a * 3 + 1];
      const dz = pos[b * 3 + 2] - pos[a * 3 + 2];
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };

    // Stretch constraints: horizontal, vertical, and diagonal edges
    for (let j = 0; j <= RES; j++) {
      for (let i = 0; i <= RES; i++) {
        const v = idx(i, j);

        // Horizontal edge
        if (i < RES) {
          const right = idx(i + 1, j);
          constraints.push({ a: v, b: right, restLen: getDist(v, right), compliance: STRETCH_COMPLIANCE });
        }

        // Vertical edge
        if (j < RES) {
          const down = idx(i, j + 1);
          constraints.push({ a: v, b: down, restLen: getDist(v, down), compliance: STRETCH_COMPLIANCE });
        }

        // Diagonal edges (shear)
        if (i < RES && j < RES) {
          const diagA = idx(i + 1, j + 1);
          constraints.push({ a: v, b: diagA, restLen: getDist(v, diagA), compliance: STRETCH_COMPLIANCE });

          const right = idx(i + 1, j);
          const down = idx(i, j + 1);
          constraints.push({ a: right, b: down, restLen: getDist(right, down), compliance: STRETCH_COMPLIANCE });
        }
      }
    }

    // Bend constraints: cross constraints (i,j) to (i+2,j) and (i,j+2)
    for (let j = 0; j <= RES; j++) {
      for (let i = 0; i <= RES; i++) {
        const v = idx(i, j);

        // Horizontal bend
        if (i + 2 <= RES) {
          const far = idx(i + 2, j);
          constraints.push({ a: v, b: far, restLen: getDist(v, far), compliance: BEND_COMPLIANCE });
        }

        // Vertical bend
        if (j + 2 <= RES) {
          const far = idx(i, j + 2);
          constraints.push({ a: v, b: far, restLen: getDist(v, far), compliance: BEND_COMPLIANCE });
        }
      }
    }

    constraintsRef.current = constraints;
  }, []);

  // Single simulation step (called every frame)
  const simulate = useCallback(() => {
    const pos = posRef.current;
    const prev = prevRef.current;
    const vel = velRef.current;
    const constraints = constraintsRef.current;
    const pA = pointARef.current;
    const pB = pointBRef.current;
    const strength = pullStrengthRef.current;

    const dt = 1 / 60;
    const subDt = dt / SUBSTEPS;
    const subDt2 = subDt * subDt;

    for (let sub = 0; sub < SUBSTEPS; sub++) {
      // 1. Predict positions using explicit velocity (no gravity - cloth on table)
      for (let v = 0; v < N; v++) {
        prev[v * 3]     = pos[v * 3];
        prev[v * 3 + 1] = pos[v * 3 + 1];
        prev[v * 3 + 2] = pos[v * 3 + 2];
        pos[v * 3]     += vel[v * 3]     * subDt;
        pos[v * 3 + 1] += vel[v * 3 + 1] * subDt;
        pos[v * 3 + 2] += vel[v * 3 + 2] * subDt;
      }

      // 2. Solve distance constraints (stretch + bend)
      for (const c of constraints) {
        const dx = pos[c.b * 3]     - pos[c.a * 3];
        const dy = pos[c.b * 3 + 1] - pos[c.a * 3 + 1];
        const dz = pos[c.b * 3 + 2] - pos[c.a * 3 + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 0.0001) continue;

        const alpha = c.compliance / subDt2;
        const C = dist - c.restLen;
        const lambda = -C / (1.0 + alpha);
        const correction = lambda * 0.5;
        const nx = dx / dist, ny = dy / dist, nz = dz / dist;

        pos[c.a * 3]     -= correction * nx;
        pos[c.a * 3 + 1] -= correction * ny;
        pos[c.a * 3 + 2] -= correction * nz;
        pos[c.b * 3]     += correction * nx;
        pos[c.b * 3 + 1] += correction * ny;
        pos[c.b * 3 + 2] += correction * nz;
      }

      // 3. Stitch constraint: proper XPBD distance between pA and pB (restLen=0)
      if (pA !== null && pB !== null && strength > 0) {
        const dx = pos[pB * 3]     - pos[pA * 3];
        const dy = pos[pB * 3 + 1] - pos[pA * 3 + 1];
        const dz = pos[pB * 3 + 2] - pos[pA * 3 + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > 0.001) {
          // compliance decreases cubically with strength → smooth pull
          const stitchCompliance = Math.pow(1.0 - strength, 3) * 10.0 + 1e-6;
          const alpha = stitchCompliance / subDt2;
          // C = dist (want restLen=0), lambda is negative (pulling together)
          const lambda = -dist / (1.0 + alpha);
          const nx = dx / dist, ny = dy / dist, nz = dz / dist;
          // w_a = w_b = 0.5: move each half way
          pos[pA * 3]     -= 0.5 * lambda * nx;
          pos[pA * 3 + 1] -= 0.5 * lambda * ny;
          pos[pA * 3 + 2] -= 0.5 * lambda * nz;
          pos[pB * 3]     += 0.5 * lambda * nx;
          pos[pB * 3 + 1] += 0.5 * lambda * ny;
          pos[pB * 3 + 2] += 0.5 * lambda * nz;
        }
      }

      // 4. Floor constraint: y >= FLOOR_Y
      for (let v = 0; v < N; v++) {
        if (pos[v * 3 + 1] < FLOOR_Y) {
          pos[v * 3 + 1] = FLOOR_Y;
          vel[v * 3 + 1] = 0;
        }
      }

      // 5. Derive velocities from position delta
      for (let v = 0; v < N; v++) {
        vel[v * 3]     = (pos[v * 3]     - prev[v * 3])     / subDt;
        vel[v * 3 + 1] = (pos[v * 3 + 1] - prev[v * 3 + 1]) / subDt;
        vel[v * 3 + 2] = (pos[v * 3 + 2] - prev[v * 3 + 2]) / subDt;
      }
    }

    // 6. Apply velocity damping ONCE per frame (after all substeps)
    for (let v = 0; v < N; v++) {
      vel[v * 3]     *= 0.985;
      vel[v * 3 + 1] *= 0.985;
      vel[v * 3 + 2] *= 0.985;
    }
  }, []);

  // Create cloth geometry
  const createClothGeometry = useCallback(() => {
    const geometry = new THREE.BufferGeometry();
    const positions = posRef.current;

    // Create indices for triangle mesh
    const indices: number[] = [];
    for (let j = 0; j < RES; j++) {
      for (let i = 0; i < RES; i++) {
        const v0 = idx(i, j);
        const v1 = idx(i + 1, j);
        const v2 = idx(i, j + 1);
        const v3 = idx(i + 1, j + 1);

        indices.push(v0, v2, v1);
        indices.push(v1, v2, v3);
      }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
  }, []);

  // Update cloth mesh geometry
  const updateClothMesh = useCallback(() => {
    if (!clothMeshRef.current) return;

    const geometry = clothMeshRef.current.geometry;
    const positionAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    positionAttr.array.set(posRef.current);
    positionAttr.needsUpdate = true;
    geometry.computeVertexNormals();

    // Update wireframe if visible
    if (wireframeMeshRef.current) {
      const wfGeom = wireframeMeshRef.current.geometry as THREE.BufferGeometry;
      const wfPosAttr = wfGeom.getAttribute('position') as THREE.BufferAttribute;
      wfPosAttr.array.set(posRef.current);
      wfPosAttr.needsUpdate = true;
    }
  }, []);

  // Update selection spheres
  const updateSelectionSpheres = useCallback(() => {
    const pos = posRef.current;
    const pA = pointARef.current;
    const pB = pointBRef.current;

    if (sphereARef.current) {
      if (pA !== null) {
        sphereARef.current.position.set(
          pos[pA * 3],
          pos[pA * 3 + 1] + 0.15,  // slightly above cloth
          pos[pA * 3 + 2]
        );
        sphereARef.current.visible = true;
      } else {
        sphereARef.current.visible = false;
      }
    }

    if (sphereBRef.current) {
      if (pB !== null) {
        sphereBRef.current.position.set(
          pos[pB * 3],
          pos[pB * 3 + 1] + 0.15,
          pos[pB * 3 + 2]
        );
        sphereBRef.current.visible = true;
      } else {
        sphereBRef.current.visible = false;
      }
    }
  }, []);

  // Handle click for point selection
  const handleClick = useCallback((event: MouseEvent) => {
    if (!containerRef.current || !clothMeshRef.current || !cameraRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);

    const intersects = raycasterRef.current.intersectObject(clothMeshRef.current);

    if (intersects.length > 0) {
      const face = intersects[0].face;
      if (!face) return;

      // Find closest vertex to intersection point
      const point = intersects[0].point;
      const pos = posRef.current;

      let closestVert = face.a;
      let closestDist = Infinity;

      for (const v of [face.a, face.b, face.c]) {
        const dx = pos[v * 3] - point.x;
        const dy = pos[v * 3 + 1] - point.y;
        const dz = pos[v * 3 + 2] - point.z;
        const dist = dx * dx + dy * dy + dz * dz;
        if (dist < closestDist) {
          closestDist = dist;
          closestVert = v;
        }
      }

      if (pointARef.current === null) {
        setPointA(closestVert);
      } else if (pointBRef.current === null && closestVert !== pointARef.current) {
        setPointB(closestVert);
      }
    }
  }, []);

  // Reset simulation
  const handleReset = useCallback(() => {
    setPointA(null);
    setPointB(null);
    initializeCloth();
    buildConstraints();
  }, [initializeCloth, buildConstraints]);

  // Toggle wireframe
  const handleToggleWireframe = useCallback(() => {
    setShowWireframe(prev => !prev);
  }, []);

  // Update wireframe visibility
  useEffect(() => {
    if (wireframeMeshRef.current) {
      wireframeMeshRef.current.visible = showWireframe;
    }
  }, [showWireframe]);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1d24);
    sceneRef.current = scene;

    // Camera - top-down view of table
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 20, 15);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 5;
    controls.maxDistance = 50;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight2.position.set(-10, 10, -10);
    scene.add(directionalLight2);

    // Table surface (subtle gray plane)
    const tableGeom = new THREE.PlaneGeometry(30, 30);
    const tableMat = new THREE.MeshPhongMaterial({
      color: 0x2a2e35,
      side: THREE.DoubleSide,
      shininess: 10
    });
    const tableMesh = new THREE.Mesh(tableGeom, tableMat);
    tableMesh.rotation.x = -Math.PI / 2;
    tableMesh.position.y = FLOOR_Y - 0.01;
    scene.add(tableMesh);

    // Grid helper on table
    const gridHelper = new THREE.GridHelper(30, 30, 0x3a3e45, 0x3a3e45);
    gridHelper.position.y = FLOOR_Y + 0.001;
    scene.add(gridHelper);

    // Initialize cloth
    initializeCloth();
    buildConstraints();

    // Create cloth mesh
    const geometry = createClothGeometry();
    const material = new THREE.MeshPhongMaterial({
      color: 0xF5F0E8,  // light cream
      side: THREE.DoubleSide,
      shininess: 30,
    });
    const clothMesh = new THREE.Mesh(geometry, material);
    clothMesh.position.y = 0.01;  // slightly above table to avoid z-fighting
    scene.add(clothMesh);
    clothMeshRef.current = clothMesh;

    // Wireframe overlay
    const wireframeGeom = new THREE.BufferGeometry();
    wireframeGeom.setAttribute('position', new THREE.BufferAttribute(posRef.current.slice(), 3));
    const wireEdges = new THREE.WireframeGeometry(geometry);
    const wireframeMat = new THREE.LineBasicMaterial({ color: 0x666666, transparent: true, opacity: 0.5 });
    const wireframeMesh = new THREE.LineSegments(wireEdges, wireframeMat);
    wireframeMesh.visible = false;
    scene.add(wireframeMesh);
    wireframeMeshRef.current = wireframeMesh;

    // Selection spheres
    const sphereGeometry = new THREE.SphereGeometry(0.25, 16, 16);
    const sphereAMat = new THREE.MeshBasicMaterial({ color: 0xff8c00 }); // Orange
    const sphereBMat = new THREE.MeshBasicMaterial({ color: 0x4a90d9 }); // Blue

    const sphereA = new THREE.Mesh(sphereGeometry, sphereAMat);
    sphereA.visible = false;
    scene.add(sphereA);
    sphereARef.current = sphereA;

    const sphereB = new THREE.Mesh(sphereGeometry, sphereBMat);
    sphereB.visible = false;
    scene.add(sphereB);
    sphereBRef.current = sphereB;

    // Single animation loop (simulation + render)
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);

      // Simulate physics
      simulate();

      // Update mesh and spheres
      updateClothMesh();
      updateSelectionSpheres();

      // Note: WireframeGeometry doesn't update easily with position changes
      // The wireframe is static; for dynamic wireframe, would need to recreate geometry each frame

      // Render
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Cleanup
    return () => {
      resizeObserver.disconnect();
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);

      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach((m) => m.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
    };
  }, [initializeCloth, buildConstraints, createClothGeometry, simulate, updateClothMesh, updateSelectionSpheres]);

  // Click handler
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, [handleClick]);

  // Get instruction text based on state
  const getInstructionText = () => {
    switch (simState) {
      case 'idle':
        return 'Click 2 points on the cloth';
      case 'selected1':
        return 'Now click second point';
      case 'ready':
        return 'Adjust Pull Strength slider';
      default:
        return '';
    }
  };

  return (
    <div className="relative w-full h-full bg-[var(--bg-darkest)]">
      <div ref={containerRef} className="w-full h-full" />

      {/* Instructions overlay */}
      <div className="absolute top-4 left-4 bg-[var(--bg-panel)] bg-opacity-90 p-4 rounded-lg shadow-lg max-w-xs">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">
          Cloth on Table
        </h3>
        <p className="text-xs text-[var(--text-secondary)] mb-3">
          {getInstructionText()}
        </p>

        <div className="space-y-3">
          <Slider
            label="Pull Strength"
            value={pullStrength}
            min={0}
            max={1}
            step={0.01}
            onChange={setPullStrength}
          />

          <div className="flex gap-2">
            <Button onClick={handleReset} variant="secondary" size="sm" className="flex-1">
              Reset
            </Button>
            <Button onClick={handleToggleWireframe} variant="secondary" size="sm" className="flex-1">
              {showWireframe ? 'Hide Grid' : 'Show Grid'}
            </Button>
          </div>
        </div>

        {/* Point info */}
        {(pointA !== null || pointB !== null) && (
          <div className="mt-3 pt-3 border-t border-[var(--border)]">
            <div className="text-xs text-[var(--text-secondary)] space-y-1">
              {pointA !== null && (
                <div>
                  <span className="inline-block w-2 h-2 rounded-full bg-orange-500 mr-2" />
                  Point A: vertex {pointA}
                </div>
              )}
              {pointB !== null && (
                <div>
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-2" />
                  Point B: vertex {pointB}
                </div>
              )}
            </div>
          </div>
        )}

        {/* State indicator */}
        <div className="mt-2 pt-2 border-t border-[var(--border)]">
          <div className="text-xs text-[var(--text-muted)]">
            State: <span className="text-[var(--text-secondary)]">{simState}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
