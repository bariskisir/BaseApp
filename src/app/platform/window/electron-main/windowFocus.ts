import type { BrowserWindow } from 'electron'

export function focusBrowserWindow(window: BrowserWindow | null | undefined): void {
  if (!window || window.isDestroyed()) {
    return
  }
  window.show()
  if (window.isMinimized()) {
    window.restore()
  }
  window.focus()
}
