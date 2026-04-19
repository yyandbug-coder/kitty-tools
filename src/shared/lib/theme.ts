import type { AppSettings, AppTheme } from '@clipboard/types'
import {
  getContrastColor,
  hslToHex,
  mixColors,
  withAlpha,
} from '@/shared/lib/color'

interface ThemeOption {
  id: AppTheme
  label: string
  description: string
  accent: string
  preview: string
}

export const DEFAULT_THEME: AppTheme = 'default'
export const MIN_BACKGROUND_OPACITY = 35
export const MAX_BACKGROUND_OPACITY = 95
export const DEFAULT_CUSTOM_HUE = 160

const PRESET_THEMES: ThemeOption[] = [
  {
    id: 'default',
    label: '默认玫瑰',
    description: '使用默认的玫瑰主色，浅色与深色模式都更柔和与稳定。',
    accent: '#e11d48',
    preview: 'linear-gradient(135deg, rgba(244,114,182,0.52), rgba(255,241,242,0.92))',
  },
  {
    id: 'ocean',
    label: '海雾蓝',
    description: '通透的蓝绿色，适合半透明浮窗与工具面板。',
    accent: '#06b6d4',
    preview: 'linear-gradient(135deg, rgba(34,211,238,0.48), rgba(8,47,73,0.92))',
  },
  {
    id: 'forest',
    label: '林地绿',
    description: '克制的绿色调，桌面工具感更强。',
    accent: '#10b981',
    preview: 'linear-gradient(135deg, rgba(16,185,129,0.46), rgba(20,83,45,0.92))',
  },
  {
    id: 'sunset',
    label: '落日橙',
    description: '偏暖的橙色，视觉层次更明显。',
    accent: '#f97316',
    preview: 'linear-gradient(135deg, rgba(249,115,22,0.52), rgba(67,20,7,0.92))',
  },
]

function deriveAccentFromHue(hue: number) {
  return hslToHex(hue, 0.72, 0.5)
}

export function getCustomHuePreviewColor(hue: number): string {
  return deriveAccentFromHue(hue)
}

export function getThemeOption(theme: AppTheme, customHue = DEFAULT_CUSTOM_HUE) {
  if (theme === 'custom') {
    const accent = deriveAccentFromHue(customHue)
    return {
      id: 'custom',
      label: '自定义颜色',
      description: '使用单一 accent 颜色生成整套主题。',
      accent,
      preview: createCustomThemePreview(customHue),
    } satisfies ThemeOption
  }

  return PRESET_THEMES.find((option) => option.id === theme) ?? PRESET_THEMES[0]
}

function createCustomThemePreview(hue: number) {
  const accent = deriveAccentFromHue(hue)
  return `linear-gradient(135deg, ${mixColors(accent, '#ffffff', 0.34)}, ${mixColors(
    accent,
    '#0f172a',
    0.32,
  )})`
}

function buildShadowVariables(accent: string, isDarkMode: boolean) {
  const shadowBase = isDarkMode
    ? mixColors(accent, '#020617', 0.86)
    : mixColors(accent, '#0f172a', 0.78)
  const baseAlpha = isDarkMode ? 0.32 : 0.1
  const strongAlpha = isDarkMode ? 0.54 : 0.18

  return {
    '--shadow-color': shadowBase,
    '--shadow-2xs': `0px 4px 12px 0px ${withAlpha(shadowBase, baseAlpha * 0.45)}`,
    '--shadow-xs': `0px 4px 12px 0px ${withAlpha(shadowBase, baseAlpha * 0.45)}`,
    '--shadow-sm': `0px 4px 12px 0px ${withAlpha(shadowBase, baseAlpha)}, 0px 1px 2px -1px ${withAlpha(shadowBase, baseAlpha)}`,
    '--shadow': `0px 4px 12px 0px ${withAlpha(shadowBase, baseAlpha)}, 0px 1px 2px -1px ${withAlpha(shadowBase, baseAlpha)}`,
    '--shadow-md': `0px 4px 12px 0px ${withAlpha(shadowBase, baseAlpha)}, 0px 2px 4px -1px ${withAlpha(shadowBase, baseAlpha)}`,
    '--shadow-lg': `0px 4px 12px 0px ${withAlpha(shadowBase, baseAlpha)}, 0px 4px 6px -1px ${withAlpha(shadowBase, baseAlpha)}`,
    '--shadow-xl': `0px 4px 12px 0px ${withAlpha(shadowBase, baseAlpha)}, 0px 8px 10px -1px ${withAlpha(shadowBase, baseAlpha)}`,
    '--shadow-2xl': `0px 4px 12px 0px ${withAlpha(shadowBase, strongAlpha)}`,
  } as Record<string, string>
}

function buildThemeVariablesFromAccent(accent: string, isDarkMode: boolean) {
  const shadowVariables = buildShadowVariables(accent, isDarkMode)

  if (!isDarkMode) {
    const background = mixColors(accent, '#ffffff', 0.95)
    const card = mixColors(accent, '#ffffff', 0.91)
    const secondary = mixColors(accent, '#ffffff', 0.87)
    const muted = mixColors(accent, '#f8fafc', 0.9)
    const accentSoft = mixColors(accent, '#ffffff', 0.8)
    const border = mixColors(accent, '#cbd5e1', 0.72)
    const foreground = getContrastColor(background)
    const secondaryForeground = getContrastColor(secondary)
    const primaryForeground = getContrastColor(accent)

    return {
      '--background': background,
      '--foreground': foreground,
      '--card': card,
      '--card-foreground': getContrastColor(card),
      '--popover': card,
      '--popover-foreground': getContrastColor(card),
      '--primary': accent,
      '--primary-foreground': primaryForeground,
      '--secondary': secondary,
      '--secondary-foreground': secondaryForeground,
      '--muted': muted,
      '--muted-foreground': mixColors(foreground, '#6b7280', 0.48),
      '--accent': accentSoft,
      '--accent-foreground': getContrastColor(accentSoft),
      '--destructive': '#ef4444',
      '--destructive-foreground': '#ffffff',
      '--border': border,
      '--input': mixColors(accent, '#ffffff', 0.86),
      '--ring': accent,
      '--sidebar': mixColors(accent, '#ffffff', 0.89),
      '--sidebar-foreground': getContrastColor(card),
      '--sidebar-primary': accent,
      '--sidebar-primary-foreground': primaryForeground,
      '--sidebar-accent': accentSoft,
      '--sidebar-accent-foreground': getContrastColor(accentSoft),
      '--sidebar-border': border,
      '--sidebar-ring': accent,
      '--chart-1': accent,
      '--chart-2': mixColors(accent, '#ffffff', 0.18),
      '--chart-3': mixColors(accent, '#0f172a', 0.12),
      '--chart-4': mixColors(accent, '#ffffff', 0.34),
      '--chart-5': mixColors(accent, '#0f172a', 0.22),
      ...shadowVariables,
    } as Record<string, string>
  }

  const background = mixColors(accent, '#0b1220', 0.93)
  const card = mixColors(accent, '#111827', 0.88)
  const secondary = mixColors(accent, '#162033', 0.82)
  const muted = mixColors(accent, '#141c2b', 0.84)
  const accentSoft = mixColors(accent, '#162033', 0.68)
  const border = mixColors(accent, '#334155', 0.7)
  const foreground = '#f8fafc'
  const primaryForeground = getContrastColor(accent)

  return {
    '--background': background,
    '--foreground': foreground,
    '--card': card,
    '--card-foreground': foreground,
    '--popover': card,
    '--popover-foreground': foreground,
    '--primary': accent,
    '--primary-foreground': primaryForeground,
    '--secondary': secondary,
    '--secondary-foreground': foreground,
    '--muted': muted,
    '--muted-foreground': mixColors(foreground, '#94a3b8', 0.34),
    '--accent': accentSoft,
    '--accent-foreground': foreground,
    '--destructive': '#f87171',
    '--destructive-foreground': '#ffffff',
    '--border': border,
    '--input': mixColors(accent, '#162033', 0.76),
    '--ring': accent,
    '--sidebar': mixColors(accent, '#0f172a', 0.9),
    '--sidebar-foreground': foreground,
    '--sidebar-primary': accent,
    '--sidebar-primary-foreground': primaryForeground,
    '--sidebar-accent': accentSoft,
    '--sidebar-accent-foreground': foreground,
    '--sidebar-border': border,
    '--sidebar-ring': accent,
    '--chart-1': accent,
    '--chart-2': mixColors(accent, '#ffffff', 0.14),
    '--chart-3': mixColors(accent, '#0f172a', 0.1),
    '--chart-4': mixColors(accent, '#ffffff', 0.26),
    '--chart-5': mixColors(accent, '#0f172a', 0.22),
    ...shadowVariables,
  } as Record<string, string>
}

export function getThemeRuntimeStyle(
  settings: Pick<AppSettings, 'backgroundOpacity' | 'theme' | 'customHue'>,
  isDarkMode: boolean,
) {
  const normalizedOpacity = Math.min(
    MAX_BACKGROUND_OPACITY,
    Math.max(MIN_BACKGROUND_OPACITY, settings.backgroundOpacity),
  )
  const theme = getThemeOption(settings.theme, settings.customHue)
  const lowOpacityHeadroom = MAX_BACKGROUND_OPACITY - normalizedOpacity
  const panelAlpha = Math.min(
    97,
    Math.round(normalizedOpacity + 12 + lowOpacityHeadroom * 0.22),
  )

  const runtimeStyle: Record<string, string> = {
    '--window-alpha': `${normalizedOpacity}%`,
    '--panel-alpha': `${panelAlpha}%`,
    '--theme-accent': theme.accent,
  }

  Object.assign(runtimeStyle, buildThemeVariablesFromAccent(theme.accent, isDarkMode))

  return runtimeStyle
}

export function getSearchShellStyle(
  theme: AppTheme,
  customHue: number,
  isDarkMode: boolean,
) {
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
    '--search-shell-focus-ring': focus,
  } as Record<string, string>
}
