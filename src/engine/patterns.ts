/**
 * Smocking Pattern Definitions
 * Based on "Fabric Tessellation: Realizing Freeform Surfaces by Smocking" (Segall et al., ACM TOG 2024)
 */

import type { SmockingPattern, PatternPreset } from '../types';

/**
 * Arrow pattern (N=2 symmetry)
 * Unit cell: 3x2 grid forming V-shape stitching
 * The pleats fold together in arrow-like formations
 */
const ArrowPattern: SmockingPattern = {
  name: 'Arrow',
  symmetry: 'N2',
  unitCell: {
    // 6 vertices in a 3x2 arrangement (indices 0-5)
    // Row 0: v0, v1, v2
    // Row 1: v3, v4, v5
    vertices: [
      [0, 0], [1, 0], [2, 0],      // top row
      [0, 1], [1, 1], [2, 1],      // bottom row
    ],
    // Underlay edges form the grid structure
    underlayEdges: [
      [0, 1], [1, 2],  // horizontal top
      [3, 4], [4, 5],  // horizontal bottom
      [0, 3], [2, 5],  // vertical edges
    ],
    // Stitching lines: V-shape connects to center vertex
    // When closed, vertices along each stitch line merge
    stitchingLines: [
      [0, 4, 2],  // V-shape: top-left to center to top-right
    ],
    // Pleat edges connect stitch points
    pleatEdges: [
      [1, 4],  // center vertical pleat
    ],
    // Underlay faces (triangles/quads that remain flat)
    underlayFaces: [
      [0, 1, 4, 3],  // left quad
      [1, 2, 5, 4],  // right quad
    ],
    // Pleat faces (faces that fold/collapse)
    pleatFaces: [],
  },
  tiling: { uStep: 2, vStep: 1 },
  closedVertices: [
    [0, 0, 0], [1, 0, 0], [2, 0, 0],
    [0, 0.5, 0], [1, 0.5, 0], [2, 0.5, 0],
  ],
};

/**
 * WaterBomb pattern (N=4 symmetry)
 * Classic origami water bomb base adapted for smocking
 * 4-fold rotational symmetry with radial stitching
 */
const WaterBombPattern: SmockingPattern = {
  name: 'WaterBomb',
  symmetry: 'N4',
  unitCell: {
    // 9 vertices in a 3x3 grid with center point
    vertices: [
      [0, 0], [1, 0], [2, 0],      // row 0
      [0, 1], [1, 1], [2, 1],      // row 1 (center is v4)
      [0, 2], [1, 2], [2, 2],      // row 2
    ],
    underlayEdges: [
      // Outer square edges
      [0, 1], [1, 2],
      [2, 5], [5, 8],
      [8, 7], [7, 6],
      [6, 3], [3, 0],
    ],
    // 4 radial stitching lines from center
    stitchingLines: [
      [1, 4, 7],  // vertical through center
      [3, 4, 5],  // horizontal through center
    ],
    pleatEdges: [
      [0, 4], [2, 4], [6, 4], [8, 4],  // diagonal pleats to center
    ],
    underlayFaces: [
      [0, 1, 4],
      [1, 2, 4],
      [2, 5, 4],
      [5, 8, 4],
      [8, 7, 4],
      [7, 6, 4],
      [6, 3, 4],
      [3, 0, 4],
    ],
    pleatFaces: [],
  },
  tiling: { uStep: 2, vStep: 2 },
  closedVertices: [
    [0, 0, 0], [1, 0, 0.2], [2, 0, 0],
    [0, 1, 0.2], [1, 1, 0.4], [2, 1, 0.2],
    [0, 2, 0], [1, 2, 0.2], [2, 2, 0],
  ],
};

/**
 * Resch-4 pattern (N=4 symmetry)
 * Based on Ron Resch's tessellation with 4-fold rotational symmetry
 */
const Resch4Pattern: SmockingPattern = {
  name: 'Resch4',
  symmetry: 'N4',
  unitCell: {
    // Square unit with triangular subdivisions
    vertices: [
      [0, 0], [0.5, 0], [1, 0],          // row 0
      [0, 0.5], [0.5, 0.5], [1, 0.5],    // row 1
      [0, 1], [0.5, 1], [1, 1],          // row 2
    ],
    underlayEdges: [
      [0, 1], [1, 2],
      [3, 4], [4, 5],
      [6, 7], [7, 8],
      [0, 3], [3, 6],
      [2, 5], [5, 8],
    ],
    stitchingLines: [
      [1, 4, 7],  // vertical center
      [3, 4, 5],  // horizontal center
    ],
    pleatEdges: [
      [0, 4], [2, 4], [6, 4], [8, 4],
    ],
    underlayFaces: [
      [0, 1, 4, 3],
      [1, 2, 5, 4],
      [3, 4, 7, 6],
      [4, 5, 8, 7],
    ],
    pleatFaces: [],
  },
  tiling: { uStep: 1, vStep: 1 },
  closedVertices: [
    [0, 0, 0], [0.5, 0, 0.1], [1, 0, 0],
    [0, 0.5, 0.1], [0.5, 0.5, 0.2], [1, 0.5, 0.1],
    [0, 1, 0], [0.5, 1, 0.1], [1, 1, 0],
  ],
};

/**
 * Braid pattern (N=2 symmetry)
 * Hexagonal mixed tiling creating braided appearance
 */
const BraidPattern: SmockingPattern = {
  name: 'Braid',
  symmetry: 'N2',
  unitCell: {
    // Hexagonal arrangement
    vertices: [
      [0.5, 0],         // 0: top
      [0, 0.5],         // 1: upper left
      [1, 0.5],         // 2: upper right
      [0.5, 1],         // 3: center
      [0, 1.5],         // 4: lower left
      [1, 1.5],         // 5: lower right
      [0.5, 2],         // 6: bottom
    ],
    underlayEdges: [
      [0, 1], [0, 2],
      [1, 3], [2, 3],
      [3, 4], [3, 5],
      [4, 6], [5, 6],
    ],
    stitchingLines: [
      [0, 3, 6],  // vertical braid
    ],
    pleatEdges: [
      [1, 2], [4, 5],
    ],
    underlayFaces: [
      [0, 1, 3, 2],
      [3, 4, 6, 5],
    ],
    pleatFaces: [],
  },
  tiling: { uStep: 1, vStep: 2 },
  closedVertices: [
    [0.5, 0, 0],
    [0, 0.5, 0],
    [1, 0.5, 0],
    [0.5, 0.7, 0.3],
    [0, 1.5, 0],
    [1, 1.5, 0],
    [0.5, 2, 0],
  ],
};

/**
 * Leaf pattern (N=2 symmetry)
 * Hexagonal tiling with leaf-like pleat shapes
 */
const LeafPattern: SmockingPattern = {
  name: 'Leaf',
  symmetry: 'N2',
  unitCell: {
    vertices: [
      [0, 0], [1, 0], [2, 0],            // row 0
      [0.5, 0.866], [1.5, 0.866],        // row 1 (hex offset)
      [0, 1.732], [1, 1.732], [2, 1.732], // row 2
    ],
    underlayEdges: [
      [0, 1], [1, 2],
      [0, 3], [1, 3], [1, 4], [2, 4],
      [3, 5], [3, 6], [4, 6], [4, 7],
      [5, 6], [6, 7],
    ],
    stitchingLines: [
      [0, 3, 6],
      [2, 4, 6],
    ],
    pleatEdges: [
      [1, 6],
    ],
    underlayFaces: [
      [0, 1, 3],
      [1, 2, 4],
      [1, 4, 6, 3],
      [3, 6, 5],
      [4, 7, 6],
    ],
    pleatFaces: [],
  },
  tiling: { uStep: 2, vStep: 1.732 },
  closedVertices: [
    [0, 0, 0], [1, 0, 0], [2, 0, 0],
    [0.5, 0.6, 0.2], [1.5, 0.6, 0.2],
    [0, 1.732, 0], [1, 1.2, 0.3], [2, 1.732, 0],
  ],
};

/**
 * Box pattern (N=2 symmetry)
 * Square grid with box-like pleat formations
 */
const BoxPattern: SmockingPattern = {
  name: 'Box',
  symmetry: 'N2',
  unitCell: {
    vertices: [
      [0, 0], [1, 0], [2, 0], [3, 0],    // row 0
      [0, 1], [1, 1], [2, 1], [3, 1],    // row 1
      [0, 2], [1, 2], [2, 2], [3, 2],    // row 2
    ],
    underlayEdges: [
      // Horizontal
      [0, 1], [1, 2], [2, 3],
      [4, 5], [5, 6], [6, 7],
      [8, 9], [9, 10], [10, 11],
      // Vertical
      [0, 4], [4, 8],
      [3, 7], [7, 11],
    ],
    stitchingLines: [
      [1, 5, 9],   // left vertical
      [2, 6, 10],  // right vertical
    ],
    pleatEdges: [
      [1, 2], [5, 6], [9, 10],
    ],
    underlayFaces: [
      [0, 1, 5, 4],
      [2, 3, 7, 6],
      [4, 5, 9, 8],
      [6, 7, 11, 10],
    ],
    pleatFaces: [
      [1, 2, 6, 5],
      [5, 6, 10, 9],
    ],
  },
  tiling: { uStep: 3, vStep: 2 },
  closedVertices: [
    [0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0],
    [0, 1, 0], [1.2, 1, 0.2], [1.8, 1, 0.2], [3, 1, 0],
    [0, 2, 0], [1, 2, 0], [2, 2, 0], [3, 2, 0],
  ],
};

/**
 * Brick pattern (N=2 symmetry)
 * Diamond/brick tiling arrangement
 */
const BrickPattern: SmockingPattern = {
  name: 'Brick',
  symmetry: 'N2',
  unitCell: {
    vertices: [
      [1, 0],              // 0: top
      [0, 1], [2, 1],      // 1, 2: middle row
      [1, 2],              // 3: center
      [0, 3], [2, 3],      // 4, 5: lower row
      [1, 4],              // 6: bottom
    ],
    underlayEdges: [
      [0, 1], [0, 2],
      [1, 3], [2, 3],
      [3, 4], [3, 5],
      [4, 6], [5, 6],
    ],
    stitchingLines: [
      [0, 3, 6],
    ],
    pleatEdges: [
      [1, 2], [4, 5],
    ],
    underlayFaces: [
      [0, 2, 3, 1],
      [3, 5, 6, 4],
    ],
    pleatFaces: [],
  },
  tiling: { uStep: 2, vStep: 4 },
  closedVertices: [
    [1, 0, 0],
    [0, 1, 0], [2, 1, 0],
    [1, 1.5, 0.3],
    [0, 3, 0], [2, 3, 0],
    [1, 4, 0],
  ],
};

/**
 * Diamond pattern (N=2 symmetry)
 * Diamond/rhombus tiling with diagonal pleats
 */
const DiamondPattern: SmockingPattern = {
  name: 'Diamond',
  symmetry: 'N2',
  unitCell: {
    vertices: [
      [0.5, 0],            // 0
      [0, 0.5], [1, 0.5],  // 1, 2
      [0.5, 1],            // 3
      [0, 1.5], [1, 1.5],  // 4, 5
      [0.5, 2],            // 6
    ],
    underlayEdges: [
      [0, 1], [0, 2],
      [1, 3], [2, 3],
      [3, 4], [3, 5],
      [4, 6], [5, 6],
    ],
    stitchingLines: [
      [1, 3, 5],
      [2, 3, 4],
    ],
    pleatEdges: [
      [0, 3], [3, 6],
    ],
    underlayFaces: [
      [0, 2, 3, 1],
      [3, 5, 6, 4],
    ],
    pleatFaces: [],
  },
  tiling: { uStep: 1, vStep: 2 },
  closedVertices: [
    [0.5, 0, 0],
    [0, 0.5, 0], [1, 0.5, 0],
    [0.5, 0.8, 0.2],
    [0, 1.5, 0], [1, 1.5, 0],
    [0.5, 2, 0],
  ],
};

/**
 * Pattern library - all available patterns
 */
export const PATTERNS: Record<PatternPreset, SmockingPattern> = {
  Arrow: ArrowPattern,
  WaterBomb: WaterBombPattern,
  Resch4: Resch4Pattern,
  Braid: BraidPattern,
  Leaf: LeafPattern,
  Box: BoxPattern,
  Brick: BrickPattern,
  Diamond: DiamondPattern,
};

/**
 * Get pattern by name
 */
export function getPattern(name: PatternPreset): SmockingPattern {
  return PATTERNS[name];
}

/**
 * Get all pattern names
 */
export function getPatternNames(): PatternPreset[] {
  return Object.keys(PATTERNS) as PatternPreset[];
}

/**
 * Pattern metadata for UI display
 */
export const PATTERN_INFO: Record<PatternPreset, { description: string; complexity: 'simple' | 'medium' | 'complex' }> = {
  Arrow: { description: 'Classic V-shape pleats with N=2 symmetry', complexity: 'simple' },
  WaterBomb: { description: 'Origami-inspired 4-fold symmetric pattern', complexity: 'medium' },
  Resch4: { description: 'Ron Resch tessellation with square base', complexity: 'medium' },
  Braid: { description: 'Hexagonal arrangement creating braided effect', complexity: 'simple' },
  Leaf: { description: 'Organic leaf-like pleat formations', complexity: 'medium' },
  Box: { description: 'Square grid with box pleat structure', complexity: 'simple' },
  Brick: { description: 'Diamond/brick offset pattern', complexity: 'simple' },
  Diamond: { description: 'Rhombus tiling with diagonal pleats', complexity: 'simple' },
};
