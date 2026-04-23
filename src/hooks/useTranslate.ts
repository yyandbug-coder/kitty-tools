import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { TranslateResult } from '@/types';

export function useTranslate() {
  const [result, setResult] = useState<TranslateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const translate = useCallback(async (text: string, sourceLang: string, targetLang: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await invoke<TranslateResult>('translate_text', {
        text, sourceLang, targetLang,
      });
      setResult(r);
      return r;
    } catch (e) {
      const msg = String(e);
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  const applyError = useCallback((msg: string) => {
    setError(msg);
    setLoading(false);
  }, []);

  return { result, loading, error, translate, clearResult, applyError };
}