import { useCallback, useEffect, useRef, useState } from 'react';

interface PanelResizerProps {
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
}

export function PanelResizer({ direction, onResize }: PanelResizerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startPosRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startPosRef.current = direction === 'horizontal' ? e.clientX : e.clientY;
  }, [direction]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = currentPos - startPosRef.current;
      startPosRef.current = currentPos;
      onResize(delta);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, direction, onResize]);

  const isHorizontal = direction === 'horizontal';

  return (
    <div
      className={`relative flex-shrink-0 ${
        isHorizontal
          ? 'w-1 cursor-col-resize hover:bg-[var(--accent)]'
          : 'h-1 cursor-row-resize hover:bg-[var(--accent)]'
      } ${isDragging ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'} transition-colors`}
      onMouseDown={handleMouseDown}
    >
      <div
        className={`absolute ${
          isHorizontal
            ? 'top-0 bottom-0 left-1/2 w-3 -translate-x-1/2'
            : 'left-0 right-0 top-1/2 h-3 -translate-y-1/2'
        }`}
      />
    </div>
  );
}
