// 设置 — 翻译：引擎与密钥、语言、互译、OpenAI OCR
import { ArrowRightLeft, CircleHelp, Globe, Loader2, ScanText, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Switch } from '@/components/ui/switch'
import { LanguageSelector } from '@/components/shared/LanguageSelector'
import SecretField from '@/components/shared/SecretField'
import { cn } from '@/lib/utils'
import type { AppConfig, TranslateProvider } from '@/types'

const PROVIDERS: { value: TranslateProvider; label: string }[] = [
  { value: 'baidu', label: '百度翻译' },
  { value: 'google', label: 'Google' },
  { value: 'youdao', label: '有道翻译' },
  { value: 'openai', label: 'OpenAI' },
]

function TranslateProviderHint({ provider }: { provider: TranslateProvider }) {
  const link =
    'font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary'
  const mono =
    'rounded bg-muted/90 px-1 py-px font-mono text-[11px] text-popover-foreground/90'
  switch (provider) {
    case 'baidu':
      return (
        <div className="space-y-2">
          <p className="text-muted-foreground">
            <strong className="font-semibold text-popover-foreground">翻译与百度截图</strong>：使用{' '}
            <a className={link} href="https://fanyi-api.baidu.com/" target="_blank" rel="noreferrer">
              百度翻译开放平台
            </a>{' '}
            的 App ID 与密钥。截图会直接走图片翻译，请在控制台开通图片翻译额度。
          </p>
        </div>
      )
    case 'google':
      return (
        <p className="text-muted-foreground">
          使用{' '}
          <a
            className={link}
            href="https://cloud.google.com/translate/docs/reference/rest/v2/translate"
            target="_blank"
            rel="noreferrer"
          >
            Google Cloud Translation API v2
          </a>{' '}
          ，请求地址<strong className="font-medium text-popover-foreground">由应用内置</strong>；填写 API Key（文本翻译与截图识字
          <strong className="font-medium text-popover-foreground">共用</strong>）。
        </p>
      )
    case 'youdao':
      return (
        <p className="text-muted-foreground">
          使用{' '}
          <a className={link} href="https://ai.youdao.com/" target="_blank" rel="noreferrer">
            网易有道智云
          </a>{' '}
          开放能力：填写应用 ID 与应用密钥，并绑定「文本翻译」与「通用文字识别」服务。
        </p>
      )
    case 'openai':
      return (
        <p className="text-muted-foreground">
          兼容 OpenAI Chat Completions 的接口。填写根路径（含 <span className={mono}>/v1</span>）、密钥与模型名。
        </p>
      )
    default:
      return null
  }
}

export interface SettingsTranslateTabProps {
  config: AppConfig
  updateConfig: (updates: Partial<AppConfig>) => Promise<void>
  testing: boolean
  testFeedback: { ok: boolean; text: string } | null
  runTranslateConnectionTest: () => Promise<void>
}

export default function SettingsTranslateTab({
  config,
  updateConfig,
  testing,
  testFeedback,
  runTranslateConnectionTest,
}: SettingsTranslateTabProps) {
  return (
    <>
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
                {PROVIDERS.map((p) => (
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
                  data-no-drag="true"
                >
                  <CircleHelp className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent
                variant="rich"
                side="left"
                align="start"
                sideOffset={8}
                className="max-w-[min(calc(100vw-1.5rem),22rem)] space-y-2 text-[11px] leading-relaxed sm:max-w-sm sm:text-xs"
              >
                <TranslateProviderHint provider={config.translateProvider} />
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
                  onChange={(e) => void updateConfig({ openai: { ...config.openai, apiBaseUrl: e.target.value } })}
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
                <LanguageSelector value={config.sourceLang} onChange={(v) => void updateConfig({ sourceLang: v })} />
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
                testFeedback?.ok === false && 'text-destructive',
              )}
            >
              {testFeedback?.text ??
                '使用当前所选引擎与上方已填参数，发送短句「Hello」英→简中试译；不依赖是否已点击保存。'}
            </p>
          </div>
        </CardContent>
      </Card>

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
              划词与截图（OCR
              后文本翻译）均会应用；选择百度「图片翻译」直出时无本地原文识别，仍以当前源/目标语言为准。
            </p>
          </div>
        </CardContent>
      </Card>

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
                onChange={(e) => void updateConfig({ baidu: { ...config.baidu, ocrAipBaseUrl: e.target.value } })}
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
    </>
  )
}
