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
  } = useAppStore();

  return (
    <div className="p-2 space-y-3 bg-[var(--bg-surface)] border-t border-[var(--border)]">
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
  );
}
