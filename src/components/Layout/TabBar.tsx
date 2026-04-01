import { useAppStore } from '../../store/useAppStore';
import type { ActiveTab } from '../../types';

interface TabConfig {
  id: ActiveTab;
  icon: string;
  label: string;
}

const TABS: TabConfig[] = [
  { id: 'Shape', icon: '🎯', label: 'Shape' },
  { id: 'Pattern', icon: '✏️', label: 'Pattern' },
  { id: 'Result', icon: '🎬', label: 'Result' },
  { id: 'Inspector', icon: '🔧', label: 'Inspector' },
];

export function MobileTabBar() {
  const { activeTab, setActiveTab } = useAppStore();

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[var(--bg-panel)] border-t border-[var(--border)] z-50 safe-area-inset-bottom">
      <div className="flex items-stretch h-16">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
              activeTab === tab.id
                ? 'text-[var(--accent)] bg-[var(--bg-surface)]'
                : 'text-[var(--text-secondary)] active:bg-[var(--bg-hover)]'
            }`}
          >
            <span className="text-xl" role="img" aria-label={tab.label}>
              {tab.icon}
            </span>
            <span className="text-xs font-medium">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function DesktopTabBar() {
  const { activeTab, setActiveTab } = useAppStore();

  return (
    <div className="hidden md:flex h-8 bg-[var(--bg-darkest)] border-b border-[var(--border)] px-2 items-center gap-1">
      {TABS.slice(0, 3).map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`px-4 py-1.5 text-sm rounded-t transition-colors flex items-center gap-2 ${
            activeTab === tab.id
              ? 'bg-[var(--bg-panel)] text-[var(--text-primary)] border-t-2 border-[var(--accent)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]'
          }`}
        >
          <span role="img" aria-label={tab.label}>
            {tab.icon}
          </span>
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
