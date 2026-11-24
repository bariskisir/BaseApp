export type HttpFetchFunction = typeof fetch

let electronFetch: HttpFetchFunction | null | undefined

async function loadElectronFetch(): Promise<HttpFetchFunction | null> {
  try {
    const versions = (globalThis as { process?: { versions?: Record<string, string> } }).process
      ?.versions
    if (!versions || !('electron' in versions)) {
      return null
    }
    const electron = (await import('electron')) as unknown as { net?: { fetch?: unknown } }
    const candidate = electron.net?.fetch
    if (typeof candidate !== 'function') {
      return null
    }
    return (candidate as HttpFetchFunction).bind(electron.net)
  } catch {
    return null
  }
}

export async function httpFetch(
  input: Parameters<HttpFetchFunction>[0],
  init?: Parameters<HttpFetchFunction>[1],
): Promise<Response> {
  if (electronFetch === undefined) {
    electronFetch = await loadElectronFetch()
  }
  const implementation = electronFetch ?? globalThis.fetch
  return implementation(input, init)
}
