/**
 * PatternEditor — SVG-based stitch pattern editor
 *
 * Two modes:
 *   preset: choose from Arrow/Leaf/Braid/etc., shown as colored lines on grid
 *   custom: draw stitch lines by clicking grid points, connect with polylines
 *
 * Grid types: square | triangle (equilateral)
 * Edit only when gary === 1 (fully flat, slider all the way to Flat)
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Panel, Button, Slider } from '../ui';
import { PATTERNS } from '../../engine/patterns';
import { generateTiledPattern } from '../../engine/tangram';
import type { StitchLine, PatternPreset } from '../../types';

// Preset thumbnail colors
const LINE_COLORS = [
  '#4a9eff', '#ff6b6b', '#51cf66', '#ffd43b',
  '#cc5de8', '#ff8cc8', '#20c997', '#f76707',
];

// Convert pattern-def stitching lines (coord arrays) to StitchLine[]
function patternDefToLines(patternName: PatternPreset): StitchLine[] {
  const def = PATTERNS[patternName];
  return def.stitchingLines.map(sl => sl as StitchLine);
}

// Grid point positions on SVG canvas
function gridPoint(
  gx: number, gy: number,
  gridType: 'square' | 'triangle',
  cellPx: number, padX: number, padY: number
): [number, number] {
  if (gridType === 'square') {
    return [padX + gx * cellPx, padY + gy * cellPx];
  } else {
    // Equilateral triangle grid
    const xOffset = gy % 2 === 1 ? cellPx * 0.5 : 0;
    return [padX + gx * cellPx + xOffset, padY + gy * cellPx * (Math.sqrt(3) / 2)];
  }
}

// Snap SVG coords to nearest grid point
function snapToGrid(
  svgX: number, svgY: number,
  nx: number, ny: number,
  gridType: 'square' | 'triangle',
  cellPx: number, padX: number, padY: number
): [number, number] | null {
  let bestDist = Infinity, bestGx = -1, bestGy = -1;
  for (let gy = 0; gy < ny; gy++) {
    for (let gx = 0; gx < nx; gx++) {
      const [px, py] = gridPoint(gx, gy, gridType, cellPx, padX, padY);
      const d = Math.hypot(svgX - px, svgY - py);
      if (d < bestDist) { bestDist = d; bestGx = gx; bestGy = gy; }
    }
  }
  if (bestDist > cellPx * 0.6) return null; // too far
  return [bestGx, bestGy];
}

const PRESET_NAMES = Object.keys(PATTERNS) as PatternPreset[];

export function PatternEditor() {
  const {
    gary, patternSource, setPatternSource,
    customStitchLines, setCustomStitchLines,
    patternGridNx, patternGridNy, setPatternGrid,
    gridType, setGridType,
    selectedPattern, setSelectedPattern,
    tilingU, tilingV, setTilingU, setTilingV,
    setTiledPattern,
  } = useAppStore();

  const svgRef = useRef<SVGSVGElement>(null);
  const [svgSize, setSvgSize] = useState({ w: 400, h: 300 });
  const [drawingLine, setDrawingLine] = useState<StitchLine | null>(null);
  const [hoverPoint, setHoverPoint] = useState<[number, number] | null>(null);

  const isEditable = gary >= 0.99;

  // Track SVG container size
  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setSvgSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Grid layout
  const nx = patternGridNx, ny = patternGridNy;
  const pad = 24;
  const cellPx = Math.min(
    (svgSize.w - pad * 2) / (nx - 1),
    (svgSize.h - pad * 2) / (gridType === 'triangle' ? (ny - 1) * (Math.sqrt(3) / 2) : (ny - 1))
  );
  const padX = (svgSize.w - cellPx * (nx - 1)) / 2;
  const padY = (svgSize.h - cellPx * (gridType === 'triangle' ? (ny - 1) * (Math.sqrt(3) / 2) : (ny - 1))) / 2;

  const gp = useCallback((gx: number, gy: number): [number, number] =>
    gridPoint(gx, gy, gridType, cellPx, padX, padY),
    [gridType, cellPx, padX, padY]
  );

  // Which lines to display (preset or custom)
  const displayLines: StitchLine[] =
    patternSource === 'preset'
      ? patternDefToLines(selectedPattern)
      : customStitchLines;

  // Sync to tiledPattern whenever display lines or grid change
  useEffect(() => {
    if (patternSource === 'preset') {
      const patternDef = PATTERNS[selectedPattern];
      const tiled = generateTiledPattern(patternDef, tilingU, tilingV);
      setTiledPattern(tiled);
    } else {
      // Build a synthetic patternDef from custom lines
      const patternDef = {
        name: 'Arrow' as PatternPreset, // placeholder name
        nx: patternGridNx,
        ny: patternGridNy,
        stitchingLines: customStitchLines,
      };
      const tiled = generateTiledPattern(patternDef, tilingU, tilingV);
      setTiledPattern(tiled);
    }
  }, [patternSource, selectedPattern, customStitchLines, patternGridNx, patternGridNy, tilingU, tilingV, setTiledPattern]);

  // SVG mouse events
  const getSVGCoords = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isEditable || patternSource !== 'custom') return;
    const coords = getSVGCoords(e);
    if (!coords) return;
    const snapped = snapToGrid(coords.x, coords.y, nx, ny, gridType, cellPx, padX, padY);
    setHoverPoint(snapped);
  };

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isEditable || patternSource !== 'custom') return;
    const coords = getSVGCoords(e);
    if (!coords) return;
    const snapped = snapToGrid(coords.x, coords.y, nx, ny, gridType, cellPx, padX, padY);
    if (!snapped) return;

    setDrawingLine(prev => {
      if (!prev) {
        // Start new line
        return [snapped];
      }
      // Check if clicking same point (finish line)
      const last = prev[prev.length - 1];
      if (last[0] === snapped[0] && last[1] === snapped[1]) {
        if (prev.length >= 2) {
          setCustomStitchLines([...customStitchLines, prev]);
        }
        return null;
      }
      // Check if already in line (finish and add)
      const alreadyIn = prev.some(p => p[0] === snapped[0] && p[1] === snapped[1]);
      if (alreadyIn) {
        if (prev.length >= 2) {
          setCustomStitchLines([...customStitchLines, prev]);
        }
        return null;
      }
      return [...prev, snapped];
    });
  };

  const handleDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (!isEditable || patternSource !== 'custom') return;
    if (drawingLine && drawingLine.length >= 2) {
      setCustomStitchLines([...customStitchLines, drawingLine]);
    }
    setDrawingLine(null);
  };

  const finishLine = () => {
    if (drawingLine && drawingLine.length >= 2) {
      setCustomStitchLines([...customStitchLines, drawingLine]);
    }
    setDrawingLine(null);
  };

  const deleteLast = () => {
    if (drawingLine) { setDrawingLine(null); return; }
    setCustomStitchLines(customStitchLines.slice(0, -1));
  };

  const clearAll = () => {
    setDrawingLine(null);
    setCustomStitchLines([]);
  };

  // Keyboard: Escape = finish line
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finishLine();
      if (e.key === 'Enter') finishLine();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Render polyline points string
  const linePoints = (pts: StitchLine) =>
    pts.map(([gx, gy]) => gp(gx, gy).join(',')).join(' ');

  return (
    <Panel title="Pattern" noPadding className="h-full flex flex-col">
      {/* Top controls */}
      <div className="shrink-0 border-b border-[var(--border)] p-2 space-y-2">
        {/* Mode toggle */}
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={patternSource === 'preset' ? 'primary' : 'secondary'}
            onClick={() => setPatternSource('preset')}
            className="flex-1"
          >
            Preset
          </Button>
          <Button
            size="sm"
            variant={patternSource === 'custom' ? 'primary' : 'secondary'}
            onClick={() => setPatternSource('custom')}
            className="flex-1"
          >
            ✏️ Draw
          </Button>
        </div>

        {/* Preset selector */}
        {patternSource === 'preset' && (
          <div className="flex flex-wrap gap-1">
            {PRESET_NAMES.map(name => (
              <button
                key={name}
                onClick={() => setSelectedPattern(name)}
                className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                  selectedPattern === name
                    ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                    : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        {/* Custom: grid settings */}
        {patternSource === 'custom' && (
          <div className="space-y-1.5">
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={gridType === 'square' ? 'primary' : 'secondary'}
                onClick={() => setGridType('square')}
                className="flex-1 text-xs"
              >
                ⬛ Square
              </Button>
              <Button
                size="sm"
                variant={gridType === 'triangle' ? 'primary' : 'secondary'}
                onClick={() => setGridType('triangle')}
                className="flex-1 text-xs"
              >
                🔺 Triangle
              </Button>
            </div>
            <div className="flex gap-2">
              <Slider label="Cols" value={patternGridNx} min={3} max={20} step={1}
                onChange={v => setPatternGrid(v, patternGridNy)} className="flex-1" />
              <Slider label="Rows" value={patternGridNy} min={3} max={20} step={1}
                onChange={v => setPatternGrid(patternGridNx, v)} className="flex-1" />
            </div>
          </div>
        )}

        {/* Tiling */}
        <div className="flex gap-2">
          <Slider label="Repeat U" value={tilingU} min={1} max={8} step={1}
            onChange={setTilingU} className="flex-1" />
          <Slider label="Repeat V" value={tilingV} min={1} max={8} step={1}
            onChange={setTilingV} className="flex-1" />
        </div>

        {/* DXF Upload */}
        <DXFUploader
          onImport={(lines, nx, ny) => {
            setPatternGrid(nx, ny);
            setCustomStitchLines(lines);
            setPatternSource('custom');
          }}
        />
      </div>

      {/* SVG canvas */}
      <div className="flex-1 relative min-h-0 overflow-hidden">
        {/* Edit lock overlay */}
        {patternSource === 'custom' && !isEditable && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10 pointer-events-none">
            <div className="text-center text-white text-sm px-4">
              <div className="text-2xl mb-1">🔒</div>
              <div>スライダーを Flat まで移動してから編集</div>
              <div className="text-xs opacity-70 mt-0.5">Move slider to Flat to edit</div>
            </div>
          </div>
        )}

        <svg
          ref={svgRef}
          width={svgSize.w}
          height={svgSize.h}
          className="w-full h-full"
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverPoint(null)}
          style={{ cursor: isEditable && patternSource === 'custom' ? 'crosshair' : 'default' }}
        >
          {/* Grid dots */}
          {Array.from({ length: ny }, (_, gy) =>
            Array.from({ length: nx }, (_, gx) => {
              const [px, py] = gp(gx, gy);
              return (
                <circle
                  key={`${gx}-${gy}`}
                  cx={px} cy={py} r={2.5}
                  fill="var(--text-muted)"
                  opacity={0.5}
                />
              );
            })
          )}

          {/* Grid lines (light) for square */}
          {gridType === 'square' && Array.from({ length: ny }, (_, gy) => {
            const [x0, y0] = gp(0, gy);
            const [x1, y1] = gp(nx - 1, gy);
            return <line key={`h${gy}`} x1={x0} y1={y0} x2={x1} y2={y1}
              stroke="var(--border)" strokeWidth={0.5} opacity={0.3} />;
          })}
          {gridType === 'square' && Array.from({ length: nx }, (_, gx) => {
            const [x0, y0] = gp(gx, 0);
            const [x1, y1] = gp(gx, ny - 1);
            return <line key={`v${gx}`} x1={x0} y1={y0} x2={x1} y2={y1}
              stroke="var(--border)" strokeWidth={0.5} opacity={0.3} />;
          })}

          {/* Completed stitch lines */}
          {displayLines.map((line, li) => (
            <g key={li}>
              <polyline
                points={linePoints(line)}
                fill="none"
                stroke={LINE_COLORS[li % LINE_COLORS.length]}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {line.map(([gx, gy], pi) => {
                const [px, py] = gp(gx, gy);
                return (
                  <circle
                    key={pi}
                    cx={px} cy={py} r={5}
                    fill={LINE_COLORS[li % LINE_COLORS.length]}
                    stroke="var(--bg-panel)"
                    strokeWidth={1.5}
                  />
                );
              })}
            </g>
          ))}

          {/* Line being drawn */}
          {drawingLine && drawingLine.length > 0 && (
            <g>
              <polyline
                points={linePoints(drawingLine)}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2.5}
                strokeDasharray="6 3"
                strokeLinecap="round"
              />
              {drawingLine.map(([gx, gy], pi) => {
                const [px, py] = gp(gx, gy);
                return (
                  <circle key={pi} cx={px} cy={py} r={5}
                    fill="var(--accent)" stroke="var(--bg-panel)" strokeWidth={1.5} />
                );
              })}
              {/* Preview to hover point */}
              {hoverPoint && (() => {
                const last = drawingLine[drawingLine.length - 1];
                const [lx, ly] = gp(last[0], last[1]);
                const [hx, hy] = gp(hoverPoint[0], hoverPoint[1]);
                return <line x1={lx} y1={ly} x2={hx} y2={hy}
                  stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.6} />;
              })()}
            </g>
          )}

          {/* Hover highlight */}
          {hoverPoint && isEditable && patternSource === 'custom' && (() => {
            const [px, py] = gp(hoverPoint[0], hoverPoint[1]);
            return <circle cx={px} cy={py} r={8}
              fill="var(--accent)" opacity={0.25} stroke="var(--accent)" strokeWidth={1.5} />;
          })()}
        </svg>

        {/* Draw toolbar (bottom of canvas) */}
        {patternSource === 'custom' && isEditable && (
          <div className="absolute bottom-2 left-2 right-2 flex gap-1 justify-center">
            {drawingLine && drawingLine.length >= 2 && (
              <Button size="sm" variant="primary" onClick={finishLine}>
                ✅ Finish Line
              </Button>
            )}
            {drawingLine && (
              <Button size="sm" variant="secondary" onClick={() => setDrawingLine(null)}>
                Cancel
              </Button>
            )}
            {!drawingLine && customStitchLines.length > 0 && (
              <Button size="sm" variant="secondary" onClick={deleteLast}>
                ↩ Undo
              </Button>
            )}
            {!drawingLine && customStitchLines.length > 0 && (
              <Button size="sm" variant="secondary" onClick={clearAll}>
                🗑 Clear
              </Button>
            )}
            {!drawingLine && (
              <span className="text-xs text-[var(--text-muted)] self-center ml-1">
                Click points to draw · Double-click or Enter to finish
              </span>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

// ── DXF Uploader ──────────────────────────────────────────────────────────────
interface DXFUploaderProps {
  onImport: (lines: StitchLine[], nx: number, ny: number) => void;
}

function DXFUploader({ onImport }: DXFUploaderProps) {
  const [status, setStatus] = useState<string>('');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus('Parsing...');
    try {
      const text = await file.text();
      // Dynamic import to avoid SSR issues
      const DxfParser = (await import('dxf-parser')).default;
      const parser = new DxfParser();
      const dxf = parser.parseSync(text);
      const entities = dxf?.entities ?? [];

      // Find fold/stitch layer entities
      const foldEntities = entities.filter((e: { layer?: string }) =>
        e.layer?.toLowerCase().match(/fold|stitch|smock|sewing/)
      );
      const outlineEntities = entities.filter((e: { layer?: string }) =>
        e.layer?.toLowerCase().match(/outline|border|fabric|cloth|外周/)
      );

      if (foldEntities.length === 0) {
        setStatus('⚠ No fold/stitch layer found. Layers: ' +
          [...new Set(entities.map((e: { layer?: string }) => e.layer))].join(', '));
        return;
      }

      // Determine grid bounds from outline or all entities
      const allPts: [number, number][] = [];
      ;[...foldEntities, ...outlineEntities].forEach((e: {
        type?: string;
        vertices?: { x: number; y: number }[];
        start?: { x: number; y: number };
        end?: { x: number; y: number };
      }) => {
        if (e.type === 'LINE') {
          if (e.start) allPts.push([e.start.x, e.start.y]);
          if (e.end) allPts.push([e.end.x, e.end.y]);
        } else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
          (e.vertices ?? []).forEach((v: { x: number; y: number }) => allPts.push([v.x, v.y]));
        }
      });

      if (allPts.length === 0) { setStatus('⚠ No vertices found'); return; }

      const xs = allPts.map(p => p[0]), ys = allPts.map(p => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;

      // Infer grid size
      const nx = Math.max(3, Math.round(rangeX) + 1);
      const ny = Math.max(3, Math.round(rangeY) + 1);

      // Convert fold entities to stitch lines (grid coords)
      const stitchLines: StitchLine[] = [];
      for (const e of foldEntities as {
        type?: string;
        vertices?: { x: number; y: number }[];
        start?: { x: number; y: number };
        end?: { x: number; y: number };
      }[]) {
        let pts: [number, number][] = [];
        if (e.type === 'LINE') {
          if (e.start && e.end) {
            pts = [
              [Math.round((e.start.x - minX)), Math.round((e.start.y - minY))],
              [Math.round((e.end.x - minX)), Math.round((e.end.y - minY))],
            ];
          }
        } else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
          pts = (e.vertices ?? []).map((v: { x: number; y: number }) => [
            Math.round((v.x - minX)),
            Math.round((v.y - minY)),
          ]);
        }
        // Clamp to grid
        pts = pts
          .map(([gx, gy]): [number, number] => [
            Math.max(0, Math.min(nx - 1, gx)),
            Math.max(0, Math.min(ny - 1, gy)),
          ])
          .filter(([gx, gy], i, arr) =>
            i === 0 || gx !== arr[i-1][0] || gy !== arr[i-1][1]
          );
        if (pts.length >= 2) stitchLines.push(pts);
      }

      onImport(stitchLines, nx, ny);
      setStatus(`✅ Imported ${stitchLines.length} lines (${nx}×${ny} grid)`);
    } catch (err) {
      setStatus(`❌ Parse error: ${err}`);
    }
    e.target.value = '';
  };

  return (
    <div>
      <label className="flex items-center gap-2 cursor-pointer">
        <span className="text-xs px-2 py-1 rounded border border-[var(--border)]
          text-[var(--text-secondary)] hover:border-[var(--accent)] transition-colors whitespace-nowrap">
          📂 Upload DXF
        </span>
        <input type="file" accept=".dxf" onChange={handleFile} className="hidden" />
      </label>
      {status && (
        <div className="text-[10px] text-[var(--text-muted)] mt-1 leading-tight">{status}</div>
      )}
    </div>
  );
}
