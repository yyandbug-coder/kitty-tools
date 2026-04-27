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
    const sidebar = mixColors(card, background, 0.35)
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
      '--ring': palette.primary,
      '--chart-1': palette.primary,
      '--chart-2': mixColors(palette.primary, '#ffffff', 0.2),
      '--chart-3': palette.accent,
      '--chart-4': mixColors(palette.accent, '#ffffff', 0.12),
      '--chart-5': mixColors(palette.primary, '#6366f1', 0.15),
      '--sidebar': sidebar,
      '--sidebar-foreground': getContrastColor(sidebar),
      '--sidebar-primary': palette.primary,
      '--sidebar-primary-foreground': getContrastColor(palette.primary),
      '--sidebar-accent': accent,
      '--sidebar-accent-foreground': getContrastColor(accent),
      '--sidebar-border': border,
      '--sidebar-ring': palette.primary
    } as Record<string, string>
  }
  // 深色：用中性深底 + 色相微染色，避免从浅色 surface 大比例混合发灰/发脏（与预置 .dark 主题一致）
  const base = '#0a0a0b'
  const tone = hslToHex(hue, 0.2, 0.22)
  const background = mixColors(base, tone, 0.22)
  const card = mixColors(background, mixColors(tone, '#e4e4e7', 0.1), 0.2)
  const secondary = mixColors(background, tone, 0.38)
  const muted = mixColors(background, mixColors(tone, '#a1a1aa', 0.08), 0.32)
  const accent = mixColors(mixColors(palette.accent, tone, 0.55), background, 0.28)
  const border = mixColors(card, mixColors(tone, '#71717a', 0.4), 0.42)
  const foreground = '#f4f4f5'
  const primary = mixColors(palette.primary, '#f4f4f5', 0.38)
  const sidebar = mixColors(background, tone, 0.18)
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
    '--muted-foreground': mixColors(foreground, '#a1a1aa', 0.5),
    '--accent': accent,
    '--accent-foreground': foreground,
    '--destructive': '#f87171',
    '--destructive-foreground': '#ffffff',
    '--border': border,
    '--input': mixColors(border, background, 0.45),
    '--ring': primary,
    '--chart-1': primary,
    '--chart-2': mixColors(primary, tone, 0.35),
    '--chart-3': mixColors(palette.accent, foreground, 0.25),
    '--chart-4': mixColors(tone, primary, 0.4),
    '--chart-5': mixColors(primary, '#a78bfa', 0.2),
    '--sidebar': sidebar,
    '--sidebar-foreground': foreground,
    '--sidebar-primary': primary,
    '--sidebar-primary-foreground': getContrastColor(primary),
    '--sidebar-accent': accent,
    '--sidebar-accent-foreground': foreground,
    '--sidebar-border': border,
    '--sidebar-ring': primary
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
