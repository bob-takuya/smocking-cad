import { useCallback } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Slider, Select } from '../ui';
import type { MeshDisplayMode } from '../../types';

const DISPLAY_MODES: { value: MeshDisplayMode; label: string }[] = [
  { value: 'Solid', label: 'Solid' },
  { value: 'Wireframe', label: 'Wireframe' },
  { value: 'GaussianCurvature', label: 'Gaussian K' },
  { value: 'MeanCurvature', label: 'Mean H' },
];

export function ShapeControls() {
  const {
    selectedShape,
    shapeParams,
    setShapeParams,
    meshDisplayMode,
    setMeshDisplayMode,
  } = useAppStore();

  const handleParamChange = useCallback((key: string, value: number) => {
    setShapeParams({ [key]: value });
  }, [setShapeParams]);

  // Render different controls based on selected shape
  const renderShapeParams = () => {
    switch (selectedShape) {
      case 'Hemisphere':
      case 'Sphere':
        return (
          <Slider
            label="Radius"
            value={shapeParams.radius ?? 1}
            min={0.2}
            max={2}
            step={0.1}
            onChange={(v) => handleParamChange('radius', v)}
          />
        );

      case 'Hyperboloid':
        return (
          <>
            <Slider
              label="Width (a)"
              value={shapeParams.a ?? 0.5}
              min={0.1}
              max={1.5}
              step={0.1}
              onChange={(v) => handleParamChange('a', v)}
            />
            <Slider
              label="Height (c)"
              value={shapeParams.c ?? 1}
              min={0.5}
              max={2}
              step={0.1}
              onChange={(v) => handleParamChange('c', v)}
            />
          </>
        );

      case 'HyperbolicParaboloid':
        return (
          <Slider
            label="Curvature"
            value={shapeParams.curvature ?? 0.5}
            min={0.1}
            max={1}
            step={0.05}
            onChange={(v) => handleParamChange('curvature', v)}
          />
        );

      case 'Torus':
        return (
          <>
            <Slider
              label="Major Radius"
              value={shapeParams.radius ?? 1}
              min={0.5}
              max={2}
              step={0.1}
              onChange={(v) => handleParamChange('radius', v)}
            />
            <Slider
              label="Tube Radius"
              value={shapeParams.radius2 ?? 0.3}
              min={0.1}
              max={0.8}
              step={0.05}
              onChange={(v) => handleParamChange('radius2', v)}
            />
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          Parameters
        </h4>
        <div className="space-y-3">
          {renderShapeParams()}
          <Slider
            label="Resolution"
            value={shapeParams.resolution ?? 32}
            min={8}
            max={64}
            step={4}
            onChange={(v) => handleParamChange('resolution', v)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          Display
        </h4>
        <Select
          options={DISPLAY_MODES}
          value={meshDisplayMode}
          onChange={(v) => setMeshDisplayMode(v as MeshDisplayMode)}
        />
      </div>
    </div>
  );
}
