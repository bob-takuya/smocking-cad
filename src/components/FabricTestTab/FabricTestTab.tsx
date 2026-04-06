import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Button } from '../ui/Button';
import { Slider } from '../ui/Slider';

// XPBD Cloth Simulation Constants
const GRID_SIZE = 20; // 20x20 grid
const NUM_VERTS = (GRID_SIZE + 1) * (GRID_SIZE + 1); // 21x21 = 441 vertices
const CELL_SIZE = 1.0;
const DT = 1 / 60;
const SUBSTEPS = 8;
const GRAVITY = new THREE.Vector3(0, -0.5, 0);
const STRETCH_COMPLIANCE = 0.0;
const BEND_COMPLIANCE = 1e-4;

interface StretchConstraint {
  i: number;
  j: number;
  restLen: number;
}

interface BendConstraint {
  i: number;
  j: number;
  k: number;
  l: number;
  restAngle: number;
}

export function FabricTestTab() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const clothMeshRef = useRef<THREE.Mesh | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());

  // Simulation state refs
  const positionsRef = useRef<Float32Array>(new Float32Array(NUM_VERTS * 3));
  const prevPositionsRef = useRef<Float32Array>(new Float32Array(NUM_VERTS * 3));
  const velocitiesRef = useRef<Float32Array>(new Float32Array(NUM_VERTS * 3));
  const invMassRef = useRef<Float32Array>(new Float32Array(NUM_VERTS));
  const stretchConstraintsRef = useRef<StretchConstraint[]>([]);
  const bendConstraintsRef = useRef<BendConstraint[]>([]);

  // Selection state
  const [pointA, setPointA] = useState<number | null>(null);
  const [pointB, setPointB] = useState<number | null>(null);
  const [pullStrength, setPullStrength] = useState(0.8);
  const sphereARef = useRef<THREE.Mesh | null>(null);
  const sphereBRef = useRef<THREE.Mesh | null>(null);

  // Initialize cloth positions
  const initializeCloth = useCallback(() => {
    const positions = positionsRef.current;
    const prevPositions = prevPositionsRef.current;
    const invMass = invMassRef.current;
    const velocities = velocitiesRef.current;

    // Center the cloth
    const offset = (GRID_SIZE * CELL_SIZE) / 2;

    for (let j = 0; j <= GRID_SIZE; j++) {
      for (let i = 0; i <= GRID_SIZE; i++) {
        const idx = j * (GRID_SIZE + 1) + i;
        positions[idx * 3] = i * CELL_SIZE - offset;
        positions[idx * 3 + 1] = 0;
        positions[idx * 3 + 2] = j * CELL_SIZE - offset;

        prevPositions[idx * 3] = positions[idx * 3];
        prevPositions[idx * 3 + 1] = positions[idx * 3 + 1];
        prevPositions[idx * 3 + 2] = positions[idx * 3 + 2];

        velocities[idx * 3] = 0;
        velocities[idx * 3 + 1] = 0;
        velocities[idx * 3 + 2] = 0;

        invMass[idx] = 1.0;
      }
    }
  }, []);

  // Build constraints
  const buildConstraints = useCallback(() => {
    const stretchConstraints: StretchConstraint[] = [];
    const bendConstraints: BendConstraint[] = [];
    const positions = positionsRef.current;

    const getIdx = (i: number, j: number) => j * (GRID_SIZE + 1) + i;
    const getDist = (a: number, b: number) => {
      const dx = positions[b * 3] - positions[a * 3];
      const dy = positions[b * 3 + 1] - positions[a * 3 + 1];
      const dz = positions[b * 3 + 2] - positions[a * 3 + 2];
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };

    // Stretch constraints: horizontal, vertical, and diagonal edges
    for (let j = 0; j <= GRID_SIZE; j++) {
      for (let i = 0; i <= GRID_SIZE; i++) {
        const idx = getIdx(i, j);

        // Horizontal edge
        if (i < GRID_SIZE) {
          const right = getIdx(i + 1, j);
          stretchConstraints.push({ i: idx, j: right, restLen: getDist(idx, right) });
        }

        // Vertical edge
        if (j < GRID_SIZE) {
          const down = getIdx(i, j + 1);
          stretchConstraints.push({ i: idx, j: down, restLen: getDist(idx, down) });
        }

        // Diagonal edges (shear)
        if (i < GRID_SIZE && j < GRID_SIZE) {
          const diagA = getIdx(i + 1, j + 1);
          stretchConstraints.push({ i: idx, j: diagA, restLen: getDist(idx, diagA) });

          const right = getIdx(i + 1, j);
          const down = getIdx(i, j + 1);
          stretchConstraints.push({ i: right, j: down, restLen: getDist(right, down) });
        }
      }
    }

    // Bend constraints: connect vertices across edges
    for (let j = 0; j < GRID_SIZE; j++) {
      for (let i = 0; i < GRID_SIZE; i++) {
        // For each quad, we have bend constraints across the shared edge
        const v0 = getIdx(i, j);
        const v1 = getIdx(i + 1, j);
        const v2 = getIdx(i + 1, j + 1);
        const v3 = getIdx(i, j + 1);

        // Bend constraint along diagonal v0-v2
        bendConstraints.push({
          i: v0,
          j: v2,
          k: v1,
          l: v3,
          restAngle: 0,
        });
      }
    }

    stretchConstraintsRef.current = stretchConstraints;
    bendConstraintsRef.current = bendConstraints;
  }, []);

  // Solve stretch constraint
  const solveStretch = useCallback(
    (c: StretchConstraint, pos: Float32Array, compliance: number, dt: number) => {
      const invMass = invMassRef.current;
      const w = invMass[c.i] + invMass[c.j];
      if (w === 0) return;

      const dx = pos[c.j * 3] - pos[c.i * 3];
      const dy = pos[c.j * 3 + 1] - pos[c.i * 3 + 1];
      const dz = pos[c.j * 3 + 2] - pos[c.i * 3 + 2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len === 0) return;

      const alpha = compliance / (dt * dt);
      const C = len - c.restLen;
      const lambda = -C / (w + alpha);
      const nx = dx / len,
        ny = dy / len,
        nz = dz / len;

      pos[c.i * 3] -= invMass[c.i] * lambda * nx;
      pos[c.i * 3 + 1] -= invMass[c.i] * lambda * ny;
      pos[c.i * 3 + 2] -= invMass[c.i] * lambda * nz;
      pos[c.j * 3] += invMass[c.j] * lambda * nx;
      pos[c.j * 3 + 1] += invMass[c.j] * lambda * ny;
      pos[c.j * 3 + 2] += invMass[c.j] * lambda * nz;
    },
    []
  );

  // Solve bend constraint (simplified dihedral)
  const solveBend = useCallback(
    (c: BendConstraint, pos: Float32Array, compliance: number, dt: number) => {
      const invMass = invMassRef.current;

      // Simplified bend: just keep the distance between diagonal vertices
      const dx = pos[c.k * 3] - pos[c.l * 3];
      const dy = pos[c.k * 3 + 1] - pos[c.l * 3 + 1];
      const dz = pos[c.k * 3 + 2] - pos[c.l * 3 + 2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // Rest length for diagonal
      const restLen = CELL_SIZE * Math.SQRT2;

      const w = invMass[c.k] + invMass[c.l];
      if (w === 0 || len === 0) return;

      const alpha = compliance / (dt * dt);
      const C = len - restLen;
      const lambda = -C / (w + alpha);
      const nx = dx / len,
        ny = dy / len,
        nz = dz / len;

      const scale = 0.1; // Softer bending effect
      pos[c.k * 3] -= invMass[c.k] * lambda * nx * scale;
      pos[c.k * 3 + 1] -= invMass[c.k] * lambda * ny * scale;
      pos[c.k * 3 + 2] -= invMass[c.k] * lambda * nz * scale;
      pos[c.l * 3] += invMass[c.l] * lambda * nx * scale;
      pos[c.l * 3 + 1] += invMass[c.l] * lambda * ny * scale;
      pos[c.l * 3 + 2] += invMass[c.l] * lambda * nz * scale;
    },
    []
  );

  // Apply stitch constraint (pull points together)
  const applyStitch = useCallback(
    (pA: number, pB: number, strength: number, pos: Float32Array) => {
      if (strength <= 0) return;

      const midX = (pos[pA * 3] + pos[pB * 3]) / 2;
      const midY = (pos[pA * 3 + 1] + pos[pB * 3 + 1]) / 2;
      const midZ = (pos[pA * 3 + 2] + pos[pB * 3 + 2]) / 2;

      pos[pA * 3] += (midX - pos[pA * 3]) * strength;
      pos[pA * 3 + 1] += (midY - pos[pA * 3 + 1]) * strength;
      pos[pA * 3 + 2] += (midZ - pos[pA * 3 + 2]) * strength;
      pos[pB * 3] += (midX - pos[pB * 3]) * strength;
      pos[pB * 3 + 1] += (midY - pos[pB * 3 + 1]) * strength;
      pos[pB * 3 + 2] += (midZ - pos[pB * 3 + 2]) * strength;
    },
    []
  );

  // XPBD simulation step
  const simulate = useCallback(
    (pA: number | null, pB: number | null, strength: number) => {
      const pos = positionsRef.current;
      const prevPos = prevPositionsRef.current;
      const vel = velocitiesRef.current;
      const invMass = invMassRef.current;
      const stretchConstraints = stretchConstraintsRef.current;
      const bendConstraints = bendConstraintsRef.current;

      const subDt = DT / SUBSTEPS;

      for (let sub = 0; sub < SUBSTEPS; sub++) {
        // Apply gravity and integrate
        for (let i = 0; i < NUM_VERTS; i++) {
          if (invMass[i] === 0) continue;

          vel[i * 3] += GRAVITY.x * subDt;
          vel[i * 3 + 1] += GRAVITY.y * subDt;
          vel[i * 3 + 2] += GRAVITY.z * subDt;

          // Damping
          vel[i * 3] *= 0.99;
          vel[i * 3 + 1] *= 0.99;
          vel[i * 3 + 2] *= 0.99;

          prevPos[i * 3] = pos[i * 3];
          prevPos[i * 3 + 1] = pos[i * 3 + 1];
          prevPos[i * 3 + 2] = pos[i * 3 + 2];

          pos[i * 3] += vel[i * 3] * subDt;
          pos[i * 3 + 1] += vel[i * 3 + 1] * subDt;
          pos[i * 3 + 2] += vel[i * 3 + 2] * subDt;
        }

        // Solve constraints
        for (const c of stretchConstraints) {
          solveStretch(c, pos, STRETCH_COMPLIANCE, subDt);
        }

        for (const c of bendConstraints) {
          solveBend(c, pos, BEND_COMPLIANCE, subDt);
        }

        // Apply stitch constraint
        if (pA !== null && pB !== null) {
          applyStitch(pA, pB, strength, pos);
        }

        // Update velocities
        for (let i = 0; i < NUM_VERTS; i++) {
          if (invMass[i] === 0) continue;

          vel[i * 3] = (pos[i * 3] - prevPos[i * 3]) / subDt;
          vel[i * 3 + 1] = (pos[i * 3 + 1] - prevPos[i * 3 + 1]) / subDt;
          vel[i * 3 + 2] = (pos[i * 3 + 2] - prevPos[i * 3 + 2]) / subDt;
        }

        // Floor collision
        for (let i = 0; i < NUM_VERTS; i++) {
          if (pos[i * 3 + 1] < -5) {
            pos[i * 3 + 1] = -5;
            vel[i * 3 + 1] = 0;
          }
        }
      }
    },
    [solveStretch, solveBend, applyStitch]
  );

  // Create cloth geometry
  const createClothGeometry = useCallback(() => {
    const geometry = new THREE.BufferGeometry();
    const positions = positionsRef.current;

    // Create indices for triangle mesh
    const indices: number[] = [];
    for (let j = 0; j < GRID_SIZE; j++) {
      for (let i = 0; i < GRID_SIZE; i++) {
        const v0 = j * (GRID_SIZE + 1) + i;
        const v1 = v0 + 1;
        const v2 = v0 + (GRID_SIZE + 1);
        const v3 = v2 + 1;

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
    positionAttr.array.set(positionsRef.current);
    positionAttr.needsUpdate = true;
    geometry.computeVertexNormals();
  }, []);

  // Update selection spheres
  const updateSelectionSpheres = useCallback(() => {
    const pos = positionsRef.current;

    if (sphereARef.current && pointA !== null) {
      sphereARef.current.position.set(
        pos[pointA * 3],
        pos[pointA * 3 + 1],
        pos[pointA * 3 + 2]
      );
      sphereARef.current.visible = true;
    } else if (sphereARef.current) {
      sphereARef.current.visible = false;
    }

    if (sphereBRef.current && pointB !== null) {
      sphereBRef.current.position.set(
        pos[pointB * 3],
        pos[pointB * 3 + 1],
        pos[pointB * 3 + 2]
      );
      sphereBRef.current.visible = true;
    } else if (sphereBRef.current) {
      sphereBRef.current.visible = false;
    }
  }, [pointA, pointB]);

  // Handle click for point selection
  const handleClick = useCallback(
    (event: MouseEvent) => {
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
        const pos = positionsRef.current;

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

        if (pointA === null) {
          setPointA(closestVert);
        } else if (pointB === null && closestVert !== pointA) {
          setPointB(closestVert);
        }
      }
    },
    [pointA, pointB]
  );

  // Reset simulation
  const handleReset = useCallback(() => {
    setPointA(null);
    setPointB(null);
    initializeCloth();
    buildConstraints();
  }, [initializeCloth, buildConstraints]);

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

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(15, 15, 15);
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
    controlsRef.current = controls;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight2.position.set(-10, 10, -10);
    scene.add(directionalLight2);

    // Grid helper
    const gridHelper = new THREE.GridHelper(30, 30, 0x2a2e35, 0x2a2e35);
    gridHelper.position.y = -5;
    scene.add(gridHelper);

    // Initialize cloth
    initializeCloth();
    buildConstraints();

    // Create cloth mesh
    const geometry = createClothGeometry();
    const material = new THREE.MeshPhongMaterial({
      color: 0xf5e6d3,
      side: THREE.DoubleSide,
      flatShading: false,
    });
    const clothMesh = new THREE.Mesh(geometry, material);
    scene.add(clothMesh);
    clothMeshRef.current = clothMesh;

    // Selection spheres
    const sphereGeometry = new THREE.SphereGeometry(0.3, 16, 16);
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

    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
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
  }, [initializeCloth, buildConstraints, createClothGeometry]);

  // Simulation loop
  useEffect(() => {
    let running = true;

    const simLoop = () => {
      if (!running) return;

      simulate(pointA, pointB, pullStrength);
      updateClothMesh();
      updateSelectionSpheres();

      requestAnimationFrame(simLoop);
    };

    simLoop();

    return () => {
      running = false;
    };
  }, [simulate, updateClothMesh, updateSelectionSpheres, pointA, pointB, pullStrength]);

  // Click handler
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, [handleClick]);

  return (
    <div className="relative w-full h-full bg-[var(--bg-darkest)]">
      <div ref={containerRef} className="w-full h-full" />

      {/* Instructions overlay */}
      <div className="absolute top-4 left-4 bg-[var(--bg-panel)] bg-opacity-90 p-4 rounded-lg shadow-lg max-w-xs">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">
          Fabric Test
        </h3>
        <p className="text-xs text-[var(--text-secondary)] mb-3">
          {pointA === null
            ? 'Click on the cloth to select the first point (orange)'
            : pointB === null
              ? 'Click to select the second point (blue)'
              : 'Points are being pulled together!'}
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

          <Button onClick={handleReset} variant="secondary" size="sm" className="w-full">
            Reset
          </Button>
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
      </div>
    </div>
  );
}
