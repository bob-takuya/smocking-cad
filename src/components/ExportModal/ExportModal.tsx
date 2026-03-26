import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Button, Select } from '../ui';
import {
  exportSVG,
  exportDXF,
  exportPDF,
  exportOBJ,
  exportSTL,
  exportJSON,
  exportSmockProject,
  downloadFile,
} from '../../engine/export';
import type { SVGExportOptions, PDFExportOptions, DXFExportOptions } from '../../types';

type ExportFormat = 'svg' | 'dxf' | 'pdf' | 'obj' | 'stl' | 'json' | 'smock';

const FORMAT_OPTIONS: { value: ExportFormat; label: string; description: string }[] = [
  { value: 'svg', label: 'SVG', description: '2D pattern for vector graphics' },
  { value: 'dxf', label: 'DXF', description: 'CAD format for laser cutting' },
  { value: 'pdf', label: 'PDF', description: 'Printable pattern document' },
  { value: 'obj', label: 'OBJ', description: '3D mesh format' },
  { value: 'stl', label: 'STL', description: '3D mesh for printing' },
  { value: 'json', label: 'JSON', description: 'Raw optimization data' },
  { value: 'smock', label: 'Project', description: 'SmockingCAD project file' },
];

export function ExportModal() {
  const {
    exportModalOpen,
    setExportModalOpen,
    tiledPattern,
    tangramState,
    targetMesh,
    optimizationResult,
    selectedShape,
    shapeParams,
    selectedPattern,
    tilingU,
    tilingV,
    gary,
    optimizationParams,
    singularityMode,
    singularities,
    savedDesigns,
  } = useAppStore();

  const [format, setFormat] = useState<ExportFormat>('svg');

  // SVG options
  const [svgOptions, setSvgOptions] = useState<SVGExportOptions>({
    showUnderlay: true,
    showPleat: true,
    showStitch: true,
    showSeams: true,
    showSingularities: true,
    scale: 50,
  });

  // PDF options
  const [pdfOptions, setPdfOptions] = useState<PDFExportOptions>({
    paperSize: 'A4',
    orientation: 'landscape',
    margin: 20,
  });

  // DXF options
  const [dxfOptions, setDxfOptions] = useState<DXFExportOptions>({
    units: 'mm',
    version: 'R2000',
  });

  if (!exportModalOpen) return null;

  const handleExport = () => {
    if (!tiledPattern || !tangramState) {
      console.warn('No pattern to export');
      return;
    }

    const timestamp = new Date().toISOString().slice(0, 10);
    const baseName = `smocking_${selectedPattern}_${timestamp}`;

    switch (format) {
      case 'svg': {
        const svg = exportSVG(tiledPattern, tangramState, svgOptions);
        downloadFile(svg, `${baseName}.svg`, 'image/svg+xml');
        break;
      }
      case 'dxf': {
        const dxf = exportDXF(tiledPattern, tangramState, dxfOptions);
        downloadFile(dxf, `${baseName}.dxf`, 'application/dxf');
        break;
      }
      case 'pdf': {
        const pdf = exportPDF(tiledPattern, tangramState, pdfOptions);
        downloadFile(pdf, `${baseName}.pdf`, 'application/pdf');
        break;
      }
      case 'obj': {
        if (targetMesh) {
          const obj = exportOBJ(targetMesh, baseName);
          downloadFile(obj, `${baseName}.obj`, 'model/obj');
        }
        break;
      }
      case 'stl': {
        if (targetMesh) {
          const stl = exportSTL(targetMesh);
          downloadFile(stl, `${baseName}.stl`, 'model/stl');
        }
        break;
      }
      case 'json': {
        if (optimizationResult) {
          const json = exportJSON(optimizationResult);
          downloadFile(json, `${baseName}.json`, 'application/json');
        }
        break;
      }
      case 'smock': {
        const project = exportSmockProject({
          selectedShape,
          shapeParams,
          selectedPattern,
          tilingU,
          tilingV,
          gary,
          optimizationParams,
          singularityMode,
          singularities,
          savedDesigns,
        });
        downloadFile(project, `${baseName}.smock`, 'application/json');
        break;
      }
    }

    setExportModalOpen(false);
  };

  const renderFormatOptions = () => {
    switch (format) {
      case 'svg':
        return (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
              Layer Visibility
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'showUnderlay', label: 'Underlay faces' },
                { key: 'showPleat', label: 'Pleat faces' },
                { key: 'showStitch', label: 'Stitch lines' },
                { key: 'showSeams', label: 'Seam edges' },
                { key: 'showSingularities', label: 'Singularities' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={svgOptions[key as keyof SVGExportOptions] as boolean}
                    onChange={(e) =>
                      setSvgOptions({ ...svgOptions, [key]: e.target.checked })
                    }
                    className="rounded border-[var(--border)] bg-[var(--bg-surface)] text-[var(--accent)]"
                  />
                  <span className="text-[var(--text-secondary)]">{label}</span>
                </label>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-secondary)]">Scale:</span>
              <input
                type="number"
                value={svgOptions.scale}
                onChange={(e) => setSvgOptions({ ...svgOptions, scale: parseFloat(e.target.value) || 50 })}
                className="w-20 px-2 py-1 text-sm bg-[var(--bg-surface)] text-[var(--text-primary)]
                           border border-[var(--border)] rounded"
              />
              <span className="text-xs text-[var(--text-muted)]">px per unit</span>
            </div>
          </div>
        );

      case 'pdf':
        return (
          <div className="space-y-3">
            <Select
              label="Paper Size"
              options={[
                { value: 'A4', label: 'A4' },
                { value: 'A3', label: 'A3' },
                { value: 'Letter', label: 'Letter' },
              ]}
              value={pdfOptions.paperSize}
              onChange={(v) => setPdfOptions({ ...pdfOptions, paperSize: v as 'A4' | 'A3' | 'Letter' })}
            />
            <Select
              label="Orientation"
              options={[
                { value: 'portrait', label: 'Portrait' },
                { value: 'landscape', label: 'Landscape' },
              ]}
              value={pdfOptions.orientation}
              onChange={(v) => setPdfOptions({ ...pdfOptions, orientation: v as 'portrait' | 'landscape' })}
            />
          </div>
        );

      case 'dxf':
        return (
          <div className="space-y-3">
            <Select
              label="Units"
              options={[
                { value: 'mm', label: 'Millimeters (mm)' },
                { value: 'cm', label: 'Centimeters (cm)' },
                { value: 'inch', label: 'Inches (in)' },
              ]}
              value={dxfOptions.units}
              onChange={(v) => setDxfOptions({ ...dxfOptions, units: v as 'mm' | 'cm' | 'inch' })}
            />
            <Select
              label="DXF Version"
              options={[
                { value: 'R12', label: 'R12 (Legacy)' },
                { value: 'R2000', label: 'R2000 (Modern)' },
              ]}
              value={dxfOptions.version}
              onChange={(v) => setDxfOptions({ ...dxfOptions, version: v as 'R12' | 'R2000' })}
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[500px] max-h-[80vh] bg-[var(--bg-panel)] border border-[var(--border)] rounded-lg shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Export</h2>
          <button
            onClick={() => setExportModalOpen(false)}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Format selector */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
              Export Format
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {FORMAT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFormat(opt.value)}
                  className={`p-3 text-left rounded border transition-colors ${
                    format === opt.value
                      ? 'bg-[var(--accent-dim)] border-[var(--accent)] text-[var(--text-primary)]'
                      : 'bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-light)]'
                  }`}
                >
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">{opt.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Format-specific options */}
          {renderFormatOptions()}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[var(--border)]">
          <Button variant="secondary" onClick={() => setExportModalOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleExport}>
            Export
          </Button>
        </div>
      </div>
    </div>
  );
}
