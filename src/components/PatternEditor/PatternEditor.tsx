/**
 * PatternEditor — Full-cloth view with repeat-unit editor
 *
 * Layout:
 *  - Large SVG canvas shows the FULL cloth (all tiled repeats)
 *  - The repeat unit (one tile) is highlighted with a bright border
 *  - User draws stitch lines WITHIN the unit cell
 *  - Pattern auto-tiles to fill the cloth
 *  - Resize the unit cell by dragging its right/bottom edge
 *
 * Modes:
 *  - Preset: select Arrow/Leaf/Braid/etc. — shown as colored lines
 *  - Draw: click grid points inside unit cell to create stitch lines
 *
 * Edit is locked when gary < 1 (slider not fully flat)
 */

import {
  useRef, useState, useCallback, useEffect, useMemo,
} from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Panel, Button } from '../ui';
import { PATTERNS } from '../../engine/patterns';
import { generateTiledPattern } from '../../engine/tangram';
import type { StitchLine, PatternPreset, GridType } from '../../types';

const LINE_COLORS = [
  '#4a9eff', '#ff6b6b', '#51cf66', '#ffd43b',
  '#cc5de8', '#ff8cc8', '#20c997', '#f76707',
];

const PRESET_NAMES = Object.keys(PATTERNS) as PatternPreset[];

/** Convert pattern-def stitch lines (coord-pair arrays) to StitchLine[] */
function presetToLines(name: PatternPreset): StitchLine[] {
  return PATTERNS[name].stitchingLines.map(sl => sl as StitchLine);
}

/** Grid point SVG position for a given grid type */
function gPos(
  gx: number, gy: number,
  gridType: GridType,
  cellPx: number,
  padX: number, padY: number,
): [number, number] {
  if (gridType === 'square') {
    return [padX + gx * cellPx, padY + gy * cellPx];
  }
  const xOff = gy % 2 === 1 ? cellPx * 0.5 : 0;
  return [padX + gx * cellPx + xOff, padY + gy * cellPx * (Math.sqrt(3) / 2)];
}

/** Snap SVG coords to nearest grid point within the unit cell */
function snapInCell(
  svgX: number, svgY: number,
  nx: number, ny: number,
  gridType: GridType,
  cellPx: number, padX: number, padY: number,
): [number, number] | null {
  let best = Infinity, bx = -1, by = -1;
  for (let gy = 0; gy < ny; gy++) {
    for (let gx = 0; gx < nx; gx++) {
      const [px, py] = gPos(gx, gy, gridType, cellPx, padX, padY);
      const d = Math.hypot(svgX - px, svgY - py);
      if (d < best) { best = d; bx = gx; by = gy; }
    }
  }
  return best < cellPx * 0.55 ? [bx, by] : null;
}

export function PatternEditor() {
  const {
    gary,
    patternSource, setPatternSource,
    customStitchLines, setCustomStitchLines,
    patternGridNx, patternGridNy, setPatternGrid,
    gridType, setGridType,
    selectedPattern, setSelectedPattern,
    tilingU, tilingV, setTilingU, setTilingV,
    setTiledPattern,
  } = useAppStore();

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgSize, setSvgSize] = useState({ w: 400, h: 400 });
  const [drawingLine, setDrawingLine] = useState<StitchLine | null>(null);
  const [hoverPt, setHoverPt] = useState<[number, number] | null>(null);

  /** Resize handle drag state */
  const [dragging, setDragging] = useState<'col' | 'row' | null>(null);

  const isEditable = gary >= 0.99;

  // Track container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(e => {
      const { width, height } = e[0].contentRect;
      setSvgSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Grid layout — fit the FULL tiled cloth
  const nx = patternGridNx, ny = patternGridNy;
  const fullNx = (nx - 1) * tilingU + 1;
  const fullNy = (ny - 1) * tilingV + 1;
  const pad = 20;
  const rowH = gridType === 'triangle' ? Math.sqrt(3) / 2 : 1;
  const cellPx = Math.min(
    (svgSize.w - pad * 2) / (fullNx - 1),
    (svgSize.h - pad * 2) / ((fullNy - 1) * rowH),
  );
  const padX = (svgSize.w - cellPx * (fullNx - 1)) / 2;
  const padY = (svgSize.h - cellPx * (fullNy - 1) * rowH) / 2;

  const gp = useCallback(
    (gx: number, gy: number): [number, number] =>
      gPos(gx, gy, gridType, cellPx, padX, padY),
    [gridType, cellPx, padX, padY],
  );

  // Active stitch lines in unit cell
  const unitLines: StitchLine[] =
    patternSource === 'preset' ? presetToLines(selectedPattern) : customStitchLines;

  // All tiled stitch lines for display
  const tiledDisplayLines = useMemo(() => {
    const all: { line: StitchLine; tile: [number, number] }[] = [];
    for (let v = 0; v < tilingV; v++) {
      for (let u = 0; u < tilingU; u++) {
        for (const line of unitLines) {
          const tiled = line.map(
            ([gx, gy]): [number, number] => [gx + u * (nx - 1), gy + v * (ny - 1)],
          );
          all.push({ line: tiled, tile: [u, v] });
        }
      }
    }
    return all;
  }, [unitLines, tilingU, tilingV, nx, ny]);

  // Sync tiledPattern to store whenever params change
  useEffect(() => {
    let patternDef;
    if (patternSource === 'preset') {
      patternDef = PATTERNS[selectedPattern];
    } else {
      patternDef = {
        name: 'Arrow' as PatternPreset,
        nx,
        ny,
        stitchingLines: customStitchLines,
      };
    }
    setTiledPattern(generateTiledPattern(patternDef, tilingU, tilingV));
  }, [patternSource, selectedPattern, customStitchLines, nx, ny, tilingU, tilingV, setTiledPattern]);

  // Unit cell SVG boundary corners
  const unitRight = padX + (nx - 1) * cellPx;
  const unitBottom = padY + (ny - 1) * rowH * cellPx;

  // ── SVG interaction ────────────────────────────────────────────────────────
  const getSVGCoords = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const coords = getSVGCoords(e);
    if (!coords) return;

    // Handle resize drag
    if (dragging === 'col') {
      const newNx = Math.max(2, Math.round((coords.x - padX) / cellPx) + 1);
      if (newNx !== nx) setPatternGrid(newNx, ny);
      return;
    }
    if (dragging === 'row') {
      const newNy = Math.max(2, Math.round((coords.y - padY) / (rowH * cellPx)) + 1);
      if (newNy !== ny) setPatternGrid(nx, newNy);
      return;
    }

    if (!isEditable || patternSource !== 'custom') { setHoverPt(null); return; }
    setHoverPt(snapInCell(coords.x, coords.y, nx, ny, gridType, cellPx, padX, padY));
  };

  const handleMouseUp = () => setDragging(null);

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (dragging) return;
    if (!isEditable || patternSource !== 'custom') return;
    const coords = getSVGCoords(e);
    if (!coords) return;
    const snapped = snapInCell(coords.x, coords.y, nx, ny, gridType, cellPx, padX, padY);
    if (!snapped) return;

    setDrawingLine(prev => {
      if (!prev) return [snapped];
      const last = prev[prev.length - 1];
      const same = last[0] === snapped[0] && last[1] === snapped[1];
      const already = prev.some(p => p[0] === snapped[0] && p[1] === snapped[1]);
      if (same || already) {
        if (prev.length >= 2) setCustomStitchLines([...customStitchLines, prev]);
        return null;
      }
      return [...prev, snapped];
    });
  };

  const handleDblClick = (e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    finishLine();
  };

  const finishLine = useCallback(() => {
    if (drawingLine && drawingLine.length >= 2) {
      setCustomStitchLines([...customStitchLines, drawingLine]);
    }
    setDrawingLine(null);
  }, [drawingLine, customStitchLines, setCustomStitchLines]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') finishLine();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [finishLine]);

  const linePoints = (pts: StitchLine) =>
    pts.map(([gx, gy]) => gp(gx, gy).join(',')).join(' ');

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Panel title="Pattern" noPadding className="h-full flex flex-col">

      {/* ── Top bar: mode + preset strip ───────────────────────────────── */}
      <div className="shrink-0 border-b border-[var(--border)] px-2 py-1.5 space-y-1.5">

        {/* Preset / Draw toggle */}
        <div className="flex gap-1">
          <Button size="sm" variant={patternSource === 'preset' ? 'primary' : 'secondary'}
            onClick={() => setPatternSource('preset')} className="flex-1">Preset</Button>
          <Button size="sm" variant={patternSource === 'custom' ? 'primary' : 'secondary'}
            onClick={() => setPatternSource('custom')} className="flex-1">✏️ Draw</Button>
          {/* Grid type (only in Draw mode) */}
          {patternSource === 'custom' && <>
            <Button size="sm" variant={gridType === 'square' ? 'primary' : 'secondary'}
              onClick={() => setGridType('square')} className="px-2 text-xs">⬛</Button>
            <Button size="sm" variant={gridType === 'triangle' ? 'primary' : 'secondary'}
              onClick={() => setGridType('triangle')} className="px-2 text-xs">🔺</Button>
          </>}
        </div>

        {/* Preset list */}
        {patternSource === 'preset' && (
          <div className="flex flex-wrap gap-1">
            {PRESET_NAMES.map(name => (
              <button key={name}
                onClick={() => setSelectedPattern(name)}
                className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                  selectedPattern === name
                    ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                    : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]'
                }`}>
                {name}
              </button>
            ))}
          </div>
        )}

        {/* DXF upload (Draw mode only) */}
        {patternSource === 'custom' && (
          <DXFUploader onImport={(lines, inx, iny) => {
            setPatternGrid(inx, iny);
            setCustomStitchLines(lines);
          }} />
        )}
      </div>

      {/* ── Full-cloth SVG canvas ───────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 relative min-h-0 overflow-hidden select-none"
      >
        {/* Lock overlay */}
        {patternSource === 'custom' && !isEditable && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10 pointer-events-none">
            <div className="text-center text-white text-sm px-4">
              <div className="text-2xl mb-1">🔒</div>
              <div className="text-xs opacity-80">スライダーを Flat まで移動してから編集</div>
            </div>
          </div>
        )}

        <svg
          ref={svgRef}
          width={svgSize.w}
          height={svgSize.h}
          className="w-full h-full"
          onClick={handleClick}
          onDoubleClick={handleDblClick}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { setHoverPt(null); setDragging(null); }}
          style={{ cursor: dragging ? 'ew-resize' : (isEditable && patternSource === 'custom' ? 'crosshair' : 'default') }}
        >
          {/* ── Background grid dots (full cloth) ── */}
          {Array.from({ length: fullNy }, (_, gy) =>
            Array.from({ length: fullNx }, (_, gx) => {
              const [px, py] = gp(gx, gy);
              const inUnit = gx < nx && gy < ny;
              return (
                <circle key={`${gx}-${gy}`}
                  cx={px} cy={py} r={inUnit ? 2.5 : 1.8}
                  fill={inUnit ? 'var(--text-secondary)' : 'var(--text-muted)'}
                  opacity={inUnit ? 0.7 : 0.3}
                />
              );
            })
          )}

          {/* ── Tile separators (faint lines) ── */}
          {Array.from({ length: tilingV + 1 }, (_, v) => {
            const gy = v * (ny - 1);
            if (gy >= fullNy) return null;
            const [x0, y0] = gp(0, gy);
            const [x1, y1] = gp(fullNx - 1, gy);
            return <line key={`hr${v}`} x1={x0} y1={y0} x2={x1} y2={y1}
              stroke="var(--border)" strokeWidth={v === 0 || v === tilingV ? 0 : 0.5} opacity={0.3} />;
          })}
          {Array.from({ length: tilingU + 1 }, (_, u) => {
            const gx = u * (nx - 1);
            if (gx >= fullNx) return null;
            const [x0, y0] = gp(gx, 0);
            const [x1, y1] = gp(gx, fullNy - 1);
            return <line key={`vc${u}`} x1={x0} y1={y0} x2={x1} y2={y1}
              stroke="var(--border)" strokeWidth={u === 0 || u === tilingU ? 0 : 0.5} opacity={0.3} />;
          })}

          {/* ── Tiled stitch lines (ghost copies) ── */}
          {tiledDisplayLines.map(({ line, tile: [u, v] }, li) => {
            const isOrigin = u === 0 && v === 0;
            const color = LINE_COLORS[(Math.floor(li / (tilingU * tilingV))) % LINE_COLORS.length];
            return (
              <g key={li}>
                <polyline
                  points={linePoints(line)}
                  fill="none"
                  stroke={color}
                  strokeWidth={isOrigin ? 2.5 : 1.5}
                  strokeOpacity={isOrigin ? 1 : 0.35}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {isOrigin && line.map(([gx, gy], pi) => {
                  const [px, py] = gp(gx, gy);
                  return <circle key={pi} cx={px} cy={py} r={4.5}
                    fill={color} stroke="var(--bg-panel)" strokeWidth={1.5} />;
                })}
              </g>
            );
          })}

          {/* ── In-progress drawing line ── */}
          {drawingLine && drawingLine.length > 0 && (
            <g>
              <polyline points={linePoints(drawingLine)}
                fill="none" stroke="var(--accent)" strokeWidth={2.5}
                strokeDasharray="6 3" strokeLinecap="round" />
              {drawingLine.map(([gx, gy], pi) => {
                const [px, py] = gp(gx, gy);
                return <circle key={pi} cx={px} cy={py} r={4.5}
                  fill="var(--accent)" stroke="var(--bg-panel)" strokeWidth={1.5} />;
              })}
              {hoverPt && (() => {
                const last = drawingLine[drawingLine.length - 1];
                const [lx, ly] = gp(last[0], last[1]);
                const [hx, hy] = gp(hoverPt[0], hoverPt[1]);
                return <line x1={lx} y1={ly} x2={hx} y2={hy}
                  stroke="var(--accent)" strokeWidth={1.5}
                  strokeDasharray="4 3" opacity={0.6} />;
              })()}
            </g>
          )}

          {/* ── Hover highlight ── */}
          {hoverPt && isEditable && patternSource === 'custom' && (() => {
            const [px, py] = gp(hoverPt[0], hoverPt[1]);
            return <circle cx={px} cy={py} r={9}
              fill="var(--accent)" fillOpacity={0.2}
              stroke="var(--accent)" strokeWidth={1.5} />;
          })()}

          {/* ── Unit cell highlight border ── */}
          <rect
            x={padX - 3}
            y={padY - 3}
            width={(nx - 1) * cellPx + 6}
            height={(ny - 1) * rowH * cellPx + 6}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeDasharray="8 4"
            rx={3}
            pointerEvents="none"
          />

          {/* ── Resize handles (right edge, bottom edge) ── */}
          {/* Right: drag to change nx */}
          <rect
            x={unitRight - 4}
            y={padY - 3}
            width={12}
            height={(ny - 1) * rowH * cellPx + 6}
            fill="var(--accent)"
            fillOpacity={0.2}
            stroke="var(--accent)"
            strokeWidth={1}
            rx={2}
            style={{ cursor: 'ew-resize' }}
            onMouseDown={e => { e.stopPropagation(); setDragging('col'); }}
          />
          {/* Bottom: drag to change ny */}
          <rect
            x={padX - 3}
            y={unitBottom - 4}
            width={(nx - 1) * cellPx + 6}
            height={12}
            fill="var(--accent)"
            fillOpacity={0.2}
            stroke="var(--accent)"
            strokeWidth={1}
            rx={2}
            style={{ cursor: 'ns-resize' }}
            onMouseDown={e => { e.stopPropagation(); setDragging('row'); }}
          />

          {/* Tiling count label */}
          <text x={padX + (nx - 1) * cellPx / 2} y={padY - 8}
            textAnchor="middle" fontSize={10} fill="var(--accent)" opacity={0.8}>
            {nx}×{ny}  ↻ {tilingU}×{tilingV}
          </text>
        </svg>

        {/* ── Draw toolbar ── */}
        {patternSource === 'custom' && isEditable && (
          <div className="absolute bottom-2 left-2 right-2 flex gap-1 flex-wrap justify-center">
            {drawingLine && drawingLine.length >= 2 && (
              <Button size="sm" variant="primary" onClick={finishLine}>✅ Finish</Button>
            )}
            {drawingLine && (
              <Button size="sm" variant="secondary" onClick={() => setDrawingLine(null)}>✕</Button>
            )}
            {!drawingLine && customStitchLines.length > 0 && (
              <Button size="sm" variant="secondary"
                onClick={() => setCustomStitchLines(customStitchLines.slice(0, -1))}>↩ Undo</Button>
            )}
            {!drawingLine && customStitchLines.length > 0 && (
              <Button size="sm" variant="secondary"
                onClick={() => { setDrawingLine(null); setCustomStitchLines([]); }}>🗑 Clear</Button>
            )}
            {!drawingLine && (
              <span className="text-[10px] text-[var(--text-muted)] self-center">
                Click points to draw · double-click or Enter to finish
              </span>
            )}
          </div>
        )}

        {/* Tiling controls (bottom-right corner) */}
        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
          <div className="flex items-center gap-1 bg-[var(--bg-panel)]/80 rounded px-1.5 py-0.5">
            <span className="text-[10px] text-[var(--text-muted)]">U</span>
            <button onClick={() => setTilingU(Math.max(1, tilingU - 1))}
              className="text-xs text-[var(--text-secondary)] hover:text-white w-4">−</button>
            <span className="text-xs text-[var(--accent)] w-4 text-center">{tilingU}</span>
            <button onClick={() => setTilingU(Math.min(10, tilingU + 1))}
              className="text-xs text-[var(--text-secondary)] hover:text-white w-4">＋</button>
          </div>
          <div className="flex items-center gap-1 bg-[var(--bg-panel)]/80 rounded px-1.5 py-0.5">
            <span className="text-[10px] text-[var(--text-muted)]">V</span>
            <button onClick={() => setTilingV(Math.max(1, tilingV - 1))}
              className="text-xs text-[var(--text-secondary)] hover:text-white w-4">−</button>
            <span className="text-xs text-[var(--accent)] w-4 text-center">{tilingV}</span>
            <button onClick={() => setTilingV(Math.min(10, tilingV + 1))}
              className="text-xs text-[var(--text-secondary)] hover:text-white w-4">＋</button>
          </div>
        </div>
      </div>
    </Panel>
  );
}

// ── DXF Uploader ──────────────────────────────────────────────────────────────
interface DXFUploaderProps {
  onImport: (lines: StitchLine[], nx: number, ny: number) => void;
}

function DXFUploader({ onImport }: DXFUploaderProps) {
  const [status, setStatus] = useState('');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus('Parsing…');
    try {
      const text = await file.text();
      const DxfParser = (await import('dxf-parser')).default;
      const parser = new DxfParser();
      const dxf = parser.parseSync(text);
      const entities = dxf?.entities ?? [];

      const isFold = (l?: string) => !!l?.toLowerCase().match(/fold|stitch|smock|sew/);
      const foldEnt = entities.filter((e: { layer?: string }) => isFold(e.layer));

      if (foldEnt.length === 0) {
        const layers = [...new Set(entities.map((e: { layer?: string }) => e.layer))].join(', ');
        setStatus(`⚠ No fold layer. Found: ${layers}`);
        return;
      }

      type DXFEntity = { type?: string; start?: {x:number;y:number}; end?: {x:number;y:number}; vertices?: {x:number;y:number}[]; layer?: string };

      const allPts: [number, number][] = [];
      foldEnt.forEach((e: DXFEntity) => {
        if (e.type === 'LINE') { if (e.start) allPts.push([e.start.x, e.start.y]); if (e.end) allPts.push([e.end.x, e.end.y]); }
        else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE')
          (e.vertices ?? []).forEach((v: {x:number;y:number}) => allPts.push([v.x, v.y]));
      });
      if (!allPts.length) { setStatus('⚠ No vertices'); return; }

      const xs = allPts.map(p => p[0]), ys = allPts.map(p => p[1]);
      const minX = Math.min(...xs), minY = Math.min(...ys);
      const maxX = Math.max(...xs), maxY = Math.max(...ys);
      const nx = Math.max(3, Math.round(maxX - minX) + 1);
      const ny = Math.max(3, Math.round(maxY - minY) + 1);

      const lines: StitchLine[] = [];
      for (const e of foldEnt as DXFEntity[]) {
        let pts: [number, number][] = [];
        if (e.type === 'LINE' && e.start && e.end) {
          pts = [[Math.round(e.start.x-minX), Math.round(e.start.y-minY)],
                 [Math.round(e.end.x-minX),   Math.round(e.end.y-minY)]];
        } else if ((e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && e.vertices) {
          pts = e.vertices.map(v => [Math.round(v.x-minX), Math.round(v.y-minY)] as [number,number]);
        }
        pts = pts.map(([gx,gy]): [number,number] => [
          Math.max(0, Math.min(nx-1, gx)),
          Math.max(0, Math.min(ny-1, gy)),
        ]).filter(([gx,gy], i, a) => i===0||gx!==a[i-1][0]||gy!==a[i-1][1]);
        if (pts.length >= 2) lines.push(pts);
      }
      onImport(lines, nx, ny);
      setStatus(`✅ ${lines.length} lines (${nx}×${ny})`);
    } catch (err) {
      setStatus(`❌ ${err}`);
    }
    e.target.value = '';
  };

  return (
    <div className="flex items-center gap-2">
      <label className="cursor-pointer">
        <span className="text-xs px-2 py-1 rounded border border-[var(--border)]
          text-[var(--text-secondary)] hover:border-[var(--accent)] transition-colors">
          📂 DXF
        </span>
        <input type="file" accept=".dxf" onChange={handleFile} className="hidden" />
      </label>
      {status && <span className="text-[10px] text-[var(--text-muted)]">{status}</span>}
    </div>
  );
}
