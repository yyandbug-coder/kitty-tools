/**
 * 主题上下文 - 与 shadcn 文档一致 API（theme / setTheme / resolvedTheme），持久化走 useAppSettings（SQLite），并同步 html 的 light|dark 供浮层与 Toast
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import type { ColorMode } from '@clipboard/types'

type Theme = ColorMode

type ResolvedTheme = 'dark' | 'light'

type ThemeProviderState = {
  /** 用户选择：跟随系统 / 浅色 / 深色 */
  theme: Theme
  setTheme: (theme: Theme) => void
  /** 实际应用到界面与 documentElement 的明暗 */
  resolvedTheme: ResolvedTheme
}

const ThemeContext = createContext<ThemeProviderState | null>(null)

export function ThemeProvider({
  children,
  colorMode,
  onColorModeChange,
  systemPrefersDark,
}: {
  children: ReactNode
  colorMode: ColorMode
  onColorModeChange: (mode: ColorMode) => void
  systemPrefersDark: boolean
}) {
  const resolvedTheme: ResolvedTheme =
    colorMode === 'dark' || (colorMode === 'system' && systemPrefersDark) ? 'dark' : 'light'

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(resolvedTheme)
  }, [resolvedTheme])

  const setTheme = useCallback(
    (next: Theme) => {
      onColorModeChange(next)
    },
    [onColorModeChange],
  )

  const value = useMemo(
    () => ({
      theme: colorMode,
      setTheme,
      resolvedTheme,
    }),
    [colorMode, setTheme, resolvedTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeProviderState {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme 必须在 ThemeProvider 内使用')
  }
  return ctx
}
