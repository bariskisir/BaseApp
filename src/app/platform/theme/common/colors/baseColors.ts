import { Color, RGBA } from '@app/base/common/color'
import { registerColor } from '../colorUtils'

export const foreground = registerColor('foreground', {
  dark: '#CCCCCC',
  light: '#3B3B3B',
})

export const descriptionForeground = registerColor('descriptionForeground', {
  dark: '#9D9D9D',
  light: '#717171',
})

export const focusBorder = registerColor('focusBorder', {
  dark: '#0078D4',
  light: '#005FB8',
})

export const iconForeground = registerColor('icon.foreground', {
  dark: '#CCCCCC',
  light: '#3B3B3B',
})

export const borderDefault = registerColor('border.default', {
  dark: '#2B2B2B',
  light: '#E5E5E5',
})

export const widgetShadow = registerColor('widget.shadow', {
  dark: new Color(new RGBA(0, 0, 0, 0.36)),
  light: new Color(new RGBA(0, 0, 0, 0.16)),
})

export const selectionBackground = registerColor('selection.background', {
  dark: '#264F78',
  light: '#ADD6FF',
})

export const textLinkForeground = registerColor('textLink.foreground', {
  dark: '#4DAAFC',
  light: '#005FB8',
})

export const textLinkActiveForeground = registerColor('textLink.activeForeground', {
  dark: '#4DAAFC',
  light: '#005FB8',
})

export const badgeBackground = registerColor('badge.background', {
  dark: '#616161',
  light: '#CCCCCC',
})

export const badgeForeground = registerColor('badge.foreground', {
  dark: '#F8F8F8',
  light: '#3B3B3B',
})

export const toolbarHoverBackground = registerColor('toolbar.hoverBackground', {
  dark: '#5A5D5E50',
  light: '#B8B8B850',
})

export const toolbarActiveBackground = registerColor('toolbar.activeBackground', {
  dark: '#63666750',
  light: '#A6A6A650',
})
