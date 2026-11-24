export type SandboxIpcListener = (...args: unknown[]) => void

export interface ISandboxIpcRenderer {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  send(channel: string, ...args: unknown[]): void
  on(channel: string, listener: SandboxIpcListener): () => void
  removeListener(channel: string, listener: SandboxIpcListener): void
}

export interface ISandboxWebFrame {
  setZoomLevel(level: number): void
  getZoomLevel(): number
  setZoomFactor(factor: number): void
}

export interface ISandboxGlobals {
  readonly ipcRenderer: ISandboxIpcRenderer
  readonly webFrame: ISandboxWebFrame
}

declare global {
  interface Window {
    baseapp: ISandboxGlobals
  }
}
