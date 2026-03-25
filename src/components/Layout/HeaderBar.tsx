import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { LayoutMode } from '../../types';

const LAYOUT_MODES: { value: LayoutMode; label: string }[] = [
  { value: 'Explore', label: 'Explore' },
  { value: 'ShapeFocus', label: 'Shape' },
  { value: 'PatternFocus', label: 'Pattern' },
  { value: 'ResultFocus', label: 'Result' },
];

interface MenuItemProps {
  label: string;
  onClick: () => void;
  shortcut?: string;
}

function MenuItem({ label, onClick, shortcut }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      className="w-full px-3 py-1.5 text-sm text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)] flex justify-between items-center"
    >
      <span>{label}</span>
      {shortcut && <span className="text-xs text-[var(--text-muted)] ml-4">{shortcut}</span>}
    </button>
  );
}

interface MenuProps {
  label: string;
  items: MenuItemProps[];
}

function Menu({ label, items }: MenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative" onMouseLeave={() => setIsOpen(false)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsOpen(true)}
        className="px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
      >
        {label}
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-0.5 py-1 min-w-[160px] bg-[var(--bg-panel)] border border-[var(--border)] rounded shadow-lg z-50">
          {items.map((item, i) => (
            <MenuItem key={i} {...item} onClick={() => { item.onClick(); setIsOpen(false); }} />
          ))}
        </div>
      )}
    </div>
  );
}

export function HeaderBar() {
  const {
    layoutMode,
    setLayoutMode,
    setExportModalOpen,
    inspectorOpen,
    setInspectorOpen,
  } = useAppStore();

  const fileMenuItems: MenuItemProps[] = [
    { label: 'New Project', onClick: () => window.location.reload(), shortcut: 'Ctrl+N' },
    { label: 'Open Project...', onClick: () => {/* TODO */}, shortcut: 'Ctrl+O' },
    { label: 'Save Project', onClick: () => {/* TODO */}, shortcut: 'Ctrl+S' },
    { label: 'Export...', onClick: () => setExportModalOpen(true), shortcut: 'Ctrl+E' },
  ];

  const editMenuItems: MenuItemProps[] = [
    { label: 'Undo', onClick: () => {/* TODO */}, shortcut: 'Ctrl+Z' },
    { label: 'Redo', onClick: () => {/* TODO */}, shortcut: 'Ctrl+Shift+Z' },
    { label: 'Reset Pattern', onClick: () => {/* TODO */} },
    { label: 'Reset Shape', onClick: () => {/* TODO */} },
  ];

  const viewMenuItems: MenuItemProps[] = [
    { label: inspectorOpen ? 'Hide Inspector' : 'Show Inspector', onClick: () => setInspectorOpen(!inspectorOpen), shortcut: 'I' },
    { label: 'Reset Camera', onClick: () => {/* TODO */}, shortcut: 'R' },
    { label: 'Fit to View', onClick: () => {/* TODO */}, shortcut: 'F' },
  ];

  return (
    <header className="h-10 bg-[var(--bg-panel)] border-b border-[var(--border)] flex items-center justify-between px-2 shrink-0">
      <div className="flex items-center">
        <div className="flex items-center gap-1 px-2">
          <svg className="w-5 h-5 text-[var(--accent)]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18l6.9 3.45L12 11.27l-6.9-3.64L12 4.18zM4 8.27l7 3.5v7.73l-7-3.5V8.27zm9 11.23V11.77l7-3.5v7.73l-7 3.5z"/>
          </svg>
          <span className="text-sm font-semibold text-[var(--text-primary)]">SmockingCAD</span>
        </div>

        <div className="flex items-center ml-4">
          <Menu label="File" items={fileMenuItems} />
          <Menu label="Edit" items={editMenuItems} />
          <Menu label="View" items={viewMenuItems} />
        </div>
      </div>

      <div className="flex items-center gap-1">
        {LAYOUT_MODES.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setLayoutMode(value)}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              layoutMode === value
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setExportModalOpen(true)}
          className="px-3 py-1 text-xs bg-[var(--accent)] text-white rounded hover:bg-[var(--accent-hover)] transition-colors"
        >
          Export
        </button>
      </div>
    </header>
  );
}
