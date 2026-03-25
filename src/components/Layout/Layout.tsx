import { useCallback, useState, type ReactNode } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { HeaderBar } from './HeaderBar';
import { PanelResizer } from './PanelResizer';

interface LayoutProps {
  shapePanel: ReactNode;
  tangramPanel: ReactNode;
  resultPanel: ReactNode;
  inspectorPanel: ReactNode;
}

export function Layout({ shapePanel, tangramPanel, resultPanel, inspectorPanel }: LayoutProps) {
  const { layoutMode, inspectorOpen } = useAppStore();

  // Panel widths as percentages
  const [panelWidths, setPanelWidths] = useState({
    shape: 50,
    tangram: 25,
    result: 25,
  });
  const [inspectorHeight, setInspectorHeight] = useState(200);

  const handleResize1 = useCallback((delta: number) => {
    setPanelWidths((prev) => {
      const containerWidth = window.innerWidth;
      const deltaPercent = (delta / containerWidth) * 100;
      const newShape = Math.max(20, Math.min(70, prev.shape + deltaPercent));
      const diff = newShape - prev.shape;
      return {
        shape: newShape,
        tangram: Math.max(15, prev.tangram - diff / 2),
        result: Math.max(15, prev.result - diff / 2),
      };
    });
  }, []);

  const handleResize2 = useCallback((delta: number) => {
    setPanelWidths((prev) => {
      const containerWidth = window.innerWidth;
      const deltaPercent = (delta / containerWidth) * 100;
      const newTangram = Math.max(15, Math.min(50, prev.tangram + deltaPercent));
      const diff = newTangram - prev.tangram;
      return {
        ...prev,
        tangram: newTangram,
        result: Math.max(15, prev.result - diff),
      };
    });
  }, []);

  const handleInspectorResize = useCallback((delta: number) => {
    setInspectorHeight((prev) => Math.max(100, Math.min(400, prev - delta)));
  }, []);

  // Adjust widths based on layout mode
  const getEffectiveWidths = () => {
    switch (layoutMode) {
      case 'ShapeFocus':
        return { shape: 70, tangram: 15, result: 15 };
      case 'PatternFocus':
        return { shape: 25, tangram: 50, result: 25 };
      case 'ResultFocus':
        return { shape: 25, tangram: 25, result: 50 };
      default:
        return panelWidths;
    }
  };

  const effectiveWidths = getEffectiveWidths();

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--bg-darkest)] overflow-hidden">
      <HeaderBar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
          {/* Shape Panel */}
          <div
            className="overflow-hidden flex flex-col"
            style={{ width: `${effectiveWidths.shape}%` }}
          >
            {shapePanel}
          </div>

          <PanelResizer direction="horizontal" onResize={handleResize1} />

          {/* Tangram Panel */}
          <div
            className="overflow-hidden flex flex-col"
            style={{ width: `${effectiveWidths.tangram}%` }}
          >
            {tangramPanel}
          </div>

          <PanelResizer direction="horizontal" onResize={handleResize2} />

          {/* Result Panel */}
          <div
            className="overflow-hidden flex flex-col"
            style={{ width: `${effectiveWidths.result}%` }}
          >
            {resultPanel}
          </div>
        </div>

        {/* Inspector Panel */}
        {inspectorOpen && (
          <>
            <PanelResizer direction="vertical" onResize={handleInspectorResize} />
            <div
              className="flex-shrink-0 overflow-hidden"
              style={{ height: inspectorHeight }}
            >
              {inspectorPanel}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
