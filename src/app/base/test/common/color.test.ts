import { Color, RGBA } from '@app/base/common/color'
import { describe, expect, it } from 'vitest'

describe('color', () => {
  it('parses 3, 4, 6, and 8 character hex colors and rejects invalid formats', () => {
    expect(Color.fromHex('#fff').toString()).toBe('#ffffff')
    expect(Color.fromHex('0f8').toString()).toBe('#00ff88')
    expect(Color.fromHex('#00ff0080').rgba.a).toBeCloseTo(0.502, 2)
    expect(Color.fromHex('#f088').rgba.r).toBe(255)
    expect(Color.fromHex('#1f1f1f').toString()).toBe('#1f1f1f')

    expect(() => Color.fromHex('#zzzzzz')).toThrow('Invalid hex color')
    expect(() => Color.fromHex('#12345')).toThrow('Invalid hex color')
  })

  it('transforms colors via transparent, opaque, lighten, darken, mix, and equals', () => {
    const accent = Color.fromHex('#0078D4')
    const translucent = accent.transparent(0.5)
    expect(translucent.toString()).toBe('rgba(0, 120, 212, 0.5)')
    expect(translucent.opaque().toString()).toBe('#0078d4')
    expect(accent.opaque()).toBe(accent)

    const red = new Color(new RGBA(220, 40, 60, 1))
    const green = new Color(new RGBA(40, 220, 80, 1))
    const gray = new Color(new RGBA(128, 128, 128, 1))
    const darkRed = red.darken(0.25)
    const lightGreen = green.lighten(0.25)
    const lightGray = gray.lighten(0.5)

    expect(darkRed.rgba.r).toBeLessThan(red.rgba.r)
    expect(lightGreen.rgba.g).toBeGreaterThan(green.rgba.g)
    expect(lightGray.rgba.r).toBeGreaterThan(gray.rgba.r)
    expect(lightGray.rgba.r).toBe(lightGray.rgba.g)

    const mixed = Color.black.mix(Color.white, 0.5)
    expect(mixed.rgba.r).toBe(128)
    expect(mixed.equals(new Color(new RGBA(128, 128, 128, 1)))).toBe(true)
    expect(mixed.equals(null)).toBe(false)
    expect(Color.transparent.rgba.a).toBe(0)
  })
})
