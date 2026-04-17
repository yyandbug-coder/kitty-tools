import { Languages } from 'lucide-react'
import logoUrl from '@translate/assets/images/logo.png'
import { TooltipProvider } from '@translate/components/ui/tooltip'
import { TranslatePanel } from '@translate/components/TranslatePanel'
import { useConfig } from '@translate/hooks/useConfig'
import { formatShortcutForDisplay } from '@translate/lib/platform'

export function TranslateWorkspaceView() {
  const { config } = useConfig()

  return (
    <TooltipProvider>
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-border/60 bg-background/85 shadow-sm backdrop-blur">
        <header className="flex shrink-0 flex-col gap-0.5 border-b border-border/60 px-5 py-4">
          <div className="flex items-center gap-2">
            <img
              src={logoUrl}
              alt=""
              width={28}
              height={28}
              className="size-7 shrink-0 object-contain"
              draggable={false}
            />
            <Languages className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <h1 className="text-sm font-semibold tracking-tight">Translate Workspace</h1>
          </div>
          <p className="truncate pl-9 text-[11px] leading-tight text-muted-foreground">
            划词 {formatShortcutForDisplay(config.hotkeySelection)} · 截图{' '}
            {formatShortcutForDisplay(config.hotkeyScreenshot)}
          </p>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-5 pt-4">
          <TranslatePanel />
        </div>
      </div>
    </TooltipProvider>
  )
}
