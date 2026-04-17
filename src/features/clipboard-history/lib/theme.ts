import type { AppSettings, AppTheme } from '@clipboard/types'
import {
  getContrastColor,
  hslToHex,
  mixColors,
  withAlpha,
} from '@clipboard/lib/color'

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
    description: '使用 shadcn 语义 token 的默认主题，浅深色都跟随系统。',
    accent: '#e11d48',
    preview: 'linear-gradient(135deg, rgba(244,114,182,0.52), rgba(255,241,242,0.92))',
  },
  {
    id: 'ocean',
    label: '海雾青',
    description: '更通透的蓝绿系，适合透明浮窗。',
    accent: '#06b6d4',
    preview: 'linear-gradient(135deg, rgba(34,211,238,0.48), rgba(8,47,73,0.92))',
  },
  {
    id: 'forest',
    label: '林地绿',
    description: '更克制的墨绿调，桌面工具感更强。',
    accent: '#10b981',
    preview: 'linear-gradient(135deg, rgba(16,185,129,0.46), rgba(20,83,45,0.92))',
  },
  {
    id: 'sunset',
    label: '落日橙',
    description: '偏暖的琥珀橙，视觉层次更明显。',
    accent: '#f97316',
    preview: 'linear-gradient(135deg, rgba(249,115,22,0.52), rgba(67,20,7,0.92))',
  },
]

interface DerivedPalette {
  primary: string
  accent: string
  surface: string
}

function derivePaletteFromHue(hue: number): DerivedPalette {
  return {
    primary: hslToHex(hue, 0.72, 0.40),
    accent: hslToHex(hue, 0.55, 0.72),
    surface: hslToHex(hue, 0.18, 0.92),
  }
}

export function getCustomHuePreviewColor(hue: number): string {
  return hslToHex(hue, 0.72, 0.50)
}

export function getThemeOption(theme: AppTheme, customHue = DEFAULT_CUSTOM_HUE) {
  if (theme === 'custom') {
    const palette = derivePaletteFromHue(customHue)
    return {
      id: 'custom',
      label: '自定义颜色',
      description: '用你自己的色调生成主题。',
      accent: palette.primary,
      preview: createCustomThemePreview(customHue),
    } satisfies ThemeOption
  }

  return PRESET_THEMES.find((option) => option.id === theme) ?? PRESET_THEMES[0]
}

function createCustomThemePreview(hue: number) {
  const palette = derivePaletteFromHue(hue)
  return `linear-gradient(135deg, ${mixColors(palette.primary, '#ffffff', 0.28)}, ${mixColors(
    palette.surface,
    palette.accent,
    0.54,
  )})`
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
    const secondaryForeground = getContrastColor(secondary)

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
      '--secondary-foreground': secondaryForeground,
      '--muted': muted,
      '--muted-foreground': mixColors(foreground, '#6b7280', 0.48),
      '--accent': accent,
      '--accent-foreground': getContrastColor(accent),
      '--destructive': '#ef4444',
      '--destructive-foreground': '#ffffff',
      '--border': border,
      '--input': mixColors(card, '#ffffff', 0.26),
      '--ring': palette.primary,
      '--sidebar': mixColors(card, '#ffffff', 0.2),
      '--sidebar-foreground': getContrastColor(card),
      '--sidebar-primary': palette.primary,
      '--sidebar-primary-foreground': getContrastColor(palette.primary),
      '--sidebar-accent': accent,
      '--sidebar-accent-foreground': getContrastColor(accent),
      '--sidebar-border': border,
      '--sidebar-ring': palette.primary,
      '--chart-1': palette.primary,
      '--chart-2': palette.accent,
      '--chart-3': mixColors(palette.primary, palette.accent, 0.42),
      '--chart-4': mixColors(palette.surface, palette.primary, 0.65),
      '--chart-5': mixColors(palette.surface, palette.accent, 0.72),
    } as Record<string, string>
  }

  const background = mixColors(palette.surface, '#07130f', 0.9)
  const card = mixColors(palette.surface, '#10201a', 0.82)
  const secondary = mixColors(palette.surface, '#163127', 0.74)
  const muted = mixColors(palette.surface, '#11231d', 0.78)
  const accent = mixColors(palette.accent, '#14241d', 0.68)
  const primary = mixColors(palette.primary, '#f8fafc', 0.08)
  const border = mixColors(palette.surface, '#385247', 0.7)
  const foreground = '#f3fff8'

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
    '--muted-foreground': mixColors(foreground, '#8eb7a4', 0.36),
    '--accent': accent,
    '--accent-foreground': foreground,
    '--destructive': '#f87171',
    '--destructive-foreground': '#ffffff',
    '--border': border,
    '--input': mixColors(card, '#1b3028', 0.34),
    '--ring': primary,
    '--sidebar': mixColors(card, '#09110e', 0.2),
    '--sidebar-foreground': foreground,
    '--sidebar-primary': primary,
    '--sidebar-primary-foreground': getContrastColor(primary),
    '--sidebar-accent': accent,
    '--sidebar-accent-foreground': foreground,
    '--sidebar-border': border,
    '--sidebar-ring': primary,
    '--chart-1': primary,
    '--chart-2': mixColors(palette.accent, '#ffffff', 0.12),
    '--chart-3': mixColors(palette.primary, palette.accent, 0.45),
    '--chart-4': mixColors(palette.surface, palette.primary, 0.55),
    '--chart-5': mixColors(palette.surface, palette.accent, 0.6),
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
  // 窗口越通透时，内层面板额外垫高不透明度，避免列表与文字被桌面背景「冲掉」
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

  if (settings.theme === 'custom') {
    Object.assign(runtimeStyle, buildCustomThemeVariables(settings.customHue, isDarkMode))
  }

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
