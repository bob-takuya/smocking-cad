import { useAppStore } from '../../store/useAppStore';

export function EtaSlider() {
  const { gary, setGary } = useAppStore();

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-[var(--bg-surface)] border-t border-[var(--border)]">
      <span className="text-xs text-[var(--text-secondary)] w-14 shrink-0">
        Closed
      </span>

      <div className="flex-1 relative">
        <input
          type="range"
          value={gary}
          min={0}
          max={1}
          step={0.01}
          onChange={(e) => setGary(parseFloat(e.target.value))}
          className="w-full h-2 rounded-full appearance-none cursor-pointer
                     bg-gradient-to-r from-[var(--color-pleat)] to-[var(--color-underlay)]
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                     [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
                     [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer
                     [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[var(--accent)]"
        />

        {/* Tick marks */}
        <div className="absolute -bottom-3 left-0 right-0 flex justify-between text-[9px] text-[var(--text-muted)]">
          <span>0</span>
          <span>0.25</span>
          <span>0.5</span>
          <span>0.75</span>
          <span>1</span>
        </div>
      </div>

      <span className="text-xs text-[var(--text-secondary)] w-14 shrink-0 text-right">
        Open
      </span>

      <div className="ml-2 px-2 py-1 bg-[var(--bg-panel)] border border-[var(--border)] rounded">
        <span className="mono text-xs text-[var(--text-primary)] tabular-nums">
          {'\u03B7'} = {gary.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
