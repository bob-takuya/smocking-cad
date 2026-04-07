import { useAppStore } from '../../store/useAppStore';
import { Select, Button } from '../ui';
import type { ResultDisplayMode } from '../../types';

const DISPLAY_MODES: { value: ResultDisplayMode; label: string }[] = [
  { value: 'Smocked', label: 'Smocked' },
  { value: 'Heatmap', label: 'Heatmap' },
  { value: 'PleatQuality', label: 'Pleat Quality' },
  { value: 'TangramOverlay', label: 'Tangram Overlay' },
  { value: 'Transparent', label: 'Transparent' },
];

export function ResultControls() {
  const {
    resultDisplayMode,
    setResultDisplayMode,
    showFront,
    setShowFront,
    gary,
    setGary,
  } = useAppStore();

  return (
    <div className="
      shrink-0
      bg-[var(--bg-surface)] border-t border-[var(--border)]
      overflow-y-auto
      max-h-[42vh] md:max-h-none
      pb-[env(safe-area-inset-bottom,0px)]
    ">
      <div className="p-2 space-y-2">
        {/* Stitch Strength slider — always visible at top */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-secondary)]">Stitch Strength</span>
            <span className="text-xs mono text-[var(--accent)]">{(1 - gary).toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={1 - gary}
            onChange={(e) => setGary(1 - Number(e.target.value))}
            className="w-full accent-[var(--accent)] cursor-pointer"
            style={{ touchAction: 'none' }}
          />
          <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
            <span>Flat</span>
            <span>Full Smocking</span>
          </div>
        </div>

        {/* Reset button */}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setGary(0)}
          className="w-full"
        >
          🔄 Reset to Smocked
        </Button>

        <Select
          label="Display Mode"
          options={DISPLAY_MODES}
          value={resultDisplayMode}
          onChange={(v) => setResultDisplayMode(v as ResultDisplayMode)}
        />

        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-secondary)]">Side:</span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={showFront ? 'primary' : 'secondary'}
              onClick={() => setShowFront(true)}
            >
              Front
            </Button>
            <Button
              size="sm"
              variant={!showFront ? 'primary' : 'secondary'}
              onClick={() => setShowFront(false)}
            >
              Back
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
