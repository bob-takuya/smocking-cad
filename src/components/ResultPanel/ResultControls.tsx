import { useAppStore } from '../../store/useAppStore';
import { Button } from '../ui';
import type { ResultDisplayMode } from '../../types';

const DISPLAY_MODES: { value: ResultDisplayMode; label: string }[] = [
  { value: 'Smocked', label: 'Smocked' },
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
    triggerExport,
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

        <div className="flex gap-1">
          {DISPLAY_MODES.map(m => (
            <Button
              key={m.value}
              size="sm"
              variant={resultDisplayMode === m.value ? 'primary' : 'secondary'}
              onClick={() => setResultDisplayMode(m.value as ResultDisplayMode)}
              className="flex-1"
            >
              {m.label}
            </Button>
          ))}
        </div>

        <div className="flex gap-1">
          <Button size="sm" variant={showFront ? 'primary' : 'secondary'}
            onClick={() => setShowFront(true)} className="flex-1">Front</Button>
          <Button size="sm" variant={!showFront ? 'primary' : 'secondary'}
            onClick={() => setShowFront(false)} className="flex-1">Back</Button>
        </div>

        {/* Export */}
        <div className="border-t border-[var(--border)] pt-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={triggerExport}
            className="w-full"
          >
            💾 Export OBJ
          </Button>
        </div>
      </div>
    </div>
  );
}
