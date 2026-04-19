import { useState, useRef, useEffect } from 'react'
import { ArrowRightLeft, Copy, Check, Loader2, Scissors, Eraser } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { Textarea } from '@translate/components/ui/textarea'
import { ScrollArea } from '@translate/components/ui/scroll-area'
import { Button } from '@translate/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@translate/components/ui/tooltip'
import { LanguageSelector } from '@translate/components/LanguageSelector'
import { useTranslate } from '@translate/hooks/useTranslate'
import { useConfig } from '@translate/hooks/useConfig'
import { getLanguageDisplayName, getProviderDisplayName } from '@translate/types'
import { formatSubmitShortcutLabel } from '@/shared/lib/shortcuts'
import {
  themedDestructiveSurfaceClassName,
  themedPanelSurfaceClassName,
} from '@/shared/lib/theme-surfaces'
import { cn } from '@translate/lib/utils'

export function TranslatePanel() {
  const { config, updateConfig } = useConfig()
  const {
    result,
    loading,
    error,
    translate,
    clearResult,
    applyError,
  } = useTranslate()
  const [inputText, setInputText] = useState('')
  const [copied, setCopied] = useState(false)
  const copiedTimerRef = useRef(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => () => window.clearTimeout(copiedTimerRef.current), [])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const autoCopyResult = async (text: string) => {
    if (!config.autoCopy || !text) return
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // clipboard not available
    }
  }

  const handleTranslate = async () => {
    if (!inputText.trim()) return
    const res = await translate({
      text: inputText.trim(),
      sourceLang: config.sourceLang,
      targetLang: config.targetLang,
    })
    if (res?.translatedText) {
      await autoCopyResult(res.translatedText)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      void handleTranslate()
    }
  }

  const handleSwapLanguages = async () => {
    if (config.sourceLang === 'auto') return
    try {
      await updateConfig({
        sourceLang: config.targetLang,
        targetLang: config.sourceLang,
      })
    } catch {
      return
    }
    if (result) {
      setInputText(result.translatedText)
      clearResult()
    }
  }

  const handleCopy = async () => {
    if (!result?.translatedText) return
    try {
      await navigator.clipboard.writeText(result.translatedText)
      setCopied(true)
      window.clearTimeout(copiedTimerRef.current)
      copiedTimerRef.current = window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }

  const handleClear = () => {
    setInputText('')
    clearResult()
    inputRef.current?.focus()
  }

  const handleScreenshot = async () => {
    try {
      await invoke('translate_start_screenshot', {
        sourceLang: config.sourceLang,
        targetLang: config.targetLang,
      })
    } catch (err) {
      applyError(typeof err === 'string' ? err : String(err))
    }
  }

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <LanguageSelector
            value={config.sourceLang}
            onChange={(v) => void updateConfig({ sourceLang: v })}
          />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSwapLanguages}
              disabled={config.sourceLang === 'auto'}
              className="shrink-0"
            >
              <ArrowRightLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>交换语言</TooltipContent>
        </Tooltip>
        <div className="flex-1">
          <LanguageSelector
            value={config.targetLang}
            onChange={(v) => void updateConfig({ targetLang: v })}
            excludeCodes={['auto']}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-row gap-3">
        <div
          className={cn(
            'relative flex min-h-[140px] min-w-0 flex-1 flex-col rounded-lg',
            themedPanelSurfaceClassName,
          )}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
            <p className="truncate text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">原文</span>
              <span className="mx-1.5 text-border">·</span>
              <span>可编辑输入</span>
            </p>
            <div className="flex shrink-0 gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => void handleScreenshot()}
                    disabled={loading}
                  >
                    <Scissors className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>截图翻译（{config.hotkeyScreenshot}）</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleClear}
                    disabled={!inputText && !result}
                  >
                    <Eraser className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>清除</TooltipContent>
              </Tooltip>
            </div>
          </div>
          <Textarea
            ref={inputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`输入要翻译的文本…（${formatSubmitShortcutLabel()} 翻译）`}
            className="min-h-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-3 py-2 text-base shadow-none field-sizing-fixed focus-visible:ring-0"
          />
        </div>

        <div
          className={cn(
            'flex min-h-[140px] min-w-0 flex-1 flex-col rounded-lg',
            themedPanelSurfaceClassName,
            error && themedDestructiveSurfaceClassName,
          )}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
            <p className="min-w-0 truncate text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">译文</span>
              <span className="mx-1.5 text-border">·</span>
              <span>翻译结果</span>
              {result && !error ? (
                <>
                  <span className="mx-1.5 text-border">·</span>
                  <span className="text-[11px]">
                    {getProviderDisplayName(result.provider)} ·{' '}
                    {getLanguageDisplayName(result.sourceLang)} →{' '}
                    {getLanguageDisplayName(result.targetLang)}
                  </span>
                </>
              ) : null}
            </p>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={handleCopy}
                  disabled={!result?.translatedText}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{copied ? '已复制' : '复制译文'}</TooltipContent>
            </Tooltip>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="px-3 py-2">
              {error ? (
                <p className="text-sm leading-relaxed text-destructive">{error}</p>
              ) : loading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  翻译中…
                </p>
              ) : result?.translatedText ? (
                <p className="whitespace-pre-wrap text-base leading-relaxed">{result.translatedText}</p>
              ) : (
                <p className="text-sm text-muted-foreground">翻译结果将显示在此</p>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      <Button
        onClick={() => void handleTranslate()}
        disabled={loading || !inputText.trim()}
        className="w-full shrink-0"
        size="lg"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            翻译中...
          </>
        ) : (
          '翻译'
        )}
      </Button>
    </div>
  )
}
