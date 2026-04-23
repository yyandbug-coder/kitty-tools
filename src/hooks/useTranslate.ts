// 翻译 Hook - 调用后端翻译接口，管理翻译状态
import { useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { TranslateRequest, TranslateResult } from '@/types'

export function useTranslate() {
  const [result, setResult] = useState<TranslateResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const translate = useCallback(async (request: TranslateRequest) => {
    setLoading(true)
    setError(null)
    try {
      const r = await invoke<TranslateResult>('translate_text', {
        text: request.text,
        sourceLang: request.source_lang,
        targetLang: request.target_lang,
      })
      setResult(r)
      return r
    } catch (e) {
      const msg = String(e)
      setError(msg)
      setResult(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const clearResult = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  const applyResult = useCallback((nextResult: TranslateResult) => {
    setResult(nextResult)
    setError(null)
    setLoading(false)
  }, [])

  const applyError = useCallback((msg: string) => {
    setResult(null)
    setError(msg)
    setLoading(false)
  }, [])

  const setLoadingState = useCallback((nextLoading: boolean) => {
    setLoading(nextLoading)
    if (nextLoading) setError(null)
  }, [])

  return { result, loading, error, translate, clearResult, applyResult, applyError, setLoadingState }
}
