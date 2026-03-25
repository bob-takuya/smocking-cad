# SmockingCAD

An interactive browser-based CAD tool for designing fabric tessellations using smocking techniques. Based on the paper "Fabric Tessellation: Realizing Freeform Surfaces by Smocking" (Segall et al., ACM TOG 2024).

## Features

- **3D Target Shape Design**: Create target surfaces using parametric shapes (hemisphere, sphere, torus, hyperboloid, hyperbolic paraboloid) or import custom OBJ/STL files
- **Smocking Pattern Library**: Eight preset patterns including Arrow, WaterBomb, Resch-4, Braid, Leaf, Box, Brick, and Diamond
- **Interactive Tangram Visualization**: Real-time 2D pattern preview with open/closed state animation via eta slider
- **Curvature Analysis**: Gaussian and mean curvature visualization on target meshes
- **Optimization Engine**: Inverse design optimization to match target shapes
- **Export Options**: SVG, DXF (CAD), PDF, OBJ, STL, and project files

## Live Demo

Visit: [https://bob-takuya.github.io/smocking-cad](https://bob-takuya.github.io/smocking-cad)

## Tech Stack

- React 18 + TypeScript
- Vite (build tool)
- Three.js (3D rendering)
- D3.js (2D SVG visualization)
- Zustand (state management)
- Tailwind CSS v4 (styling)
- jsPDF (PDF export)

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/bob-takuya/smocking-cad.git
cd smocking-cad

# Install dependencies
npm install

# Start development server
npm run dev
```

### Build

```bash
npm run build
```

The built files will be in the `dist` directory.

## Usage

### 1. Select Target Shape

In the left panel, choose from preset shapes or import a custom OBJ/STL mesh. Adjust parameters like radius, curvature, or resolution using the sliders.

### 2. Choose Smocking Pattern

In the center panel, select a pattern from the library. Patterns have different symmetries (N=2, 4, 6) affecting how they tile and fold.

### 3. Adjust Pattern Parameters

- **U/V Repeat**: Control how many times the pattern tiles
- **Eta Slider**: Animate between open (flat) and closed (smocked) states
  - eta = 1: Fully open (flat pattern)
  - eta = 0: Fully closed (stitches merged)

### 4. Run Optimization (Optional)

In the Inspector panel (bottom), adjust optimization weights:
- **w_shape**: Weight for shape matching energy
- **w_pleat**: Weight for pleat quality
- **w_seam**: Weight for seam compatibility

Click "Run Optimization" to find the best tangram configuration.

### 5. Export

Export your design in various formats:
- **SVG**: Vector graphics for cutting machines
- **DXF**: CAD format for laser cutters
- **PDF**: Printable pattern with scale
- **OBJ/STL**: 3D mesh for visualization
- **Project (.smock)**: Save full project state

## Pattern Types

| Pattern | Symmetry | Description |
|---------|----------|-------------|
| Arrow | N=2 | Classic V-shape pleats |
| WaterBomb | N=4 | Origami-inspired 4-fold pattern |
| Resch-4 | N=4 | Ron Resch tessellation |
| Braid | N=2 | Hexagonal braided effect |
| Leaf | N=2 | Organic leaf-like formations |
| Box | N=2 | Square grid box pleats |
| Brick | N=2 | Diamond/brick offset |
| Diamond | N=2 | Rhombus diagonal pleats |

## Color Coding

The tangram visualization uses consistent colors:
- **Blue (#4A90D9)**: Underlay faces
- **Pink (#E8669A)**: Pleat faces
- **Yellow (#F5C518)**: Underlay edges
- **Black (#1A1A1A)**: Stitch lines
- **Orange (#FF7A00)**: Seam edges (dashed)
- **Red (#E84040)**: Singularities

## Keyboard Shortcuts

- **I**: Toggle Inspector panel
- **R**: Reset camera
- **F**: Fit to view

## Architecture

```
src/
  engine/         # Core computational modules
    patterns.ts   # Pattern definitions
    tangram.ts    # Tangram computation
    shapes.ts     # 3D shape generators
    curvature.ts  # Curvature computation
    optimization.ts # Inverse design optimization
    arap.ts       # ARAP deformation
    export.ts     # File export utilities
  store/          # Zustand state management
  components/     # React components
    Layout/       # App layout
    ShapePanel/   # 3D shape editor
    TangramPanel/ # 2D pattern viewer
    ResultPanel/  # Result preview
    InspectorPanel/ # Parameter controls
    ExportModal/  # Export dialog
    ui/           # Reusable UI components
  hooks/          # Custom React hooks
  types/          # TypeScript definitions
```

## References

- Segall, O., et al. (2024). "Fabric Tessellation: Realizing Freeform Surfaces by Smocking." ACM Transactions on Graphics.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.
