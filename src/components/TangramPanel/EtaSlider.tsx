import { useAppStore } from '../../store/useAppStore';

export function EtaSlider() {
  const { gary, setGary } = useAppStore();

  return (
    <div className="flex items-center gap-3 px-3 py-3 bg-[var(--bg-surface)] border-t border-[var(--border)]">
      <div className="text-xs text-[var(--text-secondary)] w-20 shrink-0 text-center">
        <div className="font-medium text-[var(--color-pleat)]">Closed</div>
        <div className="text-[9px] text-[var(--text-muted)]">(η=0, stitched)</div>
      </div>

      <div className="flex-1 relative pt-1">
        <input
          type="range"
          value={gary}
          min={0}
          max={1}
          step={0.01}
          onChange={(e) => setGary(parseFloat(e.target.value))}
          className="w-full h-2.5 rounded-full appearance-none cursor-pointer
                     bg-gradient-to-r from-[var(--color-pleat)] to-[var(--color-underlay)]
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                     [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
                     [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:cursor-pointer
                     [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[var(--accent)]
                     [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110"
        />

        {/* Tick marks */}
        <div className="absolute -bottom-4 left-0 right-0 flex justify-between text-[9px] text-[var(--text-muted)]">
          <span>0</span>
          <span>0.25</span>
          <span>0.5</span>
          <span>0.75</span>
          <span>1</span>
        </div>
      </div>

      <div className="text-xs text-[var(--text-secondary)] w-20 shrink-0 text-center">
        <div className="font-medium text-[var(--color-underlay)]">Open</div>
        <div className="text-[9px] text-[var(--text-muted)]">(η=1, flat)</div>
      </div>
    </div>
  );
}
