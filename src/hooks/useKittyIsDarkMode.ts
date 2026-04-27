// 根据应用主题设置与系统外观，得到是否使用暗色（与 getThemeRuntimeStyle / dark class 一致）
import { useMemo } from 'react'
import { useSystemPrefersDark } from '@/hooks/useSystemPrefersDark'

export function useKittyIsDarkMode(theme: string): boolean {
  const systemPrefersDark = useSystemPrefersDark()
  return useMemo(
    () => theme === 'dark' || (theme === 'system' && systemPrefersDark),
    [theme, systemPrefersDark],
  )
}
