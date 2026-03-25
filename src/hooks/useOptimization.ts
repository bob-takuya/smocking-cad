import { useCallback, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { runOptimization } from '../engine/optimization';

export function useOptimization() {
  const abortRef = useRef(false);

  const {
    targetMesh,
    tiledPattern,
    optimizationParams,
    setOptimizationStatus,
    setOptimizationResult,
    setOptimizationProgress,
    setTangramState,
  } = useAppStore();

  const startOptimization = useCallback(async () => {
    if (!targetMesh || !tiledPattern) {
      console.warn('Cannot start optimization: missing target mesh or pattern');
      return;
    }

    abortRef.current = false;
    setOptimizationStatus('running');
    setOptimizationProgress({ iteration: 0, Eshape: 0, Epleat: 0 });

    try {
      const result = await runOptimization(
        targetMesh,
        tiledPattern,
        optimizationParams,
        (iter, Eshape, Epleat) => {
          if (abortRef.current) {
            throw new Error('Optimization aborted');
          }
          setOptimizationProgress({ iteration: iter, Eshape, Epleat });
        }
      );

      setOptimizationResult(result);
      setTangramState(result.tangramState);
      setOptimizationStatus(result.converged ? 'converged' : 'idle');
    } catch (error) {
      if ((error as Error).message === 'Optimization aborted') {
        setOptimizationStatus('idle');
      } else {
        console.error('Optimization failed:', error);
        setOptimizationStatus('failed');
      }
    }
  }, [
    targetMesh,
    tiledPattern,
    optimizationParams,
    setOptimizationStatus,
    setOptimizationResult,
    setOptimizationProgress,
    setTangramState,
  ]);

  const stopOptimization = useCallback(() => {
    abortRef.current = true;
  }, []);

  return {
    startOptimization,
    stopOptimization,
  };
}
