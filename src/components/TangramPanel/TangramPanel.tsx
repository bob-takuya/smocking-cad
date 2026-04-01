import { useAppStore } from '../../store/useAppStore';
import { Panel, Slider } from '../ui';
import { TangramSVG } from './TangramSVG';
import { EtaSlider } from './EtaSlider';
import { PatternLibrary } from './PatternLibrary';

export function TangramPanel() {
  const { tilingU, tilingV, setTilingU, setTilingV, selectedPattern, gary } = useAppStore();

  return (
    <Panel
      title={`Tangram - ${selectedPattern}`}
      noPadding
      className="h-full"
    >
      <div className="flex flex-col h-full min-h-0">
        {/* Pattern Library (collapsible) */}
        <div className="border-b border-[var(--border)]">
          <PatternLibrary />
        </div>

        {/* Tiling controls */}
        <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-surface)] flex gap-4">
          <Slider
            label="U Repeat"
            value={tilingU}
            min={1}
            max={10}
            step={1}
            onChange={setTilingU}
            className="flex-1"
          />
          <Slider
            label="V Repeat"
            value={tilingV}
            min={1}
            max={10}
            step={1}
            onChange={setTilingV}
            className="flex-1"
          />
        </div>

        {/* Single SVG Viewer with live η animation */}
        <div className="flex-1 relative overflow-hidden min-h-0" style={{ minHeight: '120px' }}>
          {/* Main live view driven by slider */}
          <TangramSVG mode="current" />

          {/* Current η value overlay */}
          <div className="absolute top-2 right-2 px-2 py-1 bg-[var(--bg-panel)]/90 rounded text-xs z-10">
            <span className="mono text-[var(--text-primary)] tabular-nums font-medium">
              η = {gary.toFixed(2)}
            </span>
            <span className="text-[var(--text-muted)] ml-2">
              {gary >= 0.9 ? '(Open)' : gary <= 0.1 ? '(Closed)' : ''}
            </span>
          </div>

          {/* Small reference thumbnail showing Open state */}
          <div className="absolute top-2 left-2 w-20 h-20 border border-[var(--border)] rounded overflow-hidden bg-[var(--bg-panel)]/90 z-10">
            <div className="absolute top-0.5 left-0.5 px-1 text-[8px] text-[var(--text-muted)] bg-[var(--bg-panel)]/80 rounded">
              Open (η=1)
            </div>
            <TangramSVG mode="open" />
          </div>
        </div>

        {/* Eta Slider */}
        <EtaSlider />

        {/* Legend */}
        <div className="px-3 py-2 border-t border-[var(--border)] bg-[var(--bg-surface)]">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px]">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#4A90D9', opacity: 0.5 }} />
              <span className="text-[var(--text-secondary)]">Underlay</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#E8669A', opacity: 0.5 }} />
              <span className="text-[var(--text-secondary)]">Pleat</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-6 h-1 rounded" style={{ backgroundColor: '#FF5722', border: '1px dashed #FF5722' }} />
              <span className="text-[var(--text-secondary)]">Stitch Line</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#E84040' }} />
              <span className="text-[var(--text-secondary)]">Singularity</span>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
