import { useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { TranslateResult, TranslateRequest } from '@translate/types'

export function useTranslate() {
  const [result, setResult] = useState<TranslateResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const translate = useCallback(async (request: TranslateRequest) => {
    setLoading(true)
    setError(null)
    try {
      const res = await invoke<TranslateResult>('translate_text', {
        request: {
          text: request.text,
          source_lang: request.sourceLang,
          target_lang: request.targetLang,
        },
      })
      setResult(res)
      return res
    } catch (err) {
      const msg = typeof err === 'string' ? err : String(err)
      setResult(null)
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const applyResult = useCallback((nextResult: TranslateResult) => {
    setResult(nextResult)
    setError(null)
    setLoading(false)
  }, [])

  const applyError = useCallback((message: string) => {
    setResult(null)
    setError(message)
    setLoading(false)
  }, [])

  const setLoadingState = useCallback((nextLoading: boolean) => {
    setLoading(nextLoading)
    if (nextLoading) {
      setError(null)
    }
  }, [])

  const clearResult = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  return {
    result,
    loading,
    error,
    translate,
    clearResult,
    applyResult,
    applyError,
    setLoadingState,
  }
}
