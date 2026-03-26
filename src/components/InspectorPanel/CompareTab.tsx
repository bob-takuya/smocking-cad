import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Button } from '../ui';
import type { PatternPreset } from '../../types';

// Icons for patterns
const PATTERN_ICONS: Record<PatternPreset, string> = {
  Arrow: '↗',
  Leaf: '❧',
  Braid: '⫲',
  Box: '▣',
  Brick: '⬗',
  TwistedSquare: '⟳',
  Heart: '♡',
};

export function CompareTab() {
  const { savedDesigns, saveDesign, removeDesign, optimizationResult } = useAppStore();
  const [newDesignName, setNewDesignName] = useState('');

  const handleSave = () => {
    const name = newDesignName.trim() || `Design ${savedDesigns.length + 1}`;
    saveDesign(name);
    setNewDesignName('');
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-4">
      {/* Save current design */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          Save Current Design
        </h4>

        <div className="flex gap-2">
          <input
            type="text"
            value={newDesignName}
            onChange={(e) => setNewDesignName(e.target.value)}
            placeholder="Design name..."
            className="flex-1 px-2 py-1 text-sm bg-[var(--bg-surface)] text-[var(--text-primary)]
                       border border-[var(--border)] rounded focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
          <Button onClick={handleSave} disabled={!optimizationResult}>
            Save
          </Button>
        </div>

        {!optimizationResult && (
          <p className="text-[10px] text-[var(--text-muted)]">
            Run optimization to save a design
          </p>
        )}
      </div>

      {/* Saved designs list */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          Saved Designs ({savedDesigns.length}/4)
        </h4>

        {savedDesigns.length === 0 ? (
          <div className="text-xs text-[var(--text-muted)] italic py-4 text-center">
            No saved designs yet
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {savedDesigns.slice(0, 4).map((design) => (
              <div
                key={design.id}
                className="p-2 bg-[var(--bg-surface)] rounded border border-[var(--border)] relative group"
              >
                {/* Thumbnail placeholder */}
                <div className="h-20 bg-[var(--bg-panel)] rounded mb-2 flex items-center justify-center">
                  <div className="text-3xl text-[var(--text-muted)]">
                    {PATTERN_ICONS[design.pattern] || '◇'}
                  </div>
                </div>

                {/* Info */}
                <div className="space-y-0.5">
                  <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                    {design.name}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]">
                    {design.shape} + {design.pattern}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]">
                    {formatDate(design.timestamp)}
                  </div>
                  {design.result && (
                    <div className="text-[10px] text-[var(--text-secondary)]">
                      E_shape: {design.result.Eshape.toFixed(3)}
                    </div>
                  )}
                </div>

                {/* Delete button */}
                <button
                  onClick={() => removeDesign(design.id)}
                  className="absolute top-1 right-1 w-5 h-5 rounded bg-[var(--bg-panel)]/80
                           text-[var(--text-muted)] hover:text-[var(--color-error)] hover:bg-[var(--bg-panel)]
                           opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Comparison table */}
      {savedDesigns.length >= 2 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
            Comparison
          </h4>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-[var(--border)] rounded">
              <thead className="bg-[var(--bg-surface)]">
                <tr>
                  <th className="px-2 py-1 text-left text-[var(--text-secondary)]">Metric</th>
                  {savedDesigns.slice(0, 4).map((d) => (
                    <th key={d.id} className="px-2 py-1 text-center text-[var(--text-secondary)]">
                      {d.name.slice(0, 10)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-[var(--border)]">
                  <td className="px-2 py-1 text-[var(--text-secondary)]">E_shape</td>
                  {savedDesigns.slice(0, 4).map((d) => (
                    <td key={d.id} className="px-2 py-1 text-center mono text-[var(--text-primary)]">
                      {d.result?.Eshape.toFixed(4) ?? '—'}
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-[var(--border)]">
                  <td className="px-2 py-1 text-[var(--text-secondary)]">E_pleat</td>
                  {savedDesigns.slice(0, 4).map((d) => (
                    <td key={d.id} className="px-2 py-1 text-center mono text-[var(--text-primary)]">
                      {d.result?.Epleat.toFixed(4) ?? '—'}
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-[var(--border)]">
                  <td className="px-2 py-1 text-[var(--text-secondary)]">Iterations</td>
                  {savedDesigns.slice(0, 4).map((d) => (
                    <td key={d.id} className="px-2 py-1 text-center mono text-[var(--text-primary)]">
                      {d.result?.iterations ?? '—'}
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-[var(--border)]">
                  <td className="px-2 py-1 text-[var(--text-secondary)]">Converged</td>
                  {savedDesigns.slice(0, 4).map((d) => (
                    <td key={d.id} className="px-2 py-1 text-center">
                      {d.result?.converged ? (
                        <span className="text-[var(--color-success)]">✓</span>
                      ) : (
                        <span className="text-[var(--color-error)]">✗</span>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
