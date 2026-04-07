import { useCallback, useState, type ReactNode } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { HeaderBar } from './HeaderBar';
import { PanelResizer } from './PanelResizer';
import { MobileTabBar, DesktopTabBar } from './TabBar';

interface LayoutProps {
  patternPanel: ReactNode;
  resultPanel: ReactNode;
}

export function Layout({ patternPanel, resultPanel }: LayoutProps) {
  const { activeTab } = useAppStore();

  const [splitPct, setSplitPct] = useState(50);

  const handleResize = useCallback((delta: number) => {
    setSplitPct(prev => {
      const pct = (delta / window.innerWidth) * 100;
      return Math.max(25, Math.min(75, prev + pct));
    });
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--bg-darkest)] overflow-hidden">
      <HeaderBar />
      <DesktopTabBar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Desktop: 2-column layout */}
        <div className="hidden md:flex flex-1 overflow-hidden min-h-0">
          <div className="overflow-hidden flex flex-col min-h-0" style={{ width: `${splitPct}%` }}>
            {patternPanel}
          </div>
          <PanelResizer direction="horizontal" onResize={handleResize} />
          <div className="overflow-hidden flex flex-col min-h-0" style={{ width: `${100 - splitPct}%` }}>
            {resultPanel}
          </div>
        </div>

        {/* Mobile: single panel */}
        <div className="md:hidden flex-1 overflow-hidden pb-16">
          {activeTab === 'Pattern' && (
            <div className="h-full overflow-hidden">{patternPanel}</div>
          )}
          {activeTab === 'Result' && (
            <div className="h-full overflow-hidden">{resultPanel}</div>
          )}
        </div>
      </div>

      <MobileTabBar />
    </div>
  );
}
