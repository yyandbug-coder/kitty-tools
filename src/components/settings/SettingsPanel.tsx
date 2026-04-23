// 设置面板 - 应用全局设置（通用/剪贴板/翻译/双向互译/OCR/交互/外观/关于）
// 完整迁移自 example/kitty-translate SettingsPanel，保留根应用剪贴板标签页
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  Settings,
  ClipboardList,
  Sun,
  Moon,
  Monitor,
  Zap,
  Keyboard,
  Eye,
  Loader2,
  Globe,
  Palette,
  ScanText,
  RotateCcw,
  CircleHelp,
  Sparkles,
  ArrowRightLeft,
  Power,
} from 'lucide-react'
import { useAppConfig } from '@/hooks/useAppConfig'
import { useTheme } from '@/hooks/useTheme'
import { DEFAULT_CONFIG, type TranslateProvider, type TranslateResult } from '@/types'
import { HISTORY_MAX_ITEMS_OPTIONS, HISTORY_RETENTION_OPTIONS } from '@/lib/history-settings'
import { PRESET_THEMES, getThemeOption, MIN_BACKGROUND_OPACITY, MAX_BACKGROUND_OPACITY } from '@/lib/theme'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { LanguageSelector } from '@/components/shared/LanguageSelector'
import HotkeyInput from '@/components/shared/HotkeyInput'
import SecretField from '@/components/shared/SecretField'
import { cn } from '@/lib/utils'
import { formatShortcutForDisplay } from '@/lib/platform'

const SETTINGS_TAB = {
  welcome: 'welcome',
  general: 'general',
  clipboard: 'clipboard',
  translate: 'translate',
  bidirectional: 'bidirectional',
  ocr: 'ocr',
  shortcuts: 'shortcuts',
  appearance: 'appearance',
  about: 'about',
} as const

export default function SettingsPanel() {
  const { config, updateConfig, loaded } = useAppConfig()
  const [testing, setTesting] = useState(false)
  const [testFeedback, setTestFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [activeTab, setActiveTab] = useState<string>(SETTINGS_TAB.translate)
  const hasShownFirstRunTabRef = useRef(false)
  useTheme(config.theme)

  useLayoutEffect(() => {
    if (!loaded) return
    if (config.firstRun && !hasShownFirstRunTabRef.current) {
      hasShownFirstRunTabRef.current = true
      setActiveTab(SETTINGS_TAB.welcome)
    }
    if (!config.firstRun) hasShownFirstRunTabRef.current = false
  }, [loaded, config.firstRun])

  useLayoutEffect(() => {
    if (!config.firstRun && activeTab === SETTINGS_TAB.welcome) {
      setActiveTab(SETTINGS_TAB.translate)
    }
  }, [config.firstRun, activeTab])

  useLayoutEffect(() => {
    if (config.translateProvider !== 'openai' && activeTab === SETTINGS_TAB.ocr) {
      setActiveTab(SETTINGS_TAB.translate)
    }
  }, [config.translateProvider, activeTab])

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

  const providers: { value: TranslateProvider; label: string }[] = [
    { value: 'baidu', label: '百度翻译' },
    { value: 'google', label: 'Google' },
    { value: 'youdao', label: '有道翻译' },
    { value: 'openai', label: 'OpenAI' },
  ]

  const translateProviderTooltip = (() => {
    const link = 'font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary'
    const mono = 'rounded bg-muted/90 px-1 py-px font-mono text-[11px] text-foreground/90'
    switch (config.translateProvider) {
      case 'baidu':
        return (
          <div className="space-y-2">
            <p>
              <strong className="font-semibold">翻译与百度截图</strong>：使用{' '}
              <a className={link} href="https://fanyi-api.baidu.com/" target="_blank" rel="noreferrer">百度翻译开放平台</a>{' '}
              的 App ID 与密钥。截图会直接走图片翻译，请在控制台开通图片翻译额度。
            </p>
          </div>
        )
      case 'google':
        return (
          <p>
            使用{' '}
            <a className={link} href="https://cloud.google.com/translate/docs/reference/rest/v2/translate" target="_blank" rel="noreferrer">Google Cloud Translation API v2</a>{' '}
            ，请求地址<strong className="font-medium">由应用内置</strong>；填写 API Key（文本翻译与截图识字<strong className="font-medium">共用</strong>）。
          </p>
        )
      case 'youdao':
        return (
          <p>
            使用{' '}
            <a className={link} href="https://ai.youdao.com/" target="_blank" rel="noreferrer">网易有道智云</a>{' '}
            开放能力：填写应用 ID 与应用密钥，并绑定「文本翻译」与「通用文字识别」服务。
          </p>
        )
      case 'openai':
        return (
          <p>
            兼容 OpenAI Chat Completions 的接口。填写根路径（含 <span className={mono}>/v1</span>）、密钥与模型名。
          </p>
        )
      default:
        return null
    }
  })()

  if (!loaded) return <div className="p-4 text-muted-foreground">加载中...</div>

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      {/* 标题栏 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b" data-tauri-drag-region>
        <Settings className="size-4 text-primary" />
        <h1 className="text-sm font-semibold" data-tauri-drag-region>Kitty Tools 设置</h1>
      </div>

      {/* 标签页 */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div className={cn(
          'max-w-full min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain',
          'touch-pan-x [-webkit-overflow-scrolling:touch]',
        )}>
          <TabsList className="inline-flex h-auto min-h-9 w-max max-w-none flex-nowrap justify-start gap-1 p-1 mx-4 mt-3">
            {config.firstRun ? (
              <TabsTrigger value={SETTINGS_TAB.welcome} className="shrink-0 grow-0 gap-1.5 px-2.5 py-2 sm:px-3 max-sm:text-xs">
                <Sparkles className="size-4 opacity-80" />
                入门引导
              </TabsTrigger>
            ) : null}
            <TabsTrigger value={SETTINGS_TAB.general} className="shrink-0 grow-0 gap-1.5 px-2.5 py-2 sm:px-3 max-sm:text-xs">
              <Zap className="size-4 opacity-80" />
              通用
            </TabsTrigger>
            <TabsTrigger value={SETTINGS_TAB.clipboard} className="shrink-0 grow-0 gap-1.5 px-2.5 py-2 sm:px-3 max-sm:text-xs">
              <ClipboardList className="size-4 opacity-80" />
              剪贴板
            </TabsTrigger>
            <TabsTrigger value={SETTINGS_TAB.translate} className="shrink-0 grow-0 gap-1.5 px-2.5 py-2 sm:px-3 max-sm:text-xs">
              <Globe className="size-4 opacity-80" />
              翻译与密钥
            </TabsTrigger>
            <TabsTrigger value={SETTINGS_TAB.bidirectional} className="shrink-0 grow-0 gap-1.5 px-2.5 py-2 sm:px-3 max-sm:text-xs">
              <ArrowRightLeft className="size-4 opacity-80" />
              双向互译
            </TabsTrigger>
            {config.translateProvider === 'openai' ? (
              <TabsTrigger value={SETTINGS_TAB.ocr} className="shrink-0 grow-0 gap-1.5 px-2.5 py-2 sm:px-3 max-sm:text-xs">
                <ScanText className="size-4 opacity-80" />
                截图 OCR
              </TabsTrigger>
            ) : null}
            <TabsTrigger value={SETTINGS_TAB.shortcuts} className="shrink-0 grow-0 gap-1.5 px-2.5 py-2 sm:px-3 max-sm:text-xs">
              <Keyboard className="size-4 opacity-80" />
              交互
            </TabsTrigger>
            <TabsTrigger value={SETTINGS_TAB.appearance} className="shrink-0 grow-0 gap-1.5 px-2.5 py-2 sm:px-3 max-sm:text-xs">
              <Palette className="size-4 opacity-80" />
              外观
            </TabsTrigger>
            <TabsTrigger value={SETTINGS_TAB.about} className="shrink-0 grow-0 gap-1.5 px-2.5 py-2 sm:px-3 max-sm:text-xs">
              <Settings className="size-4 opacity-80" />
              关于
            </TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="flex-1 mt-2">
          <div className="p-4 space-y-6">

            {/* 入门引导 */}
            {config.firstRun ? (
              <TabsContent value={SETTINGS_TAB.welcome} className="mt-0">
                <Card className="border-primary/35 bg-primary/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-medium">
                      <Sparkles className="size-4 text-primary" />
                      欢迎使用 Kitty Tools
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <p>
                      应用会常驻<strong className="font-medium text-foreground">系统托盘</strong>，
                      关闭本窗口不会退出程序。划词与截图翻译可使用全局快捷键，也可从托盘菜单进入「翻译工作台」。
                    </p>
                    <p className="text-xs leading-relaxed">
                      当前快捷键：划词{' '}
                      <span className="font-mono text-foreground/90">{formatShortcutForDisplay(config.hotkeySelection)}</span>
                      {' · '}截图{' '}
                      <span className="font-mono text-foreground/90">{formatShortcutForDisplay(config.hotkeyScreenshot)}</span>
                      {' · '}剪贴板{' '}
                      <span className="font-mono text-foreground/90">{formatShortcutForDisplay(config.clipboardShortcut)}</span>
                    </p>
                    <p>请在下文选择翻译引擎、按需填写密钥，并确认快捷键是否与其他软件冲突。</p>
                    <div className="flex flex-row items-center justify-between gap-4 rounded-lg border border-border/80 bg-background/60 px-3 py-2.5">
                      <div className="flex min-w-0 flex-1 items-start gap-2.5">
                        <Power className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-sm font-medium leading-none text-foreground">开机自启</span>
                          <span className="text-xs text-muted-foreground leading-relaxed">默认关闭；仅在此处或「交互」页可修改。</span>
                        </div>
                      </div>
                      <Switch
                        checked={config.launchOnStartup}
                        onCheckedChange={(v) => void updateConfig({ launchOnStartup: v })}
                        aria-label="开机自启"
                      />
                    </div>
                    <Button
                      size="sm"
                      className="w-fit"
                      onClick={() => void updateConfig({ firstRun: false })}
                    >
                      完成初次设置
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            ) : null}

            {/* 通用 */}
            <TabsContent value={SETTINGS_TAB.general} className="mt-0 space-y-5">
              <Card>
                <CardContent className="space-y-5 pt-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">外观</label>
                    <div className="flex gap-2">
                      {([
                        { value: 'system', icon: Monitor, label: '跟随系统' },
                        { value: 'light', icon: Sun, label: '浅色' },
                        { value: 'dark', icon: Moon, label: '深色' },
                      ] as const).map(({ value, icon: Icon, label }) => (
                        <Button
                          key={value}
                          variant={config.theme === value ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => void updateConfig({ theme: value })}
                          className="text-xs gap-1.5"
                        >
                          <Icon className="size-3.5" />
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">开机自启动</label>
                      <p className="text-xs text-muted-foreground">登录后自动在托盘运行</p>
                    </div>
                    <Switch
                      checked={config.launchOnStartup}
                      onCheckedChange={(v) => void updateConfig({ launchOnStartup: v })}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 剪贴板 */}
            <TabsContent value={SETTINGS_TAB.clipboard} className="mt-0 space-y-5">
              <Card>
                <CardContent className="space-y-5 pt-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      <Keyboard className="size-3.5" />
                      全局快捷键
                    </label>
                    <Input type="text" value={config.clipboardShortcut} readOnly className="text-xs" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">最大条目数</label>
                    <div className="flex flex-wrap gap-2">
                      {HISTORY_MAX_ITEMS_OPTIONS.map((opt) => (
                        <Button
                          key={opt.value}
                          variant={config.clipboardHistoryMax === opt.value ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => void updateConfig({ clipboardHistoryMax: opt.value })}
                          className="text-xs"
                        >
                          {opt.label}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">收藏条目不受此限制影响</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">保留天数</label>
                    <div className="flex flex-wrap gap-2">
                      {HISTORY_RETENTION_OPTIONS.map((opt) => (
                        <Button
                          key={opt.value}
                          variant={config.clipboardHistoryRetentionDays === opt.value ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => void updateConfig({ clipboardHistoryRetentionDays: opt.value })}
                          className="text-xs"
                        >
                          {opt.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">失焦自动隐藏</label>
                      <p className="text-xs text-muted-foreground">失去焦点后自动隐藏面板</p>
                    </div>
                    <Switch
                      checked={config.clipboardHideOnUnfocus}
                      onCheckedChange={(v) => void updateConfig({ clipboardHideOnUnfocus: v })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">回车粘贴</label>
                      <p className="text-xs text-muted-foreground">按回车键直接粘贴选中项</p>
                    </div>
                    <Switch
                      checked={config.clipboardPasteOnEnter}
                      onCheckedChange={(v) => void updateConfig({ clipboardPasteOnEnter: v })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium flex items-center gap-1.5">
                        <Eye className="size-3.5" />
                        显示预览
                      </label>
                      <p className="text-xs text-muted-foreground">在侧边栏显示内容预览</p>
                    </div>
                    <Switch
                      checked={config.clipboardShowPreview}
                      onCheckedChange={(v) => void updateConfig({ clipboardShowPreview: v })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">禁止文本选中</label>
                      <p className="text-xs text-muted-foreground">macOS 风格，防止意外选中文字</p>
                    </div>
                    <Switch
                      checked={config.clipboardDisableTextSelection}
                      onCheckedChange={(v) => void updateConfig({ clipboardDisableTextSelection: v })}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 翻译与密钥 */}
            <TabsContent value={SETTINGS_TAB.translate} className="mt-0">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <Globe className="size-4" />
                    翻译引擎
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex min-w-0 items-center gap-1">
                    <Select
                      value={config.translateProvider}
                      onValueChange={(v) => void updateConfig({ translateProvider: v as TranslateProvider })}
                    >
                      <SelectTrigger className="min-w-0 flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {providers.map((p) => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8 shrink-0 text-muted-foreground" aria-label="当前引擎说明">
                          <CircleHelp className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left" sideOffset={8} className="max-w-xs">
                        {translateProviderTooltip}
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  {config.translateProvider === 'baidu' && (
                    <div className="mt-4 flex flex-col gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="baidu-app-id" className="text-xs font-medium text-foreground">App ID</label>
                        <Input
                          id="baidu-app-id"
                          autoComplete="off"
                          value={config.baidu.appId}
                          onChange={(e) => void updateConfig({ baidu: { ...config.baidu, appId: e.target.value } })}
                          placeholder="例如：12345678"
                        />
                      </div>
                      <SecretField
                        id="baidu-secret"
                        label="密钥"
                        value={config.baidu.secret}
                        onValueChange={(v) => void updateConfig({ baidu: { ...config.baidu, secret: v } })}
                        placeholder="开放平台提供的密钥"
                      />
                    </div>
                  )}
                  {config.translateProvider === 'google' && (
                    <div className="mt-4 flex flex-col gap-3">
                      <SecretField
                        id="google-tr-key"
                        label="API Key（文本翻译与截图 Vision 共用）"
                        value={config.google.apiKey}
                        onValueChange={(v) => void updateConfig({ google: { ...config.google, apiKey: v } })}
                        placeholder="同一密钥；须开通 Translation API 与 Cloud Vision API"
                      />
                    </div>
                  )}
                  {config.translateProvider === 'openai' && (
                    <div className="mt-4 flex flex-col gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="openai-base" className="text-xs font-medium text-foreground">API 根路径</label>
                        <Input
                          id="openai-base"
                          autoComplete="off"
                          value={config.openai.apiBaseUrl}
                          onChange={(e) => void updateConfig({ openai: { ...config.openai, apiBaseUrl: e.target.value } })}
                          placeholder="https://api.openai.com/v1"
                        />
                      </div>
                      <SecretField
                        id="openai-key"
                        label="API Key"
                        value={config.openai.apiKey}
                        onValueChange={(v) => void updateConfig({ openai: { ...config.openai, apiKey: v } })}
                        placeholder="sk-…"
                      />
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="openai-model" className="text-xs font-medium text-foreground">模型</label>
                        <Input
                          id="openai-model"
                          autoComplete="off"
                          value={config.openai.model}
                          onChange={(e) => void updateConfig({ openai: { ...config.openai, model: e.target.value } })}
                          placeholder="gpt-4o-mini"
                        />
                      </div>
                    </div>
                  )}
                  {config.translateProvider === 'youdao' && (
                    <div className="mt-4 flex flex-col gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="youdao-app-key" className="text-xs font-medium text-foreground">应用 ID（appKey）</label>
                        <Input
                          id="youdao-app-key"
                          autoComplete="off"
                          value={config.youdao.appKey}
                          onChange={(e) => void updateConfig({ youdao: { ...config.youdao, appKey: e.target.value } })}
                          placeholder="智云控制台应用 ID"
                        />
                      </div>
                      <SecretField
                        id="youdao-app-secret"
                        label="应用密钥"
                        value={config.youdao.appSecret}
                        onValueChange={(v) => void updateConfig({ youdao: { ...config.youdao, appSecret: v } })}
                        placeholder="智云控制台应用密钥"
                      />
                    </div>
                  )}

                  <div className="mt-4 flex flex-col gap-2 border-t border-border/60 pt-4">
                    <div className="flex gap-3">
                      <div className="space-y-1.5 flex-1">
                        <label className="text-xs text-muted-foreground">源语言</label>
                        <LanguageSelector value={config.sourceLang} onChange={(v) => void updateConfig({ sourceLang: v })} />
                      </div>
                      <div className="space-y-1.5 flex-1">
                        <label className="text-xs text-muted-foreground">目标语言</label>
                        <LanguageSelector value={config.targetLang} onChange={(v) => void updateConfig({ targetLang: v })} excludeCodes={['auto']} />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 border-t border-border/60 pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-fit gap-2"
                      disabled={testing}
                      onClick={() => void runTranslateConnectionTest()}
                    >
                      {testing ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
                      测试连接（密钥与 API）
                    </Button>
                    <p
                      role="status"
                      className={cn(
                        'text-xs leading-relaxed',
                        testFeedback == null && 'text-muted-foreground',
                        testFeedback?.ok === true && 'text-emerald-600 dark:text-emerald-400',
                        testFeedback?.ok === false && 'text-destructive',
                      )}
                    >
                      {testFeedback?.text ?? '使用当前所选引擎与上方已填参数，发送短句「Hello」英→简中试译；不依赖是否已点击保存。'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 双向互译 */}
            <TabsContent value={SETTINGS_TAB.bidirectional} className="mt-0">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <ArrowRightLeft className="size-4" />
                    双向自动互译
                  </CardTitle>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    工作台与浮动窗里需将<strong className="font-medium text-foreground">源语言</strong>
                    设为「自动检测」。仅当本地能判断语种时切换方向；识别为甲乙之外的语言时，仍按当前「目标语言」翻译。
                  </p>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 rounded border-input accent-primary"
                      checked={config.bidirectionalAuto}
                      onChange={(e) => void updateConfig({ bidirectionalAuto: e.target.checked })}
                    />
                    <span className="min-w-0 text-sm leading-snug">
                      <span className="font-medium text-foreground">启用</span>
                      <span className="text-muted-foreground">：识别为语言甲则译向乙，识别为乙则译向甲（例如简中 ↔ 英语）。</span>
                    </span>
                  </label>
                  <div className={cn(
                    'flex flex-col gap-3 transition-opacity',
                    !config.bidirectionalAuto && 'pointer-events-none opacity-45',
                  )}>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <span className="text-xs font-medium text-foreground">互译语言甲</span>
                        <LanguageSelector
                          value={config.bidirectionalLangA}
                          onChange={(v) => void updateConfig({ bidirectionalLangA: v })}
                          excludeCodes={['auto']}
                        />
                      </div>
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <span className="text-xs font-medium text-foreground">互译语言乙</span>
                        <LanguageSelector
                          value={config.bidirectionalLangB}
                          onChange={(v) => void updateConfig({ bidirectionalLangB: v })}
                          excludeCodes={['auto']}
                        />
                      </div>
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      划词与截图（OCR 后文本翻译）均会应用；选择百度「图片翻译」直出时无本地原文识别，仍以当前源/目标语言为准。
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 截图 OCR（仅 OpenAI） */}
            {config.translateProvider === 'openai' ? (
              <TabsContent value={SETTINGS_TAB.ocr} className="mt-0">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-medium">
                      <ScanText className="size-4" />
                      截图翻译 · OCR 配置
                    </CardTitle>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      当前翻译引擎为 <strong className="font-medium text-foreground">OpenAI</strong>
                      时，截图翻译需先把画面上的字识别成文本再交给模型翻译。使用百度、谷歌或有道时不会出现本项。
                    </p>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      OpenAI 路线仅做<strong className="font-medium text-foreground">文本</strong>
                      翻译；截图需单独配置云端 OCR。可优先使用百度「
                      <a className="text-primary underline-offset-2 hover:underline" href="https://cloud.baidu.com/doc/OCR/s/zk3h7xz52" target="_blank" rel="noreferrer">通用文字识别（标准版）</a>
                      」；未配置或失败时可走 Google Cloud Vision（请求地址内置，下方填写 API Key）。
                    </p>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-foreground">百度智能云 · 通用文字识别</span>
                      <label htmlFor="baidu-ocr-base" className="text-xs text-muted-foreground">AIP 根地址（可选）</label>
                      <Input
                        id="baidu-ocr-base"
                        autoComplete="off"
                        value={config.baidu.ocrAipBaseUrl}
                        onChange={(e) => void updateConfig({ baidu: { ...config.baidu, ocrAipBaseUrl: e.target.value } })}
                        placeholder="留空则 https://aip.baidubce.com"
                      />
                      <label htmlFor="baidu-ocr-key" className="text-xs text-muted-foreground">API Key</label>
                      <Input
                        id="baidu-ocr-key"
                        autoComplete="off"
                        value={config.baidu.ocrApiKey}
                        onChange={(e) => void updateConfig({ baidu: { ...config.baidu, ocrApiKey: e.target.value } })}
                        placeholder="智能云文字识别应用的 API Key"
                      />
                      <SecretField
                        id="baidu-ocr-secret"
                        label="Secret Key"
                        labelClassName="text-xs text-muted-foreground"
                        value={config.baidu.ocrSecretKey}
                        onValueChange={(v) => void updateConfig({ baidu: { ...config.baidu, ocrSecretKey: v } })}
                        placeholder="智能云文字识别应用的 Secret Key"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 border-t border-border/60 pt-3">
                      <span className="text-xs font-medium text-foreground">Google Cloud Vision · 文字检测</span>
                      <SecretField
                        id="google-vision-key"
                        label="API Key"
                        labelClassName="text-xs text-muted-foreground"
                        value={config.google.apiKey}
                        onValueChange={(v) => void updateConfig({ google: { ...config.google, apiKey: v } })}
                        placeholder="同一 GCP API 密钥，须开通 Cloud Vision API"
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            ) : null}

            {/* 交互（快捷键） */}
            <TabsContent value={SETTINGS_TAB.shortcuts} className="mt-0">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <Keyboard className="size-4" />
                    交互
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">全局快捷键与开机自启。</p>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    <HotkeyInput
                      id="hotkey-selection"
                      label="划词翻译"
                      value={config.hotkeySelection}
                      defaultValue={DEFAULT_CONFIG.hotkeySelection}
                      onChange={async (v) => updateConfig({ hotkeySelection: v })}
                    />
                    <HotkeyInput
                      id="hotkey-screenshot"
                      label="截图翻译"
                      value={config.hotkeyScreenshot}
                      defaultValue={DEFAULT_CONFIG.hotkeyScreenshot}
                      onChange={async (v) => updateConfig({ hotkeyScreenshot: v })}
                    />
                    <HotkeyInput
                      id="hotkey-clipboard"
                      label="剪贴板历史"
                      value={config.clipboardShortcut}
                      defaultValue={DEFAULT_CONFIG.clipboardShortcut}
                      onChange={async (v) => updateConfig({ clipboardShortcut: v })}
                    />
                    <div className="flex flex-row items-center justify-between gap-4 px-4 py-3">
                      <div className="flex min-w-0 flex-1 items-start gap-2.5">
                        <Power className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-sm font-medium leading-none">开机自启</span>
                          <span className="text-xs text-muted-foreground leading-relaxed">
                            须在本页开关；打开后写入系统登录启动项，关闭后移除。
                          </span>
                        </div>
                      </div>
                      <Switch
                        checked={config.launchOnStartup}
                        onCheckedChange={(v) => void updateConfig({ launchOnStartup: v })}
                        aria-label="开机自启"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 外观 */}
            <TabsContent value={SETTINGS_TAB.appearance} className="mt-0 space-y-5">
              <Card>
                <CardContent className="space-y-5 pt-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">深浅模式</label>
                    <div className="flex gap-1">
                      {([
                        { value: 'light', icon: Sun, label: '浅色' },
                        { value: 'dark', icon: Moon, label: '深色' },
                        { value: 'system', icon: Monitor, label: '跟随系统' },
                      ] as const).map(({ value, label, icon: Icon }) => (
                        <Tooltip key={value}>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                'size-9',
                                config.theme === value && 'bg-accent text-accent-foreground shadow-sm hover:bg-accent hover:text-accent-foreground',
                              )}
                              aria-label={label}
                              aria-pressed={config.theme === value}
                              onClick={() => void updateConfig({ theme: value })}
                            >
                              <Icon className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">{label}</TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">主题色</label>
                    <div className="flex flex-wrap gap-2">
                      {PRESET_THEMES.map((t) => (
                        <Button
                          key={t.id}
                          variant={config.appThemePreset === t.id ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => void updateConfig({ appThemePreset: t.id })}
                          className="text-xs gap-1.5"
                        >
                          <span
                            className="inline-block size-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: t.accent }}
                          />
                          {t.label}
                        </Button>
                      ))}
                      <Button
                        variant={config.appThemePreset === 'custom' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => void updateConfig({ appThemePreset: 'custom' })}
                        className="text-xs gap-1.5"
                      >
                        <span
                          className="inline-block size-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: getThemeOption('custom', config.customHue).accent }}
                        />
                        自定义
                      </Button>
                    </div>
                  </div>

                  {config.appThemePreset === 'custom' && (
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">
                        色相值（0-360）：{config.customHue}
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={360}
                        value={config.customHue}
                        onChange={(e) => void updateConfig({ customHue: Number(e.target.value) })}
                        className="w-full accent-primary"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">
                      背景不透明度（{MIN_BACKGROUND_OPACITY}–{MAX_BACKGROUND_OPACITY}）：{config.backgroundOpacity}%
                    </label>
                    <input
                      type="range"
                      min={MIN_BACKGROUND_OPACITY}
                      max={MAX_BACKGROUND_OPACITY}
                      value={config.backgroundOpacity}
                      onChange={(e) => void updateConfig({ backgroundOpacity: Number(e.target.value) })}
                      className="w-full accent-primary"
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 关于 */}
            <TabsContent value={SETTINGS_TAB.about} className="mt-0">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <Settings className="size-4" />
                    关于
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                    <span>Kitty Tools v0.1.0</span>
                    <span>基于 Tauri v2 与 React 构建的桌面工具集（翻译 + 剪贴板历史）</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-fit gap-1.5"
                    onClick={() => {
                      if (!window.confirm('将语言、翻译引擎、主题、自动复制、开机自启、快捷键等恢复为安装默认；已填写的各厂商密钥会保留。确定？')) return
                      void (async () => {
                        try {
                          await updateConfig({
                            sourceLang: DEFAULT_CONFIG.sourceLang,
                            targetLang: DEFAULT_CONFIG.targetLang,
                            translateProvider: DEFAULT_CONFIG.translateProvider,
                            theme: DEFAULT_CONFIG.theme,
                            autoCopy: DEFAULT_CONFIG.autoCopy,
                            launchOnStartup: DEFAULT_CONFIG.launchOnStartup,
                            floatingPinned: DEFAULT_CONFIG.floatingPinned,
                            floatingWindowX: DEFAULT_CONFIG.floatingWindowX,
                            floatingWindowY: DEFAULT_CONFIG.floatingWindowY,
                            hotkeySelection: DEFAULT_CONFIG.hotkeySelection,
                            hotkeyScreenshot: DEFAULT_CONFIG.hotkeyScreenshot,
                            bidirectionalAuto: DEFAULT_CONFIG.bidirectionalAuto,
                            bidirectionalLangA: DEFAULT_CONFIG.bidirectionalLangA,
                            bidirectionalLangB: DEFAULT_CONFIG.bidirectionalLangB,
                            baidu: { ...config.baidu },
                            google: { ...config.google },
                            openai: { ...config.openai },
                            youdao: { ...config.youdao },
                            firstRun: false,
                          })
                        } catch (e) {
                          window.alert(typeof e === 'string' ? e : String(e))
                        }
                      })()
                    }}
                  >
                    <RotateCcw className="size-3.5" />
                    恢复默认设置（保留密钥）
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

          </div>
        </ScrollArea>
      </Tabs>
    </div>
  )
}
