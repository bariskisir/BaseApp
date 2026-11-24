export function createStyleSheet(
  container: HTMLElement = document.head,
  className?: string,
): HTMLStyleElement {
  const style = document.createElement('style')
  style.type = 'text/css'
  if (className) {
    style.className = className
  }
  container.appendChild(style)
  return style
}

export function setStyleSheetText(style: HTMLStyleElement, content: string): void {
  if (style.textContent !== content) {
    style.textContent = content
  }
}
