/**
 * Curvature Computation Module
 * Discrete Gaussian and Mean curvature computation for triangle meshes
 */

import type { Mesh3D } from '../types';

/**
 * Compute Gaussian curvature using discrete angle defect method
 * K(v) = 2π - Σθ_i where θ_i are angles at vertex v
 * Normalized by 1/3 of sum of adjacent triangle areas (mixed Voronoi area)
 */
export function computeGaussianCurvature(mesh: Mesh3D): Float32Array {
  const { vertices, faces } = mesh;
  const numVerts = vertices.length / 3;
  const numFaces = faces.length / 3;

  const angleSum = new Float32Array(numVerts);
  const areaSum = new Float32Array(numVerts);

  // For each face, compute angles at each vertex
  for (let f = 0; f < numFaces; f++) {
    const ia = faces[f * 3];
    const ib = faces[f * 3 + 1];
    const ic = faces[f * 3 + 2];

    // Get positions
    const ax = vertices[ia * 3], ay = vertices[ia * 3 + 1], az = vertices[ia * 3 + 2];
    const bx = vertices[ib * 3], by = vertices[ib * 3 + 1], bz = vertices[ib * 3 + 2];
    const cx = vertices[ic * 3], cy = vertices[ic * 3 + 1], cz = vertices[ic * 3 + 2];

    // Edge vectors
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    const bax = ax - bx, bay = ay - by, baz = az - bz;
    const bcx = cx - bx, bcy = cy - by, bcz = cz - bz;
    const cax = ax - cx, cay = ay - cy, caz = az - cz;
    const cbx = bx - cx, cby = by - cy, cbz = bz - cz;

    // Compute triangle area (half of cross product magnitude)
    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;
    const area = Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ) / 2;

    // Compute angles using dot product
    const angleA = computeAngle(abx, aby, abz, acx, acy, acz);
    const angleB = computeAngle(bax, bay, baz, bcx, bcy, bcz);
    const angleC = computeAngle(cax, cay, caz, cbx, cby, cbz);

    angleSum[ia] += angleA;
    angleSum[ib] += angleB;
    angleSum[ic] += angleC;

    // Add 1/3 of triangle area to each vertex
    const areaThird = area / 3;
    areaSum[ia] += areaThird;
    areaSum[ib] += areaThird;
    areaSum[ic] += areaThird;
  }

  // Compute Gaussian curvature as angle defect
  const gaussianCurvature = new Float32Array(numVerts);

  for (let i = 0; i < numVerts; i++) {
    const angleDefect = 2 * Math.PI - angleSum[i];
    // Normalize by area (if area > 0)
    if (areaSum[i] > 1e-10) {
      gaussianCurvature[i] = angleDefect / areaSum[i];
    } else {
      gaussianCurvature[i] = 0;
    }
  }

  return gaussianCurvature;
}

/**
 * Compute Mean curvature using cotangent formula
 * H(v) = (1/4A) Σ (cot α_ij + cot β_ij) (v_j - v_i)
 * where α_ij and β_ij are angles opposite to edge (i,j)
 */
export function computeMeanCurvature(mesh: Mesh3D): Float32Array {
  const { vertices, faces } = mesh;
  const numVerts = vertices.length / 3;
  const numFaces = faces.length / 3;

  // Build adjacency: for each vertex, collect neighboring vertices and their cotangent weights
  const laplacian: [number, number, number][][] = Array.from({ length: numVerts }, () => []);
  const areaSum = new Float32Array(numVerts);

  // For each face, compute cotangent weights for each edge
  for (let f = 0; f < numFaces; f++) {
    const ia = faces[f * 3];
    const ib = faces[f * 3 + 1];
    const ic = faces[f * 3 + 2];

    // Get positions
    const ax = vertices[ia * 3], ay = vertices[ia * 3 + 1], az = vertices[ia * 3 + 2];
    const bx = vertices[ib * 3], by = vertices[ib * 3 + 1], bz = vertices[ib * 3 + 2];
    const cx = vertices[ic * 3], cy = vertices[ic * 3 + 1], cz = vertices[ic * 3 + 2];

    // Edge vectors from each vertex
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    const bax = ax - bx, bay = ay - by, baz = az - bz;
    const bcx = cx - bx, bcy = cy - by, bcz = cz - bz;
    const cax = ax - cx, cay = ay - cy, caz = az - cz;
    const cbx = bx - cx, cby = by - cy, cbz = bz - cz;

    // Compute cotangents of angles
    const cotA = computeCotangent(abx, aby, abz, acx, acy, acz);
    const cotB = computeCotangent(bax, bay, baz, bcx, bcy, bcz);
    const cotC = computeCotangent(cax, cay, caz, cbx, cby, cbz);

    // Triangle area for Voronoi region calculation
    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;
    const area = Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ) / 2;

    areaSum[ia] += area / 3;
    areaSum[ib] += area / 3;
    areaSum[ic] += area / 3;

    // Add cotangent weights
    // Edge bc opposite to angle A
    laplacian[ib].push([ic, cotA, f]);
    laplacian[ic].push([ib, cotA, f]);

    // Edge ac opposite to angle B
    laplacian[ia].push([ic, cotB, f]);
    laplacian[ic].push([ia, cotB, f]);

    // Edge ab opposite to angle C
    laplacian[ia].push([ib, cotC, f]);
    laplacian[ib].push([ia, cotC, f]);
  }

  // Compute mean curvature for each vertex
  const meanCurvature = new Float32Array(numVerts);

  for (let i = 0; i < numVerts; i++) {
    const ix = vertices[i * 3];
    const iy = vertices[i * 3 + 1];
    const iz = vertices[i * 3 + 2];

    // Sum cotangent-weighted Laplacian
    let lapX = 0, lapY = 0, lapZ = 0;
    const neighbors = laplacian[i];

    // Combine weights for same neighbor (each edge appears twice)
    const weightMap = new Map<number, number>();
    for (const [j, w] of neighbors) {
      weightMap.set(j, (weightMap.get(j) ?? 0) + w);
    }

    for (const [j, weight] of weightMap) {
      const jx = vertices[j * 3];
      const jy = vertices[j * 3 + 1];
      const jz = vertices[j * 3 + 2];

      lapX += weight * (jx - ix);
      lapY += weight * (jy - iy);
      lapZ += weight * (jz - iz);
    }

    // Mean curvature is half the magnitude of Laplacian / area
    if (areaSum[i] > 1e-10) {
      const lapMag = Math.sqrt(lapX * lapX + lapY * lapY + lapZ * lapZ);
      meanCurvature[i] = lapMag / (4 * areaSum[i]);
    } else {
      meanCurvature[i] = 0;
    }
  }

  return meanCurvature;
}

/**
 * Compute angle between two vectors (in radians)
 */
function computeAngle(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number
): number {
  const dot = ax * bx + ay * by + az * bz;
  const lenA = Math.sqrt(ax * ax + ay * ay + az * az);
  const lenB = Math.sqrt(bx * bx + by * by + bz * bz);

  if (lenA < 1e-10 || lenB < 1e-10) return 0;

  const cosAngle = Math.max(-1, Math.min(1, dot / (lenA * lenB)));
  return Math.acos(cosAngle);
}

/**
 * Compute cotangent of angle between two vectors
 */
function computeCotangent(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number
): number {
  const dot = ax * bx + ay * by + az * bz;

  // Cross product magnitude
  const crossX = ay * bz - az * by;
  const crossY = az * bx - ax * bz;
  const crossZ = ax * by - ay * bx;
  const crossMag = Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ);

  if (crossMag < 1e-10) return 0;

  return dot / crossMag;
}

/**
 * Generate color map for curvature visualization
 * Maps curvature values to RGB colors
 */
export function curvatureToColors(
  curvature: Float32Array,
  mode: 'diverging' | 'sequential' = 'diverging'
): Float32Array {
  const n = curvature.length;
  const colors = new Float32Array(n * 3);

  // Find min/max for normalization
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < n; i++) {
    if (isFinite(curvature[i])) {
      min = Math.min(min, curvature[i]);
      max = Math.max(max, curvature[i]);
    }
  }

  // Symmetric range for diverging colormap
  if (mode === 'diverging') {
    const absMax = Math.max(Math.abs(min), Math.abs(max));
    min = -absMax;
    max = absMax;
  }

  const range = max - min;

  for (let i = 0; i < n; i++) {
    const value = curvature[i];
    let t: number;

    if (!isFinite(value) || range < 1e-10) {
      t = 0.5;
    } else {
      t = (value - min) / range;
    }

    // Color interpolation
    let r: number, g: number, b: number;

    if (mode === 'diverging') {
      // Blue -> White -> Red colormap
      if (t < 0.5) {
        // Blue to white
        const s = t * 2;
        r = s;
        g = s;
        b = 1;
      } else {
        // White to red
        const s = (t - 0.5) * 2;
        r = 1;
        g = 1 - s;
        b = 1 - s;
      }
    } else {
      // Sequential: Viridis-like
      r = Math.min(1, t * 2);
      g = Math.sin(t * Math.PI);
      b = Math.max(0, 1 - t * 2);
    }

    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }

  return colors;
}

/**
 * Get statistics for curvature values
 */
export function getCurvatureStats(curvature: Float32Array): {
  min: number;
  max: number;
  mean: number;
  stdDev: number;
} {
  let min = Infinity, max = -Infinity;
  let sum = 0;
  let count = 0;

  for (let i = 0; i < curvature.length; i++) {
    const v = curvature[i];
    if (isFinite(v)) {
      min = Math.min(min, v);
      max = Math.max(max, v);
      sum += v;
      count++;
    }
  }

  const mean = count > 0 ? sum / count : 0;

  let varianceSum = 0;
  for (let i = 0; i < curvature.length; i++) {
    const v = curvature[i];
    if (isFinite(v)) {
      varianceSum += (v - mean) * (v - mean);
    }
  }

  const stdDev = count > 0 ? Math.sqrt(varianceSum / count) : 0;

  return { min, max, mean, stdDev };
}
