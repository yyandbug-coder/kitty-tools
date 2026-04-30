// 划词翻译浮窗结果面板 - 显示选中文字的翻译结果
// 支持原文/译文分栏、语言切换、固定窗口、拖动移动、自动复制
import { useEffect, useRef, useState, useMemo, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { ArrowRightLeft, Check, Copy, Loader2, Pin, RotateCcw, Settings } from 'lucide-react'
import AppLogoIcon from '@/components/shared/AppLogoIcon'
import { LanguageSelector } from '@/components/shared/LanguageSelector'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import toast from 'react-hot-toast'
import GlobalToaster from '@/components/shared/GlobalToaster'
import { useAppConfig } from '@/hooks/useAppConfig'
import { useKittyIsDarkMode } from '@/hooks/useKittyIsDarkMode'
import { cn } from '@/lib/utils'
import { getInvokeErrorMessage, toastInvokeError } from '@/lib/invoke-helpers'
import ShortcutKbd from '@/components/shared/ShortcutKbd'
import { translateSubmitShortcutLabel } from '@/lib/platform'
import { getThemeRuntimeStyle } from '@/lib/theme'
import { type AppTheme, getLanguageDisplayName } from '@/types'

interface EventPayload {
  text: string
  translated: string
  error?: string
  sourceLang?: string
}

interface RawTranslateResult {
  source_text?: string
  translated_text?: string
  sourceText?: string
  translatedText?: string
  source_lang?: string
  sourceLang?: string
}

type CopyTarget = 'source' | 'target' | null

export default function FloatingResult() {
  const { config, updateConfig } = useAppConfig()
  const [sourceText, setSourceText] = useState('')
  const [translatedText, setTranslatedText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<CopyTarget>(null)
  const [detectedSourceLang, setDetectedSourceLang] = useState<string | null>(null)
  const isDarkMode = useKittyIsDarkMode(config.theme)
  const translateSeqRef = useRef(0)
  const autoCopyRef = useRef(config.autoCopy)
  autoCopyRef.current = config.autoCopy
  const appStyle = useMemo(
    () => getThemeRuntimeStyle(config.appThemePreset as AppTheme, config.customHue, isDarkMode) as CSSProperties,
    [config.appThemePreset, config.customHue, isDarkMode]
  )

  useEffect(() => {
    let cancelled = false
    let unlistenResult: UnlistenFn | undefined
    let unlistenLoading: UnlistenFn | undefined

    void (async () => {
      try {
        const [fnResult, fnLoading] = await Promise.all([
          listen<EventPayload>('translate-selection-result', (event) => {
            setLoading(false)
            const text = event.payload?.text ?? ''
            const translated = event.payload?.translated ?? ''
            setSourceText(text)
            if (event.payload?.error) {
              setError(event.payload.error)
              setTranslatedText('')
              setDetectedSourceLang(null)
            } else {
              setError(null)
              setTranslatedText(translated)
              const sl = event.payload?.sourceLang
              setDetectedSourceLang(sl && sl !== 'auto' ? sl : null)
              if (autoCopyRef.current && translated.trim()) {
                void navigator.clipboard.writeText(translated).catch(() => {
                  toast.error('自动复制译文失败，请手动复制', { duration: 4000 })
                })
              }
            }
          }),
          listen<string>('translate-selection-start', (event) => {
            setSourceText(event.payload)
            setTranslatedText('')
            setLoading(true)
            setError(null)
            setDetectedSourceLang(null)
          })
        ])
        if (cancelled) {
          fnResult()
          fnLoading()
          return
        }
        unlistenResult = fnResult
        unlistenLoading = fnLoading
        await invoke('floating_ready')
      } catch (e) {
        if (!cancelled) {
          toastInvokeError('浮动翻译窗口未就绪', e)
        }
      }
    })()

    return () => {
      cancelled = true
      unlistenResult?.()
      unlistenLoading?.()
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !config.floatingPinned) {
        void invoke('hide_floating_window').catch((err) => toastInvokeError('无法隐藏翻译窗口', err))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [config.floatingPinned])

  const runTranslation = async (text: string, sourceLang = config.sourceLang, targetLang = config.targetLang) => {
    if (!text.trim()) {
      setTranslatedText('')
      setError(null)
      return
    }
    const seq = ++translateSeqRef.current
    setLoading(true)
    setError(null)
    setDetectedSourceLang(null)

    try {
      const result = await invoke<RawTranslateResult>('translate_text', {
        text,
        sourceLang,
        targetLang
      })
      if (seq !== translateSeqRef.current) return
      setSourceText(result.sourceText ?? result.source_text ?? text)
      setTranslatedText(result.translatedText ?? result.translated_text ?? '')
      const sl = result.sourceLang ?? result.source_lang
      setDetectedSourceLang(sl && sl !== 'auto' ? sl : null)
    } catch (err) {
      if (seq !== translateSeqRef.current) return
      setTranslatedText('')
      setDetectedSourceLang(null)
      setError(getInvokeErrorMessage(err))
    } finally {
      if (seq === translateSeqRef.current) setLoading(false)
    }
  }

  const handleCopy = async (text: string, target: Exclude<CopyTarget, null>) => {
    if (!text.trim()) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(target)
      setTimeout(() => {
        setCopied((current) => (current === target ? null : current))
      }, 1600)
    } catch (e) {
      toast.error(`复制失败：${getInvokeErrorMessage(e)}`, { duration: 4000 })
    }
  }

  const handleSourceLangChange = async (value: string) => {
    if (value !== 'auto') setDetectedSourceLang(null)
    await updateConfig({ sourceLang: value })
    if (sourceText.trim()) await runTranslation(sourceText, value, config.targetLang)
  }

  const handleTargetLangChange = async (value: string) => {
    await updateConfig({ targetLang: value })
    if (sourceText.trim()) await runTranslation(sourceText, config.sourceLang, value)
  }

  const handleSwapLanguages = async () => {
    if (config.sourceLang === 'auto' && config.targetLang === 'auto') return
    const nextSourceLang = config.targetLang === 'auto' ? config.sourceLang : config.targetLang
    const nextTargetLang = config.sourceLang === 'auto' ? config.targetLang : config.sourceLang
    await updateConfig({ sourceLang: nextSourceLang, targetLang: nextTargetLang })
    if (sourceText.trim()) await runTranslation(sourceText, nextSourceLang, nextTargetLang)
  }

  const handleOpenSettings = async () => {
    try {
      await invoke('open_settings_window')
    } catch (e) {
      toastInvokeError('无法打开设置', e)
    }
  }

  const handleTogglePin = async () => {
    await updateConfig({ floatingPinned: !config.floatingPinned })
  }

  const handleDragPointerDown = async (event: PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('[data-no-drag="true"]')) return
    if (event.button !== 0) return
    try {
      await invoke('start_floating_drag')
    } catch (e) {
      toastInvokeError('无法开始拖动窗口', e)
    }
  }

  const handleSourceKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      void runTranslation(sourceText)
    }
  }

  return (
    <TooltipProvider>
      <div
        className={cn(
          'flex h-screen w-screen min-h-0 flex-col overflow-hidden bg-background text-foreground',
          isDarkMode && 'dark'
        )}
        data-kitty-theme-scope
        data-theme={config.appThemePreset}
        style={appStyle}
      >
        {/* 标题栏 - 可拖动 */}
        <div
          className="flex shrink-0 items-center justify-between border-b border-border/70 px-4 py-3"
          onPointerDown={handleDragPointerDown}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold tracking-tight">
            <AppLogoIcon className="size-5 shrink-0" aria-hidden />
            <span className="shrink-0">快速翻译</span>
            <span className="flex min-w-0 items-center gap-1.5 text-xs font-normal text-muted-foreground">
              <ShortcutKbd formatted={translateSubmitShortcutLabel()} className="text-muted-foreground shrink-0" />
              <span className="truncate">翻译</span>
            </span>
          </div>
          <div className="flex items-center gap-1" data-no-drag="true">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={config.floatingPinned ? 'default' : 'ghost'}
                  size="icon"
                  onClick={() => void handleTogglePin()}
                  aria-label={config.floatingPinned ? '已固定窗口，点击取消固定' : '固定窗口，失焦时不关闭'}
                  data-no-drag="true"
                >
                  <Pin className={cn('size-4', config.floatingPinned && 'fill-current')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{config.floatingPinned ? '已固定窗口' : '失焦后自动关闭'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void handleOpenSettings()}
                  aria-label="打开设置"
                  data-no-drag="true"
                >
                  <Settings className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>打开设置</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* 语言选择栏 */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border/70 bg-muted/35 px-4 py-3">
          <div className="min-w-0 flex-1">
            <LanguageSelector value={config.sourceLang} onChange={(v) => void handleSourceLangChange(v)} />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => void handleSwapLanguages()}
                disabled={config.sourceLang === 'auto' && config.targetLang === 'auto'}
                aria-label="交换源语言与目标语言"
              >
                <ArrowRightLeft className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>交换语言</TooltipContent>
          </Tooltip>
          <div className="min-w-0 flex-1">
            <LanguageSelector value={config.targetLang} onChange={(v) => void handleTargetLangChange(v)} />
          </div>
        </div>

        {/* 原文/译文分栏 */}
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
          <div className="flex min-h-0 flex-1 flex-row gap-2">
            {/* 原文区 */}
            <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-sm">
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
                <p className="truncate text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">原文</span>
                  <span className="mx-1.5 text-border">·</span>
                  <span>可编辑输入</span>
                </p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      onClick={() => void handleCopy(sourceText, 'source')}
                      disabled={!sourceText.trim()}
                      aria-label={copied === 'source' ? '已复制原文' : '复制原文'}
                    >
                      {copied === 'source' ? (
                        <Check className="size-3.5 text-green-500" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{copied === 'source' ? '已复制原文' : '复制原文'}</TooltipContent>
                </Tooltip>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden p-3">
                {loading && !sourceText.trim() ? (
                  <div
                    className="flex h-full min-h-28 items-center justify-center gap-2 px-2 text-center text-sm text-muted-foreground"
                    aria-busy
                    aria-live="polite"
                  >
                    <Loader2 className="size-4 shrink-0 animate-spin" />
                    <span>正在识别截图中的文字…</span>
                  </div>
                ) : (
                  <Textarea
                    value={sourceText}
                    onChange={(e) => setSourceText(e.target.value)}
                    onKeyDown={handleSourceKeyDown}
                    placeholder={`粘贴或输入文本，${translateSubmitShortcutLabel()} 翻译`}
                    className="h-full min-h-0 resize-none overflow-y-auto border-0 bg-transparent px-0 py-0 text-[15px] leading-7 shadow-none focus-visible:ring-0"
                  />
                )}
              </div>
            </section>

            {/* 译文区 */}
            <section
              className={cn(
                'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/70 shadow-sm',
                error ? 'bg-destructive/5' : 'bg-card/80'
              )}
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
                <p className="min-w-0 truncate text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">译文</span>
                  <span className="mx-1.5 text-border">·</span>
                  <span>{error ? '翻译失败' : '翻译结果'}</span>
                </p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      onClick={() => void handleCopy(translatedText, 'target')}
                      disabled={!translatedText.trim()}
                      aria-label={copied === 'target' ? '已复制译文' : '复制译文'}
                    >
                      {copied === 'target' ? (
                        <Check className="size-3.5 text-green-500" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{copied === 'target' ? '已复制译文' : '复制译文'}</TooltipContent>
                </Tooltip>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden p-3">
                {error ? (
                  <ScrollArea className="h-full min-h-0">
                    <div className="flex flex-col gap-2 rounded-xl border border-destructive/20 bg-background/75 px-3 py-2">
                      <p className="text-sm leading-6 text-destructive">{error}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void runTranslation(sourceText)}
                        className="w-fit"
                      >
                        <RotateCcw className="mr-1.5 size-3.5" />
                        重试
                      </Button>
                    </div>
                  </ScrollArea>
                ) : loading ? (
                  <div
                    className="flex h-full min-h-28 w-full flex-col items-center justify-center gap-2 px-2 text-center text-[15px] leading-7 text-muted-foreground sm:flex-row sm:gap-2.5"
                    aria-busy
                    aria-live="polite"
                  >
                    <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                    <span>{sourceText.trim() ? '翻译中…' : '请稍候…'}</span>
                  </div>
                ) : (
                  <ScrollArea className="h-full min-h-0">
                    {translatedText ? (
                      <p className="whitespace-pre-wrap text-[15px] leading-7 text-foreground">{translatedText}</p>
                    ) : (
                      <p className="text-[15px] leading-7 text-muted-foreground">译文将显示在这里</p>
                    )}
                  </ScrollArea>
                )}
              </div>
            </section>
          </div>

          {/* 底部操作栏 */}
          <div className="flex shrink-0 items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/70 px-3.5 py-2.5 shadow-sm ring-1 ring-foreground/4 backdrop-blur-sm dark:bg-card/50 dark:ring-foreground/6">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1.5">
              {loading ? (
                <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground/80" aria-hidden />
                  <span className="leading-snug">翻译中…</span>
                </span>
              ) : (
                <>
                  {config.sourceLang === 'auto' && detectedSourceLang ? (
                    <span
                      className="inline-flex max-w-full shrink-0 items-center gap-2 rounded-lg border border-border/60 bg-background/90 px-2 py-1 text-[11px] shadow-sm dark:bg-background/70"
                      title={`检测到的源语言：${getLanguageDisplayName(detectedSourceLang)}`}
                    >
                      <span className="shrink-0 text-muted-foreground">检测</span>
                      <span className="h-3 w-px shrink-0 bg-border/80" aria-hidden />
                      <span className="min-w-0 truncate font-medium text-foreground">
                        {getLanguageDisplayName(detectedSourceLang)}
                      </span>
                    </span>
                  ) : null}
                  <p className="min-w-0 flex-1 text-xs leading-snug text-muted-foreground">可随时修改原文后再次翻译</p>
                </>
              )}
            </div>
            <Button
              onClick={() => void runTranslation(sourceText)}
              disabled={loading || !sourceText.trim()}
              size="sm"
              className="min-w-28"
            >
              {loading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  翻译中
                </>
              ) : (
                '翻译'
              )}
            </Button>
          </div>
        </div>

        {/* 底部状态栏 */}
        <div className="flex shrink-0 items-center justify-between border-t border-border/70 bg-muted/25 px-4 py-2 text-xs text-muted-foreground">
          <span>{config.floatingPinned ? '已固定窗口' : '失焦后自动关闭'}</span>
          <span>拖动顶栏移动窗口</span>
        </div>
      </div>
      <GlobalToaster />
    </TooltipProvider>
  )
}
