import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { PanelsTopLeftIcon, Settings2Icon, SparklesIcon, WandSparklesIcon } from 'lucide-react'
import SettingsWindowApp from '@clipboard/components/SettingsWindowApp'
import TranslateSettingsApp from '@translate/App'
import { useWorkspaceSettings } from '@/app/hooks/useWorkspaceSettings'
import type { AppModuleId } from '@/shared/types/app'
import { cn } from '@clipboard/lib/utils'

const SETTINGS_TABS: Array<{
  id: Extract<AppModuleId, 'translate' | 'clipboard-history'>
  label: string
  description: string
  icon: typeof WandSparklesIcon
}> = [
  {
    id: 'translate',
    label: '引导与翻译',
    description: '首次启动引导、翻译服务、划词与截图快捷键。',
    icon: WandSparklesIcon,
  },
  {
    id: 'clipboard-history',
    label: '剪贴板历史',
    description: '历史记录、显示风格、清理与导入导出。',
    icon: PanelsTopLeftIcon,
  },
]

async function showClipboardPanel() {
  await invoke('window_show_clipboard_panel')
}

function normalizeSettingsTab(moduleId: AppModuleId): Extract<AppModuleId, 'translate' | 'clipboard-history'> {
  if (moduleId === 'clipboard-history') {
    return 'clipboard-history'
  }

  return 'translate'
}

export default function WorkspaceApp() {
  const { settings, loaded, setLastActiveModule } = useWorkspaceSettings()
  const [activeTab, setActiveTab] = useState<Extract<AppModuleId, 'translate' | 'clipboard-history'>>(
    normalizeSettingsTab(settings.lastActiveModule),
  )

  useEffect(() => {
    if (loaded) {
      setActiveTab(normalizeSettingsTab(settings.lastActiveModule))
    }
  }, [loaded, settings.lastActiveModule])

  useEffect(() => {
    let unlisten: (() => void) | undefined

    void listen<AppModuleId>('workspace:navigate', (event) => {
      const next = normalizeSettingsTab(event.payload)
      setActiveTab(next)
      setLastActiveModule(next)
    }).then((fn) => {
      unlisten = fn
    })

    return () => {
      unlisten?.()
    }
  }, [setLastActiveModule])

  const currentTab = SETTINGS_TABS.find((tab) => tab.id === activeTab) ?? SETTINGS_TABS[0]

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(242,93,120,0.14),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,255,255,0.9))] text-foreground">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border/60 bg-background/78 px-6 py-4 backdrop-blur">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Settings2Icon className="size-4 text-primary" />
            <p className="text-sm font-semibold tracking-tight">Kitty Utils 设置</p>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            常驻系统托盘；日常功能通过快捷键和托盘菜单触发。
          </p>
        </div>

        <button
          type="button"
          className="hidden items-center gap-2 rounded-xl border border-border/70 bg-background/90 px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent/60 lg:flex"
          onClick={() => {
            void showClipboardPanel()
          }}
        >
          <PanelsTopLeftIcon className="size-4" />
          打开历史记录面板
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-6 pt-5">
        <div className="mb-4 flex shrink-0 flex-wrap gap-2">
          {SETTINGS_TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = tab.id === activeTab

            return (
              <button
                key={tab.id}
                type="button"
                className={cn(
                  'flex items-center gap-2 rounded-2xl border px-4 py-3 text-left transition-colors',
                  isActive
                    ? 'border-primary/30 bg-primary/10 text-foreground shadow-sm'
                    : 'border-border/60 bg-background/75 text-muted-foreground hover:bg-accent/55 hover:text-foreground',
                )}
                onClick={() => {
                  setActiveTab(tab.id)
                  setLastActiveModule(tab.id)
                }}
              >
                <Icon className="size-4" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{tab.label}</span>
                  <span className="block text-xs leading-5">{tab.description}</span>
                </span>
              </button>
            )
          })}
        </div>

        <div className="mb-4 shrink-0 rounded-[24px] border border-border/60 bg-card/80 px-4 py-3 shadow-sm">
          <div className="flex items-start gap-3">
            <SparklesIcon className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{currentTab.label}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{currentTab.description}</p>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-[28px] border border-border/60 bg-background/86 shadow-sm backdrop-blur">
          {activeTab === 'translate' ? <TranslateSettingsApp /> : <SettingsWindowApp />}
        </div>
      </div>
    </div>
  )
}
