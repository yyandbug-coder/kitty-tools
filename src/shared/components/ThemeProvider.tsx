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
  theme: Theme
  setTheme: (theme: Theme) => void
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
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}
