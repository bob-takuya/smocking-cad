/**
 * XPBD Physics Simulation for Smocking
 *
 * Implements Extended Position Based Dynamics (XPBD) for realistic cloth simulation
 * with smocking-specific stitch constraints.
 *
 * Reference: Macklin et al. 2016 "XPBD: Position-Based Simulation of Compliant Constrained Dynamics"
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

interface Edge {
  a: number;
  b: number;
  restLength: number;
}

interface BendingConstraint {
  v0: number;  // shared edge vertices
  v1: number;
  v2: number;  // vertices opposite to edge
  v3: number;
  restAngle: number;
}

interface StitchConstraint {
  vertices: number[];  // all vertices in a stitch line
  targetCenter: Float32Array;  // target center point [x,y,z]
}

const FACE_TYPE_UNDERLAY = 1;
const FACE_TYPE_PLEAT = 0;

/**
 * Run XPBD physics simulation
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
  const prevPositions = new Float32Array(numVerts * 3);
  const velocities = new Float32Array(numVerts * 3);
  const invMass = new Float32Array(numVerts);

  // Initialize from 2D tangram positions
  for (let i = 0; i < numVerts; i++) {
    const v = tiledVerts[i];
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = 0;  // start flat
    positions[i * 3 + 2] = v.y;

    prevPositions[i * 3] = v.x;
    prevPositions[i * 3 + 1] = 0;
    prevPositions[i * 3 + 2] = v.y;

    invMass[i] = 1.0;  // uniform mass
  }

  // Build edges from triangulation
  const edgeMap = new Map<string, Edge>();
  const edgeList: Edge[] = [];

  for (let f = 0; f < numFaces; f++) {
    const v0 = tangFaces[f * 3];
    const v1 = tangFaces[f * 3 + 1];
    const v2 = tangFaces[f * 3 + 2];

    addEdge(edgeMap, edgeList, v0, v1, positions);
    addEdge(edgeMap, edgeList, v1, v2, positions);
    addEdge(edgeMap, edgeList, v2, v0, positions);
  }

  // Build bending constraints (pairs of adjacent triangles)
  const bendingConstraints: BendingConstraint[] = [];
  const faceEdges = new Map<string, number[]>();

  for (let f = 0; f < numFaces; f++) {
    const v0 = tangFaces[f * 3];
    const v1 = tangFaces[f * 3 + 1];
    const v2 = tangFaces[f * 3 + 2];

    addFaceEdge(faceEdges, v0, v1, f);
    addFaceEdge(faceEdges, v1, v2, f);
    addFaceEdge(faceEdges, v2, v0, f);
  }

  // For each edge shared by two faces, create a bending constraint
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
        bendingConstraints.push({
          v0: shared[0],
          v1: shared[1],
          v2: opposite0[0],
          v3: opposite1[0],
          restAngle: 0,  // flat initial state
        });
      }
    }
  }

  // Build stitch constraints
  const stitchConstraints: StitchConstraint[] = [];

  for (const stitchLine of stitchingLines) {
    if (stitchLine.length < 2) continue;

    // Compute target center (average of initial positions)
    let cx = 0, cy = 0, cz = 0;
    for (const vIdx of stitchLine) {
      cx += positions[vIdx * 3];
      cy += positions[vIdx * 3 + 1];
      cz += positions[vIdx * 3 + 2];
    }
    cx /= stitchLine.length;
    cy /= stitchLine.length;
    cz /= stitchLine.length;

    stitchConstraints.push({
      vertices: stitchLine,
      targetCenter: new Float32Array([cx, cy, cz]),
    });
  }

  // Simulation parameters
  const dt = 1 / 60;  // 60 FPS
  const subDt = dt / params.substeps;
  const gravity = new Float32Array([0, -params.gravity, 0]);

  // XPBD lambda storage
  const edgeLambdas = new Float32Array(edgeList.length);
  const bendingLambdas = new Float32Array(bendingConstraints.length);

  // Main simulation loop
  for (let step = 0; step < steps; step++) {
    // Store previous positions
    for (let i = 0; i < numVerts * 3; i++) {
      prevPositions[i] = positions[i];
    }

    // Substep loop
    for (let sub = 0; sub < params.substeps; sub++) {
      // Apply gravity
      for (let i = 0; i < numVerts; i++) {
        velocities[i * 3] += gravity[0] * subDt;
        velocities[i * 3 + 1] += gravity[1] * subDt;
        velocities[i * 3 + 2] += gravity[2] * subDt;
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

      // Solve constraints

      // 1. Stretch constraints (edge length preservation)
      for (let e = 0; e < edgeList.length; e++) {
        const edge = edgeList[e];
        solveStretchConstraint(
          positions,
          invMass,
          edge.a,
          edge.b,
          edge.restLength,
          params.stretchCompliance,
          subDt,
          edgeLambdas,
          e
        );
      }

      // 2. Bending constraints
      for (let b = 0; b < bendingConstraints.length; b++) {
        const bc = bendingConstraints[b];
        solveBendingConstraint(
          positions,
          invMass,
          bc.v0,
          bc.v1,
          bc.v2,
          bc.v3,
          bc.restAngle,
          params.bendingCompliance,
          subDt,
          bendingLambdas,
          b
        );
      }

      // 3. Stitch constraints (pull vertices together)
      for (const sc of stitchConstraints) {
        solveStitchConstraint(
          positions,
          invMass,
          sc.vertices,
          sc.targetCenter,
          params.stitchStiffness
        );
      }

      // Update velocities
      for (let i = 0; i < numVerts; i++) {
        velocities[i * 3] = (positions[i * 3] - prevPositions[i * 3]) / subDt;
        velocities[i * 3 + 1] = (positions[i * 3 + 1] - prevPositions[i * 3 + 1]) / subDt;
        velocities[i * 3 + 2] = (positions[i * 3 + 2] - prevPositions[i * 3 + 2]) / subDt;
      }
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
 * Add edge to edge list (avoid duplicates)
 */
function addEdge(
  edgeMap: Map<string, Edge>,
  edgeList: Edge[],
  a: number,
  b: number,
  positions: Float32Array
): void {
  const key = a < b ? `${a},${b}` : `${b},${a}`;
  if (edgeMap.has(key)) return;

  const dx = positions[b * 3] - positions[a * 3];
  const dy = positions[b * 3 + 1] - positions[a * 3 + 1];
  const dz = positions[b * 3 + 2] - positions[a * 3 + 2];
  const restLength = Math.sqrt(dx * dx + dy * dy + dz * dz);

  const edge = { a, b, restLength };
  edgeMap.set(key, edge);
  edgeList.push(edge);
}

/**
 * Add face edge mapping for bending constraint detection
 */
function addFaceEdge(faceEdges: Map<string, number[]>, a: number, b: number, faceId: number): void {
  const key = a < b ? `${a},${b}` : `${b},${a}`;
  if (!faceEdges.has(key)) {
    faceEdges.set(key, []);
  }
  faceEdges.get(key)!.push(faceId);
}

/**
 * Solve stretch constraint (XPBD)
 */
function solveStretchConstraint(
  positions: Float32Array,
  invMass: Float32Array,
  a: number,
  b: number,
  restLength: number,
  compliance: number,
  dt: number,
  lambdas: Float32Array,
  constraintIdx: number
): void {
  const dx = positions[b * 3] - positions[a * 3];
  const dy = positions[b * 3 + 1] - positions[a * 3 + 1];
  const dz = positions[b * 3 + 2] - positions[a * 3 + 2];

  const currentLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (currentLength < 1e-6) return;

  const C = currentLength - restLength;

  const gradA = [-dx / currentLength, -dy / currentLength, -dz / currentLength];
  const gradB = [dx / currentLength, dy / currentLength, dz / currentLength];

  const w = invMass[a] + invMass[b];
  if (w < 1e-6) return;

  const alpha = compliance / (dt * dt);
  const deltaLambda = (-C - alpha * lambdas[constraintIdx]) / (w + alpha);

  lambdas[constraintIdx] += deltaLambda;

  positions[a * 3] += deltaLambda * invMass[a] * gradA[0];
  positions[a * 3 + 1] += deltaLambda * invMass[a] * gradA[1];
  positions[a * 3 + 2] += deltaLambda * invMass[a] * gradA[2];

  positions[b * 3] += deltaLambda * invMass[b] * gradB[0];
  positions[b * 3 + 1] += deltaLambda * invMass[b] * gradB[1];
  positions[b * 3 + 2] += deltaLambda * invMass[b] * gradB[2];
}

/**
 * Solve bending constraint (dihedral angle between adjacent faces)
 */
function solveBendingConstraint(
  positions: Float32Array,
  invMass: Float32Array,
  v0: number,
  v1: number,
  v2: number,
  v3: number,
  restAngle: number,
  compliance: number,
  dt: number,
  lambdas: Float32Array,
  constraintIdx: number
): void {
  // Get positions
  const p0 = [positions[v0 * 3], positions[v0 * 3 + 1], positions[v0 * 3 + 2]];
  const p1 = [positions[v1 * 3], positions[v1 * 3 + 1], positions[v1 * 3 + 2]];
  const p2 = [positions[v2 * 3], positions[v2 * 3 + 1], positions[v2 * 3 + 2]];
  const p3 = [positions[v3 * 3], positions[v3 * 3 + 1], positions[v3 * 3 + 2]];

  // Compute edge vectors
  const e = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];

  // Compute normals of both faces
  const e0 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
  const e1 = [p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]];

  const n0 = cross(e, e0);
  const n1 = cross(e1, e);

  const n0Len = length(n0);
  const n1Len = length(n1);

  if (n0Len < 1e-6 || n1Len < 1e-6) return;

  normalize(n0, n0Len);
  normalize(n1, n1Len);

  // Compute dihedral angle
  const cosAngle = Math.max(-1, Math.min(1, dot(n0, n1)));
  const angle = Math.acos(cosAngle);

  const C = angle - restAngle;

  // Simplified gradient (full derivation is complex)
  // We approximate by pushing vertices to reduce angle difference
  const w = invMass[v0] + invMass[v1] + invMass[v2] + invMass[v3];
  if (w < 1e-6) return;

  const alpha = compliance / (dt * dt);
  const deltaLambda = (-C - alpha * lambdas[constraintIdx]) / (w + alpha);

  lambdas[constraintIdx] += deltaLambda;

  // Apply correction (simplified)
  const correction = deltaLambda * 0.1;

  const dir = [n0[0] + n1[0], n0[1] + n1[1], n0[2] + n1[2]];
  normalize(dir, length(dir));

  positions[v2 * 3] += correction * invMass[v2] * dir[0];
  positions[v2 * 3 + 1] += correction * invMass[v2] * dir[1];
  positions[v2 * 3 + 2] += correction * invMass[v2] * dir[2];

  positions[v3 * 3] -= correction * invMass[v3] * dir[0];
  positions[v3 * 3 + 1] -= correction * invMass[v3] * dir[1];
  positions[v3 * 3 + 2] -= correction * invMass[v3] * dir[2];
}

/**
 * Solve stitch constraint (pull vertices together)
 */
function solveStitchConstraint(
  positions: Float32Array,
  invMass: Float32Array,
  vertices: number[],
  targetCenter: Float32Array,
  stiffness: number
): void {
  if (stiffness < 1e-6) return;

  // Compute current center of mass
  let cx = 0, cy = 0, cz = 0;
  for (const v of vertices) {
    cx += positions[v * 3];
    cy += positions[v * 3 + 1];
    cz += positions[v * 3 + 2];
  }
  cx /= vertices.length;
  cy /= vertices.length;
  cz /= vertices.length;

  // Pull each vertex toward the target center
  for (const v of vertices) {
    const dx = targetCenter[0] - positions[v * 3];
    const dy = targetCenter[1] - positions[v * 3 + 1];
    const dz = targetCenter[2] - positions[v * 3 + 2];

    positions[v * 3] += dx * stiffness * invMass[v] * 0.5;
    positions[v * 3 + 1] += dy * stiffness * invMass[v] * 0.5;
    positions[v * 3 + 2] += dz * stiffness * invMass[v] * 0.5;
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

function dot(a: number[], b: number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function length(v: number[]): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function normalize(v: number[], len: number): void {
  if (len > 1e-6) {
    v[0] /= len;
    v[1] /= len;
    v[2] /= len;
  }
}
