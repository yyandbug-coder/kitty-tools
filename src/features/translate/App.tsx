import { Settings } from 'lucide-react'
import logoUrl from '@translate/assets/images/logo.png'
import { TooltipProvider } from '@translate/components/ui/tooltip'
import { SettingsPanel } from '@translate/components/SettingsPanel'
import { themedChromeSurfaceClassName } from '@/shared/lib/theme-surfaces'
import { cn } from '@clipboard/lib/utils'
function App() {
  return (
    <TooltipProvider>
      <div className="flex min-h-0 flex-1 flex-col bg-[radial-gradient(circle_at_top_left,color-mix(in_oklch,var(--theme-accent,var(--ring))_10%,transparent),transparent_32%),linear-gradient(180deg,color-mix(in_oklch,var(--background)_92%,white_8%),color-mix(in_oklch,var(--background)_86%,transparent))]">
        <header
          className={cn(
            'flex items-center gap-2 border-b px-4 py-2',
            themedChromeSurfaceClassName,
            'border-[color-mix(in_oklch,var(--border)_30%,transparent)]',
          )}
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
            <Settings className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <h1 className="text-sm font-semibold tracking-tight">设置</h1>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-4 pb-4 pt-2">
          <div className="min-h-0 min-w-0 px-1.5 pt-1.5 pb-0.5">
            <SettingsPanel />
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}

export default App
