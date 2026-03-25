import { useAppStore } from '../../store/useAppStore';
import type { ShapePreset } from '../../types';

const SHAPE_PRESETS: { value: ShapePreset; label: string; icon: string }[] = [
  { value: 'Hemisphere', label: 'Hemisphere', icon: '⌓' },
  { value: 'Sphere', label: 'Sphere', icon: '●' },
  { value: 'Hyperboloid', label: 'Hyperboloid', icon: '⧖' },
  { value: 'HyperbolicParaboloid', label: 'Saddle', icon: '∿' },
  { value: 'Torus', label: 'Torus', icon: '◎' },
];

export function ShapePresets() {
  const { selectedShape, setSelectedShape } = useAppStore();

  return (
    <div className="flex flex-wrap gap-1">
      {SHAPE_PRESETS.map(({ value, label, icon }) => (
        <button
          key={value}
          onClick={() => setSelectedShape(value)}
          className={`flex flex-col items-center justify-center w-16 h-14 rounded text-xs transition-colors ${
            selectedShape === value
              ? 'bg-[var(--accent)] text-white'
              : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border)]'
          }`}
          title={label}
        >
          <span className="text-lg mb-0.5">{icon}</span>
          <span className="text-[10px] truncate w-full text-center">{label}</span>
        </button>
      ))}
    </div>
  );
}
