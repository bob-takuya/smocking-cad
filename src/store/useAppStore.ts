/**
 * Zustand Store for SmockingCAD Application State
 */

import { create } from 'zustand';
import type {
  AppState,
  ShapePreset,
  ShapeParams,
  PatternPreset,
  Mesh3D,
  MeshDisplayMode,
  TiledPattern,
  TangramState,
  OptimizationParams,
  OptimizationStatus,
  OptimizationResult,
  ResultDisplayMode,
  SingularityMode,
  Singularity,
  LayoutMode,
  InspectorTab,
  SavedDesign,
} from '../types';
import { getDefaultShapeParams, generateMesh } from '../engine/shapes';
import { getPattern, PATTERNS } from '../engine/patterns';
import { generateTiledPattern, computeTangramForEta } from '../engine/tangram';
import { getDefaultOptimizationParams } from '../engine/optimization';

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create the application store
 */
export const useAppStore = create<AppState>((set, get) => {
  // Initialize with default values
  const defaultShape: ShapePreset = 'Hemisphere';
  const defaultShapeParams = getDefaultShapeParams(defaultShape);
  const defaultPattern: PatternPreset = 'Arrow';
  const defaultTilingU = 4;
  const defaultTilingV = 4;

  // Generate initial mesh
  const initialMesh = generateMesh(defaultShape, defaultShapeParams);

  // Generate initial pattern
  const patternDef = getPattern(defaultPattern);
  const initialTiledPattern = generateTiledPattern(patternDef, defaultTilingU, defaultTilingV);
  const initialTangram = computeTangramForEta(initialTiledPattern, 1);

  return {
    // Shape state
    selectedShape: defaultShape,
    shapeParams: defaultShapeParams,
    targetMesh: initialMesh,
    meshDisplayMode: 'Solid',

    // Pattern state
    selectedPattern: defaultPattern,
    tilingU: defaultTilingU,
    tilingV: defaultTilingV,
    eta: 1,
    tiledPattern: initialTiledPattern,
    tangramState: initialTangram,

    // Optimization state
    optimizationParams: getDefaultOptimizationParams(),
    optimizationStatus: 'idle',
    optimizationResult: null,
    optimizationProgress: { iteration: 0, Eshape: 0, Epleat: 0 },

    // Result state
    resultDisplayMode: 'Smocked',
    showFront: true,

    // Singularities state
    singularities: [],
    singularityMode: 'auto',

    // Layout state
    layoutMode: 'Explore',
    inspectorOpen: true,
    inspectorTab: 'Optimization',
    exportModalOpen: false,

    // Compare state
    savedDesigns: [],

    // Actions
    setSelectedShape: (shape: ShapePreset) => {
      const params = getDefaultShapeParams(shape);
      const mesh = generateMesh(shape, params);
      set({
        selectedShape: shape,
        shapeParams: params,
        targetMesh: mesh,
      });
    },

    setShapeParams: (params: Partial<ShapeParams>) => {
      const currentParams = get().shapeParams;
      const newParams = { ...currentParams, ...params };
      const mesh = generateMesh(get().selectedShape, newParams);
      set({
        shapeParams: newParams,
        targetMesh: mesh,
      });
    },

    setTargetMesh: (mesh: Mesh3D | null) => {
      set({ targetMesh: mesh });
    },

    setMeshDisplayMode: (mode: MeshDisplayMode) => {
      set({ meshDisplayMode: mode });
    },

    setSelectedPattern: (pattern: PatternPreset) => {
      const patternDef = PATTERNS[pattern];
      const tiledPattern = generateTiledPattern(patternDef, get().tilingU, get().tilingV);
      const tangram = computeTangramForEta(tiledPattern, get().eta);
      set({
        selectedPattern: pattern,
        tiledPattern,
        tangramState: tangram,
      });
    },

    setTilingU: (u: number) => {
      const patternDef = PATTERNS[get().selectedPattern];
      const tiledPattern = generateTiledPattern(patternDef, u, get().tilingV);
      const tangram = computeTangramForEta(tiledPattern, get().eta);
      set({
        tilingU: u,
        tiledPattern,
        tangramState: tangram,
      });
    },

    setTilingV: (v: number) => {
      const patternDef = PATTERNS[get().selectedPattern];
      const tiledPattern = generateTiledPattern(patternDef, get().tilingU, v);
      const tangram = computeTangramForEta(tiledPattern, get().eta);
      set({
        tilingV: v,
        tiledPattern,
        tangramState: tangram,
      });
    },

    setEta: (eta: number) => {
      const tiledPattern = get().tiledPattern;
      if (tiledPattern) {
        const tangram = computeTangramForEta(tiledPattern, eta);
        set({ eta, tangramState: tangram });
      } else {
        set({ eta });
      }
    },

    setTiledPattern: (p: TiledPattern | null) => {
      set({ tiledPattern: p });
    },

    setTangramState: (s: TangramState | null) => {
      set({ tangramState: s });
    },

    setOptimizationParams: (params: Partial<OptimizationParams>) => {
      const currentParams = get().optimizationParams;
      set({ optimizationParams: { ...currentParams, ...params } });
    },

    setOptimizationStatus: (status: OptimizationStatus) => {
      set({ optimizationStatus: status });
    },

    setOptimizationResult: (result: OptimizationResult | null) => {
      set({ optimizationResult: result });
    },

    setOptimizationProgress: (progress: { iteration: number; Eshape: number; Epleat: number }) => {
      set({ optimizationProgress: progress });
    },

    setResultDisplayMode: (mode: ResultDisplayMode) => {
      set({ resultDisplayMode: mode });
    },

    setShowFront: (v: boolean) => {
      set({ showFront: v });
    },

    setSingularityMode: (mode: SingularityMode) => {
      set({ singularityMode: mode });
    },

    setSingularities: (singularities: Singularity[]) => {
      set({ singularities });
    },

    setLayoutMode: (mode: LayoutMode) => {
      set({ layoutMode: mode });
    },

    setInspectorOpen: (open: boolean) => {
      set({ inspectorOpen: open });
    },

    setInspectorTab: (tab: InspectorTab) => {
      set({ inspectorTab: tab });
    },

    setExportModalOpen: (open: boolean) => {
      set({ exportModalOpen: open });
    },

    saveDesign: (name: string) => {
      const state = get();
      const design: SavedDesign = {
        id: generateId(),
        name,
        timestamp: Date.now(),
        shape: state.selectedShape,
        pattern: state.selectedPattern,
        result: state.optimizationResult ?? undefined,
      };
      set({ savedDesigns: [...state.savedDesigns, design] });
    },

    removeDesign: (id: string) => {
      const designs = get().savedDesigns.filter(d => d.id !== id);
      set({ savedDesigns: designs });
    },
  };
});
