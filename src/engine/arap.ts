/**
 * 3D Preview for Smocked Tangram
 * Creates a 3D visualization where pleat faces fold up proportionally to (1-gary)
 *
 * Based on the forward problem: given a tangram at a gary value, generate a 3D mesh where:
 * - Underlay faces lie relatively flat on the base plane
 * - Pleat faces fold up perpendicular to the fabric surface
 * - The height of pleats is proportional to (1 - gary) * edge_length
 */

import type { Mesh3D, TangramState, TiledPattern } from '../types';

// Face type enum for colors
export const FACE_TYPE_UNDERLAY = 1;
export const FACE_TYPE_PLEAT = 0;

/**
 * Extended Mesh3D with face type information for coloring
 */
export interface ColoredMesh3D extends Mesh3D {
  faceTypes: Uint8Array;  // 0 = pleat, 1 = underlay per face
}

/**
 * Generate a 3D preview mesh from the tangram
 * - Underlay faces lie flat on the z=0 plane using their 2D (x,y) positions
 * - Pleat faces are lifted upward (z direction) proportional to (1-gary) * edge_length
 */
export function generate3DPreview(
  tiledPattern: TiledPattern,
  tangramState: TangramState
): ColoredMesh3D {
  const { tangram, faces } = tiledPattern;
  const { vertices2D, gary } = tangramState;

  const numVerts = tangram.nx * tangram.ny;
  const numFaces = faces.length;

  // Compute average edge length for scaling pleat height
  let totalEdgeLength = 0;
  let edgeCount = 0;
  for (let i = 0; i < tangram.underlayEdges.length; i += 2) {
    const a = tangram.underlayEdges[i];
    const b = tangram.underlayEdges[i + 1];
    const dx = vertices2D[b * 2] - vertices2D[a * 2];
    const dy = vertices2D[b * 2 + 1] - vertices2D[a * 2 + 1];
    totalEdgeLength += Math.sqrt(dx * dx + dy * dy);
    edgeCount++;
  }
  const avgEdgeLength = edgeCount > 0 ? totalEdgeLength / edgeCount : 1;

  // Pleat height is proportional to (1 - gary) and average edge length
  // When gary=0 (fully closed), pleats are at maximum height
  // When gary=1 (fully open), pleats are flat
  const maxPleatHeight = avgEdgeLength * 0.8;
  const pleatFactor = 1 - gary;

  // Create 3D vertex positions - initially all flat
  const vertices3D = new Float32Array(numVerts * 3);
  for (let i = 0; i < numVerts; i++) {
    vertices3D[i * 3] = vertices2D[i * 2];       // x
    vertices3D[i * 3 + 1] = 0;                    // y (height)
    vertices3D[i * 3 + 2] = vertices2D[i * 2 + 1]; // z (was y in 2D)
  }

  // Compute which vertices are in pleat faces only (not shared with underlay)
  const vertexInPleat = new Uint8Array(numVerts);
  const vertexInUnderlay = new Uint8Array(numVerts);

  for (const face of faces) {
    if (face.type === 'pleat') {
      for (const v of face.vertices) {
        vertexInPleat[v] = 1;
      }
    } else {
      for (const v of face.vertices) {
        vertexInUnderlay[v] = 1;
      }
    }
  }

  // For each pleat face, compute its lift based on adjacent underlay faces
  const vertexLift = new Float32Array(numVerts);
  const vertexLiftCount = new Float32Array(numVerts);

  for (const face of faces) {
    if (face.type !== 'pleat') continue;

    // Find the centroid of this pleat face
    let cx = 0, cy = 0;
    for (const v of face.vertices) {
      cx += vertices2D[v * 2];
      cy += vertices2D[v * 2 + 1];
    }
    cx /= face.vertices.length;
    cy /= face.vertices.length;

    // Compute the "folding height" for this face
    // Use the face's area as a factor - larger pleats fold higher
    const v0 = face.vertices[0];
    const v1 = face.vertices[1];
    const v2 = face.vertices[2];
    const ax = vertices2D[v0 * 2], ay = vertices2D[v0 * 2 + 1];
    const bx = vertices2D[v1 * 2], by = vertices2D[v1 * 2 + 1];
    const ccx = vertices2D[v2 * 2], ccy = vertices2D[v2 * 2 + 1];
    const area = Math.abs((bx - ax) * (ccy - ay) - (ccx - ax) * (by - ay)) / 2;

    // Height proportional to sqrt(area) and pleat factor
    const faceHeight = pleatFactor * maxPleatHeight * (0.5 + 0.5 * Math.sqrt(area / (avgEdgeLength * avgEdgeLength)));

    // Apply height to vertices of this pleat face
    for (const v of face.vertices) {
      vertexLift[v] += faceHeight;
      vertexLiftCount[v] += 1;
    }
  }

  // Apply averaged lift to vertices
  // Vertices shared between pleat and underlay get partial lift
  for (let i = 0; i < numVerts; i++) {
    if (vertexLiftCount[i] > 0) {
      let lift = vertexLift[i] / vertexLiftCount[i];

      // If vertex is also in underlay, reduce lift (it's a boundary vertex)
      if (vertexInUnderlay[i]) {
        lift *= 0.2; // Boundary vertices lift less
      }

      vertices3D[i * 3 + 1] = lift;
    }
  }

  // Build face indices and face types
  const faceIndices = new Uint32Array(numFaces * 3);
  const faceTypes = new Uint8Array(numFaces);

  for (let f = 0; f < numFaces; f++) {
    const face = faces[f];
    faceIndices[f * 3] = face.vertices[0];
    faceIndices[f * 3 + 1] = face.vertices[1];
    faceIndices[f * 3 + 2] = face.vertices[2];
    faceTypes[f] = face.type === 'pleat' ? FACE_TYPE_PLEAT : FACE_TYPE_UNDERLAY;
  }

  // Compute normals
  const normals = computeNormals(vertices3D, faceIndices);

  return {
    vertices: vertices3D,
    faces: faceIndices,
    normals,
    faceTypes,
  };
}

/**
 * Generate smocked preview mesh combining target shape with tangram deformation
 */
export function generateSmockedPreview(
  _targetMesh: Mesh3D,
  tangram: TangramState,
  tiledPattern: TiledPattern,
  _pleatHeight: number = 0.1
): Mesh3D {
  // For now, just return a simple 3D preview of the tangram
  // A full implementation would project the tangram onto the target surface
  return generate3DPreview(tiledPattern, tangram);
}

/**
 * Compute ARAP preview (simplified version)
 * Projects tangram deformation onto a high-res mesh
 */
export function computeARAPPreview(
  openTangram: TangramState,
  closedTangram: TangramState,
  highResMesh: Mesh3D
): Mesh3D {
  const { vertices, faces, normals } = highResMesh;
  const numVerts = vertices.length / 3;

  // Create output vertex array
  const deformedVerts = new Float32Array(vertices.length);
  const deformedNormals = normals ? new Float32Array(normals.length) : undefined;

  // Compute bounding box of open tangram for normalization
  const tangramBounds = computeTangramBounds(openTangram);

  // For each mesh vertex, apply deformation based on tangram
  for (let i = 0; i < numVerts; i++) {
    const vx = vertices[i * 3];
    const vy = vertices[i * 3 + 1];
    const vz = vertices[i * 3 + 2];

    // Project 3D point to 2D tangram space (use XZ plane projection)
    const tx = (vx - tangramBounds.minX) / tangramBounds.width;
    const ty = (vz - tangramBounds.minY) / tangramBounds.height;

    // Interpolate deformation from tangram
    const deformation = interpolateDeformation(tx, ty, openTangram, closedTangram);

    // Apply deformation
    deformedVerts[i * 3] = vx + deformation.dx;
    deformedVerts[i * 3 + 1] = vy + deformation.dy;
    deformedVerts[i * 3 + 2] = vz + deformation.dz;
  }

  // Recompute normals
  if (deformedNormals) {
    const computed = computeNormals(deformedVerts, faces);
    deformedNormals.set(computed);
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
  const vertices2D = tangram.vertices2D;
  const numVerts = vertices2D.length / 2;

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (let i = 0; i < numVerts; i++) {
    const x = vertices2D[i * 2];
    const y = vertices2D[i * 2 + 1];
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
 */
function interpolateDeformation(
  tx: number,
  ty: number,
  openTangram: TangramState,
  closedTangram: TangramState
): { dx: number; dy: number; dz: number } {
  const openVerts = openTangram.vertices2D;
  const closedVerts = closedTangram.vertices2D;
  const numVerts = openVerts.length / 2;

  // Compute inverse distance weights
  let totalWeight = 0;
  let dx = 0, dy = 0, dz = 0;

  // Get bounding info for scaling
  const bounds = computeTangramBounds(openTangram);

  for (let i = 0; i < numVerts; i++) {
    const ox = openVerts[i * 2];
    const oy = openVerts[i * 2 + 1];
    const cx = closedVerts[i * 2];
    const cy = closedVerts[i * 2 + 1];

    // Distance from query point to this tangram vertex (in normalized coords)
    const qx = tx * bounds.width + bounds.minX;
    const qy = ty * bounds.height + bounds.minY;
    const dist = Math.sqrt((qx - ox) ** 2 + (qy - oy) ** 2);

    // Inverse distance weight
    const weight = 1 / (dist + 0.1);
    totalWeight += weight;

    // Displacement from open to closed position
    const localDx = (cx - ox) * 0.1;
    const localDy = 0;
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
 * Compute vertex normals from faces
 */
function computeNormals(vertices: Float32Array, faces: Uint32Array): Float32Array {
  const numVerts = vertices.length / 3;
  const numFaces = faces.length / 3;
  const normals = new Float32Array(numVerts * 3);

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

  return normals;
}

/**
 * ARAP iteration step (simplified)
 */
export function arapIteration(
  currentVerts: Float32Array,
  _originalVerts: Float32Array,
  faces: Uint32Array,
  constraints: Map<number, [number, number, number]>
): Float32Array {
  const numVerts = currentVerts.length / 3;
  const newVerts = new Float32Array(currentVerts);

  // Build neighbor information
  const neighbors: number[][] = Array.from({ length: numVerts }, () => []);
  const numFaces = faces.length / 3;

  for (let f = 0; f < numFaces; f++) {
    const ia = faces[f * 3];
    const ib = faces[f * 3 + 1];
    const ic = faces[f * 3 + 2];

    addNeighbor(neighbors, ia, ib);
    addNeighbor(neighbors, ib, ic);
    addNeighbor(neighbors, ic, ia);
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

    // Average of neighbor positions
    if (neighbors[i].length === 0) continue;

    let sumX = 0, sumY = 0, sumZ = 0;

    for (const ni of neighbors[i]) {
      sumX += currentVerts[ni * 3];
      sumY += currentVerts[ni * 3 + 1];
      sumZ += currentVerts[ni * 3 + 2];
    }

    const count = neighbors[i].length;
    newVerts[i * 3] = sumX / count;
    newVerts[i * 3 + 1] = sumY / count;
    newVerts[i * 3 + 2] = sumZ / count;
  }

  return newVerts;
}

/**
 * Helper to add neighbor relationship
 */
function addNeighbor(neighbors: number[][], i: number, j: number): void {
  if (!neighbors[i].includes(j)) {
    neighbors[i].push(j);
  }
  if (!neighbors[j].includes(i)) {
    neighbors[j].push(i);
  }
}
