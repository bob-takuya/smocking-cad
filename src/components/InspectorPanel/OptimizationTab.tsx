import { useAppStore } from '../../store/useAppStore';
import { useOptimization } from '../../hooks/useOptimization';
import { Slider, Button } from '../ui';

export function OptimizationTab() {
  const {
    optimizationParams,
    setOptimizationParams,
    optimizationStatus,
    optimizationProgress,
  } = useAppStore();

  const { startOptimization, stopOptimization } = useOptimization();

  const isRunning = optimizationStatus === 'running';

  return (
    <div className="space-y-4">
      {/* Weight sliders */}
      <div className="space-y-3">
        <h4 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          Energy Weights
        </h4>

        <Slider
          label="w_shape (Shape Matching)"
          value={optimizationParams.ws}
          min={0}
          max={2}
          step={0.1}
          onChange={(v) => setOptimizationParams({ ws: v })}
        />

        <Slider
          label="w_pleat (Pleat Quality)"
          value={optimizationParams.wp}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => setOptimizationParams({ wp: v })}
        />

        <Slider
          label="w_seam (Seam Compatibility)"
          value={optimizationParams.wc}
          min={0}
          max={0.5}
          step={0.01}
          onChange={(v) => setOptimizationParams({ wc: v })}
        />
      </div>

      {/* Optimization parameters */}
      <div className="space-y-3">
        <h4 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          Parameters
        </h4>

        <Slider
          label="Initial eta"
          value={optimizationParams.etaInitial}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => setOptimizationParams({ etaInitial: v })}
        />

        <Slider
          label="Max Iterations"
          value={optimizationParams.maxIterations}
          min={10}
          max={500}
          step={10}
          onChange={(v) => setOptimizationParams({ maxIterations: v })}
        />
      </div>

      {/* Run controls */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <Button
            variant="primary"
            onClick={startOptimization}
            disabled={isRunning}
            className="flex-1"
          >
            {isRunning ? 'Running...' : 'Run Optimization'}
          </Button>
          {isRunning && (
            <Button variant="danger" onClick={stopOptimization}>
              Stop
            </Button>
          )}
        </div>

        {/* Progress indicator */}
        {isRunning && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-[var(--text-secondary)]">
              <span>Iteration {optimizationProgress.iteration}</span>
              <span>{((optimizationProgress.iteration / optimizationParams.maxIterations) * 100).toFixed(0)}%</span>
            </div>
            <div className="h-1.5 bg-[var(--bg-surface)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--accent)] transition-all duration-200"
                style={{
                  width: `${(optimizationProgress.iteration / optimizationParams.maxIterations) * 100}%`,
                }}
              />
            </div>
            <div className="flex gap-4 text-[10px] text-[var(--text-muted)]">
              <span>E_shape: {optimizationProgress.Eshape.toFixed(4)}</span>
              <span>E_pleat: {optimizationProgress.Epleat.toFixed(4)}</span>
            </div>
          </div>
        )}

        {/* Status */}
        {optimizationStatus === 'converged' && (
          <div className="flex items-center gap-2 text-xs text-[var(--color-success)]">
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>Optimization converged</span>
          </div>
        )}

        {optimizationStatus === 'failed' && (
          <div className="flex items-center gap-2 text-xs text-[var(--color-error)]">
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span>Optimization failed</span>
          </div>
        )}
      </div>
    </div>
  );
}
