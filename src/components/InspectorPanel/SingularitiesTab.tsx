import { useAppStore } from '../../store/useAppStore';
import { Button, Select } from '../ui';
import { checkPoincareHopf } from '../../engine/optimization';
import type { SingularityMode } from '../../types';

const SINGULARITY_MODES: { value: SingularityMode; label: string }[] = [
  { value: 'auto', label: 'Auto (detect high curvature)' },
  { value: 'manual', label: 'Manual placement' },
  { value: 'none', label: 'No singularities' },
];

export function SingularitiesTab() {
  const {
    singularityMode,
    setSingularityMode,
    singularities,
    setSingularities,
    targetMesh,
  } = useAppStore();

  // Check Poincare-Hopf theorem
  const singularityIndices = singularities.map((s) => s.index);
  // Euler characteristic for closed surface (sphere = 2, torus = 0)
  const eulerCharacteristic = 2; // Assume sphere-like topology for now
  const phCheck = checkPoincareHopf(singularityIndices, eulerCharacteristic);

  const handleAddSingularity = () => {
    if (!targetMesh) return;

    // Add a singularity at the origin (for demo)
    const newSingularity = {
      id: `sing-${Date.now()}`,
      position: { x: 0, y: 0.5, z: 0 },
      index: 1,
      type: 'source' as const,
    };
    setSingularities([...singularities, newSingularity]);
  };

  const handleRemoveSingularity = (id: string) => {
    setSingularities(singularities.filter((s) => s.id !== id));
  };

  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          Detection Mode
        </h4>
        <Select
          options={SINGULARITY_MODES}
          value={singularityMode}
          onChange={(v) => setSingularityMode(v as SingularityMode)}
        />
      </div>

      {/* Singularity list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
            Singularities ({singularities.length})
          </h4>
          {singularityMode === 'manual' && (
            <Button size="sm" onClick={handleAddSingularity}>
              Add
            </Button>
          )}
        </div>

        {singularities.length === 0 ? (
          <div className="text-xs text-[var(--text-muted)] italic py-2">
            No singularities defined
          </div>
        ) : (
          <div className="border border-[var(--border)] rounded overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-[var(--bg-surface)]">
                <tr>
                  <th className="px-2 py-1 text-left text-[var(--text-secondary)]">Type</th>
                  <th className="px-2 py-1 text-left text-[var(--text-secondary)]">Index</th>
                  <th className="px-2 py-1 text-left text-[var(--text-secondary)]">Position</th>
                  <th className="px-2 py-1 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {singularities.map((sing) => (
                  <tr key={sing.id} className="border-t border-[var(--border)]">
                    <td className="px-2 py-1 text-[var(--text-primary)]">
                      <span
                        className={`inline-flex items-center gap-1 ${
                          sing.type === 'source'
                            ? 'text-[var(--color-success)]'
                            : sing.type === 'sink'
                            ? 'text-[var(--color-error)]'
                            : 'text-[var(--color-warning)]'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-current" />
                        {sing.type}
                      </span>
                    </td>
                    <td className="px-2 py-1 mono text-[var(--text-primary)]">
                      {sing.index > 0 ? '+' : ''}{sing.index}
                    </td>
                    <td className="px-2 py-1 mono text-[var(--text-muted)]">
                      ({sing.position.x.toFixed(2)}, {sing.position.y.toFixed(2)}, {sing.position.z.toFixed(2)})
                    </td>
                    <td className="px-2 py-1">
                      {singularityMode === 'manual' && (
                        <button
                          onClick={() => handleRemoveSingularity(sing.id)}
                          className="text-[var(--text-muted)] hover:text-[var(--color-error)]"
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Poincare-Hopf check */}
      <div className="p-2 bg-[var(--bg-surface)] rounded border border-[var(--border)]">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--text-secondary)]">Poincaré-Hopf Check</span>
          <span
            className={`text-xs font-medium ${
              phCheck.valid ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'
            }`}
          >
            {phCheck.valid ? 'Valid' : 'Invalid'}
          </span>
        </div>
        <div className="text-[10px] text-[var(--text-muted)] mt-1">
          Σ indices = {phCheck.sum} (expected: χ = {phCheck.expected})
        </div>
      </div>
    </div>
  );
}
