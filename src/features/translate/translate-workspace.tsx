import React from 'react'
import ReactDOM from 'react-dom/client'
import '@translate/assets/styles/tailwind/index.css'
import { Languages } from 'lucide-react'
import logoUrl from '@translate/assets/images/logo.png'
import { ConfigProvider, useConfig } from '@translate/hooks/useConfig'
import { formatShortcutForDisplay } from '@translate/lib/platform'
import { TranslatePanel } from '@translate/components/TranslatePanel'
import { TooltipProvider } from '@translate/components/ui/tooltip'

function TranslateWorkspaceApp() {
  const { config } = useConfig()

  return (
    <TooltipProvider>
      <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-background">
        <header
          className="flex shrink-0 flex-col gap-0.5 border-b px-4 py-2"
          data-tauri-drag-region
        >
          <div className="flex items-center gap-2" data-tauri-drag-region>
            <img
              src={logoUrl}
              alt=""
              width={28}
              height={28}
              className="size-7 shrink-0 object-contain"
              draggable={false}
            />
            <Languages className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <h1 className="text-sm font-semibold tracking-tight">翻译工作台</h1>
          </div>
          <p className="truncate pl-9 text-[11px] leading-tight text-muted-foreground"
            data-tauri-drag-region
          >
            划词 {formatShortcutForDisplay(config.hotkeySelection)} · 截图{' '}
            {formatShortcutForDisplay(config.hotkeyScreenshot)}
          </p>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 pt-3">
          <TranslatePanel />
        </div>
      </div>
    </TooltipProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ConfigProvider>
      <TranslateWorkspaceApp />
    </ConfigProvider>
  </React.StrictMode>,
)
