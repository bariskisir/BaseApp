import { registerSize, sizeForAllThemes } from '../sizeUtils'

export const borderWidth = registerSize('border.width', sizeForAllThemes(1, 'px'))

export const cornerRadiusSmall = registerSize('cornerRadius.small', sizeForAllThemes(2, 'px'))

export const cornerRadiusMedium = registerSize('cornerRadius.medium', sizeForAllThemes(4, 'px'))

export const cornerRadiusLarge = registerSize('cornerRadius.large', sizeForAllThemes(6, 'px'))

export const transitionFast = registerSize('transition.fast', sizeForAllThemes(100, 'ms'))

export const transitionBase = registerSize('transition.base', sizeForAllThemes(150, 'ms'))

export const sashSize = registerSize('sash.size', sizeForAllThemes(4, 'px'))
