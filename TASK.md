# SmockingCAD — Build Task

## Goal
Build SmockingCAD: a browser-based interactive inverse-design CAD tool for fabric tessellation by smocking, based on:
- Paper: "Fabric Tessellation: Realizing Freeform Surfaces by Smocking" (Segall et al., ACM TOG 2024)
- Full spec: SPEC.md in this directory

## Tech Stack
- React 18 + TypeScript + Vite
- Three.js (3D viewers)
- D3.js + SVG (2D Tangram panel)
- Zustand (state management)
- jsPDF + dxf-writer (export)
- math.js (matrix ops)
- Tailwind CSS (styling - dark theme)

## Implementation Plan

### Phase 1 — Core Viewer MVP (IMPLEMENT THIS FULLY)

1. **Project Setup**
   - `npm create vite@latest . -- --template react-ts`
   - Install: three, @types/three, d3, zustand, mathjs, jspdf, tailwindcss
   - Configure Tailwind with dark theme

2. **Layout** (src/components/Layout/)
   - HeaderBar with File/Edit/View/Export menus
   - 3-panel layout: ShapePanel (left, 50%) | TangramPanel (center, 25%) | ResultPanel (right, 25%)
   - InspectorPanel (bottom, collapsible) with 4 tabs
   - Layout mode switcher: Explore / Shape Focus / Pattern Focus / Result Focus

3. **ShapePanel** (src/components/ShapePanel/)
   - Three.js canvas with OrbitControls
   - Preset shape selector: Hemisphere, Sphere, Hyperboloid, Hyperbolic Paraboloid, Torus
   - Parametric sliders per shape (radius, curvature, aspect ratio)
   - Display toggles: Wireframe, Gaussian Curvature (colormap), Singularities
   - OBJ/STL drag-and-drop import

4. **TangramPanel** (src/components/TangramPanel/)
   - Dual-view: Open (left SVG) + Closed (right SVG)
   - η slider (0=Closed, 1=Open) animating between states
   - Color coding EXACTLY per spec:
     - Underlay faces: #4A90D9 (blue)
     - Pleat faces: #E8669A (pink)
     - Underlay edges: #F5C518 (yellow)
     - Stitch lines: #1A1A1A (black)
     - Seams: #FF7A00 dashed (orange)
     - Singularities: #E84040 (red)
   - Pattern library selector: Arrow, WaterBomb, Resch-4, Braid, Leaf, Box, Brick, Diamond

5. **ResultPanel** (src/components/ResultPanel/)
   - Three.js canvas with OrbitControls
   - Display modes: Smocked, Heatmap, Pleat Quality, Tangram Overlay, Transparent
   - Front/Back toggle

6. **InspectorPanel** (src/components/InspectorPanel/)
   - **Optimization tab**: ws/wp/wc sliders, η initial, max iterations, Run button, convergence progress bar
   - **Singularities tab**: Auto/Manual/None mode, singularity list table, Poincaré-Hopf check
   - **Analysis tab**: Eshape/Epleat metrics, fabricability checks
   - **Compare tab**: up to 4 designs side-by-side

7. **Core Engine** (src/engine/)
   
   a. `patterns.ts` — Smocking pattern definitions
      Define ALL patterns with their unit cell geometry:
      
      **Arrow pattern** (N=2):
      - Unit cell: 6×4 grid points
      - Stitching lines: connect points in V-shape
      - Open config: flat 2D grid
      - Closed config: pleats fold together, pleat faces disappear
      
      **WaterBomb pattern** (N=4):  
      - Unit cell: square grid with 4-fold symmetry
      - Stitching lines: radial from center
      - Closed: water bomb base fold geometry
      
      **Resch-4 pattern** (N=4):
      - Unit cell: based on square tessellation
      - Stitching lines: 4-fold rotational symmetry
      - Open/Closed geometry computed analytically
      
      **Braid pattern** (N=2):
      - Hexagonal mixed tiling
      
      **Leaf/Heart patterns** (N=2):
      - Hexagonal tiling, similar closed structure
      
      **Box pattern** (N=2):
      - Square grid pleats
      
      **Brick pattern** (N=2):
      - Diamond tiling
      
      For each pattern, store:
      ```typescript
      interface SmockingPattern {
        name: string;
        symmetry: 'N2' | 'N3' | 'N4' | 'N6';
        unitCell: {
          vertices: [number, number][];  // 2D coords in unit cell
          underlayEdges: [number, number][];
          stitchingLines: number[][];  // vertex indices per stitch line
          pleateEdges: [number, number][];
        };
        tiling: { uStep: number; vStep: number };  // unit cell repeat vectors
        // Closed configuration (η=0): computed via Tangram closing
        closedVertices: [number, number, number][];  // 3D coords after closing
      }
      ```
   
   b. `tangram.ts` — Tangram computation
      ```typescript
      // Generate tiled pattern for given grid size
      function generateTiledPattern(pattern: SmockingPattern, uRepeat: number, vRepeat: number): TiledPattern
      
      // Tangram closing: compute vertex positions for given η
      // Based on paper Eq.(1): min αs·Estitch + αr·Erigid
      // For Phase 1: use pre-computed analytic closed forms per pattern
      function computeTangramForEta(pattern: TiledPattern, eta: number): TangramState
      
      // Classify vertices as underlay (Vu) or pleat (Vp)
      function classifyVertices(pattern: TiledPattern): VertexClassification
      
      // Classify faces as underlay or pleat (Fp)
      function classifyFaces(pattern: TiledPattern): FaceClassification
      ```
   
   c. `shapes.ts` — 3D target shape generators
      ```typescript
      function generateHemisphere(radius: number, resolution: number): Mesh3D
      function generateSphere(radius: number, resolution: number): Mesh3D
      function generateHyperboloid(a: number, c: number, resolution: number): Mesh3D
      function generateHyperbolicParaboloid(size: number, curvature: number): Mesh3D
      function generateTorus(R: number, r: number, resolution: number): Mesh3D
      function parseOBJ(text: string): Mesh3D
      function parseSTL(buffer: ArrayBuffer): Mesh3D
      ```
   
   d. `curvature.ts` — Gaussian/Mean curvature computation
      ```typescript
      // Discrete Gaussian curvature via angle defect
      function computeGaussianCurvature(mesh: Mesh3D): Float32Array
      // Discrete mean curvature via cotangent formula
      function computeMeanCurvature(mesh: Mesh3D): Float32Array
      ```
   
   e. `optimization.ts` — Inverse design optimization (Phase 2)
      ```typescript
      // Paper Eq.(5): Y° = argmin ws·Eshape + wp·Epleat + wc·Eseam
      // Newton's method with WebWorker
      function runOptimization(
        targetMesh: Mesh3D,
        pattern: SmockingPattern,
        params: OptimizationParams,
        onProgress: (iter: number, Eshape: number, Epleat: number) => void
      ): Promise<OptimizationResult>
      
      // Paper Eq.(2): Eshape = sum over underlay edges of (|e_Y| / |e_X| - |e_M| / |e_X|)^2  
      function computeEshape(tangram: TangramState, targetMesh: Mesh3D): number
      
      // Paper Eq.(3): Epleat = sum over pleat face angles
      function computeEpleat(tangram: TangramState): number
      
      // Paper Eq.(4): Eseam = seam edge/angle compatibility
      function computeEseam(tangram: TangramState): number
      ```
   
   f. `arap.ts` — ARAP preview mesh deformation
      ```typescript
      // As-Rigid-As-Possible deformation: Y° → Y^c
      function computeARAPPreview(
        openTangram: TangramState,
        closedTangram: TangramState,
        highResMesh: Mesh3D
      ): Mesh3D
      ```
   
   g. `export.ts` — Export functions
      ```typescript
      function exportSVG(pattern: TiledPattern, options: SVGExportOptions): string
      function exportDXF(pattern: TiledPattern, options: DXFExportOptions): string
      function exportPDF(pattern: TiledPattern, options: PDFExportOptions): Blob
      function exportOBJ(mesh: Mesh3D, options: OBJExportOptions): string
      function exportJSON(result: OptimizationResult): string
      function exportSmockProject(state: AppState): string
      ```

8. **State Management** (src/store/)
   - `useAppStore.ts` with Zustand:
     ```typescript
     interface AppState {
       // Shape
       selectedShape: ShapePreset;
       shapeParams: Record<string, number>;
       targetMesh: Mesh3D | null;
       meshDisplayMode: MeshDisplayMode;
       
       // Pattern
       selectedPattern: PatternPreset;
       tilingU: number;
       tilingV: number;
       eta: number;  // 0-1 slider
       tangramState: TangramState | null;
       
       // Optimization
       optimizationParams: OptimizationParams;
       optimizationStatus: OptimizationStatus;
       optimizationResult: OptimizationResult | null;
       
       // Result
       resultDisplayMode: ResultDisplayMode;
       previewMesh: Mesh3D | null;
       
       // Singularities
       singularities: Singularity[];
       singularityMode: 'auto' | 'manual' | 'none';
       
       // Layout
       layoutMode: LayoutMode;
       inspectorOpen: boolean;
       inspectorTab: InspectorTab;
       
       // Compare
       savedDesigns: SavedDesign[];
     }
     ```

9. **Export Modal** (src/components/ExportModal/)
   - SVG export with layer visibility toggles
   - DXF export with version/unit options
   - PDF export with paper size selection
   - OBJ/STL/GLB export for 3D result
   - JSON export for raw data
   - .smock project save

### Phase 2 — Optimization Engine

10. **Tangram Closing Optimization** (src/engine/tangram.ts)
    - Implement Newton's method for Eq.(1)
    - Per-element projected Hessian
    - Convergence: energy change < 1e-6
    - Run in WebWorker to avoid blocking UI

11. **Inverse Design Optimization** (src/engine/optimization.ts)
    - Newton's method for Eq.(5)
    - Dynamic wp scheduling: 20% decay per iteration
    - WebWorker with progress callbacks
    - Convergence: Eshape < 1e-4 or max 100 iterations

12. **Seamless Parameterization** (src/engine/parameterization.ts)
    - Simple N=4 version for Phase 2
    - Map target mesh to 2D domain with singularities

13. **ARAP Preview** (src/engine/arap.ts)
    - Sparse linear system solver
    - Local/global ARAP iterations
    - Mean Value Coordinates for pleat extrusion

### Design System
- Background: #0D0D0F (darkest), #16181C (panels), #1E2126 (surfaces)
- Borders: #2A2E35
- Text: #E8EAF0 (primary), #7A8090 (secondary)
- Accent: #4A90D9 (same as underlay blue)
- Fonts: JetBrains Mono (numbers), system-ui (UI text)
- All color vars as CSS custom properties

## Key Implementation Notes

### Arrow Pattern Geometry
The Arrow pattern unit cell (simplified):
- Open: 6 points in a 2×3 grid, stitch lines connect adjacent rows in V shape
- Closed: V-shapes close, pleat vertices merge toward center

```
Open (η=1):          Closed (η=0):
A---B---C            A-B-C
|   |   |            |/|\|  
D---E---F    →       D-E-F
|   |   |            |\|/|
G---H---I            G-H-I

Stitch lines: (A,E), (B,E), (C,E), (D,E), (F,E) etc.
```

### WaterBomb Pattern Geometry
Based on origami water bomb base:
- 4 stitching lines meeting at center point
- Each line connects 3-4 points in a radial arrangement
- Closed: center rises up in 3D (but we show 2D projection)

### Resch-4 Pattern Geometry
Ron Resch's square tessellation:
- Square grid, alternating up/down folds
- 4-fold rotational symmetry
- Each unit: 1 central square + 4 triangular pleats

### Tangram Closing (simplified for Phase 1)
For Phase 1, instead of full optimization, use analytic forms:
- Arrow: linearly interpolate between open and known closed config
- WaterBomb: analytically compute fold angles for given η
- Resch-4: similarly analytic

### Seamless Parameterization for N=4 (Phase 2)
- Divide mesh into 4 sectors separated by seam curves C, C'
- Each sector parameterized with regular Resch-4 grid
- Singularities placed at high-curvature regions
- Seam constraints: Eq.(4a) edge lengths, (4b) dihedral angles, (4c) N-symmetry

## File Structure

```
smocking-cad/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── README.md           ← Write comprehensive README
├── LICENSE             ← MIT License
├── SPEC.md             ← (already exists)
├── public/
│   └── favicon.svg
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css       ← Global styles + CSS vars
    ├── types/
    │   └── index.ts    ← All TypeScript interfaces
    ├── store/
    │   └── useAppStore.ts
    ├── engine/
    │   ├── patterns.ts
    │   ├── tangram.ts
    │   ├── shapes.ts
    │   ├── curvature.ts
    │   ├── optimization.ts
    │   ├── arap.ts
    │   └── export.ts
    ├── components/
    │   ├── Layout/
    │   │   ├── Layout.tsx
    │   │   ├── HeaderBar.tsx
    │   │   └── PanelResizer.tsx
    │   ├── ShapePanel/
    │   │   ├── ShapePanel.tsx
    │   │   ├── ShapeViewer3D.tsx    ← Three.js canvas
    │   │   ├── ShapePresets.tsx
    │   │   ├── ShapeControls.tsx
    │   │   └── CurvatureOverlay.tsx
    │   ├── TangramPanel/
    │   │   ├── TangramPanel.tsx
    │   │   ├── TangramSVG.tsx      ← D3.js SVG viewer
    │   │   ├── EtaSlider.tsx
    │   │   └── PatternLibrary.tsx
    │   ├── ResultPanel/
    │   │   ├── ResultPanel.tsx
    │   │   ├── ResultViewer3D.tsx  ← Three.js canvas
    │   │   └── ResultControls.tsx
    │   ├── InspectorPanel/
    │   │   ├── InspectorPanel.tsx
    │   │   ├── OptimizationTab.tsx
    │   │   ├── SingularitiesTab.tsx
    │   │   ├── AnalysisTab.tsx
    │   │   └── CompareTab.tsx
    │   ├── ExportModal/
    │   │   └── ExportModal.tsx
    │   └── ui/             ← Reusable UI components
    │       ├── Slider.tsx
    │       ├── Button.tsx
    │       ├── Panel.tsx
    │       └── Tooltip.tsx
    └── hooks/
        ├── useThreeScene.ts
        └── useOptimization.ts
```

## GitHub Setup
- Repo already created at: https://github.com/bob-takuya/smocking-cad
- After implementation, run:
  ```bash
  git add -A
  git commit -m "feat: initial SmockingCAD implementation - Phase 1+2"
  git push origin main
  ```

## Quality Bar
- TypeScript strict mode, no `any`
- All Three.js scenes must dispose properly on unmount
- WebWorkers for optimization (no UI freeze)
- Responsive layout (min 1200px wide)
- All panels must show meaningful content without running optimization first (use preset data)
- Error boundaries on all panels
- The app must BUILD with `npm run build` without errors

## When Done
Run this to notify:
openclaw system event --text "SmockingCAD Phase 1+2 implementation complete: https://github.com/bob-takuya/smocking-cad" --mode now
