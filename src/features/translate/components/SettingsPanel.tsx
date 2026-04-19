import { useCallback, useLayoutEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  Settings,
  Keyboard,
  Globe,
  ScanText,
  RotateCcw,
  CircleHelp,
  Eye,
  EyeOff,
  ArrowRightLeft,
  Loader2,
} from 'lucide-react'
import { HotkeyInput } from '@translate/components/HotkeyInput'
import { LanguageSelector } from '@translate/components/LanguageSelector'
import { Card, CardContent, CardHeader, CardTitle } from '@translate/components/ui/card'
import { Button } from '@translate/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@translate/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@translate/components/ui/tooltip'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@translate/components/ui/tabs'
import { useConfig } from '@translate/hooks/useConfig'
import type { TranslateProvider, TranslateResult } from '@translate/types'
import { appConfigToRust, DEFAULT_CONFIG } from '@translate/types'
import {
  themedMutedSurfaceClassName,
  themedOverlaySurfaceClassName,
} from '@/shared/lib/theme-surfaces'
import { SecretField } from '@/shared/components/settings/SecretField'
import { TextField } from '@/shared/components/settings/TextField'
import { cn } from '@translate/lib/utils'

type SecretFieldProps = {
  id: string
  label: string
  labelClassName?: string
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  inputClassName: string
}

/** 密钥输入：默认密文，可通过按钮切换为明文以便核对。 */
export function LegacySecretField({
  id,
  label,
  labelClassName = 'text-xs font-medium text-foreground',
  value,
  onValueChange,
  placeholder,
  inputClassName,
}: SecretFieldProps) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete="off"
          className={cn(inputClassName, 'pr-10')}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={placeholder}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0.5 top-1/2 size-8 -translate-y-1/2 shrink-0 text-muted-foreground"
              aria-label={visible ? '隐藏密钥' : '显示密钥'}
              aria-pressed={visible}
              onClick={() => setVisible((v) => !v)}
            >
              {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{visible ? '隐藏' : '显示'}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

const SETTINGS_TAB = {
  translate: 'translate',
  bidirectional: 'bidirectional',
  ocr: 'ocr',
  shortcuts: 'shortcuts',
  about: 'about',
} as const

export function SettingsPanel() {
  const { config, updateConfig } = useConfig()
  const [testLoading, setTestLoading] = useState(false)
  const [testFeedback, setTestFeedback] = useState<{ ok: boolean; text: string } | null>(null)

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
    setTestLoading(true)
    try {
      const res = await invoke<TranslateResult>('translate_test_connection', {
        snapshot: appConfigToRust(config),
      })
      const sample = (res.translatedText ?? '').trim()
      setTestFeedback({
        ok: true,
        text: sample
          ? `连接成功，示例译文：${sample}`
          : '连接成功（未返回译文文本，请检查模型或接口响应）。',
      })
    } catch (err) {
      const msg = typeof err === 'string' ? err : String(err)
      setTestFeedback({ ok: false, text: msg || '请求失败' })
    } finally {
      setTestLoading(false)
    }
  }, [config])

  const providers: { value: TranslateProvider; label: string }[] = [
    { value: 'baidu', label: '百度翻译' },
    { value: 'google', label: '谷歌翻译' },
    { value: 'youdao', label: '有道翻译' },
    { value: 'openai', label: 'OpenAI' },
  ]

  const credentialInputClass = cn(
    'flex h-9 w-full rounded-md px-3 py-1 text-sm shadow-sm',
    themedOverlaySurfaceClassName,
    'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
  )

  const translateProviderTooltip = (() => {
    const link =
      'font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary'
    const mono = cn(
      'rounded px-1 py-px font-mono text-[11px] text-foreground/90',
      themedOverlaySurfaceClassName,
    )
    switch (config.translateProvider) {
      case 'baidu':
        return (
          <div className="space-y-2">
            <p className="text-popover-foreground">
              <strong className="font-semibold text-foreground">翻译与百度截图</strong>
              ：使用{' '}
              <a
                className={link}
                href="https://fanyi-api.baidu.com/"
                target="_blank"
                rel="noreferrer"
              >
                百度翻译开放平台
              </a>
              的 App ID 与密钥。通用文本翻译与{' '}
              <a
                className={link}
                href="https://fanyi-api.baidu.com/product/22"
                target="_blank"
                rel="noreferrer"
              >
                图片翻译
              </a>
              为同一套凭证；截图会直接走图片翻译。请在控制台开通图片翻译额度。
            </p>
          </div>
        )
      case 'google':
        return (
          <p className="text-popover-foreground">
            使用{' '}
            <a
              className={link}
              href="https://cloud.google.com/translate/docs/reference/rest/v2/translate"
              target="_blank"
              rel="noreferrer"
            >
              Google Cloud Translation API v2
            </a>
            ，Translation 与 Vision 的<strong className="font-medium text-foreground">请求地址由应用内置</strong>；请填写
            API Key（文本翻译与截图识字<strong className="font-medium text-foreground">共用</strong>，项目内需同时启用 Translation API 与 Cloud Vision API）。
          </p>
        )
      case 'youdao':
        return (
          <p className="text-popover-foreground">
            使用{' '}
            <a className={link} href="https://ai.youdao.com/" target="_blank" rel="noreferrer">
              网易有道智云
            </a>
            开放能力：请填写控制台「应用 ID」与「应用密钥」，并在应用中绑定「文本翻译」与「通用文字识别」服务。截图翻译将先走通用 OCR 再走文本翻译，密钥与划词相同。
          </p>
        )
      case 'openai':
        return (
          <p className="text-popover-foreground">
            兼容 OpenAI Chat Completions 的接口（如官方 API 或自建网关）。填写根路径（含{' '}
            <span className={mono}>/v1</span>
            ）、密钥与模型名。
          </p>
        )
      default:
        return null
    }
  })()

  const [activeTab, setActiveTab] = useState<string>(SETTINGS_TAB.translate)

  useLayoutEffect(() => {
    if (config.translateProvider !== 'openai' && activeTab === SETTINGS_TAB.ocr) {
      setActiveTab(SETTINGS_TAB.translate)
    }
  }, [config.translateProvider, activeTab])

  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className="flex min-h-0 min-w-0 flex-col gap-4 pb-1"
    >
      <div
        className={cn(
          'max-w-full min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain',
          'touch-pan-x [-webkit-overflow-scrolling:touch]',
        )}
      >
        <TabsList className="inline-flex h-auto min-h-9 w-max max-w-none flex-nowrap justify-start gap-1 p-1">
        <TabsTrigger value={SETTINGS_TAB.translate} className="shrink-0 grow-0 gap-1.5 px-2.5 py-2 sm:px-3 max-sm:text-xs">
          <Globe className="size-4 opacity-80" aria-hidden />
          翻译与密钥
        </TabsTrigger>
        <TabsTrigger value={SETTINGS_TAB.bidirectional} className="shrink-0 grow-0 gap-1.5 px-2.5 py-2 sm:px-3 max-sm:text-xs">
          <ArrowRightLeft className="size-4 opacity-80" aria-hidden />
          双向互译
        </TabsTrigger>
        {config.translateProvider === 'openai' ? (
          <TabsTrigger value={SETTINGS_TAB.ocr} className="shrink-0 grow-0 gap-1.5 px-2.5 py-2 sm:px-3 max-sm:text-xs">
            <ScanText className="size-4 opacity-80" aria-hidden />
            截图 OCR
          </TabsTrigger>
        ) : null}
        <TabsTrigger value={SETTINGS_TAB.shortcuts} className="shrink-0 grow-0 gap-1.5 px-2.5 py-2 sm:px-3 max-sm:text-xs">
          <Keyboard className="size-4 opacity-80" aria-hidden />
          交互
        </TabsTrigger>
        <TabsTrigger value={SETTINGS_TAB.about} className="shrink-0 grow-0 gap-1.5 px-2.5 py-2 sm:px-3 max-sm:text-xs">
          <Settings className="size-4 opacity-80" aria-hidden />
          关于
        </TabsTrigger>
        </TabsList>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
      {/* Translate Provider */}
      <TabsContent value={SETTINGS_TAB.translate} className="mt-0 outline-none">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Globe className="h-4 w-4" />
            翻译引擎
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex min-w-0 items-center gap-1">
            <Select
              value={config.translateProvider}
              onValueChange={(v) => updateConfig({ translateProvider: v as TranslateProvider })}
            >
              <SelectTrigger className="min-w-0 flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {providers.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground"
                  aria-label="当前引擎说明"
                >
                  <CircleHelp className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent variant="rich" side="left" sideOffset={8}>
                {translateProviderTooltip}
              </TooltipContent>
            </Tooltip>
          </div>
          {config.translateProvider === 'baidu' && (
            <div className="mt-4 flex flex-col gap-3">
              <TextField
                id="baidu-app-id"
                label="App ID"
                value={config.baidu.appId}
                onValueChange={(value) => void updateConfig({ baidu: { ...config.baidu, appId: value } })}
                placeholder="例如：12345678"
                inputClassName={credentialInputClass}
              />
              <SecretField
                id="baidu-secret"
                label="密钥"
                value={config.baidu.secret}
                onValueChange={(v) => void updateConfig({ baidu: { ...config.baidu, secret: v } })}
                placeholder="开放平台提供的密钥"
                inputClassName={credentialInputClass}
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
                inputClassName={credentialInputClass}
              />
            </div>
          )}
          {config.translateProvider === 'openai' && (
            <div className="mt-4 flex flex-col gap-3">
              <TextField
                id="openai-base"
                label="API 根路径"
                value={config.openai.apiBaseUrl}
                onValueChange={(value) =>
                  void updateConfig({ openai: { ...config.openai, apiBaseUrl: value } })
                }
                placeholder="https://api.openai.com/v1"
                inputClassName={credentialInputClass}
              />
              <SecretField
                id="openai-key"
                label="API Key"
                value={config.openai.apiKey}
                onValueChange={(v) => void updateConfig({ openai: { ...config.openai, apiKey: v } })}
                placeholder="sk-…"
                inputClassName={credentialInputClass}
              />
              <TextField
                id="openai-model"
                label="模型"
                value={config.openai.model}
                onValueChange={(value) => void updateConfig({ openai: { ...config.openai, model: value } })}
                placeholder="gpt-4o-mini"
                inputClassName={credentialInputClass}
              />
            </div>
          )}
          {config.translateProvider === 'youdao' && (
            <div className="mt-4 flex flex-col gap-3">
              <TextField
                id="youdao-app-key"
                label="应用 ID（appKey）"
                value={config.youdao.appKey}
                onValueChange={(value) => void updateConfig({ youdao: { ...config.youdao, appKey: value } })}
                placeholder="智云控制台应用 ID"
                inputClassName={credentialInputClass}
              />
              <SecretField
                id="youdao-app-secret"
                label="应用密钥"
                value={config.youdao.appSecret}
                onValueChange={(v) => void updateConfig({ youdao: { ...config.youdao, appSecret: v } })}
                placeholder="智云控制台应用密钥"
                inputClassName={credentialInputClass}
              />
            </div>
          )}
          <div className="mt-4 flex flex-col gap-2 border-t border-[color-mix(in_oklch,var(--border)_34%,transparent)] pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit gap-2"
              disabled={testLoading}
              onClick={() => void runTranslateConnectionTest()}
            >
              {testLoading ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              测试连接（密钥与 API）
            </Button>
            <p
              role="status"
              className={cn(
                'text-xs leading-relaxed',
                testFeedback == null && 'text-muted-foreground',
                testFeedback?.ok === true && 'text-primary',
                testFeedback?.ok === false && 'text-destructive',
              )}
            >
              {testFeedback?.text ??
                '使用当前所选引擎与上方已填参数，发送短句「Hello」英→简中试译；不依赖是否已点击保存。'}
            </p>
          </div>
        </CardContent>
      </Card>
      </TabsContent>

      <TabsContent value={SETTINGS_TAB.bidirectional} className="mt-0 outline-none">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <ArrowRightLeft className="h-4 w-4" />
            双向自动互译
          </CardTitle>
          <p className="text-xs text-muted-foreground leading-relaxed">
            工作台与浮动窗里需将<strong className="font-medium text-foreground">源语言</strong>
            设为「自动检测」。仅当本地能判断语种时切换方向；识别为甲乙之外的语言时，仍按当前「目标语言」翻译。
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5',
              themedMutedSurfaceClassName,
            )}
          >
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0 rounded border-input accent-primary"
              checked={config.bidirectionalAuto}
              onChange={(e) => void updateConfig({ bidirectionalAuto: e.target.checked })}
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
              !config.bidirectionalAuto && 'pointer-events-none opacity-45',
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
              划词与截图（OCR 后文本翻译）均会应用；选择百度「图片翻译」直出时无本地原文识别，仍以当前源/目标语言为准。
            </p>
          </div>
        </CardContent>
      </Card>
      </TabsContent>

      {config.translateProvider === 'openai' ? (
        <TabsContent value={SETTINGS_TAB.ocr} className="mt-0 outline-none">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <ScanText className="h-4 w-4" />
              截图翻译 · OCR 配置
            </CardTitle>
            <p className="text-xs text-muted-foreground leading-relaxed">
              当前翻译引擎为 <strong className="font-medium text-foreground">OpenAI</strong>
              时，截图翻译需先把画面上的字识别成文本再交给模型翻译，因此需要配置下方 OCR。使用百度、谷歌或有道时不会出现本项。
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
              」（<span className="font-mono text-[11px]">general_basic</span>），与「
              <a
                className="text-primary underline-offset-2 hover:underline"
                href="https://cloud.baidu.com/doc/OCR/s/Ek3h7y961"
                target="_blank"
                rel="noreferrer"
              >
                iOCR 固定模板
              </a>
              」不是同一套 API；未配置或失败时可走 Google Cloud Vision（<strong className="font-medium text-foreground">Vision 请求地址内置</strong>，下方填写 API Key）。
            </p>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground">百度智能云 · 通用文字识别</span>
              <TextField
                id="baidu-ocr-base"
                label="AIP 根地址（可选）"
                labelClassName="text-xs text-muted-foreground"
                value={config.baidu.ocrAipBaseUrl}
                onValueChange={(value) =>
                  void updateConfig({ baidu: { ...config.baidu, ocrAipBaseUrl: value } })
                }
                placeholder="留空则 https://aip.baidubce.com"
                inputClassName={credentialInputClass}
              />
              <TextField
                id="baidu-ocr-key"
                label="API Key"
                labelClassName="text-xs text-muted-foreground"
                value={config.baidu.ocrApiKey}
                onValueChange={(value) => void updateConfig({ baidu: { ...config.baidu, ocrApiKey: value } })}
                placeholder="智能云文字识别应用的 API Key"
                inputClassName={credentialInputClass}
              />
              <SecretField
                id="baidu-ocr-secret"
                label="Secret Key"
                labelClassName="text-xs text-muted-foreground"
                value={config.baidu.ocrSecretKey}
                onValueChange={(v) => void updateConfig({ baidu: { ...config.baidu, ocrSecretKey: v } })}
                placeholder="智能云文字识别应用的 Secret Key"
                inputClassName={credentialInputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5 border-t border-[color-mix(in_oklch,var(--border)_34%,transparent)] pt-3">
              <span className="text-xs font-medium text-foreground">Google Cloud Vision · 文字检测</span>
              <SecretField
                id="google-vision-key"
                label="API Key"
                labelClassName="text-xs text-muted-foreground"
                value={config.google.apiKey}
                onValueChange={(v) => void updateConfig({ google: { ...config.google, apiKey: v } })}
                placeholder="同一 GCP API 密钥，须开通 Cloud Vision API"
                inputClassName={credentialInputClass}
              />
            </div>
          </CardContent>
        </Card>
        </TabsContent>
      ) : null}

      {/* Hotkeys */}
      <TabsContent value={SETTINGS_TAB.shortcuts} className="mt-0 outline-none">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Keyboard className="h-4 w-4" />
            交互
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            全局快捷键在此管理；开机自启与全局主题请前往「通用设置」。
          </p>
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
          </div>
        </CardContent>
      </Card>
      </TabsContent>

      {/* About */}
      <TabsContent value={SETTINGS_TAB.about} className="mt-0 outline-none">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Settings className="h-4 w-4" />
            关于
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            <span>Kitty 翻译 v0.1.0</span>
            <span>基于 Tauri v2 与 React 构建</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit gap-1.5"
            onClick={() => {
              if (
                !window.confirm(
                  '将语言、翻译引擎、自动复制、快捷键等恢复为安装默认；已填写的各厂商密钥会保留。确定？',
                )
              ) {
                return
              }
              void (async () => {
                try {
                  await updateConfig({
                    sourceLang: DEFAULT_CONFIG.sourceLang,
                    targetLang: DEFAULT_CONFIG.targetLang,
                    translateProvider: DEFAULT_CONFIG.translateProvider,
                    autoCopy: DEFAULT_CONFIG.autoCopy,
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
            <RotateCcw className="h-3.5 w-3.5" />
            恢复默认设置（保留密钥）
          </Button>
        </CardContent>
      </Card>
      </TabsContent>
      </div>
    </Tabs>
  )
}
