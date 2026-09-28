# SmockingCAD

A browser-based tool for drawing smocking stitch patterns and previewing how the fabric gathers in 3D, inspired by *Fabric Tessellation: Realizing Freeform Surfaces by Smocking* (Segall et al., ACM TOG 2024).

スモッキング（布を縫い縮めて立体をつくる手芸技法）のステッチパターンを描き、縫い縮めた形をブラウザで3Dプレビューするツール（プロトタイプ）。

## Status

**Prototype.** The pattern editor and 3D preview work and were used for a workshop; much of the larger CAD feature set (target shapes, optimization, multi-format export) exists as engine code but is not connected to the current UI.

- ✅ **Works**
  - Pattern editor: 7 preset patterns (Arrow, Leaf, Braid, Box, Brick, TwistedSquare, Heart), or draw your own stitch lines on a square or triangular grid
  - Import stitch lines from a DXF file (Draw mode)
  - Tiling: set U/V repeats; in Draw mode the repeat cell can be resized by dragging
  - 3D preview with a "Stitch Strength" slider (flat ↔ fully smocked)
  - Export the preview mesh as OBJ ("Export OBJ" button under the 3D view)
  - Responsive layout: two columns on desktop, Draw / Simulate tabs on mobile
  - `npm run build` succeeds
- 🚧 **Partial**
  - The 3D preview is a *geometric approximation* (Gaussian stitch-pair field, raised-cosine arches, Laplacian smoothing and a short xPBD pass), not a physical cloth simulation and not the paper's optimization
  - Engine modules for target shapes (hemisphere, sphere, torus, hyperboloid, hyperbolic paraboloid, OBJ/STL import), curvature analysis, inverse-design optimization, and SVG / DXF / PDF / STL / project export exist in `src/engine/` and in components (`ShapePanel`, `TangramPanel`, `InspectorPanel`, `ExportModal`, `FabricTestTab`), but these components are **not mounted** in `App.tsx`, so they are not reachable from the UI
  - The optimization's shape energy is simplified (uses a fixed target edge-length ratio instead of the target mesh)
- 📝 **Not implemented**
  - File menu: Open Project / Save Project; Edit menu: Undo / Redo / Reset Pattern / Reset Shape; View menu: Reset Camera / Fit to View (menu items exist but do nothing)
  - Keyboard shortcuts
  - The full inverse-design pipeline from the paper (target surface → smocking pattern)
- ⚠️ **Known issues**
  - The "Export" buttons in the header and the Result panel do nothing (they open an export dialog that is never rendered). Use "Export OBJ" instead
  - `npm run lint` reports several errors (unused variables etc.)
  - The repository contains a committed `.npm-cache/` directory that should not be there
  - Development continued after the last push; newer work-in-progress exists that isn't pushed yet

## Demo

The GitHub Pages workflow (`.github/workflows/deploy.yml`) builds `main` and publishes it to:
https://bob-takuya.github.io/smocking-cad/

## Background

Built in spring 2026 as the tool for a smocking workshop held at the a university festival in May 2026. Visitors drew or picked a stitch pattern and checked the gathered shape on screen before sewing. The starting point was the smocking research by Segall et al. (2024); this project implements an interactive pattern-and-preview part, not the paper's full method.

## Usage

1. **Pattern** (left panel): choose *Preset* and pick a pattern, or choose *Draw* and click grid points to draw stitch lines (Enter / Esc finishes a line). In Draw mode, editing is locked unless the stitch-strength slider is at *Flat*.
2. Adjust the U/V repeats (and, in Draw mode, the size of the repeat cell).
3. **Result** (right panel): move *Stitch Strength* to see the fabric gather.
4. Click **Export OBJ** to download the current 3D mesh.

## Development

Requires Node.js (the CI uses Node 20).

```bash
npm install
npm run dev       # start the Vite dev server
npm run build     # type-check (tsc -b) and build to dist/
npm run preview   # serve the production build
npm run lint      # ESLint
```

Tech: React 19, TypeScript, Vite, Three.js, Zustand, Tailwind CSS v4 (plus d3, jsPDF, mathjs and dxf-parser used by engine/export code).

```
src/
  components/PatternEditor/  # 2D pattern editor (mounted)
  components/ResultPanel/    # 3D preview + OBJ export (mounted)
  components/…               # other panels, currently not mounted
  engine/                    # patterns, tangram, shapes, curvature, optimization, ARAP, physics, export
  store/                     # Zustand store
```

## Credits

- Aviv Segall, Jing Ren, Amir Vaxman, Olga Sorkine-Hornung. "Fabric Tessellation: Realizing Freeform Surfaces by Smocking." *ACM Transactions on Graphics* 43(4) (SIGGRAPH 2024).

This is an independent student project and is not affiliated with the paper's authors.

## Related repos

- [tpms-kagome-designer](https://github.com/bob-takuya/tpms-kagome-designer) — kagome weaving patterns on TPMS surfaces
- [bamboo-gridshell](https://github.com/bob-takuya/bamboo-gridshell) — small bamboo gridshell sketch tool
- [rhinotools](https://github.com/bob-takuya/rhinotools) — RhinoPython scripts for CNC / laser part prep

## License

MIT — see [LICENSE](LICENSE).
