// 设置面板 - 应用全局设置（剪贴板/翻译/交互/外观/关于）
import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import toast from 'react-hot-toast'
import { useAppConfig } from '@/hooks/useAppConfig'
import { useTheme } from '@/hooks/useTheme'
import { DEFAULT_CONFIG, type TranslateResult } from '@/types'
import { cn } from '@/lib/utils'
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
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import AppLogoIcon from '@/components/shared/AppLogoIcon'
import { SETTINGS_TAB, SETTINGS_TAB_ITEMS, type SettingsTabId } from '@/components/settings/constants'
import SettingsClipboardTab from '@/components/settings/SettingsClipboardTab'
import SettingsTranslateTab from '@/components/settings/SettingsTranslateTab'
import SettingsShortcutsTab from '@/components/settings/SettingsShortcutsTab'
import SettingsLauncherTab from '@/components/settings/SettingsLauncherTab'
import SettingsGeneralTab from '@/components/settings/SettingsGeneralTab'
import SettingsAboutTab from '@/components/settings/SettingsAboutTab'

export default function SettingsPanel() {
  const { config, updateConfig, loaded } = useAppConfig()
  const launcherExcludedDirNames = config.launcherFileSearchExcludedDirNames ?? []
  const [testing, setTesting] = useState(false)
  const [testFeedback, setTestFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [appVersion, setAppVersion] = useState('')
  const [activeTab, setActiveTab] = useState<SettingsTabId>(SETTINGS_TAB.general)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [launcherExcludeDirInput, setLauncherExcludeDirInput] = useState('')
  useTheme(config.theme)

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion('unknown'))
  }, [])

  const runTranslateConnectionTest = useCallback(async () => {
    setTestFeedback(null)
    const p = config.translateProvider
    if (p === 'baidu' && (!config.baidu.appId.trim() || !config.baidu.secret.trim())) {
      setTestFeedback({ ok: false, text: '请先填写百度翻译的 App ID 与密钥。' })
      return
    }
    if (p === 'google' && !config.google.apiKey.trim()) {
      setTestFeedback({ ok: false, text: '请先填写 Google Cloud API Key。' })
      return
    }
    if (p === 'openai' && (!config.openai.apiKey.trim() || !config.openai.apiBaseUrl.trim())) {
      setTestFeedback({ ok: false, text: '请先填写 OpenAI 的 API Key 与 API 根路径。' })
      return
    }
    if (p === 'youdao' && (!config.youdao.appKey.trim() || !config.youdao.appSecret.trim())) {
      setTestFeedback({ ok: false, text: '请先填写有道智云的应用 ID 与应用密钥。' })
      return
    }
    setTesting(true)
    try {
      const res = await invoke<TranslateResult>('test_translate_connection', {
        provider: config.translateProvider,
        config,
      })
      const sample = (res.translatedText ?? '').trim()
      setTestFeedback({
        ok: true,
        text: sample ? `连接成功，示例译文：${sample}` : '连接成功（未返回译文文本，请检查模型或接口响应）。',
      })
    } catch (err) {
      const msg = typeof err === 'string' ? err : String(err)
      setTestFeedback({ ok: false, text: msg || '请求失败' })
    } finally {
      setTesting(false)
    }
  }, [config])

  if (!loaded) return <div className="p-4 text-muted-foreground">加载中...</div>

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      <div className="flex items-center gap-3 px-4 py-3 border-b" data-tauri-drag-region>
        <AppLogoIcon className="size-5" />
        <h1 className="text-sm font-semibold tracking-tight" data-tauri-drag-region>
          Kitty Tools 设置
        </h1>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SettingsTabId)} className="flex-1 flex flex-col min-h-0">
        <div
          className={cn(
            'max-w-full min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain',
            'touch-pan-x [-webkit-overflow-scrolling:touch]',
          )}
        >
          <TabsList className="inline-flex h-auto w-max max-w-none flex-nowrap justify-start gap-1 p-1 mx-4 mt-3">
            {SETTINGS_TAB_ITEMS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                <tab.icon className="size-4 opacity-80" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <ScrollArea className="flex-1 mt-2">
          <div className="p-4 space-y-6">
            <TabsContent value={SETTINGS_TAB.clipboard} className="mt-0 space-y-5">
              <SettingsClipboardTab config={config} updateConfig={updateConfig} />
            </TabsContent>

            <TabsContent value={SETTINGS_TAB.translate} className="mt-0 space-y-5">
              <SettingsTranslateTab
                config={config}
                updateConfig={updateConfig}
                testing={testing}
                testFeedback={testFeedback}
                runTranslateConnectionTest={runTranslateConnectionTest}
              />
            </TabsContent>

            <TabsContent value={SETTINGS_TAB.shortcuts} className="mt-0">
              <SettingsShortcutsTab config={config} updateConfig={updateConfig} />
            </TabsContent>

            <TabsContent value={SETTINGS_TAB.launcher} className="mt-0 space-y-5">
              <SettingsLauncherTab
                config={config}
                updateConfig={updateConfig}
                launcherExcludedDirNames={launcherExcludedDirNames}
                launcherExcludeDirInput={launcherExcludeDirInput}
                setLauncherExcludeDirInput={setLauncherExcludeDirInput}
              />
            </TabsContent>

            <TabsContent value={SETTINGS_TAB.general} className="mt-0 space-y-5">
              <SettingsGeneralTab config={config} updateConfig={updateConfig} />
            </TabsContent>

            <TabsContent value={SETTINGS_TAB.about} className="mt-0">
              <SettingsAboutTab appVersion={appVersion} onRequestReset={() => setResetConfirmOpen(true)} />
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
                    firstRun: false,
                  })
                  toast.success('已恢复默认设置')
                } catch (e) {
                  toast.error(typeof e === 'string' ? e : String(e))
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
