import { useState } from 'react';
import { IconMoon, IconSun } from '@tabler/icons-react';
import { t } from './i18n';

const SIDEBAR_TABS = ['Inventory', 'Library', 'Setups', 'Issues'] as const;
const CANVAS_TABS = ['Layout', 'Patch', 'Face', 'Tables'] as const;

export function App() {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [sidebarTab, setSidebarTab] = useState<(typeof SIDEBAR_TABS)[number]>('Inventory');
  const [canvasTab, setCanvasTab] = useState<(typeof CANVAS_TABS)[number]>('Layout');

  return (
    <div className={dark ? 'dark h-full' : 'h-full'}>
      <div className="flex h-full flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
        <header className="flex items-center gap-3 border-b border-neutral-200 px-3 py-2 dark:border-neutral-700">
          <h1 className="text-sm font-semibold">{t('Studio Planner')}</h1>
          <div className="flex-1" />
          <button
            type="button"
            aria-label={t('Toggle theme')}
            className="rounded p-1 hover:bg-neutral-200 dark:hover:bg-neutral-800"
            onClick={() => setDark((d) => !d)}
          >
            {dark ? <IconSun size={18} /> : <IconMoon size={18} />}
          </button>
        </header>
        <div className="flex min-h-0 flex-1">
          <aside className="w-64 border-r border-neutral-200 dark:border-neutral-700" aria-label={t('Sidebar')}>
            <nav className="flex border-b border-neutral-200 text-xs dark:border-neutral-700" role="tablist">
              {SIDEBAR_TABS.map((tab) => (
                <button
                  key={tab}
                  role="tab"
                  aria-selected={sidebarTab === tab}
                  className={`flex-1 px-2 py-1.5 ${sidebarTab === tab ? 'font-semibold' : 'text-neutral-500'}`}
                  onClick={() => setSidebarTab(tab)}
                >
                  {t(tab)}
                </button>
              ))}
            </nav>
          </aside>
          <main className="flex min-w-0 flex-1 flex-col">
            <nav className="flex gap-1 border-b border-neutral-200 px-2 text-xs dark:border-neutral-700" role="tablist">
              {CANVAS_TABS.map((tab) => (
                <button
                  key={tab}
                  role="tab"
                  aria-selected={canvasTab === tab}
                  className={`px-3 py-1.5 ${canvasTab === tab ? 'border-b-2 border-current font-semibold' : 'text-neutral-500'}`}
                  onClick={() => setCanvasTab(tab)}
                >
                  {t(tab)}
                </button>
              ))}
            </nav>
            <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
              {t('{view} view', { view: t(canvasTab) })}
            </div>
          </main>
          <aside className="w-72 border-l border-neutral-200 dark:border-neutral-700" aria-label={t('Inspector')} />
        </div>
        <footer className="border-t border-neutral-200 px-3 py-1 text-xs text-neutral-500 dark:border-neutral-700">
          mm
        </footer>
      </div>
    </div>
  );
}
