/**
 * Inverse Design Optimization Module
 * Based on "Fabric Tessellation: Realizing Freeform Surfaces by Smocking" (Segall et al., ACM TOG 2024)
 *
 * Implements the optimization: Y = argmin ws*Eshape + wp*Epleat + wc*Eseam
 */

import type {
  Mesh3D,
  TiledPattern,
  TangramState,
  OptimizationParams,
  OptimizationResult,
} from '../types';
import { computeTangramForGary } from './tangram';

/**
 * Compute shape energy Eshape
 * Based on paper Eq.(2): sum over underlay edges of (|e_Y| / |e_X| - |e_M| / |e_X|)^2
 * Measures how well the tangram matches the target mesh's edge length ratios
 */
export function computeEshape(
  tangram: TangramState,
  _targetMesh: Mesh3D,
  tiledPattern: TiledPattern
): number {
  const { vertices2D } = tangram;
  const openVertices = tiledPattern.tangram.vertices; // Original open positions
  let energy = 0;
  let count = 0;

  // For each underlay edge, compare current length ratio to target ratio
  for (const edge of tiledPattern.edges) {
    if (edge.type !== 'underlay') continue;

    const a = edge.a;
    const b = edge.b;

    // Open (reference) edge length
    const oax = openVertices[a * 2];
    const oay = openVertices[a * 2 + 1];
    const obx = openVertices[b * 2];
    const oby = openVertices[b * 2 + 1];
    const openLen = Math.sqrt((obx - oax) ** 2 + (oby - oay) ** 2);

    if (openLen < 1e-10) continue;

    // Current edge length
    const cax = vertices2D[a * 2];
    const cay = vertices2D[a * 2 + 1];
    const cbx = vertices2D[b * 2];
    const cby = vertices2D[b * 2 + 1];
    const currentLen = Math.sqrt((cbx - cax) ** 2 + (cby - cay) ** 2);

    // Target ratio (for now, assume uniform scaling to 0.8 of open)
    // In full implementation, this would come from mesh parameterization
    const targetRatio = 0.8;
    const currentRatio = currentLen / openLen;

    const diff = currentRatio - targetRatio;
    energy += diff * diff;
    count++;
  }

  return count > 0 ? energy / count : 0;
}

/**
 * Compute pleat energy Epleat
 * Based on paper Eq.(3): sum over pleat face angles
 * Encourages pleats to fold cleanly
 */
export function computeEpleat(
  tangram: TangramState,
  tiledPattern: TiledPattern
): number {
  const { vertices2D } = tangram;
  let energy = 0;
  let count = 0;

  // For each pleat face, compute deviation from flat
  for (const face of tiledPattern.faces) {
    if (face.type !== 'pleat') continue;

    const verts = face.vertices;
    if (verts.length < 3) continue;

    // Compute angles in the face
    for (let i = 0; i < verts.length; i++) {
      const prev = verts[(i - 1 + verts.length) % verts.length];
      const curr = verts[i];
      const next = verts[(i + 1) % verts.length];

      const px = vertices2D[prev * 2];
      const py = vertices2D[prev * 2 + 1];
      const cx = vertices2D[curr * 2];
      const cy = vertices2D[curr * 2 + 1];
      const nx = vertices2D[next * 2];
      const ny = vertices2D[next * 2 + 1];

      // Vectors from current to neighbors
      const v1x = px - cx, v1y = py - cy;
      const v2x = nx - cx, v2y = ny - cy;

      // Angle at current vertex
      const dot = v1x * v2x + v1y * v2y;
      const cross = v1x * v2y - v1y * v2x;
      const angle = Math.atan2(Math.abs(cross), dot);

      // Target angle for quad is PI/2, for triangle is PI/3
      const targetAngle = verts.length === 4 ? Math.PI / 2 : Math.PI / 3;
      const diff = angle - targetAngle;
      energy += diff * diff;
      count++;
    }
  }

  return count > 0 ? energy / count : 0;
}

/**
 * Compute seam energy Eseam
 * Based on paper Eq.(4): seam edge/angle compatibility
 * Ensures seams between pattern sectors match properly
 */
export function computeEseam(
  tangram: TangramState,
  tiledPattern: TiledPattern
): number {
  const { vertices2D } = tangram;
  let energy = 0;
  let count = 0;

  // For each seam edge, compute length mismatch
  for (const edge of tiledPattern.edges) {
    if (edge.type !== 'seam') continue;

    const a = edge.a;
    const b = edge.b;

    const ax = vertices2D[a * 2];
    const ay = vertices2D[a * 2 + 1];
    const bx = vertices2D[b * 2];
    const by = vertices2D[b * 2 + 1];

    // Seam edges should maintain consistent length
    // (In full implementation, would compare to matching edge on other side)
    const len = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);

    // Target length (would be computed from matching seam)
    const targetLen = 1.0;
    const diff = (len - targetLen) / targetLen;
    energy += diff * diff;
    count++;
  }

  return count > 0 ? energy / count : 0;
}

/**
 * Compute total energy
 */
export function computeTotalEnergy(
  tangram: TangramState,
  targetMesh: Mesh3D,
  tiledPattern: TiledPattern,
  params: OptimizationParams
): { total: number; Eshape: number; Epleat: number; Eseam: number } {
  const Eshape = computeEshape(tangram, targetMesh, tiledPattern);
  const Epleat = computeEpleat(tangram, tiledPattern);
  const Eseam = computeEseam(tangram, tiledPattern);

  const total = params.ws * Eshape + params.wp * Epleat + params.wc * Eseam;

  return { total, Eshape, Epleat, Eseam };
}

/**
 * Compute gradient of total energy w.r.t. vertex positions
 * Uses numerical differentiation for simplicity
 */
function computeGradient(
  tangram: TangramState,
  targetMesh: Mesh3D,
  tiledPattern: TiledPattern,
  params: OptimizationParams
): Float64Array {
  const h = 1e-6; // Step size for finite differences
  const n = tangram.vertices2D.length / 2;
  const gradient = new Float64Array(n * 2);

  const baseEnergy = computeTotalEnergy(tangram, targetMesh, tiledPattern, params).total;

  for (let i = 0; i < n; i++) {
    // Gradient for x
    const originalX = tangram.vertices2D[i * 2];
    tangram.vertices2D[i * 2] = originalX + h;
    const energyPlusX = computeTotalEnergy(tangram, targetMesh, tiledPattern, params).total;
    tangram.vertices2D[i * 2] = originalX;
    gradient[i * 2] = (energyPlusX - baseEnergy) / h;

    // Gradient for y
    const originalY = tangram.vertices2D[i * 2 + 1];
    tangram.vertices2D[i * 2 + 1] = originalY + h;
    const energyPlusY = computeTotalEnergy(tangram, targetMesh, tiledPattern, params).total;
    tangram.vertices2D[i * 2 + 1] = originalY;
    gradient[i * 2 + 1] = (energyPlusY - baseEnergy) / h;
  }

  return gradient;
}

/**
 * Run optimization using gradient descent
 */
export async function runOptimization(
  targetMesh: Mesh3D,
  tiledPattern: TiledPattern,
  params: OptimizationParams,
  onProgress?: (iter: number, Eshape: number, Epleat: number) => void
): Promise<OptimizationResult> {
  // Initialize tangram at given gary value
  let tangram = computeTangramForGary(tiledPattern, params.etaInitial);

  const maxIter = params.maxIterations;
  const threshold = params.convergenceThreshold;
  let wpCurrent = params.wp;

  let prevEnergy = Infinity;
  let iter = 0;

  for (iter = 0; iter < maxIter; iter++) {
    // Compute current energy
    const modifiedParams = { ...params, wp: wpCurrent };
    const { total, Eshape, Epleat } = computeTotalEnergy(
      tangram, targetMesh, tiledPattern, modifiedParams
    );

    // Report progress
    if (onProgress) {
      onProgress(iter, Eshape, Epleat);
    }

    // Check convergence
    const energyChange = Math.abs(prevEnergy - total);
    if (energyChange < threshold && iter > 0) {
      break;
    }
    prevEnergy = total;

    // Compute gradient
    const gradient = computeGradient(tangram, targetMesh, tiledPattern, modifiedParams);

    // Update positions (gradient descent with adaptive step size)
    const stepSize = 0.01;
    for (let i = 0; i < tangram.vertices2D.length; i++) {
      tangram.vertices2D[i] -= stepSize * gradient[i];
    }

    // Dynamic wp scheduling: decay by 20% per iteration
    wpCurrent *= 0.8;

    // Yield to event loop periodically
    if (iter % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  // Final energy computation
  const finalEnergy = computeTotalEnergy(tangram, targetMesh, tiledPattern, params);

  return {
    tiledPattern,
    tangramState: tangram,
    Eshape: finalEnergy.Eshape,
    Epleat: finalEnergy.Epleat,
    Eseam: finalEnergy.Eseam,
    iterations: iter,
    converged: iter < maxIter,
  };
}

/**
 * Get default optimization parameters
 */
export function getDefaultOptimizationParams(): OptimizationParams {
  return {
    ws: 1.0,      // Shape weight
    wp: 0.1,      // Pleat weight (starts low, decays)
    wc: 0.01,     // Seam weight
    etaInitial: 0.5,
    maxIterations: 100,
    convergenceThreshold: 1e-4,
  };
}

/**
 * Evaluate fabricability metrics
 */
export function evaluateFabricability(
  _tangram: TangramState,
  tiledPattern: TiledPattern
): {
  pleatQuality: number;       // 0-1, higher is better
  edgeRatioVariance: number;  // Lower is better
  overallScore: number;       // 0-1, higher is better
} {
  // Simplified fabricability metrics
  // In full implementation would check:
  // - Minimum edge lengths
  // - Maximum pleat angles
  // - Stitch line straightness
  // - Pattern regularity

  const numFaces = tiledPattern.faces.length;
  const numPleatFaces = tiledPattern.faces.filter(f => f.type === 'pleat').length;

  // Pleat quality: ratio of pleat to total faces (for patterns with pleats)
  const pleatQuality = numFaces > 0 ? (numFaces - numPleatFaces) / numFaces : 1;

  // Edge ratio variance (would compute from actual edge lengths)
  const edgeRatioVariance = 0.1;

  // Overall score combining metrics
  const overallScore = pleatQuality * 0.7 + (1 - Math.min(1, edgeRatioVariance)) * 0.3;

  return {
    pleatQuality,
    edgeRatioVariance,
    overallScore,
  };
}

/**
 * Check Poincare-Hopf theorem for singularities
 * Sum of singularity indices should equal Euler characteristic
 */
export function checkPoincareHopf(
  singularityIndices: number[],
  eulerCharacteristic: number
): { valid: boolean; sum: number; expected: number } {
  const sum = singularityIndices.reduce((a, b) => a + b, 0);
  const valid = Math.abs(sum - eulerCharacteristic) < 1e-6;

  return { valid, sum, expected: eulerCharacteristic };
}
