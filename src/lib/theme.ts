import type { AppTheme } from '@/types'
import { getContrastColor, hslToHex, mixColors, withAlpha } from '@/lib/color'

export const DEFAULT_CUSTOM_HUE = 160
export const DEFAULT_OPACITY = 72
export const MIN_BACKGROUND_OPACITY = 35
export const MAX_BACKGROUND_OPACITY = 95

export interface ThemeOption {
  id: AppTheme
  label: string
  accent: string
}

export const PRESET_THEMES: ThemeOption[] = [
  { id: 'default', label: '默认玫瑰', accent: '#e83095' },
  { id: 'ocean', label: '海雾青', accent: '#06b6d4' },
  { id: 'forest', label: '林地绿', accent: '#10b981' },
  { id: 'sunset', label: '落日橙', accent: '#f97316' }
]

interface DerivedPalette {
  primary: string
  accent: string
  surface: string
}

function derivePaletteFromHue(hue: number): DerivedPalette {
  return {
    primary: hslToHex(hue, 0.72, 0.4),
    accent: hslToHex(hue, 0.55, 0.72),
    surface: hslToHex(hue, 0.18, 0.92)
  }
}

export function getThemeOption(theme: AppTheme, customHue = DEFAULT_CUSTOM_HUE): ThemeOption {
  if (theme === 'custom') {
    const palette = derivePaletteFromHue(customHue)
    return { id: 'custom', label: '自定义颜色', accent: palette.primary }
  }
  return PRESET_THEMES.find((o) => o.id === theme) ?? PRESET_THEMES[0]
}

export function getThemeAccent(theme: AppTheme, customHue = DEFAULT_CUSTOM_HUE): string {
  return getThemeOption(theme, customHue).accent
}

function buildCustomThemeVariables(hue: number, isDarkMode: boolean) {
  const palette = derivePaletteFromHue(hue)
  if (!isDarkMode) {
    const background = mixColors(palette.surface, '#ffffff', 0.72)
    const card = mixColors(palette.surface, '#ffffff', 0.82)
    const secondary = mixColors(palette.surface, '#ffffff', 0.64)
    const muted = mixColors(palette.surface, '#f4f7f5', 0.54)
    const accent = mixColors(palette.accent, '#ffffff', 0.68)
    const border = mixColors(palette.surface, '#cbd5d1', 0.58)
    const foreground = getContrastColor(background)
    return {
      '--background': background,
      '--foreground': foreground,
      '--card': card,
      '--card-foreground': getContrastColor(card),
      '--popover': card,
      '--popover-foreground': getContrastColor(card),
      '--primary': palette.primary,
      '--primary-foreground': getContrastColor(palette.primary),
      '--secondary': secondary,
      '--secondary-foreground': getContrastColor(secondary),
      '--muted': muted,
      '--muted-foreground': mixColors(foreground, '#6b7280', 0.48),
      '--accent': accent,
      '--accent-foreground': getContrastColor(accent),
      '--destructive': '#ef4444',
      '--destructive-foreground': '#ffffff',
      '--border': border,
      '--input': mixColors(card, '#ffffff', 0.26),
      '--ring': palette.primary
    } as Record<string, string>
  }
  const background = mixColors(palette.surface, '#0f0f12', 0.9)
  const card = mixColors(palette.surface, '#17171c', 0.84)
  const secondary = mixColors(palette.surface, '#202026', 0.76)
  const muted = mixColors(palette.surface, '#19191e', 0.82)
  const accent = mixColors(palette.accent, '#19191e', 0.72)
  const primary = mixColors(palette.primary, '#f8fafc', 0.08)
  const border = mixColors(palette.surface, '#292930', 0.72)
  const foreground = '#f5f5f7'
  return {
    '--background': background,
    '--foreground': foreground,
    '--card': card,
    '--card-foreground': foreground,
    '--popover': card,
    '--popover-foreground': foreground,
    '--primary': primary,
    '--primary-foreground': getContrastColor(primary),
    '--secondary': secondary,
    '--secondary-foreground': foreground,
    '--muted': muted,
    '--muted-foreground': mixColors(foreground, '#8e8e96', 0.4),
    '--accent': accent,
    '--accent-foreground': foreground,
    '--destructive': '#f87171',
    '--destructive-foreground': '#ffffff',
    '--border': border,
    '--input': mixColors(card, '#18181c', 0.34),
    '--ring': primary
  } as Record<string, string>
}

export function getThemeRuntimeStyle(
  themePreset: string,
  customHue: number,
  isDarkMode: boolean,
  backgroundOpacity = DEFAULT_OPACITY
): Record<string, string> {
  const theme = getThemeOption(themePreset as AppTheme, customHue)
  const normalizedOpacity = Math.min(MAX_BACKGROUND_OPACITY, Math.max(MIN_BACKGROUND_OPACITY, backgroundOpacity))
  const lowOpacityHeadroom = MAX_BACKGROUND_OPACITY - normalizedOpacity
  const panelAlpha = Math.min(97, Math.round(normalizedOpacity + 12 + lowOpacityHeadroom * 0.22))

  const vars: Record<string, string> = {
    '--window-alpha': `${normalizedOpacity}%`,
    '--panel-alpha': `${panelAlpha}%`,
    '--theme-accent': theme.accent
  }
  if (themePreset === 'custom') {
    Object.assign(vars, buildCustomThemeVariables(customHue, isDarkMode))
  }
  return vars
}

export function getSearchShellStyle(theme: AppTheme, customHue: number, isDarkMode: boolean): Record<string, string> {
  const currentTheme = getThemeOption(theme, customHue)
  const accent = currentTheme.accent
  const backgroundBlend = isDarkMode
    ? withAlpha(mixColors(accent, '#0b1220', 0.72), 0.84)
    : withAlpha(mixColors(accent, '#ffffff', 0.86), 0.88)
  const border = isDarkMode
    ? withAlpha(mixColors(accent, '#94a3b8', 0.32), 0.66)
    : withAlpha(mixColors(accent, '#cbd5e1', 0.44), 0.82)
  const focus = isDarkMode
    ? withAlpha(mixColors(accent, '#e2e8f0', 0.22), 0.55)
    : withAlpha(mixColors(accent, '#ffffff', 0.22), 0.34)

  return {
    '--search-shell-bg': backgroundBlend,
    '--search-shell-border': border,
    '--search-shell-focus-ring': focus
  }
}
