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
// Smocking Pattern Types (based on paper)
// ============================================================

// Pattern presets from the paper
export type PatternPreset =
  | 'Arrow'
  | 'Leaf'
  | 'Braid'
  | 'Box'
  | 'Brick'
  | 'TwistedSquare'
  | 'Heart';

// Pattern definition: just grid dimensions + stitching lines
export interface SmockingPatternDef {
  name: PatternPreset;
  nx: number;  // grid width (columns)
  ny: number;  // grid height (rows)
  stitchingLines: Array<Array<[number, number]>>;  // list of (x,y) coordinate sequences
}

// ============================================================
// Tangram Data Types
// ============================================================

// Mean Value Coordinates for a pleat vertex
export interface PleatMVC {
  pleatIndex: number;  // index of the pleat vertex
  neighbors: Array<{ index: number; weight: number }>;  // underlay neighbors with MVC weights
}

// Tangram: the computed structure from a pattern
export interface TangramData {
  nx: number;
  ny: number;
  vertices: Float64Array;       // flat [x0,y0, x1,y1, ...] for nx*ny vertices
  coordToSL: Int32Array;        // flat [nx*ny], -1 if pleat, >= 0 if underlay (stitch line index)
  underlayEdges: Uint32Array;   // pairs [a, b, a, b, ...]
  stitchingEdges: Uint32Array;  // pairs [a, b, a, b, ...]
  faces: Uint32Array;           // triangles [a, b, c, ...]
  faceClass: Uint8Array;        // 0=pleat, 1=underlay per triangle
  pleatIndices: Uint32Array;    // indices of pleat vertices
  underlayIndices: Uint32Array; // indices of underlay vertices
  pleatMVC: PleatMVC[];         // mean value coords for each pleat vertex
  originalLengths: Float64Array; // original edge lengths for optimization
}

// State of the tangram at a particular gary value
export interface TangramState {
  gary: number;  // 0 = closed, 1 = open (called eta in paper, gary in code)
  vertices2D: Float64Array;  // current 2D positions [x0,y0, x1,y1, ...]
  vertices3D?: Float32Array; // 3D positions (after folding)
}

// Legacy types for backward compatibility with UI
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
  a: number;
  b: number;
  type: 'underlay' | 'pleat' | 'stitch' | 'seam';
}

export interface TiledFace {
  id: number;
  vertices: number[];
  type: 'underlay' | 'pleat';
}

// TiledPattern: UI-friendly representation of a tangram
export interface TiledPattern {
  pattern: SmockingPatternDef;
  uRepeat: number;
  vRepeat: number;
  vertices: TiledVertex[];
  edges: TiledEdge[];
  faces: TiledFace[];
  stitchingLines: number[][];
  tangram: TangramData;  // the underlying tangram data
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
  index: number;   // Poincare-Hopf index (+1 or -1)
  type: 'source' | 'sink' | 'saddle';
}

// ============================================================
// Layout Types
// ============================================================

export type LayoutMode = 'Explore' | 'ShapeFocus' | 'PatternFocus' | 'ResultFocus';
export type InspectorTab = 'Optimization' | 'Singularities' | 'Analysis' | 'Compare';
export type ResultDisplayMode = 'Smocked' | 'Heatmap' | 'PleatQuality' | 'TangramOverlay' | 'Transparent';
export type ActiveTab = 'Pattern' | 'Result';

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

// Custom pattern: grid coords [x, y] for each point in a stitch line
export type StitchLine = Array<[number, number]>;
export type GridType = 'square' | 'triangle';
export type PatternSource = 'preset' | 'custom';

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
  gary: number;  // 0 = closed, 1 = open
  tiledPattern: TiledPattern | null;
  tangramState: TangramState | null;

  // Custom pattern editor
  patternSource: PatternSource;          // 'preset' | 'custom'
  customStitchLines: StitchLine[];       // user-drawn stitch lines (grid coords)
  patternGridNx: number;                 // editor grid columns (default 9)
  patternGridNy: number;                 // editor grid rows (default 7)
  gridType: GridType;                    // 'square' | 'triangle'
  exportTrigger: number;                 // increment to trigger OBJ export

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
  activeTab: ActiveTab;
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
  setGary: (gary: number) => void;
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
  setActiveTab: (tab: ActiveTab) => void;
  setInspectorOpen: (open: boolean) => void;
  setInspectorTab: (tab: InspectorTab) => void;
  setExportModalOpen: (open: boolean) => void;
  saveDesign: (name: string) => void;
  removeDesign: (id: string) => void;
  // Custom pattern editor
  setPatternSource: (s: PatternSource) => void;
  setCustomStitchLines: (lines: StitchLine[]) => void;
  setPatternGrid: (nx: number, ny: number) => void;
  setGridType: (t: GridType) => void;
  triggerExport: () => void;
}
