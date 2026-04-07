/**
 * PatternEditor — Full-cloth view with draggable repeat-unit cell
 *
 * Bugs fixed:
 * - Stale closure on drag → use document-level events + frozen cellPx ref
 * - Preset mode uses PATTERNS[selectedPattern].nx/ny (not store values)
 * - Top bar condensed to single row
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

function presetToLines(name: PatternPreset): StitchLine[] {
  return PATTERNS[name].stitchingLines.map(sl => sl as StitchLine);
}

function gPos(gx: number, gy: number, gridType: GridType, cellPx: number, padX: number, padY: number): [number, number] {
  if (gridType === 'square') return [padX + gx * cellPx, padY + gy * cellPx];
  const xOff = gy % 2 === 1 ? cellPx * 0.5 : 0;
  return [padX + gx * cellPx + xOff, padY + gy * cellPx * (Math.sqrt(3) / 2)];
}

function snapInCell(svgX: number, svgY: number, nx: number, ny: number, gridType: GridType, cellPx: number, padX: number, padY: number): [number, number] | null {
  let best = Infinity, bx = -1, by = -1;
  for (let gy = 0; gy < ny; gy++) for (let gx = 0; gx < nx; gx++) {
    const [px, py] = gPos(gx, gy, gridType, cellPx, padX, padY);
    const d = Math.hypot(svgX - px, svgY - py);
    if (d < best) { best = d; bx = gx; by = gy; }
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

  // Drag resize: use refs to avoid stale closure
  const dragRef = useRef<{
    type: 'col' | 'row';
    startSvgX: number; startSvgY: number;
    startNx: number;   startNy: number;
    frozenCellPx: number;
    frozenPadX: number; frozenPadY: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const isEditable = gary >= 0.99;

  // Unit cell dimensions: preset uses pattern's own nx/ny; custom uses store
  const nx = patternSource === 'preset' ? PATTERNS[selectedPattern].nx : patternGridNx;
  const ny = patternSource === 'preset' ? PATTERNS[selectedPattern].ny : patternGridNy;
  const rowH = gridType === 'triangle' ? Math.sqrt(3) / 2 : 1;

  // Container size tracking
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

  // Grid layout: fit FULL tiled cloth in canvas
  const fullNx = (nx - 1) * tilingU + 1;
  const fullNy = (ny - 1) * tilingV + 1;
  const pad = 24;
  const cellPx = Math.min(
    (svgSize.w - pad * 2) / Math.max(1, fullNx - 1),
    (svgSize.h - pad * 2) / Math.max(1, (fullNy - 1) * rowH),
  );
  const padX = (svgSize.w - cellPx * (fullNx - 1)) / 2;
  const padY = (svgSize.h - cellPx * (fullNy - 1) * rowH) / 2;

  // Keep refs current for document-level events (avoids stale closure)
  const layoutRef = useRef({ cellPx, padX, padY, nx, ny });
  layoutRef.current = { cellPx, padX, padY, nx, ny };

  const gp = useCallback(
    (gx: number, gy: number) => gPos(gx, gy, gridType, cellPx, padX, padY),
    [gridType, cellPx, padX, padY],
  );

  // Stitch lines for unit cell
  const unitLines: StitchLine[] =
    patternSource === 'preset' ? presetToLines(selectedPattern) : customStitchLines;

  // All tiled lines for display
  const tiledDisplayLines = useMemo(() => {
    const all: { line: StitchLine; isOrigin: boolean; colorIdx: number }[] = [];
    for (let v = 0; v < tilingV; v++) for (let u = 0; u < tilingU; u++) {
      unitLines.forEach((line, li) => {
        all.push({
          line: line.map(([gx, gy]): [number, number] => [gx + u * (nx - 1), gy + v * (ny - 1)]),
          isOrigin: u === 0 && v === 0,
          colorIdx: li % LINE_COLORS.length,
        });
      });
    }
    return all;
  }, [unitLines, tilingU, tilingV, nx, ny]);

  // Sync to store
  useEffect(() => {
    const def = patternSource === 'preset'
      ? PATTERNS[selectedPattern]
      : { name: 'Arrow' as PatternPreset, nx, ny, stitchingLines: customStitchLines };
    setTiledPattern(generateTiledPattern(def, tilingU, tilingV));
  }, [patternSource, selectedPattern, customStitchLines, nx, ny, tilingU, tilingV, setTiledPattern]);

  // ── Document-level drag events (no stale closure) ────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const svgX = e.clientX - rect.left;
      const svgY = e.clientY - rect.top;
      const { type, frozenCellPx, frozenPadX, frozenPadY, startNx, startNy } = dragRef.current;

      if (type === 'col') {
        const newNx = Math.max(2, Math.min(20, Math.round((svgX - frozenPadX) / frozenCellPx) + 1));
        if (newNx !== startNx) setPatternGrid(newNx, startNy);
        dragRef.current.startNx = newNx;
      } else {
        const newNy = Math.max(2, Math.min(20, Math.round((svgY - frozenPadY) / (rowH * frozenCellPx)) + 1));
        if (newNy !== startNy) setPatternGrid(startNx, newNy);
        dragRef.current.startNy = newNy;
      }
    };
    const onUp = () => { dragRef.current = null; setIsDragging(false); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [rowH, setPatternGrid]);

  const startDrag = (type: 'col' | 'row', e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const { cellPx: cp, padX: px, padY: py, nx: cnx, ny: cny } = layoutRef.current;
    dragRef.current = {
      type,
      startSvgX: e.clientX, startSvgY: e.clientY,
      startNx: cnx, startNy: cny,
      frozenCellPx: cp, frozenPadX: px, frozenPadY: py,
    };
    setIsDragging(true);
  };

  // ── SVG interaction ───────────────────────────────────────────────────────
  const getSVGCoords = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isEditable || patternSource !== 'custom' || isDragging) { setHoverPt(null); return; }
    const coords = getSVGCoords(e);
    if (!coords) return;
    setHoverPt(snapInCell(coords.x, coords.y, nx, ny, gridType, cellPx, padX, padY));
  };

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isDragging || !isEditable || patternSource !== 'custom') return;
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

  const finishLine = useCallback(() => {
    if (drawingLine && drawingLine.length >= 2)
      setCustomStitchLines([...customStitchLines, drawingLine]);
    setDrawingLine(null);
  }, [drawingLine, customStitchLines, setCustomStitchLines]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter') finishLine(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [finishLine]);

  const linePoints = (pts: StitchLine) => pts.map(([gx, gy]) => gp(gx, gy).join(',')).join(' ');

  const unitRight  = padX + (nx - 1) * cellPx;
  const unitBottom = padY + (ny - 1) * rowH * cellPx;

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <Panel title="Pattern" noPadding className="h-full flex flex-col">

      {/* ── SINGLE-ROW top bar ──────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-[var(--border)] px-2 py-1 flex items-center gap-1.5 flex-wrap">

        {/* Preset / Draw */}
        <Button size="sm" variant={patternSource === 'preset' ? 'primary' : 'secondary'}
          onClick={() => setPatternSource('preset')}>Preset</Button>
        <Button size="sm" variant={patternSource === 'custom' ? 'primary' : 'secondary'}
          onClick={() => setPatternSource('custom')}>✏️ Draw</Button>

        <div className="w-px h-5 bg-[var(--border)]" />

        {/* Preset selector (inline horizontal scroll) */}
        {patternSource === 'preset' && (
          <div className="flex gap-1 overflow-x-auto flex-nowrap">
            {PRESET_NAMES.map(name => (
              <button key={name}
                onClick={() => setSelectedPattern(name)}
                className={`px-2 py-0.5 text-xs rounded border whitespace-nowrap transition-colors ${
                  selectedPattern === name
                    ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                    : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]'
                }`}>
                {name}
              </button>
            ))}
          </div>
        )}

        {/* Draw: grid type + DXF */}
        {patternSource === 'custom' && <>
          <Button size="sm" variant={gridType === 'square' ? 'primary' : 'secondary'}
            onClick={() => setGridType('square')} className="px-2">⬛</Button>
          <Button size="sm" variant={gridType === 'triangle' ? 'primary' : 'secondary'}
            onClick={() => setGridType('triangle')} className="px-2">🔺</Button>
          <DXFUploader onImport={(lines, inx, iny) => {
            setPatternGrid(inx, iny);
            setCustomStitchLines(lines);
          }} />
        </>}
      </div>

      {/* ── Full-cloth SVG canvas ───────────────────────────────────────── */}
      <div ref={containerRef} className="flex-1 relative min-h-0 overflow-hidden select-none">

        {/* Lock overlay */}
        {patternSource === 'custom' && !isEditable && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10 pointer-events-none">
            <div className="text-center text-white">
              <div className="text-2xl mb-1">🔒</div>
              <div className="text-xs opacity-80">スライダーを Flat まで移動してから編集</div>
            </div>
          </div>
        )}

        <svg ref={svgRef} width={svgSize.w} height={svgSize.h} className="w-full h-full"
          onClick={handleClick}
          onDoubleClick={e => { e.preventDefault(); finishLine(); }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverPt(null)}
          style={{ cursor: isDragging ? 'crosshair' : (isEditable && patternSource === 'custom' ? 'crosshair' : 'default') }}
        >
          {/* Grid dots (full cloth) */}
          {Array.from({ length: fullNy }, (_, gy) =>
            Array.from({ length: fullNx }, (_, gx) => {
              const [px, py] = gp(gx, gy);
              const inUnit = gx < nx && gy < ny;
              return <circle key={`${gx}-${gy}`} cx={px} cy={py}
                r={inUnit ? 2.5 : 1.5}
                fill={inUnit ? 'var(--text-secondary)' : 'var(--text-muted)'}
                opacity={inUnit ? 0.75 : 0.28} />;
            })
          )}

          {/* Tile dividers */}
          {Array.from({ length: tilingU - 1 }, (_, u) => {
            const gx = (u + 1) * (nx - 1);
            const [x0, y0] = gp(gx, 0), [x1, y1] = gp(gx, fullNy - 1);
            return <line key={`cu${u}`} x1={x0} y1={y0} x2={x1} y2={y1}
              stroke="var(--border)" strokeWidth={0.5} opacity={0.4} />;
          })}
          {Array.from({ length: tilingV - 1 }, (_, v) => {
            const gy = (v + 1) * (ny - 1);
            const [x0, y0] = gp(0, gy), [x1, y1] = gp(fullNx - 1, gy);
            return <line key={`rv${v}`} x1={x0} y1={y0} x2={x1} y2={y1}
              stroke="var(--border)" strokeWidth={0.5} opacity={0.4} />;
          })}

          {/* Tiled stitch lines */}
          {tiledDisplayLines.map(({ line, isOrigin, colorIdx }, li) => (
            <g key={li}>
              <polyline points={linePoints(line)} fill="none"
                stroke={LINE_COLORS[colorIdx]}
                strokeWidth={isOrigin ? 2.5 : 1.5}
                strokeOpacity={isOrigin ? 1 : 0.32}
                strokeLinecap="round" strokeLinejoin="round" />
              {isOrigin && line.map(([gx, gy], pi) => {
                const [px, py] = gp(gx, gy);
                return <circle key={pi} cx={px} cy={py} r={4.5}
                  fill={LINE_COLORS[colorIdx]} stroke="var(--bg-panel)" strokeWidth={1.5} />;
              })}
            </g>
          ))}

          {/* Drawing line */}
          {drawingLine && drawingLine.length > 0 && <>
            <polyline points={linePoints(drawingLine)} fill="none"
              stroke="var(--accent)" strokeWidth={2.5}
              strokeDasharray="6 3" strokeLinecap="round" />
            {drawingLine.map(([gx, gy], pi) => {
              const [px, py] = gp(gx, gy);
              return <circle key={pi} cx={px} cy={py} r={4.5}
                fill="var(--accent)" stroke="var(--bg-panel)" strokeWidth={1.5} />;
            })}
            {hoverPt && (() => {
              const [lx, ly] = gp(...drawingLine[drawingLine.length - 1]);
              const [hx, hy] = gp(...hoverPt);
              return <line x1={lx} y1={ly} x2={hx} y2={hy}
                stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.6} />;
            })()}
          </>}

          {/* Hover highlight */}
          {hoverPt && isEditable && patternSource === 'custom' && (() => {
            const [px, py] = gp(...hoverPt);
            return <circle cx={px} cy={py} r={9}
              fill="var(--accent)" fillOpacity={0.2}
              stroke="var(--accent)" strokeWidth={1.5} />;
          })()}

          {/* Unit cell border */}
          <rect x={padX - 4} y={padY - 4}
            width={(nx - 1) * cellPx + 8} height={(ny - 1) * rowH * cellPx + 8}
            fill="none" stroke="var(--accent)" strokeWidth={1.5}
            strokeDasharray="7 4" rx={3} pointerEvents="none" />

          {/* Label */}
          <text x={padX + (nx - 1) * cellPx / 2} y={padY - 10}
            textAnchor="middle" fontSize={10} fill="var(--accent)" opacity={0.8}>
            {nx}×{ny} &nbsp;↻&nbsp; {tilingU}×{tilingV}
          </text>

          {/* ── Resize handles (custom mode only) ── */}
          {patternSource === 'custom' && <>
            {/* Right edge → change nx */}
            <rect x={unitRight - 5} y={padY + 4}
              width={10} height={(ny - 1) * rowH * cellPx - 8}
              fill="var(--accent)" fillOpacity={isDragging ? 0.4 : 0.15}
              stroke="var(--accent)" strokeWidth={1}
              rx={3} style={{ cursor: 'ew-resize' }}
              onMouseDown={e => startDrag('col', e)} />
            <text x={unitRight + 10} y={padY + (ny - 1) * rowH * cellPx / 2}
              fontSize={8} fill="var(--accent)" opacity={0.6}
              dominantBaseline="middle">↔</text>

            {/* Bottom edge → change ny */}
            <rect x={padX + 4} y={unitBottom - 5}
              width={(nx - 1) * cellPx - 8} height={10}
              fill="var(--accent)" fillOpacity={isDragging ? 0.4 : 0.15}
              stroke="var(--accent)" strokeWidth={1}
              rx={3} style={{ cursor: 'ns-resize' }}
              onMouseDown={e => startDrag('row', e)} />
            <text x={padX + (nx - 1) * cellPx / 2} y={unitBottom + 12}
              fontSize={8} fill="var(--accent)" opacity={0.6}
              textAnchor="middle">↕</text>
          </>}
        </svg>

        {/* Tiling +/− controls (top-right) */}
        <div className="absolute top-2 right-2 flex flex-col gap-0.5">
          {[['U', tilingU, setTilingU] as const, ['V', tilingV, setTilingV] as const].map(([label, val, setter]) => (
            <div key={label} className="flex items-center gap-0.5 bg-[var(--bg-panel)]/85 rounded px-1 py-0.5">
              <span className="text-[9px] text-[var(--text-muted)] w-3">{label}</span>
              <button onClick={() => setter(Math.max(1, val - 1))}
                className="text-xs text-[var(--text-secondary)] hover:text-white w-4 leading-none">−</button>
              <span className="text-xs text-[var(--accent)] w-4 text-center">{val}</span>
              <button onClick={() => setter(Math.min(10, val + 1))}
                className="text-xs text-[var(--text-secondary)] hover:text-white w-4 leading-none">＋</button>
            </div>
          ))}
        </div>

        {/* Draw toolbar (bottom) */}
        {patternSource === 'custom' && isEditable && (
          <div className="absolute bottom-2 left-2 right-2 flex gap-1 flex-wrap justify-center">
            {drawingLine && drawingLine.length >= 2 && (
              <Button size="sm" variant="primary" onClick={finishLine}>✅ Finish</Button>)}
            {drawingLine && (
              <Button size="sm" variant="secondary" onClick={() => setDrawingLine(null)}>✕</Button>)}
            {!drawingLine && customStitchLines.length > 0 && <>
              <Button size="sm" variant="secondary"
                onClick={() => setCustomStitchLines(customStitchLines.slice(0, -1))}>↩ Undo</Button>
              <Button size="sm" variant="secondary"
                onClick={() => { setDrawingLine(null); setCustomStitchLines([]); }}>🗑 Clear</Button>
            </>}
            {!drawingLine && (
              <span className="text-[10px] text-[var(--text-muted)] self-center">
                Click points · double-click or Enter to finish
              </span>)}
          </div>
        )}
      </div>
    </Panel>
  );
}

// ── DXF Uploader ─────────────────────────────────────────────────────────────
function DXFUploader({ onImport }: { onImport: (lines: StitchLine[], nx: number, ny: number) => void }) {
  const [status, setStatus] = useState('');
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setStatus('…');
    try {
      const text = await file.text();
      const DxfParser = (await import('dxf-parser')).default;
      const dxf = new DxfParser().parseSync(text);
      const ents = dxf?.entities ?? [];
      type E = { type?:string; layer?:string; start?:{x:number;y:number}; end?:{x:number;y:number}; vertices?:{x:number;y:number}[] };
      const fold = ents.filter((e:E) => !!e.layer?.toLowerCase().match(/fold|stitch|smock|sew/));
      if (!fold.length) { setStatus('⚠ No fold layer'); return; }
      const pts: [number,number][] = [];
      fold.forEach((e:E) => {
        if (e.type==='LINE') { if(e.start)pts.push([e.start.x,e.start.y]); if(e.end)pts.push([e.end.x,e.end.y]); }
        else if (e.type==='LWPOLYLINE'||e.type==='POLYLINE') (e.vertices??[]).forEach(v=>pts.push([v.x,v.y]));
      });
      if (!pts.length) { setStatus('⚠ No points'); return; }
      const minX=Math.min(...pts.map(p=>p[0])), minY=Math.min(...pts.map(p=>p[1]));
      const nx=Math.max(3,Math.round(Math.max(...pts.map(p=>p[0]))-minX)+1);
      const ny=Math.max(3,Math.round(Math.max(...pts.map(p=>p[1]))-minY)+1);
      const lines: StitchLine[] = [];
      for (const e of fold as E[]) {
        let lp: [number,number][] = [];
        if (e.type==='LINE'&&e.start&&e.end)
          lp=[[Math.round(e.start.x-minX),Math.round(e.start.y-minY)],[Math.round(e.end.x-minX),Math.round(e.end.y-minY)]];
        else if ((e.type==='LWPOLYLINE'||e.type==='POLYLINE')&&e.vertices)
          lp=e.vertices.map(v=>[Math.round(v.x-minX),Math.round(v.y-minY)] as [number,number]);
        lp=lp.map(([gx,gy]):[number,number]=>[Math.max(0,Math.min(nx-1,gx)),Math.max(0,Math.min(ny-1,gy))])
             .filter(([gx,gy],i,a)=>i===0||gx!==a[i-1][0]||gy!==a[i-1][1]);
        if (lp.length>=2) lines.push(lp);
      }
      onImport(lines, nx, ny);
      setStatus(`✅${lines.length}`);
    } catch(err) { setStatus(`❌${err}`); }
    e.target.value='';
  };
  return (
    <label className="cursor-pointer flex items-center gap-1.5">
      <span className="text-xs px-2 py-0.5 rounded border border-[var(--border)]
        text-[var(--text-secondary)] hover:border-[var(--accent)] transition-colors whitespace-nowrap">
        📂 DXF
      </span>
      {status && <span className="text-[10px] text-[var(--text-muted)]">{status}</span>}
      <input type="file" accept=".dxf" onChange={handleFile} className="hidden" />
    </label>
  );
}
