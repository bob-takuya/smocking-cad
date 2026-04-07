import { useAppStore } from '../../store/useAppStore';
import { Panel, Button } from '../ui';
import { ResultViewer3D } from './ResultViewer3D';
import { ResultControls } from './ResultControls';

export function ResultPanel() {
  const { setExportModalOpen, optimizationResult } = useAppStore();

  return (
    <Panel
      title="Result Preview"
      noPadding
      className="h-full"
      headerActions={
        <Button size="sm" onClick={() => setExportModalOpen(true)}>
          Export
        </Button>
      }
    >
      <div className="flex flex-col h-full min-h-0">
        {/* 3D Viewer — min-h-0 prevents flex from ignoring overflow */}
        <div className="flex-1 relative min-h-0">
          <ResultViewer3D />

          {/* Stats overlay */}
          {optimizationResult && (
            <div className="absolute top-2 left-2 px-2 py-1 bg-[var(--bg-panel)]/90 rounded text-[10px] text-[var(--text-secondary)] space-y-0.5">
              <div>
                <span className="text-[var(--text-muted)]">E_shape:</span>{' '}
                <span className="mono text-[var(--text-primary)]">
                  {optimizationResult.Eshape.toFixed(4)}
                </span>
              </div>
              <div>
                <span className="text-[var(--text-muted)]">E_pleat:</span>{' '}
                <span className="mono text-[var(--text-primary)]">
                  {optimizationResult.Epleat.toFixed(4)}
                </span>
              </div>
              <div>
                <span className="text-[var(--text-muted)]">Iterations:</span>{' '}
                <span className="mono text-[var(--text-primary)]">
                  {optimizationResult.iterations}
                </span>
              </div>
              <div>
                <span className="text-[var(--text-muted)]">Status:</span>{' '}
                <span className={`mono ${optimizationResult.converged ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'}`}>
                  {optimizationResult.converged ? 'Converged' : 'Max Iter'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <ResultControls />
      </div>
    </Panel>
  );
}
