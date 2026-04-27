// 设置面板 - 应用全局设置（剪贴板/翻译/交互/外观/关于）
import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import toast from 'react-hot-toast'
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
  ScanText,
  RotateCcw,
  Info,
  CircleHelp,
  ArrowRightLeft,
  Power,
  Palette,
  Search,
  FolderOpen,
  X
} from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import { useAppConfig } from '@/hooks/useAppConfig'
import { useTheme } from '@/hooks/useTheme'
import {
  DEFAULT_CONFIG,
  DEFAULT_LAUNCHER_FILE_SEARCH_EXCLUDED_DIR_NAMES,
  type TranslateProvider,
  type TranslateResult
} from '@/types'
import { HISTORY_MAX_ITEMS_OPTIONS, HISTORY_RETENTION_OPTIONS } from '@/app/clipboard/lib/history-settings'
import { PRESET_THEMES, getThemeOption, MIN_BACKGROUND_OPACITY, MAX_BACKGROUND_OPACITY } from '@/lib/theme'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { LanguageSelector } from '@/components/shared/LanguageSelector'
import HotkeyInput from '@/components/shared/HotkeyInput'
import AppLogoIcon from '@/components/shared/AppLogoIcon'
import SecretField from '@/components/shared/SecretField'
import CustomColorPicker from '@/components/CustomColorPicker'
import { cn } from '@/lib/utils'

const SETTINGS_TAB = {
  general: 'general',
  clipboard: 'clipboard',
  translate: 'translate',
  shortcuts: 'shortcuts',
  launcher: 'launcher',
  about: 'about'
} as const

interface ITabItem {
  value: string
  icon: typeof Settings
  label: string
}

const TAB_ITEMS: ITabItem[] = [
  { value: SETTINGS_TAB.general, icon: Settings, label: '通用' },
  { value: SETTINGS_TAB.clipboard, icon: ClipboardList, label: '剪贴板' },
  { value: SETTINGS_TAB.translate, icon: Globe, label: '翻译' },
  { value: SETTINGS_TAB.shortcuts, icon: Keyboard, label: '交互' },
  { value: SETTINGS_TAB.launcher, icon: Search, label: '启动器' },
  { value: SETTINGS_TAB.about, icon: Info, label: '关于' }
]

export default function SettingsPanel() {
  const { config, updateConfig, loaded } = useAppConfig()
  /** 旧版配置可能无此字段，避免 UI 抛错 */
  const launcherExcludedDirNames = config.launcherFileSearchExcludedDirNames ?? []
  const [testing, setTesting] = useState(false)
  const [testFeedback, setTestFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [appVersion, setAppVersion] = useState('')
  const [activeTab, setActiveTab] = useState<string>(SETTINGS_TAB.general)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [launcherExcludeDirInput, setLauncherExcludeDirInput] = useState('')
  useTheme(config.theme)

  useEffect(() => { getVersion().then(setAppVersion).catch(() => setAppVersion('unknown')) }, [])

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
        config
      })
      const sample = (res.translatedText ?? '').trim()
      setTestFeedback({
        ok: true,
        text: sample ? `连接成功，示例译文：${sample}` : '连接成功（未返回译文文本，请检查模型或接口响应）。'
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
    { value: 'openai', label: 'OpenAI' }
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
              <a className={link} href="https://fanyi-api.baidu.com/" target="_blank" rel="noreferrer">
                百度翻译开放平台
              </a>{' '}
              的 App ID 与密钥。截图会直接走图片翻译，请在控制台开通图片翻译额度。
            </p>
          </div>
        )
      case 'google':
        return (
          <p>
            使用{' '}
            <a
              className={link}
              href="https://cloud.google.com/translate/docs/reference/rest/v2/translate"
              target="_blank"
              rel="noreferrer"
            >
              Google Cloud Translation API v2
            </a>{' '}
            ，请求地址<strong className="font-medium">由应用内置</strong>；填写 API Key（文本翻译与截图识字
            <strong className="font-medium">共用</strong>）。
          </p>
        )
      case 'youdao':
        return (
          <p>
            使用{' '}
            <a className={link} href="https://ai.youdao.com/" target="_blank" rel="noreferrer">
              网易有道智云
            </a>{' '}
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
        <AppLogoIcon className="size-5" />
        <h1 className="text-sm font-semibold tracking-tight" data-tauri-drag-region>
          Kitty Tools 设置
        </h1>
      </div>

      {/* 标签页 */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div
          className={cn(
            'max-w-full min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain',
            'touch-pan-x [-webkit-overflow-scrolling:touch]'
          )}
        >
          <TabsList className="inline-flex h-auto w-max max-w-none flex-nowrap justify-start gap-1 p-1 mx-4 mt-3">
            {TAB_ITEMS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                <tab.icon className="size-4 opacity-80" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <ScrollArea className="flex-1 mt-2">
          <div className="p-4 space-y-6">
            {/* 剪贴板 */}
            <TabsContent value={SETTINGS_TAB.clipboard} className="mt-0 space-y-5">
              <Card>
                <CardContent className="space-y-5 pt-4">
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

            {/* 翻译（引擎 + 双向互译 + OCR） */}
            <TabsContent value={SETTINGS_TAB.translate} className="mt-0 space-y-5">
              {/* 翻译引擎 */}
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
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0 text-muted-foreground"
                          aria-label="当前引擎说明"
                        >
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
                        <label htmlFor="baidu-app-id" className="text-xs font-medium text-foreground">
                          App ID
                        </label>
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
                        <label htmlFor="openai-base" className="text-xs font-medium text-foreground">
                          API 根路径
                        </label>
                        <Input
                          id="openai-base"
                          autoComplete="off"
                          value={config.openai.apiBaseUrl}
                          onChange={(e) =>
                            void updateConfig({ openai: { ...config.openai, apiBaseUrl: e.target.value } })
                          }
                          placeholder="https://api.openai.com/v1"
                        />
                        {config.openai.apiBaseUrl.trim() && !/^https?:\/\/.+/.test(config.openai.apiBaseUrl.trim()) && (
                          <p className="text-[11px] text-destructive">请输入有效的 URL，以 http:// 或 https:// 开头</p>
                        )}
                      </div>
                      <SecretField
                        id="openai-key"
                        label="API Key"
                        value={config.openai.apiKey}
                        onValueChange={(v) => void updateConfig({ openai: { ...config.openai, apiKey: v } })}
                        placeholder="sk-…"
                      />
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="openai-model" className="text-xs font-medium text-foreground">
                          模型
                        </label>
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
                        <label htmlFor="youdao-app-key" className="text-xs font-medium text-foreground">
                          应用 ID（appKey）
                        </label>
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
                        <LanguageSelector
                          value={config.sourceLang}
                          onChange={(v) => void updateConfig({ sourceLang: v })}
                        />
                      </div>
                      <div className="space-y-1.5 flex-1">
                        <label className="text-xs text-muted-foreground">目标语言</label>
                        <LanguageSelector
                          value={config.targetLang}
                          onChange={(v) => void updateConfig({ targetLang: v })}
                          excludeCodes={['auto']}
                        />
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
                        testFeedback?.ok === false && 'text-destructive'
                      )}
                    >
                      {testFeedback?.text ??
                        '使用当前所选引擎与上方已填参数，发送短句「Hello」英→简中试译；不依赖是否已点击保存。'}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* 双向自动互译 */}
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
                    <Switch
                      className="mt-0.5 shrink-0"
                      checked={config.bidirectionalAuto}
                      onCheckedChange={(checked) => void updateConfig({ bidirectionalAuto: checked })}
                    />
                    <span className="min-w-0 text-sm leading-snug">
                      <span className="font-medium text-foreground">启用</span>
                      <span className="text-muted-foreground">
                        ：识别为语言甲则译向乙，识别为乙则译向甲（例如简中 ↔ 英语）。
                      </span>
                    </span>
                  </label>
                  <div
                    className={cn(
                      'flex flex-col gap-3 transition-opacity',
                      !config.bidirectionalAuto && 'pointer-events-none opacity-45'
                    )}
                  >
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
                      划词与截图（OCR
                      后文本翻译）均会应用；选择百度「图片翻译」直出时无本地原文识别，仍以当前源/目标语言为准。
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* 截图 OCR（仅 OpenAI） */}
              {config.translateProvider === 'openai' ? (
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
                      <a
                        className="text-primary underline-offset-2 hover:underline"
                        href="https://cloud.baidu.com/doc/OCR/s/zk3h7xz52"
                        target="_blank"
                        rel="noreferrer"
                      >
                        通用文字识别（标准版）
                      </a>
                      」；未配置或失败时可走 Google Cloud Vision（请求地址内置，下方填写 API Key）。
                    </p>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-foreground">百度智能云 · 通用文字识别</span>
                      <label htmlFor="baidu-ocr-base" className="text-xs text-muted-foreground">
                        AIP 根地址（可选）
                      </label>
                      <Input
                        id="baidu-ocr-base"
                        autoComplete="off"
                        value={config.baidu.ocrAipBaseUrl}
                        onChange={(e) =>
                          void updateConfig({ baidu: { ...config.baidu, ocrAipBaseUrl: e.target.value } })
                        }
                        placeholder="留空则 https://aip.baidubce.com"
                      />
                      <label htmlFor="baidu-ocr-key" className="text-xs text-muted-foreground">
                        API Key
                      </label>
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
              ) : null}
            </TabsContent>

            {/* 交互（快捷键 + 开机自启） */}
            <TabsContent value={SETTINGS_TAB.shortcuts} className="mt-0">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <Keyboard className="size-4" />
                    交互
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">全局快捷键。</p>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    <HotkeyInput
                      id="hotkey-selection"
                      label="划词翻译"
                      value={config.hotkeySelection}
                      defaultValue={DEFAULT_CONFIG.hotkeySelection}
                      onChange={async (v) => updateConfig({ hotkeySelection: v })}
                      otherHotkeys={[
                        { label: '截图翻译', value: config.hotkeyScreenshot },
                        { label: '剪贴板历史', value: config.clipboardShortcut },
                        { label: '启动器', value: config.launcherShortcut },
                      ]}
                    />
                    <HotkeyInput
                      id="hotkey-screenshot"
                      label="截图翻译"
                      value={config.hotkeyScreenshot}
                      defaultValue={DEFAULT_CONFIG.hotkeyScreenshot}
                      onChange={async (v) => updateConfig({ hotkeyScreenshot: v })}
                      otherHotkeys={[
                        { label: '划词翻译', value: config.hotkeySelection },
                        { label: '剪贴板历史', value: config.clipboardShortcut },
                        { label: '启动器', value: config.launcherShortcut },
                      ]}
                    />
                    <HotkeyInput
                      id="hotkey-clipboard"
                      label="剪贴板历史"
                      value={config.clipboardShortcut}
                      defaultValue={DEFAULT_CONFIG.clipboardShortcut}
                      onChange={async (v) => updateConfig({ clipboardShortcut: v })}
                      otherHotkeys={[
                        { label: '划词翻译', value: config.hotkeySelection },
                        { label: '截图翻译', value: config.hotkeyScreenshot },
                        { label: '启动器', value: config.launcherShortcut },
                      ]}
                    />
                    <HotkeyInput
                      id="hotkey-launcher"
                      label="启动器"
                      value={config.launcherShortcut}
                      defaultValue={DEFAULT_CONFIG.launcherShortcut}
                      onChange={async (v) => updateConfig({ launcherShortcut: v })}
                      otherHotkeys={[
                        { label: '划词翻译', value: config.hotkeySelection },
                        { label: '截图翻译', value: config.hotkeyScreenshot },
                        { label: '剪贴板历史', value: config.clipboardShortcut },
                      ]}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 启动器：书签来源与文件搜索 */}
            <TabsContent value={SETTINGS_TAB.launcher} className="mt-0 space-y-5">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <Search className="size-4" />
                    浏览器书签
                  </CardTitle>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    勾选后，启动器可搜索并打开对应浏览器的书签（读取本机 Chromium 格式 Bookmarks
                    文件）。请确保已安装并使用该浏览器；可多选。
                  </p>
                </CardHeader>
                <CardContent className="space-y-4 pt-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">Google Chrome</span>
                    <Switch
                      checked={config.launcherBookmarksChrome}
                      onCheckedChange={(v) => void updateConfig({ launcherBookmarksChrome: v })}
                      aria-label="Chrome 书签"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">Microsoft Edge</span>
                    <Switch
                      checked={config.launcherBookmarksEdge}
                      onCheckedChange={(v) => void updateConfig({ launcherBookmarksEdge: v })}
                      aria-label="Edge 书签"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">Brave</span>
                    <Switch
                      checked={config.launcherBookmarksBrave}
                      onCheckedChange={(v) => void updateConfig({ launcherBookmarksBrave: v })}
                      aria-label="Brave 书签"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <FolderOpen className="size-4" />
                    本地文件搜索
                  </CardTitle>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    在指定目录内按<strong className="font-medium text-foreground">文件名</strong>
                    包含关键词搜索；无 <span className="font-mono text-foreground/90">find </span>/
                    <span className="font-mono text-foreground/90">open </span>前缀时与启动器里其它项一起出现；在输入框中输入{' '}
                    <span className="font-mono text-foreground/90">find </span>+ 关键词为仅文件搜索，选中后
                    <strong className="font-medium text-foreground">打开该文件所在目录</strong>；输入{' '}
                    <span className="font-mono text-foreground/90">open </span>+ 关键词为仅文件搜索，选中后
                    <strong className="font-medium text-foreground">打开该文件</strong>。关键词至少 2 个字符。目录列表为空时使用系统「文档」文件夹。多根目录会并行扫描；仅添加常用文件夹可明显加快。整盘搜索仍可能较慢。可在下方配置「排除的目录名」以跳过如{' '}
                    <span className="font-mono text-foreground/90">node_modules</span>、
                    <span className="font-mono text-foreground/90">dist</span> 等（仅按路径中<strong className="font-medium text-foreground">单级文件夹名</strong>匹配，大小写不敏感）。
                  </p>
                </CardHeader>
                <CardContent className="space-y-4 pt-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">启用文件搜索</span>
                    <Switch
                      checked={config.launcherFileSearchEnabled}
                      onCheckedChange={(v) => void updateConfig({ launcherFileSearchEnabled: v })}
                      aria-label="启用启动器文件搜索"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!config.launcherFileSearchEnabled}
                      onClick={async () => {
                        try {
                          const dir = await open({ directory: true, multiple: false })
                          if (typeof dir !== 'string' || !dir.trim()) return
                          const paths = config.launcherFileSearchPaths
                          if (paths.includes(dir)) return
                          await updateConfig({ launcherFileSearchPaths: [...paths, dir] })
                        } catch (e) {
                          console.error(e)
                        }
                      }}
                    >
                      添加搜索目录
                    </Button>
                    {config.launcherFileSearchPaths.length > 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void updateConfig({ launcherFileSearchPaths: [] })}
                      >
                        清空列表（使用「文档」默认）
                      </Button>
                    ) : null}
                  </div>
                  {config.launcherFileSearchPaths.length > 0 ? (
                    <ul className="border-border bg-muted/30 max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2 text-sm">
                      {config.launcherFileSearchPaths.map((p) => (
                        <li
                          key={p}
                          className="text-muted-foreground flex min-w-0 items-start justify-between gap-2 break-all"
                        >
                          <span className="min-w-0">{p}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="shrink-0"
                            aria-label="移除目录"
                            onClick={() =>
                              void updateConfig({
                                launcherFileSearchPaths: config.launcherFileSearchPaths.filter((x) => x !== p)
                              })
                            }
                          >
                            <X className="size-3.5" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground text-xs">未添加目录时，使用系统「文档」作为搜索根目录。</p>
                  )}

                  <div className="space-y-2">
                    <p className="text-sm font-medium">排除的目录名</p>
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      与某一级文件夹名（不含路径）一致则<strong className="font-medium text-foreground/90">不进入</strong>
                      该目录及其子文件。对以 <span className="font-mono">.</span> 开头的目录（如{' '}
                      <span className="font-mono">.git</span>）除列表外，也会在深层默认跳过以点号开头的目录。
                    </p>
                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                      <Input
                        className="min-w-0 flex-1"
                        value={launcherExcludeDirInput}
                        onChange={(e) => setLauncherExcludeDirInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            const t = launcherExcludeDirInput.trim()
                            if (!t) return
                            const cur = launcherExcludedDirNames
                            if (cur.some((x) => x.toLowerCase() === t.toLowerCase())) {
                              setLauncherExcludeDirInput('')
                              return
                            }
                            void updateConfig({ launcherFileSearchExcludedDirNames: [...cur, t] })
                            setLauncherExcludeDirInput('')
                          }
                        }}
                        placeholder="例如 .next 或 out"
                        disabled={!config.launcherFileSearchEnabled}
                        autoComplete="off"
                        spellCheck={false}
                        aria-label="添加排除的目录名"
                      />
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={!config.launcherFileSearchEnabled || !launcherExcludeDirInput.trim()}
                          onClick={() => {
                            const t = launcherExcludeDirInput.trim()
                            if (!t) return
                            const cur = launcherExcludedDirNames
                            if (cur.some((x) => x.toLowerCase() === t.toLowerCase())) {
                              setLauncherExcludeDirInput('')
                              return
                            }
                            void updateConfig({ launcherFileSearchExcludedDirNames: [...cur, t] })
                            setLauncherExcludeDirInput('')
                          }}
                        >
                          添加
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!config.launcherFileSearchEnabled}
                          onClick={() =>
                            void updateConfig({
                              launcherFileSearchExcludedDirNames: [...DEFAULT_LAUNCHER_FILE_SEARCH_EXCLUDED_DIR_NAMES]
                            })
                          }
                        >
                          恢复默认
                        </Button>
                      </div>
                    </div>
                    {launcherExcludedDirNames.length > 0 ? (
                      <ul className="border-border bg-muted/30 max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2 text-sm">
                        {launcherExcludedDirNames.map((name) => (
                          <li
                            key={name}
                            className="text-muted-foreground font-mono flex min-w-0 items-center justify-between gap-2"
                          >
                            <span className="min-w-0 truncate">{name}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              className="shrink-0"
                              aria-label={`移除 ${name}`}
                              disabled={!config.launcherFileSearchEnabled}
                              onClick={() =>
                                void updateConfig({
                                  launcherFileSearchExcludedDirNames: launcherExcludedDirNames.filter(
                                    (x) => x !== name
                                  ),
                                })
                              }
                            >
                              <X className="size-3.5" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground text-xs">
                        未配置时将为空；点击「恢复默认」可填回 node_modules、dist、target 等常见构建目录名。
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 通用 */}
            <TabsContent value={SETTINGS_TAB.general} className="mt-0 space-y-5">
              <Card>
                <CardContent className="space-y-5 pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex min-w-0 flex-1 items-start gap-2.5">
                      <Power className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-sm font-medium leading-none">开机自启</span>
                        <span className="text-xs text-muted-foreground leading-relaxed">
                          打开后写入系统登录启动项，关闭后移除。
                        </span>
                      </div>
                    </div>
                    <Switch
                      checked={config.launchOnStartup}
                      onCheckedChange={(v) => void updateConfig({ launchOnStartup: v })}
                      aria-label="开机自启"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">深浅模式</label>
                    <div className="flex gap-1">
                      {(
                        [
                          { value: 'light', icon: Sun, label: '浅色' },
                          { value: 'dark', icon: Moon, label: '深色' },
                          { value: 'system', icon: Monitor, label: '跟随系统' }
                        ] as const
                      ).map(({ value, label, icon: Icon }) => (
                        <Tooltip key={value}>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                'size-9',
                                config.theme === value &&
                                  'bg-accent text-accent-foreground shadow-sm hover:bg-accent hover:text-accent-foreground'
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
                      {PRESET_THEMES.map((t) => {
                        const active = config.appThemePreset === t.id
                        return (
                          <button
                            key={t.id}
                            type="button"
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                              active ? 'text-white shadow-sm' : 'bg-background hover:bg-accent/50'
                            )}
                            style={
                              active
                                ? { backgroundColor: t.accent, borderColor: t.accent }
                                : { borderColor: t.accent, color: t.accent }
                            }
                            onClick={() => void updateConfig({ appThemePreset: t.id })}
                          >
                            {t.label}
                          </button>
                        )
                      })}

                      <Popover>
                        <PopoverTrigger asChild>
                          {(() => {
                            const customActive = config.appThemePreset === 'custom'
                            const customColor = getThemeOption('custom', config.customHue).accent
                            return (
                              <button
                                type="button"
                                className={cn(
                                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                                  customActive ? 'text-white shadow-sm' : 'bg-background hover:bg-accent/50'
                                )}
                                style={
                                  customActive
                                    ? { backgroundColor: customColor, borderColor: customColor }
                                    : { borderColor: customColor, color: customColor }
                                }
                              >
                                {!customActive && <Palette className="size-3 shrink-0" />}
                                自定义
                              </button>
                            )
                          })()}
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-3" side="bottom" align="end">
                          <CustomColorPicker
                            value={config.customHue}
                            onChange={(hue) => void updateConfig({ appThemePreset: 'custom', customHue: hue })}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">
                      背景不透明度（{MIN_BACKGROUND_OPACITY}–{MAX_BACKGROUND_OPACITY}）：{config.backgroundOpacity}%
                    </label>
                    <Slider
                      min={MIN_BACKGROUND_OPACITY}
                      max={MAX_BACKGROUND_OPACITY}
                      step={1}
                      value={[config.backgroundOpacity]}
                      onValueChange={([v]) => void updateConfig({ backgroundOpacity: v })}
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
                    <Info className="size-4" />
                    关于
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <AppLogoIcon className="size-12" />
                    <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
                      <span className="text-foreground font-medium">Kitty Tools v{appVersion}</span>
                      <span>基于 Tauri v2 与 React 构建的桌面工具集（翻译 + 剪贴板历史）</span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-fit gap-1.5"
                    onClick={() => setResetConfirmOpen(true)}
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
