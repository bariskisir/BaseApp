import { Emitter, type Event } from '../common/event'

class BrowserWindowState {
  static readonly INSTANCE = new BrowserWindowState()

  private _zoomLevel = 0
  private _zoomFactor = 1
  private _fullscreen = false

  private readonly _onDidChangeZoomLevel = new Emitter<number>()
  readonly onDidChangeZoomLevel: Event<number> = this._onDidChangeZoomLevel.event

  private readonly _onDidChangeFullscreen = new Emitter<boolean>()
  readonly onDidChangeFullscreen: Event<boolean> = this._onDidChangeFullscreen.event

  getZoomLevel(): number {
    return this._zoomLevel
  }

  setZoomLevel(zoomLevel: number): void {
    if (this._zoomLevel === zoomLevel) {
      return
    }
    this._zoomLevel = zoomLevel
    this._onDidChangeZoomLevel.fire(zoomLevel)
  }

  getZoomFactor(): number {
    return this._zoomFactor
  }

  setZoomFactor(zoomFactor: number): void {
    this._zoomFactor = zoomFactor
  }

  isFullscreen(): boolean {
    return this._fullscreen
  }

  setFullscreen(fullscreen: boolean): void {
    if (this._fullscreen === fullscreen) {
      return
    }
    this._fullscreen = fullscreen
    this._onDidChangeFullscreen.fire(fullscreen)
  }
}

export function getZoomLevel(): number {
  return BrowserWindowState.INSTANCE.getZoomLevel()
}

export function setZoomLevel(zoomLevel: number): void {
  BrowserWindowState.INSTANCE.setZoomLevel(zoomLevel)
}

export const onDidChangeZoomLevel: Event<number> = BrowserWindowState.INSTANCE.onDidChangeZoomLevel

export function getZoomFactor(): number {
  return BrowserWindowState.INSTANCE.getZoomFactor()
}

export function setZoomFactor(zoomFactor: number): void {
  BrowserWindowState.INSTANCE.setZoomFactor(zoomFactor)
}

export function isFullscreen(): boolean {
  return BrowserWindowState.INSTANCE.isFullscreen()
}

export function setFullscreen(fullscreen: boolean): void {
  BrowserWindowState.INSTANCE.setFullscreen(fullscreen)
}

export const onDidChangeFullscreen: Event<boolean> =
  BrowserWindowState.INSTANCE.onDidChangeFullscreen
