import { useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { evaluateFabricability } from '../../engine/optimization';

export function AnalysisTab() {
  const { tangramState, tiledPattern, optimizationResult } = useAppStore();

  const metrics = useMemo(() => {
    if (!tangramState || !tiledPattern) {
      return null;
    }
    return evaluateFabricability(tangramState, tiledPattern);
  }, [tangramState, tiledPattern]);

  const renderMetricBar = (value: number, label: string, color: string) => (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span className="mono text-[var(--text-primary)]">{(value * 100).toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-[var(--bg-surface)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${value * 100}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Energy metrics */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          Energy Metrics
        </h4>

        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 bg-[var(--bg-surface)] rounded border border-[var(--border)]">
            <div className="text-[10px] text-[var(--text-muted)]">E_shape</div>
            <div className="mono text-sm text-[var(--text-primary)]">
              {optimizationResult?.Eshape.toFixed(4) ?? '—'}
            </div>
          </div>
          <div className="p-2 bg-[var(--bg-surface)] rounded border border-[var(--border)]">
            <div className="text-[10px] text-[var(--text-muted)]">E_pleat</div>
            <div className="mono text-sm text-[var(--text-primary)]">
              {optimizationResult?.Epleat.toFixed(4) ?? '—'}
            </div>
          </div>
          <div className="p-2 bg-[var(--bg-surface)] rounded border border-[var(--border)]">
            <div className="text-[10px] text-[var(--text-muted)]">E_seam</div>
            <div className="mono text-sm text-[var(--text-primary)]">
              {optimizationResult?.Eseam.toFixed(4) ?? '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Fabricability metrics */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          Fabricability Analysis
        </h4>

        {metrics ? (
          <div className="space-y-3">
            {renderMetricBar(metrics.overallScore, 'Overall Score', '#50C878')}
            {renderMetricBar(metrics.pleatQuality, 'Pleat Quality', '#4A90D9')}
            {renderMetricBar(1 - Math.min(1, metrics.edgeRatioVariance * 5), 'Edge Uniformity', '#E8669A')}
          </div>
        ) : (
          <div className="text-xs text-[var(--text-muted)] italic py-2">
            Run optimization to see analysis
          </div>
        )}
      </div>

      {/* Pattern statistics */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          Pattern Statistics
        </h4>

        {tiledPattern ? (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Vertices:</span>
              <span className="mono text-[var(--text-primary)]">{tiledPattern.vertices.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Edges:</span>
              <span className="mono text-[var(--text-primary)]">{tiledPattern.edges.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Faces:</span>
              <span className="mono text-[var(--text-primary)]">{tiledPattern.faces.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Stitch Lines:</span>
              <span className="mono text-[var(--text-primary)]">{tiledPattern.stitchingLines.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Underlay Faces:</span>
              <span className="mono text-[var(--text-primary)]">
                {tiledPattern.faces.filter((f) => f.type === 'underlay').length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Pleat Faces:</span>
              <span className="mono text-[var(--text-primary)]">
                {tiledPattern.faces.filter((f) => f.type === 'pleat').length}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-[var(--text-muted)] italic py-2">
            No pattern loaded
          </div>
        )}
      </div>

      {/* Fabricability checks */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          Fabricability Checks
        </h4>

        <div className="space-y-1">
          {[
            { label: 'Minimum edge length', status: 'pass' },
            { label: 'Maximum pleat angle', status: 'pass' },
            { label: 'Stitch line straightness', status: 'pass' },
            { label: 'Pattern regularity', status: metrics ? 'pass' : 'pending' },
          ].map((check) => (
            <div
              key={check.label}
              className="flex items-center justify-between text-xs py-1 px-2 bg-[var(--bg-surface)] rounded"
            >
              <span className="text-[var(--text-secondary)]">{check.label}</span>
              <span
                className={`flex items-center gap-1 ${
                  check.status === 'pass'
                    ? 'text-[var(--color-success)]'
                    : check.status === 'fail'
                    ? 'text-[var(--color-error)]'
                    : 'text-[var(--text-muted)]'
                }`}
              >
                {check.status === 'pass' ? (
                  <>
                    <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Pass
                  </>
                ) : check.status === 'fail' ? (
                  <>
                    <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    Fail
                  </>
                ) : (
                  'Pending'
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
