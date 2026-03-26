/**
 * Smocking Pattern Definitions
 * Based on "Fabric Tessellation: Realizing Freeform Surfaces by Smocking" (Segall et al., SIGGRAPH 2024)
 *
 * Pattern definitions from official source code at github.com/segaviv/SmockingTessellations
 *
 * Each pattern is defined by:
 * - nx, ny: grid dimensions
 * - stitchingLines: array of (x,y) coordinate sequences that get stitched together
 */

import type { SmockingPatternDef, PatternPreset } from '../types';

/**
 * ARROW pattern
 * 5x3 grid, stitching lines: [{(0,2),(1,1),(2,2)}, {(2,1),(3,0),(4,1)}]
 */
const ArrowPattern: SmockingPatternDef = {
  name: 'Arrow',
  nx: 5,
  ny: 3,
  stitchingLines: [
    [[0, 2], [1, 1], [2, 2]],
    [[2, 1], [3, 0], [4, 1]],
  ],
};

/**
 * LEAF pattern
 * 7x3 grid, stitching lines: [{(0,1),(1,0)}, {(1,1),(2,2)}, {(3,0),(4,1)}, {(4,2),(5,1)}]
 */
const LeafPattern: SmockingPatternDef = {
  name: 'Leaf',
  nx: 7,
  ny: 3,
  stitchingLines: [
    [[0, 1], [1, 0]],
    [[1, 1], [2, 2]],
    [[3, 0], [4, 1]],
    [[4, 2], [5, 1]],
  ],
};

/**
 * BRAID pattern
 * 4x3 grid, stitching lines: [{(0,1),(1,2)}, {(1,1),(2,0)}]
 */
const BraidPattern: SmockingPatternDef = {
  name: 'Braid',
  nx: 4,
  ny: 3,
  stitchingLines: [
    [[0, 1], [1, 2]],
    [[1, 1], [2, 0]],
  ],
};

/**
 * BOX pattern
 * 5x7 grid with 8 stitching lines
 */
const BoxPattern: SmockingPatternDef = {
  name: 'Box',
  nx: 5,
  ny: 7,
  stitchingLines: [
    [[1, 1], [0, 2]],
    [[1, 2], [0, 3]],
    [[2, 1], [3, 2]],
    [[2, 2], [3, 3]],
    [[0, 4], [1, 5]],
    [[0, 5], [1, 6]],
    [[3, 4], [2, 5]],
    [[3, 5], [2, 6]],
  ],
};

/**
 * BRICK pattern
 * 5x5 grid with 4 stitching lines
 */
const BrickPattern: SmockingPatternDef = {
  name: 'Brick',
  nx: 5,
  ny: 5,
  stitchingLines: [
    [[0, 0], [1, 1], [0, 2]],
    [[1, 2], [0, 3], [1, 4]],
    [[3, 0], [2, 1], [3, 2]],
    [[2, 2], [3, 3], [2, 4]],
  ],
};

/**
 * TWISTED_SQUARE pattern
 * 4x4 grid, stitching lines: [{(0,1),(1,1)},{(2,1),(2,2)},{(0,2),(0,3)},{(1,3),(2,3)}]
 */
const TwistedSquarePattern: SmockingPatternDef = {
  name: 'TwistedSquare',
  nx: 4,
  ny: 4,
  stitchingLines: [
    [[0, 1], [1, 1]],
    [[2, 1], [2, 2]],
    [[0, 2], [0, 3]],
    [[1, 3], [2, 3]],
  ],
};

/**
 * HEART pattern (additional pattern)
 * 7x3 grid, similar to Leaf but with different stitch arrangement
 */
const HeartPattern: SmockingPatternDef = {
  name: 'Heart',
  nx: 7,
  ny: 3,
  stitchingLines: [
    [[0, 1], [1, 0]],
    [[1, 1], [2, 2]],
    [[3, 2], [4, 1]],
    [[4, 0], [5, 1]],
  ],
};

/**
 * Pattern library - all available patterns
 */
export const PATTERNS: Record<PatternPreset, SmockingPatternDef> = {
  Arrow: ArrowPattern,
  Leaf: LeafPattern,
  Braid: BraidPattern,
  Box: BoxPattern,
  Brick: BrickPattern,
  TwistedSquare: TwistedSquarePattern,
  Heart: HeartPattern,
};

/**
 * Get pattern by name
 */
export function getPattern(name: PatternPreset): SmockingPatternDef {
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
  Arrow: { description: 'V-shape stitches creating arrow-like pleats', complexity: 'simple' },
  Leaf: { description: 'Diagonal stitches forming leaf-like patterns', complexity: 'medium' },
  Braid: { description: 'Crossed diagonal stitches creating braided effect', complexity: 'simple' },
  Box: { description: 'Square grid with box pleat formations', complexity: 'complex' },
  Brick: { description: 'Offset V-stitches in brick arrangement', complexity: 'medium' },
  TwistedSquare: { description: 'Stitches forming twisted square rotations', complexity: 'medium' },
  Heart: { description: 'Heart-shaped pleat formations', complexity: 'medium' },
};
