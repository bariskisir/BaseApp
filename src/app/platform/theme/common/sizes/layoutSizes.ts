import { registerSize, sizeForAllThemes } from '../sizeUtils'

export const titlebarHeight = registerSize('layout.titlebarHeight', sizeForAllThemes(35, 'px'))

export const statusbarHeight = registerSize('layout.statusbarHeight', sizeForAllThemes(22, 'px'))

export const tabHeight = registerSize('layout.tabHeight', sizeForAllThemes(35, 'px'))

export const sidebarHeaderHeight = registerSize(
  'layout.sidebarHeaderHeight',
  sizeForAllThemes(35, 'px'),
)

export const settingsTocWidth = registerSize('layout.settingsTocWidth', sizeForAllThemes(200, 'px'))
