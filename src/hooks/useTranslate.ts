// 翻译 Hook - 调用后端翻译接口，管理翻译状态
import { useState, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { TranslateRequest, TranslateResult } from '@/types'
import { getInvokeErrorMessage } from '@/lib/invoke-helpers'

export function useTranslate() {
  const [result, setResult] = useState<TranslateResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRequest, setLastRequest] = useState<TranslateRequest | null>(null)
  const seqRef = useRef(0)

  const translate = useCallback(async (request: TranslateRequest) => {
    const seq = ++seqRef.current
    setLastRequest(request)
    setLoading(true)
    setError(null)
    try {
      const r = await invoke<TranslateResult>('translate_text', {
        text: request.text,
        sourceLang: request.source_lang,
        targetLang: request.target_lang,
      })
      if (seq !== seqRef.current) return null
      setResult(r)
      return r
    } catch (e) {
      if (seq !== seqRef.current) return null
      setError(getInvokeErrorMessage(e))
      setResult(null)
      return null
    } finally {
      if (seq === seqRef.current) setLoading(false)
    }
  }, [])

  const retry = useCallback(() => {
    if (lastRequest) return translate(lastRequest)
    return Promise.resolve(null)
  }, [lastRequest, translate])

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

  return { result, loading, error, lastRequest, translate, retry, clearResult, applyResult, applyError, setLoadingState }
}
