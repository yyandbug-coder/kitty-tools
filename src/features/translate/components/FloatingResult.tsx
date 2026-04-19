import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { ArrowRightLeft, Check, Copy, Loader2, Pin, PinOff, Settings, X } from 'lucide-react'
import { LanguageSelector } from '@translate/components/LanguageSelector'
import { Button } from '@translate/components/ui/button'
import { Textarea } from '@translate/components/ui/textarea'
import { ScrollArea } from '@translate/components/ui/scroll-area'
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from '@translate/components/ui/tooltip'
import { useConfig } from '@translate/hooks/useConfig'
import { ThemeProvider } from '@/shared/components/ThemeProvider'
import { getThemeRuntimeStyle } from '@/shared/lib/theme'
import { useGlobalAppSettings } from '@/shared/hooks/useGlobalAppSettings'
import {
  themedChromeSurfaceClassName,
  themedDestructiveSurfaceClassName,
  themedMutedSurfaceClassName,
  themedOverlaySurfaceClassName,
  themedPanelSurfaceClassName,
  themedWindowSurfaceClassName,
} from '@/shared/lib/theme-surfaces'
import logoUrl from '@translate/assets/images/logo.png'
import { cn } from '@translate/lib/utils'
import { formatSubmitShortcutLabel } from '@/shared/lib/shortcuts'
import { getLanguageDisplayName } from '@translate/types'

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

export function FloatingResult() {
  const { config, updateConfig } = useConfig()
  const {
    settings: globalSettings,
    updateSettings: updateGlobalSettings,
    loaded,
  } = useGlobalAppSettings()
  const [sourceText, setSourceText] = useState('')
  const [translatedText, setTranslatedText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<CopyTarget>(null)
  const [detectedSourceLang, setDetectedSourceLang] = useState<string | null>(null)
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  const isDarkMode =
    globalSettings.colorMode === 'dark' ||
    (globalSettings.colorMode === 'system' && systemPrefersDark)
  const appStyle = useMemo(
    () => getThemeRuntimeStyle(globalSettings, isDarkMode) as CSSProperties,
    [globalSettings.backgroundOpacity, globalSettings.theme, globalSettings.customHue, isDarkMode],
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const updateThemeMode = (event: MediaQueryList | MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches)
    }
    updateThemeMode(mediaQuery)
    mediaQuery.addEventListener('change', updateThemeMode)
    return () => mediaQuery.removeEventListener('change', updateThemeMode)
  }, [])

  useEffect(() => {
    let cancelled = false
    let unlistenResult: UnlistenFn | undefined
    let unlistenLoading: UnlistenFn | undefined

    ;(async () => {
      try {
        unlistenResult = await listen<EventPayload>('translate-selection-result', (event) => {
          setLoading(false)
          setSourceText(event.payload.text)

          if (event.payload.error) {
            setError(event.payload.error)
            setTranslatedText('')
            setDetectedSourceLang(null)
          } else {
            setError(null)
            setTranslatedText(event.payload.translated)
            const sourceLang = event.payload.sourceLang
            setDetectedSourceLang(sourceLang && sourceLang !== 'auto' ? sourceLang : null)
            if (config.autoCopy && event.payload.translated.trim()) {
              void navigator.clipboard.writeText(event.payload.translated).catch(() => {})
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

        await invoke('translate_floating_ready')
      } catch {
        // 非 Tauri 环境或权限异常时忽略
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
        request: {
          text,
          source_lang: sourceLang,
          target_lang: targetLang,
        },
      })

      setSourceText(result.sourceText ?? result.source_text ?? text)
      setTranslatedText(result.translatedText ?? result.translated_text ?? '')
      const sourceLangResult = result.sourceLang ?? result.source_lang
      setDetectedSourceLang(sourceLangResult && sourceLangResult !== 'auto' ? sourceLangResult : null)
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
    if (value !== 'auto') {
      setDetectedSourceLang(null)
    }
    await updateConfig({ sourceLang: value })
    if (sourceText.trim()) {
      await runTranslation(sourceText, value, config.targetLang)
    }
  }

  const handleTargetLangChange = async (value: string) => {
    await updateConfig({ targetLang: value })
    if (sourceText.trim()) {
      await runTranslation(sourceText, config.sourceLang, value)
    }
  }

  const handleSwapLanguages = async () => {
    if (config.sourceLang === 'auto') return

    const nextSourceLang = config.targetLang
    const nextTargetLang = config.sourceLang

    await updateConfig({
      sourceLang: nextSourceLang,
      targetLang: nextTargetLang,
    })

    if (sourceText.trim()) {
      await runTranslation(sourceText, nextSourceLang, nextTargetLang)
    }
  }

  const handleClose = async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().hide()
  }

  const handleOpenSettings = async () => {
    try {
      await invoke('app_open_workspace', { module: 'settings' })
    } catch {
      // 非 Tauri 环境忽略
    }
  }

  const handleTogglePin = async () => {
    await updateConfig({ floatingPinned: !config.floatingPinned })
  }

  const handleDragPointerDown = async (event: PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('[data-no-drag="true"]')) return
    if (event.button !== 0) return

    if (!config.floatingPinned) {
      try {
        await invoke('translate_prepare_floating_drag')
      } catch {
        // 非 Tauri 环境忽略
      }
    }

    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().startDragging()
  }

  const handleSourceKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      void runTranslation(sourceText)
    }
  }

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
        正在准备翻译窗口…
      </div>
    )
  }

  return (
    <ThemeProvider
      colorMode={globalSettings.colorMode}
      onColorModeChange={(mode) => updateGlobalSettings({ colorMode: mode })}
      systemPrefersDark={systemPrefersDark}
    >
      <TooltipProvider>
        <div
          className={cn(
            'flex h-screen w-screen min-h-0 flex-col overflow-hidden rounded-[24px] text-foreground',
            themedWindowSurfaceClassName,
            isDarkMode && 'dark',
          )}
          data-kitty-theme-scope
          data-theme={globalSettings.theme}
          data-window="translate-floating"
          style={appStyle}
        >
          <div
            className={cn(
              'flex shrink-0 items-center justify-between border-b px-4 py-3',
              themedChromeSurfaceClassName,
              'border-[color-mix(in_oklch,var(--border)_30%,transparent)]',
            )}
            onPointerDown={handleDragPointerDown}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium tracking-tight">
              <img
                src={logoUrl}
                alt=""
                width={28}
                height={28}
                className="size-7 shrink-0 object-contain"
                draggable={false}
                aria-hidden
              />
              <span className="shrink-0">快速翻译</span>
              <span className="truncate text-xs font-normal text-muted-foreground">
                {formatSubmitShortcutLabel()} 翻译
              </span>
            </div>
            <div className="flex items-center gap-1" data-no-drag="true">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void handleOpenSettings()}
                    data-no-drag="true"
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>打开设置</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" onClick={handleTogglePin} data-no-drag="true">
                    {config.floatingPinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{config.floatingPinned ? '已固定窗口' : '失焦后自动关闭'}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" onClick={handleClose} data-no-drag="true">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>关闭</TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div
            className={cn(
              'flex shrink-0 items-center gap-2 border-b px-4 py-3',
              themedChromeSurfaceClassName,
              'border-[color-mix(in_oklch,var(--border)_28%,transparent)]',
            )}
          >
            <div className="min-w-0 flex-1">
              <LanguageSelector value={config.sourceLang} onChange={handleSourceLangChange} />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleSwapLanguages}
                  disabled={config.sourceLang === 'auto'}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>交换语言</TooltipContent>
            </Tooltip>
            <div className="min-w-0 flex-1">
              <LanguageSelector
                value={config.targetLang}
                onChange={handleTargetLangChange}
                excludeCodes={['auto']}
              />
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
            <div className="flex min-h-0 flex-1 flex-row gap-2">
              <section
                className={cn(
                  'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl shadow-sm',
                  themedPanelSurfaceClassName,
                )}
              >
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[color-mix(in_oklch,var(--border)_26%,transparent)] px-3 py-2">
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
                        {copied === 'source' ? (
                          <Check className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
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
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                      <span>正在识别截图中的文字…</span>
                    </div>
                  ) : (
                    <Textarea
                      value={sourceText}
                      onChange={(event) => setSourceText(event.target.value)}
                      onKeyDown={handleSourceKeyDown}
                      placeholder={`粘贴或输入文本，${formatSubmitShortcutLabel()} 翻译`}
                      className="h-full min-h-0 resize-none overflow-y-auto border-0 bg-transparent px-0 py-0 text-[15px] leading-7 shadow-none field-sizing-fixed focus-visible:ring-0"
                    />
                  )}
                </div>
              </section>

              <section
                className={cn(
                  'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl shadow-sm',
                  themedPanelSurfaceClassName,
                  error && themedDestructiveSurfaceClassName,
                )}
              >
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[color-mix(in_oklch,var(--border)_26%,transparent)] px-3 py-2">
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
                        {copied === 'target' ? (
                          <Check className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{copied === 'target' ? '已复制译文' : '复制译文'}</TooltipContent>
                  </Tooltip>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden p-3">
                  {error ? (
                    <ScrollArea className="h-full min-h-0">
                      <div
                        className={cn(
                          'rounded-xl px-3 py-2 text-sm leading-6 text-destructive',
                          themedOverlaySurfaceClassName,
                          'border-[color-mix(in_oklch,var(--destructive)_28%,var(--border)_72%)]',
                        )}
                      >
                        {error}
                      </div>
                    </ScrollArea>
                  ) : (
                    <ScrollArea className="h-full min-h-0">
                      {loading ? (
                        <div
                          className="flex min-h-28 items-center gap-2 text-[15px] leading-7 text-muted-foreground"
                          aria-busy
                          aria-live="polite"
                        >
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
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

            <div
              className={cn(
                'flex shrink-0 items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5 shadow-sm ring-1 ring-[color-mix(in_oklch,var(--foreground)_6%,transparent)]',
                themedMutedSurfaceClassName,
              )}
            >
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1.5">
                {loading ? (
                  <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground/80" aria-hidden />
                    <span className="leading-snug">翻译中…</span>
                  </span>
                ) : (
                  <>
                    {config.sourceLang === 'auto' && detectedSourceLang ? (
                      <span
                        className={cn(
                          'inline-flex max-w-full shrink-0 items-center gap-2 rounded-lg px-2 py-1 text-[11px] shadow-sm',
                          themedOverlaySurfaceClassName,
                        )}
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
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    翻译中
                  </>
                ) : (
                  '翻译'
                )}
              </Button>
            </div>
          </div>

          <div
            className={cn(
              'flex shrink-0 items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground',
              themedChromeSurfaceClassName,
              'border-[color-mix(in_oklch,var(--border)_28%,transparent)]',
            )}
          >
            <span>{config.floatingPinned ? '已固定窗口' : '失焦后自动关闭'}</span>
            <span>拖动标题栏移动窗口</span>
          </div>
        </div>
      </TooltipProvider>
    </ThemeProvider>
  )
}
