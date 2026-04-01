/**
 * Kangaroo-style Goal-based Physics Simulation for Smocking
 *
 * Implements a goal-driven Position Based Dynamics approach inspired by Kangaroo2.
 * Each constraint is a "goal" that computes target positions for vertices,
 * and all goals are solved iteratively via weighted averaging.
 *
 * Reference: Daniel Piker's Kangaroo2 (Grasshopper)
 */

import type { TiledPattern, TangramData } from '../types';

export interface PhysicsParams {
  stretchCompliance: number;   // 0 = rigid, 1e-3 = soft (cloth stretch)
  bendingCompliance: number;    // bending stiffness
  stitchStiffness: number;      // 0 = no stitching, 1 = fully stitched
  gravity: number;              // gravity acceleration (default 9.8)
  substeps: number;             // simulation substeps per step (default 8)
  damping: number;              // velocity damping (0-1)
}

export interface SimulationResult {
  vertices: Float32Array;       // final 3D positions [x,y,z, ...]
  normals: Float32Array;        // vertex normals
  faces: Uint32Array;           // triangles [a,b,c, ...]
  faceTypes: Uint8Array;        // 0=pleat, 1=underlay
}

// Goal types
type Goal =
  | { type: 'spring'; a: number; b: number; restLen: number; stiffness: number }
  | { type: 'bend'; v0: number; v1: number; v2: number; v3: number; restAngle: number; stiffness: number }
  | { type: 'stitch'; vertices: number[]; stiffness: number }
  | { type: 'anchor'; vertex: number; position: [number, number, number] };

const FACE_TYPE_UNDERLAY = 1;
const FACE_TYPE_PLEAT = 0;

/**
 * Run Kangaroo-style goal-based physics simulation
 */
export function runPhysicsSimulation(
  tiledPattern: TiledPattern,
  tangram: TangramData,
  params: PhysicsParams,
  steps: number = 300
): SimulationResult {
  const { nx, ny, faces: tangFaces, faceClass } = tangram;
  const { vertices: tiledVerts, stitchingLines } = tiledPattern;

  const numVerts = nx * ny;
  const numFaces = tangFaces.length / 3;

  // Initialize positions (spread flat on XZ plane, Y up)
  const positions = new Float32Array(numVerts * 3);
  const velocities = new Float32Array(numVerts * 3);
  const masses = new Float32Array(numVerts).fill(1.0);

  // Find bounding box of 2D pattern
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const v of tiledVerts) {
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);
  }

  // Initialize from 2D tangram positions
  for (let i = 0; i < numVerts; i++) {
    const v = tiledVerts[i];
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = 0;  // start flat
    positions[i * 3 + 2] = v.y;
  }

  // Build goals
  const goals: Goal[] = [];

  // 1. Spring goals (edge length preservation)
  const edgeMap = new Map<string, boolean>();
  for (let f = 0; f < numFaces; f++) {
    const v0 = tangFaces[f * 3];
    const v1 = tangFaces[f * 3 + 1];
    const v2 = tangFaces[f * 3 + 2];

    addSpringGoal(goals, edgeMap, v0, v1, positions, params.stretchCompliance);
    addSpringGoal(goals, edgeMap, v1, v2, positions, params.stretchCompliance);
    addSpringGoal(goals, edgeMap, v2, v0, positions, params.stretchCompliance);
  }

  // 2. Bending goals (dihedral angle between adjacent faces)
  const faceEdges = new Map<string, number[]>();
  for (let f = 0; f < numFaces; f++) {
    const v0 = tangFaces[f * 3];
    const v1 = tangFaces[f * 3 + 1];
    const v2 = tangFaces[f * 3 + 2];

    addFaceEdge(faceEdges, v0, v1, f);
    addFaceEdge(faceEdges, v1, v2, f);
    addFaceEdge(faceEdges, v2, v0, f);
  }

  for (const [_edgeKey, faceIds] of faceEdges) {
    if (faceIds.length === 2) {
      const f0 = faceIds[0];
      const f1 = faceIds[1];

      const face0 = [tangFaces[f0 * 3], tangFaces[f0 * 3 + 1], tangFaces[f0 * 3 + 2]];
      const face1 = [tangFaces[f1 * 3], tangFaces[f1 * 3 + 1], tangFaces[f1 * 3 + 2]];

      // Find shared edge and opposite vertices
      const shared: number[] = [];
      const opposite0: number[] = [];
      const opposite1: number[] = [];

      for (const v of face0) {
        if (face1.includes(v)) {
          shared.push(v);
        } else {
          opposite0.push(v);
        }
      }

      for (const v of face1) {
        if (!shared.includes(v)) {
          opposite1.push(v);
        }
      }

      if (shared.length === 2 && opposite0.length === 1 && opposite1.length === 1) {
        goals.push({
          type: 'bend',
          v0: shared[0],
          v1: shared[1],
          v2: opposite0[0],
          v3: opposite1[0],
          restAngle: 0,  // flat initial state
          stiffness: 1.0 / (params.bendingCompliance + 1e-6),
        });
      }
    }
  }

  // 3. Stitch goals (pull vertices together)
  for (const stitchLine of stitchingLines) {
    if (stitchLine.length < 2) continue;

    goals.push({
      type: 'stitch',
      vertices: stitchLine,
      stiffness: params.stitchStiffness,
    });
  }

  // 4. Anchor goals (fix top edge perimeter vertices)
  // Fix vertices along the top edge (maxY boundary) to hang the cloth
  const anchorThreshold = 0.01;
  for (let i = 0; i < numVerts; i++) {
    const v = tiledVerts[i];
    // Anchor vertices on the top edge
    if (Math.abs(v.y - maxY) < anchorThreshold) {
      goals.push({
        type: 'anchor',
        vertex: i,
        position: [v.x, 0, v.y],
      });
      masses[i] = 0;  // infinite mass (fixed)
    }
  }

  // Simulation parameters
  const dt = 1 / 60;  // 60 FPS
  const subDt = dt / params.substeps;
  const gravity = new Float32Array([0, -params.gravity, 0]);

  // Main simulation loop
  for (let step = 0; step < steps; step++) {
    for (let sub = 0; sub < params.substeps; sub++) {
      // Apply gravity
      for (let i = 0; i < numVerts; i++) {
        if (masses[i] > 0) {  // skip anchored vertices
          velocities[i * 3] += gravity[0] * subDt;
          velocities[i * 3 + 1] += gravity[1] * subDt;
          velocities[i * 3 + 2] += gravity[2] * subDt;
        }
      }

      // Apply damping
      for (let i = 0; i < numVerts; i++) {
        velocities[i * 3] *= (1 - params.damping);
        velocities[i * 3 + 1] *= (1 - params.damping);
        velocities[i * 3 + 2] *= (1 - params.damping);
      }

      // Predict positions
      for (let i = 0; i < numVerts; i++) {
        positions[i * 3] += velocities[i * 3] * subDt;
        positions[i * 3 + 1] += velocities[i * 3 + 1] * subDt;
        positions[i * 3 + 2] += velocities[i * 3 + 2] * subDt;
      }

      // Solve all goals
      solveGoals(positions, masses, goals);
    }
  }

  // Compute normals
  const normals = computeNormals(positions, tangFaces, numVerts);

  // Build face types array
  const faceTypes = new Uint8Array(numFaces);
  for (let f = 0; f < numFaces; f++) {
    faceTypes[f] = faceClass[f] === 0 ? FACE_TYPE_PLEAT : FACE_TYPE_UNDERLAY;
  }

  return {
    vertices: positions,
    normals,
    faces: new Uint32Array(tangFaces),
    faceTypes,
  };
}

/**
 * Add spring goal to goal list (avoid duplicates)
 */
function addSpringGoal(
  goals: Goal[],
  edgeMap: Map<string, boolean>,
  a: number,
  b: number,
  positions: Float32Array,
  compliance: number
): void {
  const key = a < b ? `${a},${b}` : `${b},${a}`;
  if (edgeMap.has(key)) return;

  const dx = positions[b * 3] - positions[a * 3];
  const dy = positions[b * 3 + 1] - positions[a * 3 + 1];
  const dz = positions[b * 3 + 2] - positions[a * 3 + 2];
  const restLen = Math.sqrt(dx * dx + dy * dy + dz * dz);

  goals.push({
    type: 'spring',
    a,
    b,
    restLen,
    stiffness: 1.0 / (compliance + 1e-6),
  });

  edgeMap.set(key, true);
}

/**
 * Add face edge mapping for bending goal detection
 */
function addFaceEdge(faceEdges: Map<string, number[]>, a: number, b: number, faceId: number): void {
  const key = a < b ? `${a},${b}` : `${b},${a}`;
  if (!faceEdges.has(key)) {
    faceEdges.set(key, []);
  }
  faceEdges.get(key)!.push(faceId);
}

/**
 * Solve all goals using Gauss-Seidel iteration
 */
function solveGoals(positions: Float32Array, masses: Float32Array, goals: Goal[]): void {
  const numVerts = positions.length / 3;
  const targetPositions = new Float32Array(numVerts * 3);
  const weightSums = new Float32Array(numVerts);

  // For each goal, compute target positions and accumulate
  for (const goal of goals) {
    switch (goal.type) {
      case 'spring': {
        const dx = positions[goal.b * 3] - positions[goal.a * 3];
        const dy = positions[goal.b * 3 + 1] - positions[goal.a * 3 + 1];
        const dz = positions[goal.b * 3 + 2] - positions[goal.a * 3 + 2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (len > 1e-6) {
          const factor = goal.restLen / len;
          const midX = (positions[goal.a * 3] + positions[goal.b * 3]) * 0.5;
          const midY = (positions[goal.a * 3 + 1] + positions[goal.b * 3 + 1]) * 0.5;
          const midZ = (positions[goal.a * 3 + 2] + positions[goal.b * 3 + 2]) * 0.5;

          // Target for vertex a
          targetPositions[goal.a * 3] += (midX - dx * factor * 0.5) * goal.stiffness;
          targetPositions[goal.a * 3 + 1] += (midY - dy * factor * 0.5) * goal.stiffness;
          targetPositions[goal.a * 3 + 2] += (midZ - dz * factor * 0.5) * goal.stiffness;
          weightSums[goal.a] += goal.stiffness;

          // Target for vertex b
          targetPositions[goal.b * 3] += (midX + dx * factor * 0.5) * goal.stiffness;
          targetPositions[goal.b * 3 + 1] += (midY + dy * factor * 0.5) * goal.stiffness;
          targetPositions[goal.b * 3 + 2] += (midZ + dz * factor * 0.5) * goal.stiffness;
          weightSums[goal.b] += goal.stiffness;
        }
        break;
      }

      case 'bend': {
        // Simplified bending: keep adjacent faces close to flat
        const p0 = [positions[goal.v0 * 3], positions[goal.v0 * 3 + 1], positions[goal.v0 * 3 + 2]];
        const p1 = [positions[goal.v1 * 3], positions[goal.v1 * 3 + 1], positions[goal.v1 * 3 + 2]];
        const p2 = [positions[goal.v2 * 3], positions[goal.v2 * 3 + 1], positions[goal.v2 * 3 + 2]];
        const p3 = [positions[goal.v3 * 3], positions[goal.v3 * 3 + 1], positions[goal.v3 * 3 + 2]];

        // Compute normals
        const e = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
        const e0 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
        const e1 = [p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]];

        const n0 = cross(e, e0);
        const n1 = cross(e1, e);

        normalize(n0);
        normalize(n1);

        // Push v2 and v3 to align normals (simplified)
        const correction = 0.01 * goal.stiffness;
        targetPositions[goal.v2 * 3] += (p2[0] + n0[0] * correction) * goal.stiffness;
        targetPositions[goal.v2 * 3 + 1] += (p2[1] + n0[1] * correction) * goal.stiffness;
        targetPositions[goal.v2 * 3 + 2] += (p2[2] + n0[2] * correction) * goal.stiffness;
        weightSums[goal.v2] += goal.stiffness;

        targetPositions[goal.v3 * 3] += (p3[0] - n1[0] * correction) * goal.stiffness;
        targetPositions[goal.v3 * 3 + 1] += (p3[1] - n1[1] * correction) * goal.stiffness;
        targetPositions[goal.v3 * 3 + 2] += (p3[2] - n1[2] * correction) * goal.stiffness;
        weightSums[goal.v3] += goal.stiffness;
        break;
      }

      case 'stitch': {
        if (goal.stiffness < 1e-6) break;

        // Compute center of all vertices in stitch
        let cx = 0, cy = 0, cz = 0;
        for (const v of goal.vertices) {
          cx += positions[v * 3];
          cy += positions[v * 3 + 1];
          cz += positions[v * 3 + 2];
        }
        cx /= goal.vertices.length;
        cy /= goal.vertices.length;
        cz /= goal.vertices.length;

        // Pull each vertex toward center
        for (const v of goal.vertices) {
          targetPositions[v * 3] += cx * goal.stiffness;
          targetPositions[v * 3 + 1] += cy * goal.stiffness;
          targetPositions[v * 3 + 2] += cz * goal.stiffness;
          weightSums[v] += goal.stiffness;
        }
        break;
      }

      case 'anchor': {
        // Fixed position (infinite stiffness)
        const weight = 1e6;
        targetPositions[goal.vertex * 3] += goal.position[0] * weight;
        targetPositions[goal.vertex * 3 + 1] += goal.position[1] * weight;
        targetPositions[goal.vertex * 3 + 2] += goal.position[2] * weight;
        weightSums[goal.vertex] += weight;
        break;
      }
    }
  }

  // Update positions by weighted average
  for (let i = 0; i < numVerts; i++) {
    if (weightSums[i] > 1e-6 && masses[i] > 0) {
      positions[i * 3] = targetPositions[i * 3] / weightSums[i];
      positions[i * 3 + 1] = targetPositions[i * 3 + 1] / weightSums[i];
      positions[i * 3 + 2] = targetPositions[i * 3 + 2] / weightSums[i];
    }
  }
}

/**
 * Compute vertex normals
 */
function computeNormals(
  positions: Float32Array,
  faces: Uint32Array,
  numVerts: number
): Float32Array {
  const normals = new Float32Array(numVerts * 3);
  const numFaces = faces.length / 3;

  // Accumulate face normals
  for (let f = 0; f < numFaces; f++) {
    const ia = faces[f * 3];
    const ib = faces[f * 3 + 1];
    const ic = faces[f * 3 + 2];

    const ax = positions[ia * 3], ay = positions[ia * 3 + 1], az = positions[ia * 3 + 2];
    const bx = positions[ib * 3], by = positions[ib * 3 + 1], bz = positions[ib * 3 + 2];
    const cx = positions[ic * 3], cy = positions[ic * 3 + 1], cz = positions[ic * 3 + 2];

    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;

    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;

    normals[ia * 3] += nx;
    normals[ia * 3 + 1] += ny;
    normals[ia * 3 + 2] += nz;

    normals[ib * 3] += nx;
    normals[ib * 3 + 1] += ny;
    normals[ib * 3 + 2] += nz;

    normals[ic * 3] += nx;
    normals[ic * 3 + 1] += ny;
    normals[ic * 3 + 2] += nz;
  }

  // Normalize
  for (let i = 0; i < numVerts; i++) {
    const nx = normals[i * 3];
    const ny = normals[i * 3 + 1];
    const nz = normals[i * 3 + 2];
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    normals[i * 3] = nx / len;
    normals[i * 3 + 1] = ny / len;
    normals[i * 3 + 2] = nz / len;
  }

  return normals;
}

// Vector math utilities
function cross(a: number[], b: number[]): number[] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(v: number[]): void {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len > 1e-6) {
    v[0] /= len;
    v[1] /= len;
    v[2] /= len;
  }
}
