import { setZoomFactor, setZoomLevel } from '@app/base/browser/browser'
import type { ISandboxGlobals } from '@app/base/parts/sandbox/common/sandboxTypes'
import { clampZoomLevel, zoomLevelToZoomFactor } from '../common/window'

export function applyZoom(zoomLevel: number): number {
  const clamped = clampZoomLevel(zoomLevel)
  const factor = zoomLevelToZoomFactor(clamped)

  if (typeof window !== 'undefined') {
    const sandbox = (window as { baseapp?: ISandboxGlobals }).baseapp
    if (typeof sandbox?.webFrame?.setZoomLevel === 'function') {
      sandbox.webFrame.setZoomLevel(clamped)
    } else if (typeof sandbox?.webFrame?.setZoomFactor === 'function') {
      sandbox.webFrame.setZoomFactor(factor)
    }
  }

  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.style.setProperty('--baseapp-window-zoom-factor', String(factor))
  }

  setZoomFactor(factor)
  setZoomLevel(clamped)
  return clamped
}
