import {
  foreground,
  selectionBackground,
  textLinkActiveForeground,
  textLinkForeground,
} from '@app/platform/theme/common/colors/baseColors'
import { registerThemingParticipant } from '@app/platform/theme/common/themeService'
import { WORKBENCH_BACKGROUND } from '@app/workbench/common/theme'

registerThemingParticipant((theme, collector) => {
  const backgroundColor = theme.getColor(WORKBENCH_BACKGROUND)
  const foregroundColor = theme.getColor(foreground)
  if (backgroundColor && foregroundColor) {
    collector.addRule(
      `body, .monaco-workbench { background: ${backgroundColor.toString()}; color: ${foregroundColor.toString()}; }`,
    )
  } else if (backgroundColor) {
    collector.addRule(`body, .monaco-workbench { background: ${backgroundColor.toString()}; }`)
  }

  const selectionColor = theme.getColor(selectionBackground)
  if (selectionColor) {
    collector.addRule(`::selection { background: ${selectionColor.toString()}; }`)
  }

  const linkColor = theme.getColor(textLinkForeground)
  if (linkColor) {
    collector.addRule(`a { color: ${linkColor.toString()}; }`)
  }

  const linkActiveColor = theme.getColor(textLinkActiveForeground)
  if (linkActiveColor) {
    collector.addRule(`a:hover { color: ${linkActiveColor.toString()}; }`)
  }
})
