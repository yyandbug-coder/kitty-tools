// 翻译工作台面板 - 主翻译界面，支持文本输入、语言选择和截图翻译
// 原文/译文双栏布局，参考 example/kitty-translate
import { useState, useRef, useEffect } from 'react'
import { ArrowRightLeft, Copy, Check, Loader2, Scissors, Eraser } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { LanguageSelector } from '@/components/shared/LanguageSelector'
import { useTranslate } from '@/hooks/useTranslate'
import { useAppConfig } from '@/hooks/useAppConfig'
import { getLanguageDisplayName, getProviderDisplayName } from '@/types'
import { translateSubmitShortcutLabel } from '@/lib/platform'

export default function TranslatePanel() {
  const { config, updateConfig } = useAppConfig()
  const { result, loading, error, translate, clearResult, applyError } = useTranslate()
  const [inputText, setInputText] = useState('')
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const autoCopyResult = async (text: string) => {
    if (!config.autoCopy || !text) return
    try { await navigator.clipboard.writeText(text) } catch { /* clipboard not available */ }
  }

  const handleTranslate = async () => {
    if (!inputText.trim()) return
    const res = await translate({ text: inputText.trim(), source_lang: config.sourceLang, target_lang: config.targetLang })
    if (res?.translatedText) await autoCopyResult(res.translatedText)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      void handleTranslate()
    }
  }

  const handleSwapLanguages = () => {
    if (config.sourceLang === 'auto') return
    void updateConfig({ sourceLang: config.targetLang, targetLang: config.sourceLang })
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
      setTimeout(() => setCopied(false), 2000)
    } catch { /* fallback */ }
  }

  const handleClear = () => {
    setInputText('')
    clearResult()
    inputRef.current?.focus()
  }

  const handleScreenshot = async () => {
    try {
      await invoke('start_screenshot_translate', {
        sourceLang: config.sourceLang,
        targetLang: config.targetLang,
      })
    } catch (err) {
      applyError(typeof err === 'string' ? err : String(err))
    }
  }

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4">
      {/* 语言选择栏 */}
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
              <ArrowRightLeft className="size-4" />
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

      {/* 原文/译文双栏 */}
      <div className="flex min-h-0 flex-1 flex-row gap-3">
        {/* 原文区 */}
        <div className="relative flex min-h-[140px] min-w-0 flex-1 flex-col rounded-lg border bg-card">
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
                    className="size-7"
                    onClick={() => void handleScreenshot()}
                    disabled={loading}
                  >
                    <Scissors className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>截图翻译（{config.hotkeyScreenshot}）</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={handleClear}
                    disabled={!inputText && !result}
                  >
                    <Eraser className="size-3.5" />
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
            placeholder={`输入要翻译的文本…（${translateSubmitShortcutLabel()} 翻译）`}
            className="min-h-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-3 py-2 text-base shadow-none focus-visible:ring-0"
          />
        </div>

        {/* 译文区 */}
        <div className="flex min-h-[140px] min-w-0 flex-1 flex-col rounded-lg border bg-muted/40">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
            <p className="min-w-0 truncate text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">译文</span>
              <span className="mx-1.5 text-border">·</span>
              <span>翻译结果</span>
              {result && !error ? (
                <>
                  <span className="mx-1.5 text-border">·</span>
                  <span className="text-[11px]">
                    {getProviderDisplayName(result.provider as 'baidu' | 'google' | 'youdao' | 'openai')} ·{' '}
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
                  className="size-7 shrink-0"
                  onClick={handleCopy}
                  disabled={!result?.translatedText}
                >
                  {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
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
                  <Loader2 className="size-4 shrink-0 animate-spin" />
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

      {/* 翻译按钮 */}
      <Button
        onClick={() => void handleTranslate()}
        disabled={loading || !inputText.trim()}
        className="w-full shrink-0"
        size="lg"
      >
        {loading ? (
          <><Loader2 className="mr-2 size-4 animate-spin" />翻译中...</>
        ) : '翻译'}
      </Button>
    </div>
  )
}
