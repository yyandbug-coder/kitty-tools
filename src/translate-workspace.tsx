// 翻译工作台入口页面 - 包含标题栏和翻译面板
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Languages } from 'lucide-react';
import { ConfigProvider, useAppConfig } from '@/hooks/useAppConfig';
import { formatShortcutForDisplay } from '@/lib/platform';
import TranslatePanel from '@/components/translate/TranslatePanel';
import { TooltipProvider } from '@/components/ui/tooltip';
import '@/assets/styles/tailwind/index.css';

function TranslateWorkspaceApp() {
  const { config } = useAppConfig();

  return (
    <TooltipProvider>
      <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground">
        <header
          className="flex shrink-0 flex-col gap-0.5 border-b px-4 py-2"
          data-tauri-drag-region
        >
          <div className="flex items-center gap-2" data-tauri-drag-region>
            <Languages className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <h1 className="text-sm font-semibold tracking-tight">翻译工作台</h1>
          </div>
          <p className="truncate pl-6 text-[11px] leading-tight text-muted-foreground" data-tauri-drag-region>
            划词 {formatShortcutForDisplay(config.hotkeySelection)} · 截图{' '}
            {formatShortcutForDisplay(config.hotkeyScreenshot)}
          </p>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 pt-3">
          <TranslatePanel />
        </div>
      </div>
    </TooltipProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider>
      <TranslateWorkspaceApp />
    </ConfigProvider>
  </React.StrictMode>,
);
