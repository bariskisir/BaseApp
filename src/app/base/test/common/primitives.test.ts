import {
  CancellationError,
  onUnexpectedError,
  setUnexpectedErrorHandler,
  toErrorMessage,
} from '@app/base/common/errors'
import { formatBytes, formatDate } from '@app/base/common/formatters'
import { clamp, snapToStep } from '@app/base/common/number'
import {
  getCurrentPlatform,
  isStartupLaunchSupported,
  isTraySupported,
  toDesktopPlatform,
} from '@app/base/common/platform'
import { describe, expect, it } from 'vitest'

describe('base common primitives', () => {
  it('formats errors and routes unexpected errors while ignoring cancellations', () => {
    const namedErr = new Error('custom failure')
    expect(toErrorMessage(namedErr)).toBe('custom failure')
    expect(toErrorMessage(namedErr, true)).toContain('custom failure')
    expect(toErrorMessage(null)).toBe('An unknown error occurred.')
    expect(toErrorMessage('plain string')).toBe('plain string')
    expect(toErrorMessage({ message: 'object message' })).toBe('object message')
    expect(toErrorMessage(404)).toBe('404')

    const seen: unknown[] = []
    setUnexpectedErrorHandler((error) => seen.push(error))
    try {
      onUnexpectedError(new CancellationError())
      expect(seen).toEqual([])
      const err = new Error('real-error')
      onUnexpectedError(err)
      expect(seen).toEqual([err])
    } finally {
      setUnexpectedErrorHandler((error) => {
        console.error(error)
      })
    }
  })

  it('formats dates and byte sizes across formats and edge cases', () => {
    expect(formatDate('not-a-date', '24-hour')).toBe('')
    const morning = new Date(2026, 2, 5, 9, 7, 0).toISOString()
    const evening = new Date(2026, 2, 5, 18, 45, 0).toISOString()
    const midnight = new Date(2026, 2, 5, 0, 5, 0).toISOString()

    expect(formatDate(morning, '24-hour', 'dmy')).toBe('05.03.2026 09:07')
    expect(formatDate(evening, '12-hour', 'mdy')).toBe('03/05/2026 06:45 PM')
    expect(formatDate(midnight, '12-hour', 'ymd')).toBe('2026-03-05 12:05 AM')
    expect(formatDate(morning, '24-hour', 'locale', 'en-US')).toMatch(/2026.*09:07/)

    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(-50)).toBe('0 B')
    expect(formatBytes(Number.NaN)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(150 * 1024)).toBe('150 KB')
    expect(formatBytes(2 * 1024 * 1024)).toBe('2 MB')
    expect(formatBytes(3.5 * 1024 ** 3)).toBe('3.5 GB')
  })

  it('clamps and snaps numeric values cleanly', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-3, 0, 10)).toBe(0)
    expect(clamp(15, 0, 10)).toBe(10)

    expect(snapToStep(0.34, 0.1, 1, 0.1)).toBe(0.3)
    expect(snapToStep(0.36, 0.1, 1, 0.1)).toBe(0.4)
    expect(snapToStep(12, 0, 10, 2)).toBe(10)
    expect(snapToStep(-5, 0, 10, 2)).toBe(0)
  })

  it('resolves desktop platform capabilities', () => {
    expect(toDesktopPlatform('win32')).toBe('win32')
    expect(toDesktopPlatform('darwin')).toBe('darwin')
    expect(toDesktopPlatform('freebsd')).toBe('linux')

    expect(isTraySupported('win32')).toBe(true)
    expect(isTraySupported('darwin')).toBe(true)
    expect(isTraySupported('linux')).toBe(false)
    expect(isStartupLaunchSupported('win32')).toBe(true)
    expect(isStartupLaunchSupported('linux')).toBe(false)
    expect(['win32', 'darwin', 'linux']).toContain(getCurrentPlatform())
  })
})
