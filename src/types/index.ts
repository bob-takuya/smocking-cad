// ============================================================
// Core Geometry Types
// ============================================================

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Mesh3D {
  vertices: Float32Array; // flat [x,y,z, x,y,z, ...]
  faces: Uint32Array;     // flat [a,b,c, a,b,c, ...]
  normals?: Float32Array;
  uvs?: Float32Array;
}

// ============================================================
// Smocking Pattern Types
// ============================================================

export type PatternPreset =
  | 'Arrow'
  | 'WaterBomb'
  | 'Resch4'
  | 'Braid'
  | 'Leaf'
  | 'Box'
  | 'Brick'
  | 'Diamond';

export type PatternSymmetry = 'N2' | 'N3' | 'N4' | 'N6';

export interface SmockingPattern {
  name: PatternPreset;
  symmetry: PatternSymmetry;
  unitCell: {
    vertices: [number, number][];      // 2D coords in unit cell
    underlayEdges: [number, number][]; // edge indices
    stitchingLines: number[][];        // vertex indices per stitch line
    pleatEdges: [number, number][];    // pleat edge indices
    underlayFaces: number[][];         // face vertex indices
    pleatFaces: number[][];            // face vertex indices
  };
  tiling: { uStep: number; vStep: number };
  closedVertices: [number, number, number][]; // 3D coords after full closing (eta=0)
}

// ============================================================
// Tangram / Pattern Instance Types
// ============================================================

export interface TiledVertex {
  id: number;
  x: number;
  y: number;
  type: 'underlay' | 'pleat';
  unitCellIndex: number;
  cellU: number;
  cellV: number;
}

export interface TiledEdge {
  id: number;
  a: number; // vertex id
  b: number; // vertex id
  type: 'underlay' | 'pleat' | 'stitch' | 'seam';
}

export interface TiledFace {
  id: number;
  vertices: number[]; // vertex ids
  type: 'underlay' | 'pleat';
}

export interface TiledPattern {
  pattern: SmockingPattern;
  uRepeat: number;
  vRepeat: number;
  vertices: TiledVertex[];
  edges: TiledEdge[];
  faces: TiledFace[];
  stitchingLines: number[][]; // arrays of vertex ids
}

export interface TangramState {
  eta: number;  // 0 = closed, 1 = open
  vertices2D: [number, number][];  // current 2D positions
  vertices3D?: [number, number, number][]; // 3D positions (after optimization)
  openVertices: [number, number][];
  closedVertices: [number, number][];
}

export interface VertexClassification {
  underlay: Set<number>;
  pleat: Set<number>;
}

export interface FaceClassification {
  underlay: Set<number>;
  pleat: Set<number>;
}

// ============================================================
// Shape Types
// ============================================================

export type ShapePreset =
  | 'Hemisphere'
  | 'Sphere'
  | 'Hyperboloid'
  | 'HyperbolicParaboloid'
  | 'Torus'
  | 'Custom';

export interface ShapeParams {
  radius?: number;
  radius2?: number;
  a?: number;
  c?: number;
  curvature?: number;
  aspectRatio?: number;
  resolution?: number;
}

export type MeshDisplayMode = 'Solid' | 'Wireframe' | 'GaussianCurvature' | 'MeanCurvature';

// ============================================================
// Optimization Types
// ============================================================

export interface OptimizationParams {
  ws: number;  // weight shape energy
  wp: number;  // weight pleat energy
  wc: number;  // weight seam energy
  etaInitial: number;
  maxIterations: number;
  convergenceThreshold: number;
}

export type OptimizationStatus = 'idle' | 'running' | 'converged' | 'failed';

export interface OptimizationResult {
  tiledPattern: TiledPattern;
  tangramState: TangramState;
  Eshape: number;
  Epleat: number;
  Eseam: number;
  iterations: number;
  converged: boolean;
}

// ============================================================
// Singularity Types
// ============================================================

export type SingularityMode = 'auto' | 'manual' | 'none';

export interface Singularity {
  id: string;
  position: Vec3;
  index: number;   // Poincaré-Hopf index (+1 or -1)
  type: 'source' | 'sink' | 'saddle';
}

// ============================================================
// Layout Types
// ============================================================

export type LayoutMode = 'Explore' | 'ShapeFocus' | 'PatternFocus' | 'ResultFocus';
export type InspectorTab = 'Optimization' | 'Singularities' | 'Analysis' | 'Compare';
export type ResultDisplayMode = 'Smocked' | 'Heatmap' | 'PleatQuality' | 'TangramOverlay' | 'Transparent';

// ============================================================
// Export Types
// ============================================================

export interface SVGExportOptions {
  showUnderlay: boolean;
  showPleat: boolean;
  showStitch: boolean;
  showSeams: boolean;
  showSingularities: boolean;
  scale: number;
}

export interface PDFExportOptions {
  paperSize: 'A4' | 'A3' | 'Letter';
  orientation: 'portrait' | 'landscape';
  margin: number;
}

export interface DXFExportOptions {
  units: 'mm' | 'cm' | 'inch';
  version: 'R12' | 'R2000';
}

// ============================================================
// App State (Zustand Store)
// ============================================================

export interface SavedDesign {
  id: string;
  name: string;
  timestamp: number;
  shape: ShapePreset;
  pattern: PatternPreset;
  result?: OptimizationResult;
  thumbnail?: string;
}

export interface AppState {
  // Shape
  selectedShape: ShapePreset;
  shapeParams: ShapeParams;
  targetMesh: Mesh3D | null;
  meshDisplayMode: MeshDisplayMode;

  // Pattern
  selectedPattern: PatternPreset;
  tilingU: number;
  tilingV: number;
  eta: number;
  tiledPattern: TiledPattern | null;
  tangramState: TangramState | null;

  // Optimization
  optimizationParams: OptimizationParams;
  optimizationStatus: OptimizationStatus;
  optimizationResult: OptimizationResult | null;
  optimizationProgress: { iteration: number; Eshape: number; Epleat: number };

  // Result
  resultDisplayMode: ResultDisplayMode;
  showFront: boolean;

  // Singularities
  singularities: Singularity[];
  singularityMode: SingularityMode;

  // Layout
  layoutMode: LayoutMode;
  inspectorOpen: boolean;
  inspectorTab: InspectorTab;
  exportModalOpen: boolean;

  // Compare
  savedDesigns: SavedDesign[];

  // Actions
  setSelectedShape: (shape: ShapePreset) => void;
  setShapeParams: (params: Partial<ShapeParams>) => void;
  setTargetMesh: (mesh: Mesh3D | null) => void;
  setMeshDisplayMode: (mode: MeshDisplayMode) => void;
  setSelectedPattern: (pattern: PatternPreset) => void;
  setTilingU: (u: number) => void;
  setTilingV: (v: number) => void;
  setEta: (eta: number) => void;
  setTiledPattern: (p: TiledPattern | null) => void;
  setTangramState: (s: TangramState | null) => void;
  setOptimizationParams: (params: Partial<OptimizationParams>) => void;
  setOptimizationStatus: (s: OptimizationStatus) => void;
  setOptimizationResult: (r: OptimizationResult | null) => void;
  setOptimizationProgress: (p: { iteration: number; Eshape: number; Epleat: number }) => void;
  setResultDisplayMode: (mode: ResultDisplayMode) => void;
  setShowFront: (v: boolean) => void;
  setSingularityMode: (mode: SingularityMode) => void;
  setSingularities: (s: Singularity[]) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  setInspectorOpen: (open: boolean) => void;
  setInspectorTab: (tab: InspectorTab) => void;
  setExportModalOpen: (open: boolean) => void;
  saveDesign: (name: string) => void;
  removeDesign: (id: string) => void;
}
