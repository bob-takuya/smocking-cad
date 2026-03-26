/**
 * Tangram Computation Module
 * Handles pattern construction, vertex classification, and optimization-based closing
 *
 * Based on "Fabric Tessellation: Realizing Freeform Surfaces by Smocking" (Segall et al., SIGGRAPH 2024)
 */

import type {
  SmockingPatternDef,
  TangramData,
  TangramState,
  PleatMVC,
  TiledPattern,
  TiledVertex,
  TiledEdge,
  TiledFace,
} from '../types';

// ============================================================
// Core Tangram Building
// ============================================================

/**
 * Build tangram data structure from a pattern definition
 */
export function buildTangram(
  pattern: SmockingPatternDef,
  uRepeat: number = 1,
  vRepeat: number = 1
): TangramData {
  // Calculate full grid dimensions
  const nx = pattern.nx + (pattern.nx - 1) * (uRepeat - 1);
  const ny = pattern.ny + (pattern.ny - 1) * (vRepeat - 1);
  const numVerts = nx * ny;

  // Build coordinate to stitch line mapping
  const coordToSL = new Int32Array(numVerts).fill(-1);

  // Map each coordinate in each repetition to its stitch line index
  for (let v = 0; v < vRepeat; v++) {
    for (let u = 0; u < uRepeat; u++) {
      const offsetX = u * (pattern.nx - 1);
      const offsetY = v * (pattern.ny - 1);

      for (let slIdx = 0; slIdx < pattern.stitchingLines.length; slIdx++) {
        const sl = pattern.stitchingLines[slIdx];
        for (const [x, y] of sl) {
          const gx = x + offsetX;
          const gy = y + offsetY;
          if (gx < nx && gy < ny) {
            const vertIdx = gy * nx + gx;
            // Use unique stitch line index per repetition
            const globalSLIdx = (v * uRepeat + u) * pattern.stitchingLines.length + slIdx;
            coordToSL[vertIdx] = globalSLIdx;
          }
        }
      }
    }
  }

  // Initialize vertex positions on unit grid
  const vertices = new Float64Array(numVerts * 2);
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const idx = y * nx + x;
      vertices[idx * 2] = x;
      vertices[idx * 2 + 1] = y;
    }
  }

  // Collect underlay and pleat vertex indices
  const underlayList: number[] = [];
  const pleatList: number[] = [];
  for (let i = 0; i < numVerts; i++) {
    if (coordToSL[i] >= 0) {
      underlayList.push(i);
    } else {
      pleatList.push(i);
    }
  }

  // Build edge lists
  const underlayEdgeList: number[] = [];
  const stitchingEdgeList: number[] = [];

  // Helper to check if edge connects two underlay vertices from same/different stitch lines
  const isUnderlay = (i: number) => coordToSL[i] >= 0;

  // Add all grid edges
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const idx = y * nx + x;

      // Right neighbor
      if (x < nx - 1) {
        const right = idx + 1;
        if (isUnderlay(idx) && isUnderlay(right)) {
          if (coordToSL[idx] === coordToSL[right]) {
            stitchingEdgeList.push(idx, right);
          } else {
            underlayEdgeList.push(idx, right);
          }
        }
      }

      // Down neighbor
      if (y < ny - 1) {
        const down = idx + nx;
        if (isUnderlay(idx) && isUnderlay(down)) {
          if (coordToSL[idx] === coordToSL[down]) {
            stitchingEdgeList.push(idx, down);
          } else {
            underlayEdgeList.push(idx, down);
          }
        }
      }

      // Diagonal edges (for triangulation)
      if (x < nx - 1 && y < ny - 1) {
        const bl = idx;
        const br = idx + 1;
        const tl = idx + nx;
        const tr = idx + nx + 1;

        // Check diagonals
        if (isUnderlay(bl) && isUnderlay(tr)) {
          if (coordToSL[bl] === coordToSL[tr]) {
            stitchingEdgeList.push(bl, tr);
          } else {
            underlayEdgeList.push(bl, tr);
          }
        }
        if (isUnderlay(br) && isUnderlay(tl)) {
          if (coordToSL[br] === coordToSL[tl]) {
            stitchingEdgeList.push(br, tl);
          } else {
            underlayEdgeList.push(br, tl);
          }
        }
      }
    }
  }

  // Triangulate the grid
  const { faces, faceClass } = triangulateGrid(nx, ny, coordToSL, underlayEdgeList, stitchingEdgeList);

  // Compute original edge lengths
  const allEdges = [...underlayEdgeList, ...stitchingEdgeList];
  const originalLengths = new Float64Array(allEdges.length / 2);
  for (let i = 0; i < allEdges.length; i += 2) {
    const a = allEdges[i];
    const b = allEdges[i + 1];
    const dx = vertices[b * 2] - vertices[a * 2];
    const dy = vertices[b * 2 + 1] - vertices[a * 2 + 1];
    originalLengths[i / 2] = Math.sqrt(dx * dx + dy * dy);
  }

  // Compute Mean Value Coordinates for pleat vertices
  const pleatMVC = computePleatMVC(
    pleatList,
    underlayList,
    vertices,
    faces,
    faceClass,
    nx
  );

  return {
    nx,
    ny,
    vertices,
    coordToSL,
    underlayEdges: new Uint32Array(underlayEdgeList),
    stitchingEdges: new Uint32Array(stitchingEdgeList),
    faces,
    faceClass,
    pleatIndices: new Uint32Array(pleatList),
    underlayIndices: new Uint32Array(underlayList),
    pleatMVC,
    originalLengths,
  };
}

/**
 * Triangulate the grid with proper diagonal choice
 * - Use (bl,tr) diagonal if it's an underlay edge OR (br,tl) is a stitching edge
 * - Otherwise use (br,tl) diagonal
 */
function triangulateGrid(
  nx: number,
  ny: number,
  coordToSL: Int32Array,
  underlayEdgeList: number[],
  stitchingEdgeList: number[]
): { faces: Uint32Array; faceClass: Uint8Array } {
  const faceList: number[] = [];

  // Build edge sets for fast lookup
  const underlayEdgeSet = new Set<string>();
  const stitchingEdgeSet = new Set<string>();

  for (let i = 0; i < underlayEdgeList.length; i += 2) {
    const a = underlayEdgeList[i];
    const b = underlayEdgeList[i + 1];
    underlayEdgeSet.add(`${Math.min(a, b)},${Math.max(a, b)}`);
  }

  for (let i = 0; i < stitchingEdgeList.length; i += 2) {
    const a = stitchingEdgeList[i];
    const b = stitchingEdgeList[i + 1];
    stitchingEdgeSet.add(`${Math.min(a, b)},${Math.max(a, b)}`);
  }

  const isUnderlayEdge = (a: number, b: number) =>
    underlayEdgeSet.has(`${Math.min(a, b)},${Math.max(a, b)}`);
  const isStitchingEdge = (a: number, b: number) =>
    stitchingEdgeSet.has(`${Math.min(a, b)},${Math.max(a, b)}`);

  // Triangulate each grid cell
  for (let y = 0; y < ny - 1; y++) {
    for (let x = 0; x < nx - 1; x++) {
      const bl = y * nx + x;       // bottom-left
      const br = y * nx + x + 1;   // bottom-right
      const tl = (y + 1) * nx + x; // top-left
      const tr = (y + 1) * nx + x + 1; // top-right

      // Choose diagonal based on paper's rules
      const useBLTR = isUnderlayEdge(bl, tr) || isStitchingEdge(br, tl);

      if (useBLTR) {
        // Use (bl, tr) diagonal: triangles are (bl, br, tr) and (bl, tr, tl)
        faceList.push(bl, br, tr);
        faceList.push(bl, tr, tl);
      } else {
        // Use (br, tl) diagonal: triangles are (bl, br, tl) and (br, tr, tl)
        faceList.push(bl, br, tl);
        faceList.push(br, tr, tl);
      }
    }
  }

  const faces = new Uint32Array(faceList);
  const numFaces = faces.length / 3;

  // Classify faces using flood-fill
  const faceClass = classifyFaces(faces, numFaces, coordToSL, nx, ny);

  return { faces, faceClass };
}

/**
 * Classify faces as UNDERLAY (1) or PLEAT (0) using flood-fill
 * A region is PLEAT if it contains 2 vertices from the same stitching line
 */
function classifyFaces(
  faces: Uint32Array,
  numFaces: number,
  coordToSL: Int32Array,
  nx: number,
  ny: number
): Uint8Array {
  const faceClass = new Uint8Array(numFaces);

  // Build face adjacency (faces sharing an edge)
  // Build edge-to-face mapping
  const edgeToFaces = new Map<string, number[]>();

  for (let f = 0; f < numFaces; f++) {
    const v0 = faces[f * 3];
    const v1 = faces[f * 3 + 1];
    const v2 = faces[f * 3 + 2];

    const edges = [
      [v0, v1],
      [v1, v2],
      [v2, v0],
    ];

    for (const [a, b] of edges) {
      const key = `${Math.min(a, b)},${Math.max(a, b)}`;
      if (!edgeToFaces.has(key)) {
        edgeToFaces.set(key, []);
      }
      edgeToFaces.get(key)!.push(f);
    }
  }

  // Build underlay edge set for boundary detection
  const underlayEdgeSet = new Set<string>();
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const idx = y * nx + x;

      if (coordToSL[idx] >= 0) {
        // Right
        if (x < nx - 1 && coordToSL[idx + 1] >= 0 && coordToSL[idx] !== coordToSL[idx + 1]) {
          underlayEdgeSet.add(`${idx},${idx + 1}`);
        }
        // Down
        if (y < ny - 1 && coordToSL[idx + nx] >= 0 && coordToSL[idx] !== coordToSL[idx + nx]) {
          underlayEdgeSet.add(`${idx},${idx + nx}`);
        }
        // Diagonal (bl to tr)
        if (x < nx - 1 && y < ny - 1) {
          const tr = idx + nx + 1;
          if (coordToSL[tr] >= 0 && coordToSL[idx] !== coordToSL[tr]) {
            underlayEdgeSet.add(`${idx},${tr}`);
          }
        }
        // Diagonal (br to tl)
        if (x > 0 && y < ny - 1) {
          const tl = idx + nx - 1;
          if (coordToSL[tl] >= 0 && coordToSL[idx] !== coordToSL[tl]) {
            underlayEdgeSet.add(`${Math.min(idx, tl)},${Math.max(idx, tl)}`);
          }
        }
      }
    }
  }

  // Flood-fill from each unclassified face
  const visited = new Uint8Array(numFaces);

  for (let startFace = 0; startFace < numFaces; startFace++) {
    if (visited[startFace]) continue;

    // Collect all faces in this region
    const region: number[] = [];
    const stack = [startFace];

    while (stack.length > 0) {
      const f = stack.pop()!;
      if (visited[f]) continue;
      visited[f] = 1;
      region.push(f);

      // Get face vertices
      const v0 = faces[f * 3];
      const v1 = faces[f * 3 + 1];
      const v2 = faces[f * 3 + 2];

      const edges = [
        [v0, v1],
        [v1, v2],
        [v2, v0],
      ];

      for (const [a, b] of edges) {
        const key = `${Math.min(a, b)},${Math.max(a, b)}`;

        // Check if this edge is an underlay edge (boundary)
        if (underlayEdgeSet.has(key)) continue;

        // Get adjacent faces
        const adjFaces = edgeToFaces.get(key) || [];
        for (const adjF of adjFaces) {
          if (!visited[adjF]) {
            stack.push(adjF);
          }
        }
      }
    }

    // Classify the region
    // Check if any stitch line index appears twice in the region's vertices
    const stitchLineCounts = new Map<number, number>();
    let isPleat = false;

    for (const f of region) {
      const faceVerts = [faces[f * 3], faces[f * 3 + 1], faces[f * 3 + 2]];
      for (const v of faceVerts) {
        const sl = coordToSL[v];
        if (sl >= 0) {
          const count = (stitchLineCounts.get(sl) || 0) + 1;
          stitchLineCounts.set(sl, count);
          if (count >= 2) {
            isPleat = true;
          }
        }
      }
    }

    // Set classification for all faces in region
    const classification = isPleat ? 0 : 1; // 0=pleat, 1=underlay
    for (const f of region) {
      faceClass[f] = classification;
    }
  }

  return faceClass;
}

/**
 * Compute Mean Value Coordinates for pleat vertices
 */
function computePleatMVC(
  pleatList: number[],
  underlayList: number[],
  vertices: Float64Array,
  faces: Uint32Array,
  _faceClass: Uint8Array,
  nx: number
): PleatMVC[] {
  const mvcList: PleatMVC[] = [];
  const underlaySet = new Set(underlayList);

  for (const pleatIdx of pleatList) {
    // Find the underlay polygon surrounding this pleat vertex
    // This is the set of underlay vertices that form a boundary around the pleat vertex
    const neighbors = findUnderlayNeighbors(pleatIdx, vertices, faces, underlaySet, nx);

    if (neighbors.length < 3) {
      // Fallback: uniform weights
      const weights = neighbors.map(idx => ({ index: idx, weight: 1 / neighbors.length }));
      mvcList.push({ pleatIndex: pleatIdx, neighbors: weights });
      continue;
    }

    // Compute MVC weights
    const px = vertices[pleatIdx * 2];
    const py = vertices[pleatIdx * 2 + 1];

    const weights: { index: number; weight: number }[] = [];
    let totalWeight = 0;

    for (let i = 0; i < neighbors.length; i++) {
      const idx = neighbors[i];
      const prevIdx = neighbors[(i + neighbors.length - 1) % neighbors.length];
      const nextIdx = neighbors[(i + 1) % neighbors.length];

      // Get positions
      const vx = vertices[idx * 2];
      const vy = vertices[idx * 2 + 1];
      const prevX = vertices[prevIdx * 2];
      const prevY = vertices[prevIdx * 2 + 1];
      const nextX = vertices[nextIdx * 2];
      const nextY = vertices[nextIdx * 2 + 1];

      // Vector from p to v
      const dx = vx - px;
      const dy = vy - py;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 1e-10) {
        // Vertex is at pleat position, use high weight
        weights.push({ index: idx, weight: 1e6 });
        totalWeight += 1e6;
        continue;
      }

      // Compute angles
      const alpha = computeAngle(px, py, prevX, prevY, vx, vy);
      const beta = computeAngle(px, py, vx, vy, nextX, nextY);

      // MVC weight: (tan(alpha/2) + tan(beta/2)) / dist
      const weight = (Math.tan(alpha / 2) + Math.tan(beta / 2)) / dist;

      weights.push({ index: idx, weight: Math.max(weight, 0) });
      totalWeight += Math.max(weight, 0);
    }

    // Normalize weights
    if (totalWeight > 0) {
      for (const w of weights) {
        w.weight /= totalWeight;
      }
    }

    mvcList.push({ pleatIndex: pleatIdx, neighbors: weights });
  }

  return mvcList;
}

/**
 * Find underlay vertices that form a boundary around a pleat vertex
 */
function findUnderlayNeighbors(
  pleatIdx: number,
  vertices: Float64Array,
  faces: Uint32Array,
  underlaySet: Set<number>,
  _nx: number
): number[] {
  const numFaces = faces.length / 3;
  const neighbors: number[] = [];
  const neighborSet = new Set<number>();

  // Find all faces containing this pleat vertex
  for (let f = 0; f < numFaces; f++) {
    const v0 = faces[f * 3];
    const v1 = faces[f * 3 + 1];
    const v2 = faces[f * 3 + 2];

    if (v0 === pleatIdx || v1 === pleatIdx || v2 === pleatIdx) {
      // Add underlay vertices from this face
      for (const v of [v0, v1, v2]) {
        if (v !== pleatIdx && underlaySet.has(v) && !neighborSet.has(v)) {
          neighborSet.add(v);
          neighbors.push(v);
        }
      }
    }
  }

  // Sort neighbors by angle around the pleat vertex
  const px = vertices[pleatIdx * 2];
  const py = vertices[pleatIdx * 2 + 1];

  neighbors.sort((a, b) => {
    const ax = vertices[a * 2] - px;
    const ay = vertices[a * 2 + 1] - py;
    const bx = vertices[b * 2] - px;
    const by = vertices[b * 2 + 1] - py;
    return Math.atan2(ay, ax) - Math.atan2(by, bx);
  });

  return neighbors;
}

/**
 * Compute angle at point p between vectors to a and b
 */
function computeAngle(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const v1x = ax - px;
  const v1y = ay - py;
  const v2x = bx - px;
  const v2y = by - py;

  const dot = v1x * v2x + v1y * v2y;
  const cross = v1x * v2y - v1y * v2x;

  return Math.atan2(Math.abs(cross), dot);
}

// ============================================================
// Tangram Closing Optimization
// ============================================================

/**
 * Compute closed positions for a given gary value using optimization
 * gary = 1.0: fully open (original positions)
 * gary = 0.0: fully closed (stitching edges shrink to zero)
 */
export function computeClosedPositions(
  tangram: TangramData,
  gary: number
): Float64Array {
  if (gary >= 1.0) {
    // Return original positions
    return new Float64Array(tangram.vertices);
  }

  // Start with current positions
  const positions = new Float64Array(tangram.vertices);

  // Run gradient descent optimization
  const maxIterations = 100;
  const learningRate = 0.1;
  const convergenceThreshold = 1e-6;

  for (let iter = 0; iter < maxIterations; iter++) {
    const gradient = computeGradient(
      positions,
      tangram.underlayEdges,
      tangram.stitchingEdges,
      tangram.originalLengths,
      gary,
      tangram.nx,
      tangram.ny,
      tangram.coordToSL
    );

    // Check convergence
    let maxGrad = 0;
    for (let i = 0; i < gradient.length; i++) {
      maxGrad = Math.max(maxGrad, Math.abs(gradient[i]));
    }
    if (maxGrad < convergenceThreshold) break;

    // Line search
    let step = learningRate;
    const currentEnergy = computeEnergy(
      positions,
      tangram.underlayEdges,
      tangram.stitchingEdges,
      tangram.originalLengths,
      gary
    );

    // Armijo line search
    for (let ls = 0; ls < 10; ls++) {
      const testPos = new Float64Array(positions.length);
      for (let i = 0; i < positions.length; i++) {
        testPos[i] = positions[i] - step * gradient[i];
      }

      const testEnergy = computeEnergy(
        testPos,
        tangram.underlayEdges,
        tangram.stitchingEdges,
        tangram.originalLengths,
        gary
      );

      if (testEnergy < currentEnergy) {
        positions.set(testPos);
        break;
      }
      step *= 0.5;
    }
  }

  // Place pleat vertices using Mean Value Coordinates
  placePleatVertices(positions, tangram.pleatMVC);

  return positions;
}

/**
 * Compute energy for tangram closing
 */
function computeEnergy(
  positions: Float64Array,
  underlayEdges: Uint32Array,
  stitchingEdges: Uint32Array,
  originalLengths: Float64Array,
  gary: number
): number {
  let energy = 0;

  // Underlay edges: maintain original length
  let lenIdx = 0;
  for (let i = 0; i < underlayEdges.length; i += 2) {
    const a = underlayEdges[i];
    const b = underlayEdges[i + 1];
    const dx = positions[b * 2] - positions[a * 2];
    const dy = positions[b * 2 + 1] - positions[a * 2 + 1];
    const lenSq = dx * dx + dy * dy;
    const targetLenSq = originalLengths[lenIdx] * originalLengths[lenIdx];
    energy += (lenSq - targetLenSq) * (lenSq - targetLenSq);
    lenIdx++;
  }

  // Stitching edges: shrink to gary fraction of original length
  for (let i = 0; i < stitchingEdges.length; i += 2) {
    const a = stitchingEdges[i];
    const b = stitchingEdges[i + 1];
    const dx = positions[b * 2] - positions[a * 2];
    const dy = positions[b * 2 + 1] - positions[a * 2 + 1];
    const lenSq = dx * dx + dy * dy;
    const targetLenSq = gary * gary * originalLengths[lenIdx] * originalLengths[lenIdx];
    energy += (lenSq - targetLenSq) * (lenSq - targetLenSq);
    lenIdx++;
  }

  return energy;
}

/**
 * Compute gradient of energy for optimization
 */
function computeGradient(
  positions: Float64Array,
  underlayEdges: Uint32Array,
  stitchingEdges: Uint32Array,
  originalLengths: Float64Array,
  gary: number,
  _nx: number,
  _ny: number,
  coordToSL: Int32Array
): Float64Array {
  const gradient = new Float64Array(positions.length);

  // Only compute gradient for underlay vertices
  let lenIdx = 0;

  // Underlay edges: maintain original length
  for (let i = 0; i < underlayEdges.length; i += 2) {
    const a = underlayEdges[i];
    const b = underlayEdges[i + 1];

    const dx = positions[b * 2] - positions[a * 2];
    const dy = positions[b * 2 + 1] - positions[a * 2 + 1];
    const lenSq = dx * dx + dy * dy;
    const targetLenSq = originalLengths[lenIdx] * originalLengths[lenIdx];

    // Gradient of (lenSq - targetLenSq)^2
    const factor = 4 * (lenSq - targetLenSq);

    if (coordToSL[a] >= 0) {
      gradient[a * 2] -= factor * dx;
      gradient[a * 2 + 1] -= factor * dy;
    }
    if (coordToSL[b] >= 0) {
      gradient[b * 2] += factor * dx;
      gradient[b * 2 + 1] += factor * dy;
    }

    lenIdx++;
  }

  // Stitching edges: shrink to gary fraction
  for (let i = 0; i < stitchingEdges.length; i += 2) {
    const a = stitchingEdges[i];
    const b = stitchingEdges[i + 1];

    const dx = positions[b * 2] - positions[a * 2];
    const dy = positions[b * 2 + 1] - positions[a * 2 + 1];
    const lenSq = dx * dx + dy * dy;
    const targetLenSq = gary * gary * originalLengths[lenIdx] * originalLengths[lenIdx];

    const factor = 4 * (lenSq - targetLenSq);

    if (coordToSL[a] >= 0) {
      gradient[a * 2] -= factor * dx;
      gradient[a * 2 + 1] -= factor * dy;
    }
    if (coordToSL[b] >= 0) {
      gradient[b * 2] += factor * dx;
      gradient[b * 2 + 1] += factor * dy;
    }

    lenIdx++;
  }

  return gradient;
}

/**
 * Place pleat vertices using Mean Value Coordinates
 */
function placePleatVertices(positions: Float64Array, pleatMVC: PleatMVC[]): void {
  for (const mvc of pleatMVC) {
    let x = 0;
    let y = 0;

    for (const neighbor of mvc.neighbors) {
      x += neighbor.weight * positions[neighbor.index * 2];
      y += neighbor.weight * positions[neighbor.index * 2 + 1];
    }

    positions[mvc.pleatIndex * 2] = x;
    positions[mvc.pleatIndex * 2 + 1] = y;
  }
}

// ============================================================
// TangramState Computation
// ============================================================

/**
 * Get tangram state at a given gary value
 */
export function getTangramAtGary(tangram: TangramData, gary: number): TangramState {
  const vertices2D = computeClosedPositions(tangram, gary);
  return {
    gary,
    vertices2D,
  };
}

// ============================================================
// UI-friendly Tiled Pattern Generation
// ============================================================

/**
 * Generate a tiled pattern with UI-friendly data structures
 */
export function generateTiledPattern(
  pattern: SmockingPatternDef,
  uRepeat: number,
  vRepeat: number
): TiledPattern {
  const tangram = buildTangram(pattern, uRepeat, vRepeat);
  const { nx, ny, vertices, coordToSL, underlayEdges, stitchingEdges, faces, faceClass } = tangram;

  // Build TiledVertex array
  const tiledVertices: TiledVertex[] = [];
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const idx = y * nx + x;
      tiledVertices.push({
        id: idx,
        x: vertices[idx * 2],
        y: vertices[idx * 2 + 1],
        type: coordToSL[idx] >= 0 ? 'underlay' : 'pleat',
        unitCellIndex: (y % pattern.ny) * pattern.nx + (x % pattern.nx),
        cellU: Math.floor(x / (pattern.nx - 1)),
        cellV: Math.floor(y / (pattern.ny - 1)),
      });
    }
  }

  // Build TiledEdge array
  const tiledEdges: TiledEdge[] = [];
  const edgeSet = new Set<string>();
  let edgeId = 0;

  // Add underlay edges
  for (let i = 0; i < underlayEdges.length; i += 2) {
    const a = underlayEdges[i];
    const b = underlayEdges[i + 1];
    const key = `${Math.min(a, b)},${Math.max(a, b)}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      tiledEdges.push({ id: edgeId++, a, b, type: 'underlay' });
    }
  }

  // Add stitching edges
  for (let i = 0; i < stitchingEdges.length; i += 2) {
    const a = stitchingEdges[i];
    const b = stitchingEdges[i + 1];
    const key = `${Math.min(a, b)},${Math.max(a, b)}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      tiledEdges.push({ id: edgeId++, a, b, type: 'stitch' });
    }
  }

  // Add remaining grid edges as pleat edges
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const idx = y * nx + x;

      // Right
      if (x < nx - 1) {
        const right = idx + 1;
        const key = `${idx},${right}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          tiledEdges.push({ id: edgeId++, a: idx, b: right, type: 'pleat' });
        }
      }

      // Down
      if (y < ny - 1) {
        const down = idx + nx;
        const key = `${idx},${down}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          tiledEdges.push({ id: edgeId++, a: idx, b: down, type: 'pleat' });
        }
      }
    }
  }

  // Build TiledFace array from triangles
  const tiledFaces: TiledFace[] = [];
  const numFaces = faces.length / 3;
  for (let f = 0; f < numFaces; f++) {
    tiledFaces.push({
      id: f,
      vertices: [faces[f * 3], faces[f * 3 + 1], faces[f * 3 + 2]],
      type: faceClass[f] === 0 ? 'pleat' : 'underlay',
    });
  }

  // Build stitching lines
  const stitchingLines: number[][] = [];
  for (let v = 0; v < vRepeat; v++) {
    for (let u = 0; u < uRepeat; u++) {
      const offsetX = u * (pattern.nx - 1);
      const offsetY = v * (pattern.ny - 1);

      for (const sl of pattern.stitchingLines) {
        const globalLine: number[] = [];
        for (const [x, y] of sl) {
          const gx = x + offsetX;
          const gy = y + offsetY;
          if (gx < nx && gy < ny) {
            globalLine.push(gy * nx + gx);
          }
        }
        if (globalLine.length >= 2) {
          stitchingLines.push(globalLine);
        }
      }
    }
  }

  return {
    pattern,
    uRepeat,
    vRepeat,
    vertices: tiledVertices,
    edges: tiledEdges,
    faces: tiledFaces,
    stitchingLines,
    tangram,
  };
}

/**
 * Compute tangram state for a given gary value (UI-friendly version)
 */
export function computeTangramForGary(
  tiledPattern: TiledPattern,
  gary: number
): TangramState {
  return getTangramAtGary(tiledPattern.tangram, gary);
}

// Legacy alias for backward compatibility
export const computeTangramForEta = computeTangramForGary;

// ============================================================
// Utility Functions
// ============================================================

/**
 * Get bounding box of the pattern
 */
export function getPatternBounds(tiledPattern: TiledPattern): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
} {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const v of tiledPattern.vertices) {
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Scale and center pattern to fit within given dimensions
 */
export function normalizePattern(
  tiledPattern: TiledPattern,
  targetWidth: number,
  targetHeight: number,
  padding: number = 20
): { scale: number; offsetX: number; offsetY: number } {
  const bounds = getPatternBounds(tiledPattern);

  const availableWidth = targetWidth - 2 * padding;
  const availableHeight = targetHeight - 2 * padding;

  const scaleX = availableWidth / bounds.width;
  const scaleY = availableHeight / bounds.height;
  const scale = Math.min(scaleX, scaleY);

  const scaledWidth = bounds.width * scale;
  const scaledHeight = bounds.height * scale;

  const offsetX = padding + (availableWidth - scaledWidth) / 2 - bounds.minX * scale;
  const offsetY = padding + (availableHeight - scaledHeight) / 2 - bounds.minY * scale;

  return { scale, offsetX, offsetY };
}
