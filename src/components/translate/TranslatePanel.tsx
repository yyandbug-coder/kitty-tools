// 翻译工作台面板 - 主翻译界面，支持文本输入、语言选择和截图翻译
// 监听截图/划词翻译事件，将结果回显到面板中
import { useState, useRef, useEffect } from 'react'
import { ArrowRightLeft, Copy, Check, Loader2, Scissors, Eraser, RotateCcw } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { LanguageSelector } from '@/components/shared/LanguageSelector'
import { useTranslate } from '@/hooks/useTranslate'
import { useAppConfig } from '@/hooks/useAppConfig'
import { getLanguageDisplayName, getProviderDisplayName } from '@/types'
import ShortcutKbd from '@/components/shared/ShortcutKbd'
import { formatShortcutForDisplay, translateSubmitShortcutLabel } from '@/lib/platform'
import { getInvokeErrorMessage } from '@/lib/invoke-helpers'
import { copyTextWithFallback } from '@/lib/copy-text'
import toast from 'react-hot-toast'

interface ScreenshotResultPayload {
  translatedText?: string
  sourceText?: string
  sourceLang?: string
  targetLang?: string
  error?: string
}

export default function TranslatePanel() {
  const { config, updateConfig } = useAppConfig()
  const { result, loading, error, translate, retry, clearResult, applyResult, applyError, setLoadingState } =
    useTranslate()
  const [inputText, setInputText] = useState('')
  const [copied, setCopied] = useState(false)
  const MAX_INPUT_LENGTH = 5000
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 监听截图/划词翻译结果，回显到面板。
  // 两个 listen 用 Promise.all 并行注册，省一次 IPC RTT；解绑遵循「resolve 时若已卸载则立即解绑」模式。
  useEffect(() => {
    let cancelled = false
    let unlistenResult: UnlistenFn | undefined
    let unlistenStart: UnlistenFn | undefined

    void Promise.all([
      listen<string>('translate-selection-start', (event) => {
        if (!event.payload) return
        // 避免覆盖用户在面板里已经手动输入的内容：仅在输入框为空时才回显源文本。
        // 否则用户正在编辑时被划词/截图事件打断会丢失输入。
        const incoming = typeof event.payload === 'string' ? event.payload : ''
        setInputText((current) => (current.trim().length === 0 ? incoming : current))
        setLoadingState(true)
      }),
      listen<ScreenshotResultPayload>('translate-selection-result', (event) => {
        const p = event.payload
        if (p?.error) {
          applyError(p.error)
        } else if (p?.translatedText) {
          setInputText(p.sourceText ?? '')
          applyResult({
            sourceText: p.sourceText ?? '',
            translatedText: p.translatedText,
            sourceLang: p.sourceLang ?? '',
            targetLang: p.targetLang ?? '',
            provider: ''
          })
        }
      })
    ]).then(([fnStart, fnResult]) => {
      if (cancelled) {
        fnStart()
        fnResult()
        return
      }
      unlistenStart = fnStart
      unlistenResult = fnResult
    })

    return () => {
      cancelled = true
      unlistenStart?.()
      unlistenResult?.()
    }
  }, [applyResult, applyError, setLoadingState])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(
    () => () => {
      if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current)
    },
    []
  )

  const autoCopyResult = async (text: string) => {
    if (!config.autoCopy || !text) return
    try {
      // navigator.clipboard 失败时回落到后端 arboard 写入，避免失焦/权限场景丢译文。
      await copyTextWithFallback(text)
    } catch (e) {
      toast.error(`自动复制译文失败：${getInvokeErrorMessage(e)}`, { duration: 4000 })
    }
  }

  const handleTranslate = async () => {
    if (!inputText.trim()) return
    const res = await translate({
      text: inputText.trim(),
      source_lang: config.sourceLang,
      target_lang: config.targetLang
    })
    if (res?.translatedText) await autoCopyResult(res.translatedText)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      void handleTranslate()
    }
  }

  const handleSwapLanguages = () => {
    if (config.sourceLang === 'auto' && config.targetLang === 'auto') return
    const nextSource = config.targetLang === 'auto' ? config.sourceLang : config.targetLang
    const nextTarget = config.sourceLang === 'auto' ? config.targetLang : config.sourceLang
    void updateConfig({ sourceLang: nextSource, targetLang: nextTarget })
    if (result) {
      setInputText(result.translatedText)
      clearResult()
    }
  }

  const handleCopy = async () => {
    if (!result?.translatedText) return
    try {
      await copyTextWithFallback(result.translatedText)
      if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current)
      setCopied(true)
      copyResetTimerRef.current = setTimeout(() => {
        setCopied(false)
        copyResetTimerRef.current = null
      }, 2000)
    } catch (e) {
      toast.error(`复制失败：${getInvokeErrorMessage(e)}`, { duration: 4000 })
    }
  }

  const handleClear = () => {
    setInputText('')
    clearResult()
    inputRef.current?.focus()
  }

  const handleScreenshot = async () => {
    try {
      // 语言由后端 AppConfig 决定（与已保存配置一致）；勿传无效参数以免误导维护者
      await invoke('start_screenshot_translate')
    } catch (err) {
      applyError(getInvokeErrorMessage(err))
    }
  }

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4">
      {/* 语言选择栏 */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <LanguageSelector value={config.sourceLang} onChange={(v) => void updateConfig({ sourceLang: v })} />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSwapLanguages}
              disabled={config.sourceLang === 'auto' && config.targetLang === 'auto'}
              className="shrink-0"
            >
              <ArrowRightLeft className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>交换语言</TooltipContent>
        </Tooltip>
        <div className="flex-1">
          <LanguageSelector value={config.targetLang} onChange={(v) => void updateConfig({ targetLang: v })} />
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
                <TooltipContent className="flex flex-wrap items-center gap-1">
                  <span>截图翻译（</span>
                  <ShortcutKbd formatted={formatShortcutForDisplay(config.hotkeyScreenshot)} />
                  <span>）</span>
                </TooltipContent>
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
            // textarea 自带 `maxLength` 已能限制输入，外层再 slice 是冗余路径；
            // 保留 maxLength 作为单一截断点，外部「来自事件回灌」的写入由各自来源保证不超长。
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`输入要翻译的文本…（${translateSubmitShortcutLabel()} 翻译）`}
            maxLength={MAX_INPUT_LENGTH}
            className="min-h-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-3 py-2 text-base shadow-none focus-visible:ring-0"
          />
          {inputText.length > MAX_INPUT_LENGTH * 0.9 && (
            <div className="shrink-0 border-t px-3 py-1 text-[11px] text-muted-foreground">
              {inputText.length} / {MAX_INPUT_LENGTH}
            </div>
          )}
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
                    {getLanguageDisplayName(result.sourceLang)} → {getLanguageDisplayName(result.targetLang)}
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
                <div className="flex flex-col gap-2">
                  <p className="text-sm leading-relaxed text-destructive">{error}</p>
                  <Button variant="outline" size="sm" onClick={() => void retry()} className="w-fit">
                    <RotateCcw className="mr-1.5 size-3.5" />
                    重试
                  </Button>
                </div>
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
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            翻译中...
          </>
        ) : (
          '翻译'
        )}
      </Button>
    </div>
  )
}
