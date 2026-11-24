import { clamp } from './number'

function roundFloat(value: number, decimalPoints: number): number {
  const scale = 10 ** decimalPoints
  return Math.round(value * scale) / scale
}

function toHexByte(value: number): string {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')
}

interface HslaChannels {
  readonly h: number
  readonly s: number
  readonly l: number
  readonly a: number
}

function rgbaToHsla(rgba: RGBA): HslaChannels {
  const r = rgba.r / 255
  const g = rgba.g / 255
  const b = rgba.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const delta = max - min

  let h = 0
  let s = 0

  if (delta > 0) {
    s = clamp(l <= 0.5 ? delta / (2 * l) : delta / (2 - 2 * l), 0, 1)
    if (max === r) {
      h = (g - b) / delta + (g < b ? 6 : 0)
    } else if (max === g) {
      h = (b - r) / delta + 2
    } else {
      h = (r - g) / delta + 4
    }
    h = Math.round(h * 60)
  }

  return { h, s, l, a: rgba.a }
}

function hueToRgb(p: number, q: number, t: number): number {
  let normalized = t
  if (normalized < 0) {
    normalized += 1
  }
  if (normalized > 1) {
    normalized -= 1
  }
  if (normalized < 1 / 6) {
    return p + (q - p) * 6 * normalized
  }
  if (normalized < 1 / 2) {
    return q
  }
  if (normalized < 2 / 3) {
    return p + (q - p) * (2 / 3 - normalized) * 6
  }
  return p
}

function hslaToRgba(hsla: HslaChannels): RGBA {
  const h = hsla.h / 360
  const s = clamp(hsla.s, 0, 1)
  const l = clamp(hsla.l, 0, 1)

  if (s === 0) {
    const channel = Math.round(l * 255)
    return new RGBA(channel, channel, channel, hsla.a)
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const r = Math.round(hueToRgb(p, q, h + 1 / 3) * 255)
  const g = Math.round(hueToRgb(p, q, h) * 255)
  const b = Math.round(hueToRgb(p, q, h - 1 / 3) * 255)

  return new RGBA(r, g, b, hsla.a)
}

export class RGBA {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly a: number

  constructor(r: number, g: number, b: number, a = 1) {
    this.r = clamp(Math.round(r), 0, 255)
    this.g = clamp(Math.round(g), 0, 255)
    this.b = clamp(Math.round(b), 0, 255)
    this.a = roundFloat(clamp(a, 0, 1), 3)
  }

  static equals(first: RGBA, second: RGBA): boolean {
    return (
      first.r === second.r && first.g === second.g && first.b === second.b && first.a === second.a
    )
  }
}

export class Color {
  static readonly white = new Color(new RGBA(255, 255, 255, 1))
  static readonly black = new Color(new RGBA(0, 0, 0, 1))
  static readonly transparent = new Color(new RGBA(0, 0, 0, 0))

  readonly rgba: RGBA

  constructor(rgba: RGBA) {
    this.rgba = rgba
  }

  static fromHex(hex: string): Color {
    const normalized = hex.trim().startsWith('#') ? hex.trim().slice(1) : hex.trim()
    if (!/^[0-9a-fA-F]+$/.test(normalized)) {
      throw new Error(`Invalid hex color: ${hex}`)
    }

    if (normalized.length === 3 || normalized.length === 4) {
      const r = Number.parseInt(normalized.charAt(0).repeat(2), 16)
      const g = Number.parseInt(normalized.charAt(1).repeat(2), 16)
      const b = Number.parseInt(normalized.charAt(2).repeat(2), 16)
      const a =
        normalized.length === 4 ? Number.parseInt(normalized.charAt(3).repeat(2), 16) / 255 : 1
      return new Color(new RGBA(r, g, b, a))
    }

    if (normalized.length === 6 || normalized.length === 8) {
      const r = Number.parseInt(normalized.slice(0, 2), 16)
      const g = Number.parseInt(normalized.slice(2, 4), 16)
      const b = Number.parseInt(normalized.slice(4, 6), 16)
      const a = normalized.length === 8 ? Number.parseInt(normalized.slice(6, 8), 16) / 255 : 1
      return new Color(new RGBA(r, g, b, a))
    }

    throw new Error(`Invalid hex color: ${hex}`)
  }

  toString(): string {
    const { r, g, b, a } = this.rgba
    if (a === 1) {
      return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`
    }
    return `rgba(${r}, ${g}, ${b}, ${a})`
  }

  transparent(factor: number): Color {
    const { r, g, b, a } = this.rgba
    return new Color(new RGBA(r, g, b, a * factor))
  }

  lighten(factor: number): Color {
    const hsla = rgbaToHsla(this.rgba)
    const amount = clamp(factor, 0, 1)
    const lightness = hsla.l + (1 - hsla.l) * amount
    return new Color(hslaToRgba({ h: hsla.h, s: hsla.s, l: lightness, a: hsla.a }))
  }

  darken(factor: number): Color {
    const hsla = rgbaToHsla(this.rgba)
    const amount = clamp(factor, 0, 1)
    const lightness = hsla.l * (1 - amount)
    return new Color(hslaToRgba({ h: hsla.h, s: hsla.s, l: lightness, a: hsla.a }))
  }

  mix(other: Color, weight = 0.5): Color {
    const factor = clamp(weight, 0, 1)
    const r = this.rgba.r + (other.rgba.r - this.rgba.r) * factor
    const g = this.rgba.g + (other.rgba.g - this.rgba.g) * factor
    const b = this.rgba.b + (other.rgba.b - this.rgba.b) * factor
    const a = this.rgba.a + (other.rgba.a - this.rgba.a) * factor
    return new Color(new RGBA(r, g, b, a))
  }

  opaque(): Color {
    if (this.rgba.a === 1) {
      return this
    }
    return new Color(new RGBA(this.rgba.r, this.rgba.g, this.rgba.b, 1))
  }

  equals(other: Color | null | undefined): boolean {
    return Boolean(other) && RGBA.equals(this.rgba, (other as Color).rgba)
  }
}
