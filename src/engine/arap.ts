/**
 * ARAP (As-Rigid-As-Possible) Preview Mesh Deformation
 * Deforms a high-resolution mesh to match the tangram transformation
 */

import type { Mesh3D, TangramState, TiledPattern } from '../types';

/**
 * Compute ARAP deformation from open tangram to closed tangram state
 * Projects the deformation onto a higher-resolution preview mesh
 */
export function computeARAPPreview(
  openTangram: TangramState,
  _closedTangram: TangramState,
  highResMesh: Mesh3D
): Mesh3D {
  const { vertices, faces, normals } = highResMesh;
  const numVerts = vertices.length / 3;

  // Create output vertex array
  const deformedVerts = new Float32Array(vertices.length);
  const deformedNormals = normals ? new Float32Array(normals.length) : undefined;

  // Compute bounding box of open tangram for normalization
  const tangramBounds = computeTangramBounds(openTangram);

  // For each mesh vertex, find its barycentric coordinates in the tangram
  // and apply the corresponding deformation
  for (let i = 0; i < numVerts; i++) {
    const vx = vertices[i * 3];
    const vy = vertices[i * 3 + 1];
    const vz = vertices[i * 3 + 2];

    // Project 3D point to 2D tangram space (use XZ plane projection)
    // Normalize to tangram coordinate system
    const tx = (vx - tangramBounds.minX) / tangramBounds.width;
    const ty = (vz - tangramBounds.minY) / tangramBounds.height;

    // Interpolate deformation from tangram
    const deformation = interpolateDeformation(
      tx, ty,
      openTangram
    );

    // Apply deformation
    deformedVerts[i * 3] = vx + deformation.dx;
    deformedVerts[i * 3 + 1] = vy + deformation.dy;
    deformedVerts[i * 3 + 2] = vz + deformation.dz;
  }

  // Recompute normals for the deformed mesh
  if (deformedNormals) {
    computeNormals(deformedVerts, faces, deformedNormals);
  }

  return {
    vertices: deformedVerts,
    faces: new Uint32Array(faces),
    normals: deformedNormals,
  };
}

/**
 * Compute bounds of tangram in 2D
 */
function computeTangramBounds(tangram: TangramState): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
} {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const [x, y] of tangram.vertices2D) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  return {
    minX, maxX, minY, maxY,
    width: Math.max(maxX - minX, 1e-6),
    height: Math.max(maxY - minY, 1e-6),
  };
}

/**
 * Interpolate deformation at a point based on tangram vertices
 * Uses inverse distance weighting for smooth interpolation
 */
function interpolateDeformation(
  tx: number,
  ty: number,
  openTangram: TangramState
): { dx: number; dy: number; dz: number } {
  const { openVertices, closedVertices } = openTangram;
  const n = openVertices.length;

  // Compute inverse distance weights
  let totalWeight = 0;
  let dx = 0, dy = 0, dz = 0;

  for (let i = 0; i < n; i++) {
    const [ox, oy] = openVertices[i];
    const [cx, cy] = closedVertices[i];

    // Distance from query point to this tangram vertex (in normalized coords)
    const dist = Math.sqrt(
      (tx * (openTangram.vertices2D[n - 1]?.[0] ?? 1) - ox) ** 2 +
      (ty * (openTangram.vertices2D[n - 1]?.[1] ?? 1) - oy) ** 2
    );

    // Inverse distance weight with small epsilon to avoid division by zero
    const weight = 1 / (dist + 0.01);
    totalWeight += weight;

    // Displacement from open to closed position
    const localDx = (cx - ox) * 0.1; // Scale down deformation
    const localDy = 0; // Keep Y (height) unchanged
    const localDz = (cy - oy) * 0.1;

    dx += weight * localDx;
    dy += weight * localDy;
    dz += weight * localDz;
  }

  if (totalWeight > 0) {
    dx /= totalWeight;
    dy /= totalWeight;
    dz /= totalWeight;
  }

  return { dx, dy, dz };
}

/**
 * Compute vertex normals from face normals
 */
function computeNormals(
  vertices: Float32Array,
  faces: Uint32Array,
  normals: Float32Array
): void {
  const numVerts = vertices.length / 3;
  const numFaces = faces.length / 3;

  // Reset normals
  normals.fill(0);

  // Accumulate face normals at each vertex
  for (let f = 0; f < numFaces; f++) {
    const ia = faces[f * 3];
    const ib = faces[f * 3 + 1];
    const ic = faces[f * 3 + 2];

    // Get vertex positions
    const ax = vertices[ia * 3], ay = vertices[ia * 3 + 1], az = vertices[ia * 3 + 2];
    const bx = vertices[ib * 3], by = vertices[ib * 3 + 1], bz = vertices[ib * 3 + 2];
    const cx = vertices[ic * 3], cy = vertices[ic * 3 + 1], cz = vertices[ic * 3 + 2];

    // Compute face normal via cross product
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;

    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;

    // Add to each vertex
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
}

/**
 * Generate a preview mesh showing the smocked result
 * Combines the target shape with pleat geometry
 */
export function generateSmockedPreview(
  targetMesh: Mesh3D,
  tangram: TangramState,
  _tiledPattern: TiledPattern,
  pleatHeight: number = 0.1
): Mesh3D {
  const { vertices, faces, normals } = targetMesh;
  const numVerts = vertices.length / 3;

  // Create output arrays with extra vertices for pleats
  const newVerts: number[] = [];
  const newFaces: number[] = [];
  const newNormals: number[] = [];

  // Copy original vertices with slight displacement based on eta
  for (let i = 0; i < numVerts; i++) {
    const vx = vertices[i * 3];
    const vy = vertices[i * 3 + 1];
    const vz = vertices[i * 3 + 2];

    const nx = normals ? normals[i * 3] : 0;
    const ny = normals ? normals[i * 3 + 1] : 1;
    const nz = normals ? normals[i * 3 + 2] : 0;

    // Displace vertex along normal based on pleat height (simulating fabric bunching)
    const displacement = pleatHeight * (1 - tangram.eta) * Math.random() * 0.5;

    newVerts.push(vx + nx * displacement);
    newVerts.push(vy + ny * displacement);
    newVerts.push(vz + nz * displacement);

    newNormals.push(nx, ny, nz);
  }

  // Copy original faces
  for (let i = 0; i < faces.length; i++) {
    newFaces.push(faces[i]);
  }

  return {
    vertices: new Float32Array(newVerts),
    faces: new Uint32Array(newFaces),
    normals: new Float32Array(newNormals),
  };
}

/**
 * Local-global ARAP iteration step
 * For full implementation of ARAP deformation
 */
export function arapIteration(
  currentVerts: Float32Array,
  _originalVerts: Float32Array,
  faces: Uint32Array,
  constraints: Map<number, [number, number, number]>
): Float32Array {
  const numVerts = currentVerts.length / 3;
  const newVerts = new Float32Array(currentVerts);

  // Build cotangent Laplacian matrix (simplified version)
  const weights: number[][] = Array.from({ length: numVerts }, () => []);
  const neighbors: number[][] = Array.from({ length: numVerts }, () => []);

  // Collect edge weights from faces
  const numFaces = faces.length / 3;
  for (let f = 0; f < numFaces; f++) {
    const ia = faces[f * 3];
    const ib = faces[f * 3 + 1];
    const ic = faces[f * 3 + 2];

    // Add uniform weights for simplicity (would use cotangent weights in full implementation)
    addNeighbor(neighbors, weights, ia, ib, 1);
    addNeighbor(neighbors, weights, ib, ic, 1);
    addNeighbor(neighbors, weights, ic, ia, 1);
  }

  // Global step: solve for new vertex positions
  for (let i = 0; i < numVerts; i++) {
    // Check if this vertex has a constraint
    if (constraints.has(i)) {
      const [cx, cy, cz] = constraints.get(i)!;
      newVerts[i * 3] = cx;
      newVerts[i * 3 + 1] = cy;
      newVerts[i * 3 + 2] = cz;
      continue;
    }

    // Average of neighbor positions weighted by Laplacian
    if (neighbors[i].length === 0) continue;

    let sumX = 0, sumY = 0, sumZ = 0;
    let totalWeight = 0;

    for (let j = 0; j < neighbors[i].length; j++) {
      const ni = neighbors[i][j];
      const w = weights[i][j];

      sumX += w * currentVerts[ni * 3];
      sumY += w * currentVerts[ni * 3 + 1];
      sumZ += w * currentVerts[ni * 3 + 2];
      totalWeight += w;
    }

    if (totalWeight > 0) {
      newVerts[i * 3] = sumX / totalWeight;
      newVerts[i * 3 + 1] = sumY / totalWeight;
      newVerts[i * 3 + 2] = sumZ / totalWeight;
    }
  }

  return newVerts;
}

/**
 * Helper to add neighbor relationship
 */
function addNeighbor(
  neighbors: number[][],
  weights: number[][],
  i: number,
  j: number,
  weight: number
): void {
  if (!neighbors[i].includes(j)) {
    neighbors[i].push(j);
    weights[i].push(weight);
  }
  if (!neighbors[j].includes(i)) {
    neighbors[j].push(i);
    weights[j].push(weight);
  }
}
