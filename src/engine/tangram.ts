/**
 * Tangram Computation Module
 * Handles pattern tiling and eta-based interpolation between open/closed states
 */

import type {
  SmockingPattern,
  TiledPattern,
  TiledVertex,
  TiledEdge,
  TiledFace,
  TangramState,
  VertexClassification,
  FaceClassification,
} from '../types';

/**
 * Generate a tiled pattern from a base smocking pattern
 */
export function generateTiledPattern(
  pattern: SmockingPattern,
  uRepeat: number,
  vRepeat: number
): TiledPattern {
  const vertices: TiledVertex[] = [];
  const edges: TiledEdge[] = [];
  const faces: TiledFace[] = [];
  const stitchingLines: number[][] = [];

  const { unitCell, tiling } = pattern;
  const vertexMap = new Map<string, number>(); // "cellU,cellV,localIdx" -> global vertex id

  // Helper to get or create vertex
  const getVertexId = (cellU: number, cellV: number, localIdx: number): number => {
    const key = `${cellU},${cellV},${localIdx}`;
    if (vertexMap.has(key)) {
      return vertexMap.get(key)!;
    }

    const [localX, localY] = unitCell.vertices[localIdx];
    const globalX = cellU * tiling.uStep + localX;
    const globalY = cellV * tiling.vStep + localY;

    const id = vertices.length;
    vertices.push({
      id,
      x: globalX,
      y: globalY,
      type: 'underlay', // Will be classified later
      unitCellIndex: localIdx,
      cellU,
      cellV,
    });
    vertexMap.set(key, id);
    return id;
  };

  // Generate all vertices and edges for each unit cell
  const edgeSet = new Set<string>();

  for (let v = 0; v < vRepeat; v++) {
    for (let u = 0; u < uRepeat; u++) {
      // Create vertices for this cell
      for (let i = 0; i < unitCell.vertices.length; i++) {
        getVertexId(u, v, i);
      }

      // Create underlay edges
      for (const [a, b] of unitCell.underlayEdges) {
        const va = getVertexId(u, v, a);
        const vb = getVertexId(u, v, b);
        const edgeKey = `${Math.min(va, vb)},${Math.max(va, vb)}`;
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          edges.push({
            id: edges.length,
            a: va,
            b: vb,
            type: 'underlay',
          });
        }
      }

      // Create pleat edges
      for (const [a, b] of unitCell.pleatEdges) {
        const va = getVertexId(u, v, a);
        const vb = getVertexId(u, v, b);
        const edgeKey = `${Math.min(va, vb)},${Math.max(va, vb)}`;
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          edges.push({
            id: edges.length,
            a: va,
            b: vb,
            type: 'pleat',
          });
          // Mark connected vertices as pleat
          vertices[va].type = 'pleat';
          vertices[vb].type = 'pleat';
        }
      }

      // Create stitching lines
      for (const line of unitCell.stitchingLines) {
        const globalLine = line.map(idx => getVertexId(u, v, idx));
        stitchingLines.push(globalLine);

        // Create stitch edges
        for (let i = 0; i < globalLine.length - 1; i++) {
          const va = globalLine[i];
          const vb = globalLine[i + 1];
          const edgeKey = `${Math.min(va, vb)},${Math.max(va, vb)}`;
          if (!edgeSet.has(edgeKey)) {
            edgeSet.add(edgeKey);
            edges.push({
              id: edges.length,
              a: va,
              b: vb,
              type: 'stitch',
            });
          }
        }
      }

      // Create underlay faces
      for (const faceVerts of unitCell.underlayFaces) {
        const globalVerts = faceVerts.map(idx => getVertexId(u, v, idx));
        faces.push({
          id: faces.length,
          vertices: globalVerts,
          type: 'underlay',
        });
      }

      // Create pleat faces
      for (const faceVerts of unitCell.pleatFaces) {
        const globalVerts = faceVerts.map(idx => getVertexId(u, v, idx));
        faces.push({
          id: faces.length,
          vertices: globalVerts,
          type: 'pleat',
        });
      }
    }
  }

  // Add seam edges at boundaries (connecting adjacent unit cells)
  for (let v = 0; v < vRepeat; v++) {
    for (let u = 0; u < uRepeat - 1; u++) {
      // Connect right edge of (u,v) to left edge of (u+1,v)
      // This depends on the pattern structure
    }
  }

  return {
    pattern,
    uRepeat,
    vRepeat,
    vertices,
    edges,
    faces,
    stitchingLines,
  };
}

/**
 * Compute tangram state for a given eta value
 * eta = 0: fully closed (vertices along stitch lines merge)
 * eta = 1: fully open (flat 2D pattern)
 */
export function computeTangramForEta(
  tiledPattern: TiledPattern,
  eta: number
): TangramState {
  const { vertices } = tiledPattern;
  const numVerts = vertices.length;

  // Open positions (eta = 1): original 2D positions
  const openVertices: [number, number][] = vertices.map(v => [v.x, v.y]);

  // Closed positions (eta = 0): computed from pattern's closed configuration
  const closedVertices: [number, number][] = computeClosedPositions(tiledPattern);

  // Interpolate between open and closed
  const vertices2D: [number, number][] = new Array(numVerts);
  for (let i = 0; i < numVerts; i++) {
    const [ox, oy] = openVertices[i];
    const [cx, cy] = closedVertices[i];
    vertices2D[i] = [
      ox * eta + cx * (1 - eta),
      oy * eta + cy * (1 - eta),
    ];
  }

  return {
    eta,
    vertices2D,
    openVertices,
    closedVertices,
  };
}

/**
 * Compute closed positions for all vertices
 * In the closed state, vertices along stitching lines merge together
 */
function computeClosedPositions(tiledPattern: TiledPattern): [number, number][] {
  const { vertices, stitchingLines } = tiledPattern;
  const numVerts = vertices.length;
  const closedPos: [number, number][] = new Array(numVerts);

  // Start with original positions
  for (let i = 0; i < numVerts; i++) {
    closedPos[i] = [vertices[i].x, vertices[i].y];
  }

  // For each stitching line, move vertices toward the center point
  for (const line of stitchingLines) {
    if (line.length < 2) continue;

    // Calculate center of the stitching line
    let centerX = 0;
    let centerY = 0;
    for (const vidx of line) {
      centerX += vertices[vidx].x;
      centerY += vertices[vidx].y;
    }
    centerX /= line.length;
    centerY /= line.length;

    // Move all vertices on this stitch line toward center
    // In full closed state (eta=0), they should merge
    for (const vidx of line) {
      // Move 80% of the way to center for closed position
      // (not fully merged to maintain visual clarity)
      const [ox, oy] = [vertices[vidx].x, vertices[vidx].y];
      closedPos[vidx] = [
        ox * 0.2 + centerX * 0.8,
        oy * 0.2 + centerY * 0.8,
      ];
    }
  }

  return closedPos;
}

/**
 * Classify vertices as underlay or pleat
 */
export function classifyVertices(tiledPattern: TiledPattern): VertexClassification {
  const underlay = new Set<number>();
  const pleat = new Set<number>();

  for (const vertex of tiledPattern.vertices) {
    if (vertex.type === 'pleat') {
      pleat.add(vertex.id);
    } else {
      underlay.add(vertex.id);
    }
  }

  return { underlay, pleat };
}

/**
 * Classify faces as underlay or pleat
 */
export function classifyFaces(tiledPattern: TiledPattern): FaceClassification {
  const underlay = new Set<number>();
  const pleat = new Set<number>();

  for (const face of tiledPattern.faces) {
    if (face.type === 'pleat') {
      pleat.add(face.id);
    } else {
      underlay.add(face.id);
    }
  }

  return { underlay, pleat };
}

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
