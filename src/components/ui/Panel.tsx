import type { ReactNode } from 'react';

interface PanelProps {
  title?: string;
  children: ReactNode;
  className?: string;
  headerActions?: ReactNode;
  noPadding?: boolean;
}

export function Panel({ title, children, className = '', headerActions, noPadding = false }: PanelProps) {
  return (
    <div className={`bg-[var(--bg-panel)] border border-[var(--border)] rounded-lg flex flex-col overflow-hidden ${className}`}>
      {title && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-surface)]">
          <h3 className="text-sm font-medium text-[var(--text-primary)]">{title}</h3>
          {headerActions && <div className="flex items-center gap-1">{headerActions}</div>}
        </div>
      )}
      <div className={`flex-1 min-h-0 ${noPadding ? 'overflow-hidden flex flex-col' : 'overflow-auto p-3'}`}>
        {children}
      </div>
    </div>
  );
}

interface PanelSectionProps {
  title?: string;
  children: ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

export function PanelSection({ title, children, className = '' }: PanelSectionProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {title && (
        <h4 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          {title}
        </h4>
      )}
      <div className="space-y-2">{children}</div>
    </div>
  );
}
