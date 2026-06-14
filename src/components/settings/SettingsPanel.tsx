// 设置面板 - 应用全局设置（剪贴板/翻译/交互/外观/关于）；无系统装饰窗，首行 Logo+标题+关闭，其下为 Tab
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAppConfig } from '@/hooks/useAppConfig'
import { DEFAULT_CONFIG, type TranslateResult } from '@/types'
import { getInvokeErrorMessage } from '@/lib/invoke-helpers'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import AppLogoIcon from '@/components/shared/AppLogoIcon'
import { SETTINGS_TAB, SETTINGS_TAB_ITEMS, type SettingsTabId } from '@/components/settings/constants'
import SettingsGeneralTab from '@/components/settings/SettingsGeneralTab'

const SettingsClipboardTab = lazy(() => import('@/components/settings/SettingsClipboardTab'))
const SettingsTranslateTab = lazy(() => import('@/components/settings/SettingsTranslateTab'))
const SettingsShortcutsTab = lazy(() => import('@/components/settings/SettingsShortcutsTab'))
const SettingsLauncherTab = lazy(() => import('@/components/settings/SettingsLauncherTab'))
const SettingsAboutTab = lazy(() => import('@/components/settings/SettingsAboutTab'))

function SettingsTabFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="正在加载该设置分类"
      className="flex min-h-[140px] flex-col items-center justify-center gap-2 py-10"
    >
      <div className="relative size-6">
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-border/50 border-t-primary" />
      </div>
      <span className="text-xs text-muted-foreground">加载中…</span>
    </div>
  )
}

/** 悬停标签时预取 chunk，减轻首次点击时的等待感 */
function prefetchSettingsTabChunk(tab: SettingsTabId) {
  switch (tab) {
    case SETTINGS_TAB.clipboard:
      void import('@/components/settings/SettingsClipboardTab')
      break
    case SETTINGS_TAB.translate:
      void import('@/components/settings/SettingsTranslateTab')
      break
    case SETTINGS_TAB.shortcuts:
      void import('@/components/settings/SettingsShortcutsTab')
      break
    case SETTINGS_TAB.launcher:
      void import('@/components/settings/SettingsLauncherTab')
      break
    case SETTINGS_TAB.about:
      void import('@/components/settings/SettingsAboutTab')
      break
    default:
      break
  }
}

export interface SettingsPanelProps {
  /** 嵌入主应用壳层时隐藏自带标题栏，由 MainAppShell 统一提供 */
  embedded?: boolean
}

export default function SettingsPanel({ embedded = false }: SettingsPanelProps) {
  const { config, updateConfig, loaded } = useAppConfig()
  const configRef = useRef(config)
  configRef.current = config
  const launcherExcludedDirNames = config.launcherFileSearchExcludedDirNames ?? []
  const [testing, setTesting] = useState(false)
  const [testFeedback, setTestFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [appVersion, setAppVersion] = useState('')
  const [activeTab, setActiveTab] = useState<SettingsTabId>(SETTINGS_TAB.general)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [launcherExcludeDirInput, setLauncherExcludeDirInput] = useState('')
  /** 曾打开过的 Tab 保持挂载，避免切回时丢失滚动位置与未提交的局部状态 */
  const [visitedTabs, setVisitedTabs] = useState<Set<SettingsTabId>>(
    () => new Set<SettingsTabId>([SETTINGS_TAB.general])
  )

  const handleTabChange = useCallback((value: string) => {
    const id = value as SettingsTabId
    setActiveTab(id)
    setVisitedTabs((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion('unknown'))
  }, [])

  const runTranslateConnectionTest = useCallback(async () => {
    const cfg = configRef.current
    setTestFeedback(null)
    const p = cfg.translateProvider
    if (p === 'baidu' && (!cfg.baidu.appId.trim() || !cfg.baidu.secret.trim())) {
      setTestFeedback({ ok: false, text: '请先填写百度翻译的 App ID 与密钥。' })
      return
    }
    if (p === 'google' && !cfg.google.apiKey.trim()) {
      setTestFeedback({ ok: false, text: '请先填写 Google Cloud API Key。' })
      return
    }
    if (p === 'openai') {
      const baseUrl = cfg.openai.apiBaseUrl.trim()
      if (!cfg.openai.apiKey.trim() || !baseUrl) {
        setTestFeedback({ ok: false, text: '请先填写 OpenAI 的 API Key 与 API 根路径。' })
        return
      }
      if (!/^https?:\/\//i.test(baseUrl)) {
        setTestFeedback({ ok: false, text: 'OpenAI API 根路径必须以 http:// 或 https:// 开头。' })
        return
      }
      try {
        // 仅校验可解析；实际请求由后端拼接 /chat/completions
        // eslint-disable-next-line no-new
        new URL(baseUrl)
      } catch {
        setTestFeedback({ ok: false, text: 'OpenAI API 根路径无法解析为合法 URL。' })
        return
      }
    }
    if (p === 'youdao' && (!cfg.youdao.appKey.trim() || !cfg.youdao.appSecret.trim())) {
      setTestFeedback({ ok: false, text: '请先填写有道智云的应用 ID 与应用密钥。' })
      return
    }
    setTesting(true)
    try {
      const res = await invoke<TranslateResult>('test_translate_connection', {
        provider: cfg.translateProvider,
        config: cfg
      })
      const sample = (res.translatedText ?? '').trim()
      setTestFeedback({
        ok: true,
        text: sample ? `连接成功，示例译文：${sample}` : '连接成功（未返回译文文本，请检查模型或接口响应）。'
      })
    } catch (err) {
      const msg = getInvokeErrorMessage(err)
      setTestFeedback({ ok: false, text: msg || '请求失败' })
    } finally {
      setTesting(false)
    }
  }, [])

  // hooks 必须在任何条件 return 之前声明，否则 loaded 变化会改变 hooks 顺序触发警告/抛错
  const handleCloseWindow = useCallback(() => {
    void invoke('hide_settings_window').catch((err) => {
      toast.error(getInvokeErrorMessage(err) || '无法关闭设置窗口')
    })
  }, [])

  if (!loaded) {
    return (
      <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 p-6">
        <div className="relative size-7">
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-border/50 border-t-primary" />
        </div>
        <span className="text-xs text-muted-foreground">加载设置中…</span>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col bg-background text-foreground', embedded ? 'h-full min-h-0' : 'h-screen')}>
      {!embedded ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3" data-tauri-drag-region>
            <AppLogoIcon className="size-5 shrink-0" alt="" aria-hidden />
            <h1 className="min-w-0 truncate text-sm font-semibold tracking-tight" data-tauri-drag-region>
              Kitty Tools 设置
            </h1>
          </div>
          <div className="shrink-0" data-no-drag="true">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-8 text-muted-foreground hover:text-foreground"
              onClick={handleCloseWindow}
              aria-label="关闭窗口"
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}

      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col min-h-0">
        <div
          className={cn(
            'max-w-full min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain',
            'touch-pan-x [-webkit-overflow-scrolling:touch]'
          )}
          data-tauri-drag-region
        >
          <TabsList className="inline-flex h-auto w-max max-w-none flex-nowrap justify-start gap-1 p-1 m-2 mx-3 sm:mx-4">
            {SETTINGS_TAB_ITEMS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} onPointerEnter={() => prefetchSettingsTabChunk(tab.value)}>
                <tab.icon className="size-4 opacity-80" aria-hidden />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <ScrollArea className="flex-1 mt-2">
          <div className="p-4 space-y-6">
            <TabsContent value={SETTINGS_TAB.clipboard} className="mt-0 space-y-5" forceMount>
              {visitedTabs.has(SETTINGS_TAB.clipboard) ? (
                <Suspense fallback={<SettingsTabFallback />}>
                  <SettingsClipboardTab config={config} updateConfig={updateConfig} />
                </Suspense>
              ) : null}
            </TabsContent>

            <TabsContent value={SETTINGS_TAB.translate} className="mt-0 space-y-5" forceMount>
              {visitedTabs.has(SETTINGS_TAB.translate) ? (
                <Suspense fallback={<SettingsTabFallback />}>
                  <SettingsTranslateTab
                    config={config}
                    updateConfig={updateConfig}
                    testing={testing}
                    testFeedback={testFeedback}
                    runTranslateConnectionTest={runTranslateConnectionTest}
                  />
                </Suspense>
              ) : null}
            </TabsContent>

            <TabsContent value={SETTINGS_TAB.shortcuts} className="mt-0" forceMount>
              {visitedTabs.has(SETTINGS_TAB.shortcuts) ? (
                <Suspense fallback={<SettingsTabFallback />}>
                  <SettingsShortcutsTab config={config} updateConfig={updateConfig} />
                </Suspense>
              ) : null}
            </TabsContent>

            <TabsContent value={SETTINGS_TAB.launcher} className="mt-0 space-y-5" forceMount>
              {visitedTabs.has(SETTINGS_TAB.launcher) ? (
                <Suspense fallback={<SettingsTabFallback />}>
                  <SettingsLauncherTab
                    config={config}
                    updateConfig={updateConfig}
                    launcherExcludedDirNames={launcherExcludedDirNames}
                    launcherExcludeDirInput={launcherExcludeDirInput}
                    setLauncherExcludeDirInput={setLauncherExcludeDirInput}
                  />
                </Suspense>
              ) : null}
            </TabsContent>

            <TabsContent value={SETTINGS_TAB.general} className="mt-0 space-y-5" forceMount>
              {visitedTabs.has(SETTINGS_TAB.general) ? (
                <SettingsGeneralTab config={config} updateConfig={updateConfig} />
              ) : null}
            </TabsContent>

            <TabsContent value={SETTINGS_TAB.about} className="mt-0" forceMount>
              {visitedTabs.has(SETTINGS_TAB.about) ? (
                <Suspense fallback={<SettingsTabFallback />}>
                  <SettingsAboutTab appVersion={appVersion} onRequestReset={() => setResetConfirmOpen(true)} />
                </Suspense>
              ) : null}
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>

      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>恢复默认设置</AlertDialogTitle>
            <AlertDialogDescription>
              除百度/谷歌/OpenAI/有道已填密钥外，其余选项（含外观、剪贴板、快捷键等）均恢复为安装默认。确定？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await updateConfig({
                    ...DEFAULT_CONFIG,
                    baidu: { ...config.baidu },
                    google: { ...config.google },
                    openai: { ...config.openai },
                    youdao: { ...config.youdao },
                    firstRun: false
                  })
                  toast.success('已恢复默认设置')
                } catch (e) {
                  toast.error(getInvokeErrorMessage(e))
                }
              }}
            >
              确定恢复
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
