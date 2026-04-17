function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

interface RgbColor {
  r: number
  g: number
  b: number
}

function normalizeHexColor(input: string | undefined, fallback: string) {
  if (!input) {
    return fallback
  }

  const value = input.trim()
  const shortHex = /^#([\da-fA-F]{3})$/
  const fullHex = /^#([\da-fA-F]{6})$/

  if (shortHex.test(value)) {
    const [, hex] = value.match(shortHex)!
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase()
  }

  if (fullHex.test(value)) {
    return value.toLowerCase()
  }

  return fallback
}

function hexToRgb(hex: string): RgbColor {
  const normalized = normalizeHexColor(hex, '#000000').slice(1)

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

function rgbToHex({ r, g, b }: RgbColor) {
  return `#${[r, g, b]
    .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`
}

export function mixColors(base: string, target: string, amount: number) {
  const weight = clamp(amount, 0, 1)
  const start = hexToRgb(base)
  const end = hexToRgb(target)

  return rgbToHex({
    r: start.r + (end.r - start.r) * weight,
    g: start.g + (end.g - start.g) * weight,
    b: start.b + (end.b - start.b) * weight,
  })
}

export function withAlpha(color: string, alpha: number) {
  const { r, g, b } = hexToRgb(color)
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`
}

function channelToLinear(channel: number) {
  const normalized = channel / 255
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4
}

export function getContrastColor(background: string, dark = '#10211b', light = '#ffffff') {
  const { r, g, b } = hexToRgb(background)
  const luminance =
    0.2126 * channelToLinear(r) +
    0.7152 * channelToLinear(g) +
    0.0722 * channelToLinear(b)

  return luminance > 0.56 ? dark : light
}

export function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60)       { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else              { r = c; g = 0; b = x }
  return rgbToHex({
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  })
}

export function hexToHue(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  if (d === 0) return 0
  let h = 0
  if (max === rn)      h = ((gn - bn) / d) % 6
  else if (max === gn) h = (bn - rn) / d + 2
  else                 h = (rn - gn) / d + 4
  h = Math.round(h * 60)
  if (h < 0) h += 360
  return h
}
