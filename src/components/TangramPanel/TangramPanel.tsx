import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Panel, Slider } from '../ui';
import { TangramSVG } from './TangramSVG';
import { EtaSlider } from './EtaSlider';
import { PatternLibrary } from './PatternLibrary';

type ViewMode = 'dual' | 'open' | 'closed' | 'current';

export function TangramPanel() {
  const [viewMode, setViewMode] = useState<ViewMode>('dual');
  const { tilingU, tilingV, setTilingU, setTilingV, selectedPattern } = useAppStore();

  return (
    <Panel
      title={`Tangram - ${selectedPattern}`}
      noPadding
      className="h-full"
      headerActions={
        <div className="flex gap-1">
          {(['dual', 'open', 'closed', 'current'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                viewMode === mode
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      }
    >
      <div className="flex flex-col h-full">
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

        {/* SVG Viewer(s) */}
        <div className="flex-1 flex overflow-hidden">
          {viewMode === 'dual' ? (
            <>
              <div className="flex-1 border-r border-[var(--border)] relative">
                <div className="absolute top-2 left-2 px-2 py-0.5 bg-[var(--bg-panel)]/80 rounded text-[10px] text-[var(--text-secondary)] z-10">
                  Open ({'\u03B7'}=1)
                </div>
                <TangramSVG mode="open" />
              </div>
              <div className="flex-1 relative">
                <div className="absolute top-2 left-2 px-2 py-0.5 bg-[var(--bg-panel)]/80 rounded text-[10px] text-[var(--text-secondary)] z-10">
                  Closed ({'\u03B7'}=0)
                </div>
                <TangramSVG mode="closed" />
              </div>
            </>
          ) : (
            <div className="flex-1">
              <TangramSVG mode={viewMode === 'current' ? 'current' : viewMode} />
            </div>
          )}
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
              <div className="w-6 h-0.5" style={{ backgroundColor: '#F5C518' }} />
              <span className="text-[var(--text-secondary)]">Underlay Edge</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-6 h-0.5" style={{ backgroundColor: '#1A1A1A' }} />
              <span className="text-[var(--text-secondary)]">Stitch</span>
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
