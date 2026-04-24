// 划词翻译浮窗结果面板 - 显示选中文字的翻译结果
// 支持原文/译文分栏、语言切换、固定窗口、拖动移动、自动复制
import { useEffect, useState, useMemo, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { ArrowRightLeft, Check, Copy, Loader2, Pin, PinOff, Settings } from 'lucide-react'
import { LanguageSelector } from '@/components/shared/LanguageSelector'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppConfig } from '@/hooks/useAppConfig'
import { cn } from '@/lib/utils'
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
  const [systemPrefersDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const isDarkMode = config.theme === 'dark' || (config.theme === 'system' && systemPrefersDark)
  const appStyle = useMemo(
    () => getThemeRuntimeStyle(config.appThemePreset as AppTheme, config.customHue, isDarkMode, config.backgroundOpacity) as CSSProperties,
    [config.appThemePreset, config.customHue, isDarkMode, config.backgroundOpacity],
  )

  useEffect(() => {
    let cancelled = false
    let unlistenResult: UnlistenFn | undefined
    let unlistenLoading: UnlistenFn | undefined
    ;(async () => {
      try {
        unlistenResult = await listen<EventPayload>('translate-selection-result', (event) => {
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
            if (config.autoCopy && translated.trim()) {
              void navigator.clipboard.writeText(translated).catch(() => {})
            }
          }
        })

        unlistenLoading = await listen<string>('translate-selection-start', (event) => {
          setSourceText(event.payload)
          setTranslatedText('')
          setLoading(true)
          setError(null)
          setDetectedSourceLang(null)
        })

        if (cancelled) {
          unlistenResult()
          unlistenLoading()
          return
        }

        await invoke('floating_ready')
      } catch {
        // 非 Tauri 环境忽略
      }
    })()

    return () => {
      cancelled = true
      unlistenResult?.()
      unlistenLoading?.()
    }
  }, [config.autoCopy])

  const runTranslation = async (
    text: string,
    sourceLang = config.sourceLang,
    targetLang = config.targetLang,
  ) => {
    if (!text.trim()) {
      setTranslatedText('')
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    setDetectedSourceLang(null)

    try {
      const result = await invoke<RawTranslateResult>('translate_text', {
        text,
        sourceLang,
        targetLang,
      })
      setSourceText(result.sourceText ?? result.source_text ?? text)
      setTranslatedText(result.translatedText ?? result.translated_text ?? '')
      const sl = result.sourceLang ?? result.source_lang
      setDetectedSourceLang(sl && sl !== 'auto' ? sl : null)
    } catch (err) {
      setTranslatedText('')
      setDetectedSourceLang(null)
      setError(typeof err === 'string' ? err : String(err))
    } finally {
      setLoading(false)
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
    } catch {
      // clipboard not available
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
    try { await invoke('open_settings_window') } catch { /* ignore */ }
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
    } catch {
      // 非 Tauri 环境忽略
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
          isDarkMode && 'dark',
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
          <div className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium tracking-tight">
            <ArrowRightLeft className="size-4 text-primary shrink-0" />
            <span className="shrink-0">快速翻译</span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {translateSubmitShortcutLabel()} 翻译
            </span>
          </div>
          <div className="flex items-center gap-1" data-no-drag="true">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={handleTogglePin} data-no-drag="true">
                  {config.floatingPinned ? <Pin className="size-3.5" /> : <PinOff className="size-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{config.floatingPinned ? '已固定窗口' : '失焦后自动关闭'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={() => void handleOpenSettings()} data-no-drag="true">
                  <Settings className="size-3.5" />
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
                size="icon-sm"
                onClick={handleSwapLanguages}
                disabled={config.sourceLang === 'auto' && config.targetLang === 'auto'}
              >
                <ArrowRightLeft className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>交换语言</TooltipContent>
          </Tooltip>
          <div className="min-w-0 flex-1">
            <LanguageSelector value={config.targetLang} onChange={(v) => void handleTargetLangChange(v)}  />
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
                      size="icon-sm"
                      className="shrink-0"
                      onClick={() => void handleCopy(sourceText, 'source')}
                      disabled={!sourceText.trim()}
                    >
                      {copied === 'source' ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{copied === 'source' ? '已复制原文' : '复制原文'}</TooltipContent>
                </Tooltip>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden p-3">
                {loading && !sourceText.trim() ? (
                  <div className="flex h-full min-h-28 items-center justify-center gap-2 px-2 text-center text-sm text-muted-foreground" aria-busy aria-live="polite">
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
            <section className={cn(
              'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/70 shadow-sm',
              error ? 'bg-destructive/5' : 'bg-card/80'
            )}>
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
                      size="icon-sm"
                      className="shrink-0"
                      onClick={() => void handleCopy(translatedText, 'target')}
                      disabled={!translatedText.trim()}
                    >
                      {copied === 'target' ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{copied === 'target' ? '已复制译文' : '复制译文'}</TooltipContent>
                </Tooltip>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden p-3">
                {error ? (
                  <ScrollArea className="h-full min-h-0">
                    <div className="rounded-xl border border-destructive/20 bg-background/75 px-3 py-2 text-sm leading-6 text-destructive">
                      {error}
                    </div>
                  </ScrollArea>
                ) : (
                  <ScrollArea className="h-full min-h-0">
                    {loading ? (
                      <div className="flex min-h-28 items-center gap-2 text-[15px] leading-7 text-muted-foreground" aria-busy aria-live="polite">
                        <Loader2 className="size-4 shrink-0 animate-spin" />
                        <span>{sourceText.trim() ? '翻译中…' : '请稍候…'}</span>
                      </div>
                    ) : translatedText ? (
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
                  <p className="min-w-0 flex-1 text-xs leading-snug text-muted-foreground">
                    可随时修改原文后再次翻译
                  </p>
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
                <><Loader2 className="size-3.5 animate-spin" />翻译中</>
              ) : '翻译'}
            </Button>
          </div>
        </div>

        {/* 底部状态栏 */}
        <div className="flex shrink-0 items-center justify-between border-t border-border/70 bg-muted/25 px-4 py-2 text-xs text-muted-foreground">
          <span>{config.floatingPinned ? '已固定窗口' : '失焦后自动关闭'}</span>
          <span>拖动顶栏移动窗口</span>
        </div>
      </div>
    </TooltipProvider>
  )
}
