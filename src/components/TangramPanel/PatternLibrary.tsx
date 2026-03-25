import { useAppStore } from '../../store/useAppStore';
import { PATTERN_INFO, getPatternNames } from '../../engine/patterns';
import type { PatternPreset } from '../../types';
import { Tooltip } from '../ui';

// Simple icons representing each pattern type
const PATTERN_ICONS: Record<PatternPreset, string> = {
  Arrow: '↗',
  WaterBomb: '◈',
  Resch4: '▦',
  Braid: '⫲',
  Leaf: '❧',
  Box: '▣',
  Brick: '⬗',
  Diamond: '◇',
};

export function PatternLibrary() {
  const { selectedPattern, setSelectedPattern } = useAppStore();
  const patterns = getPatternNames();

  return (
    <div className="p-2 space-y-2">
      <h4 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider px-1">
        Pattern Library
      </h4>

      <div className="grid grid-cols-4 gap-1">
        {patterns.map((pattern) => {
          const info = PATTERN_INFO[pattern];
          return (
            <Tooltip key={pattern} content={info.description} position="bottom">
              <button
                onClick={() => setSelectedPattern(pattern)}
                className={`flex flex-col items-center justify-center p-2 rounded transition-colors ${
                  selectedPattern === pattern
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border)]'
                }`}
              >
                <span className="text-lg">{PATTERN_ICONS[pattern]}</span>
                <span className="text-[9px] mt-0.5 truncate w-full text-center">
                  {pattern}
                </span>
              </button>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
