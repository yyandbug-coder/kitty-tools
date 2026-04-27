// 订阅系统 prefers-color-scheme: dark，随系统外观变化更新
import { useEffect, useState } from 'react'

const MEDIA_QUERY = '(prefers-color-scheme: dark)'

export function useSystemPrefersDark(): boolean {
  const [prefersDark, setPrefersDark] = useState(
    () => (typeof window !== 'undefined' ? window.matchMedia(MEDIA_QUERY).matches : false),
  )

  useEffect(() => {
    const mq = window.matchMedia(MEDIA_QUERY)
    const handler = (e: MediaQueryListEvent) => setPrefersDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return prefersDark
}
