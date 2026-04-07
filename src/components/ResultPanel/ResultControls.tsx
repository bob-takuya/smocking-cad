import { useAppStore } from '../../store/useAppStore';
import { Button } from '../ui';

export function ResultControls() {
  const { gary, setGary, triggerExport } = useAppStore();

  return (
    <div className="shrink-0 bg-[var(--bg-surface)] border-t border-[var(--border)]
      pb-[env(safe-area-inset-bottom,0px)]">
      <div className="p-2 space-y-2">
        {/* Stitch Strength */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              Stitch Strength
            </span>
            <span className="text-xs font-mono text-[var(--accent)]">
              {(1 - gary).toFixed(2)}
            </span>
          </div>
          <input
            type="range" min="0" max="1" step="0.01"
            value={1 - gary}
            onChange={e => setGary(1 - Number(e.target.value))}
            className="w-full accent-[var(--accent)] cursor-pointer"
            style={{ touchAction: 'none' }}
          />
          <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
            <span>Flat</span>
            <span>Full Smocking</span>
          </div>
        </div>

        {/* Export */}
        <Button size="sm" variant="secondary" onClick={triggerExport} className="w-full">
          💾 Export OBJ
        </Button>
      </div>
    </div>
  );
}
