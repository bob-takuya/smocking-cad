import { useAppStore } from '../../store/useAppStore';
import type { InspectorTab } from '../../types';
import { OptimizationTab } from './OptimizationTab';
import { SingularitiesTab } from './SingularitiesTab';
import { AnalysisTab } from './AnalysisTab';
import { CompareTab } from './CompareTab';

const TABS: { value: InspectorTab; label: string }[] = [
  { value: 'Optimization', label: 'Optimization' },
  { value: 'Singularities', label: 'Singularities' },
  { value: 'Analysis', label: 'Analysis' },
  { value: 'Compare', label: 'Compare' },
];

export function InspectorPanel() {
  const { inspectorTab, setInspectorTab, setInspectorOpen } = useAppStore();

  const renderTabContent = () => {
    switch (inspectorTab) {
      case 'Optimization':
        return <OptimizationTab />;
      case 'Singularities':
        return <SingularitiesTab />;
      case 'Analysis':
        return <AnalysisTab />;
      case 'Compare':
        return <CompareTab />;
      default:
        return null;
    }
  };

  return (
    <div className="h-full bg-[var(--bg-panel)] border-t border-[var(--border)] flex flex-col">
      {/* Tab bar */}
      <div className="flex items-center border-b border-[var(--border)] bg-[var(--bg-surface)] shrink-0">
        <div className="flex-1 flex">
          {TABS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setInspectorTab(value)}
              className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                inspectorTab === value
                  ? 'text-[var(--accent)] border-[var(--accent)]'
                  : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Close button */}
        <button
          onClick={() => setInspectorOpen(false)}
          className="px-3 py-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          title="Close Inspector (I)"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-3">
        {renderTabContent()}
      </div>
    </div>
  );
}
