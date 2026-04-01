import { useCallback, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { parseOBJ, parseSTL } from '../../engine/shapes';
import { Panel } from '../ui';
import { ShapeViewer3D } from './ShapeViewer3D';
import { ShapePresets } from './ShapePresets';
import { ShapeControls } from './ShapeControls';

export function ShapePanel() {
  const { setTargetMesh, setSelectedShape } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileImport = useCallback(async (file: File) => {
    try {
      const extension = file.name.split('.').pop()?.toLowerCase();

      if (extension === 'obj') {
        const text = await file.text();
        const mesh = parseOBJ(text);
        setTargetMesh(mesh);
        setSelectedShape('Custom');
      } else if (extension === 'stl') {
        const buffer = await file.arrayBuffer();
        const mesh = parseSTL(buffer);
        setTargetMesh(mesh);
        setSelectedShape('Custom');
      } else {
        console.warn('Unsupported file format:', extension);
      }
    } catch (error) {
      console.error('Failed to import file:', error);
    }
  }, [setTargetMesh, setSelectedShape]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileImport(file);
    }
  }, [handleFileImport]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileImport(file);
    }
  }, [handleFileImport]);

  return (
    <Panel title="Target Shape" noPadding className="h-full">
      <div className="flex h-full min-h-0">
        {/* 3D Viewer */}
        <div
          className="flex-1 relative"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <ShapeViewer3D />

          {/* Drop zone overlay */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
            <div className="pointer-events-auto absolute inset-4 border-2 border-dashed border-[var(--border-light)] rounded-lg flex items-center justify-center opacity-0 [.dragging_&]:opacity-100">
              <span className="text-[var(--text-secondary)]">Drop OBJ/STL file</span>
            </div>
          </div>

          {/* Import button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-3 right-3 px-2 py-1 text-xs bg-[var(--bg-surface)] text-[var(--text-secondary)]
                       border border-[var(--border)] rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            Import OBJ/STL
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".obj,.stl"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {/* Controls sidebar */}
        <div className="w-48 border-l border-[var(--border)] bg-[var(--bg-surface)] p-3 space-y-4 overflow-y-auto">
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
              Presets
            </h4>
            <ShapePresets />
          </div>
          <ShapeControls />
        </div>
      </div>
    </Panel>
  );
}
