/**
 * Verifies shared date formatting and session-summary helpers.
 */

import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { formatDate, toSessionSummary } from '../src/renderer/src/utils/formatters'

describe('formatDate', () => {
  const isoDate = '2026-12-25T14:30:00.000Z'

  it('formats 24-hour timestamps without a period suffix', () => {
    const result = formatDate(isoDate, '24-hour')
    expect(result).toMatch(/^\d{2}\.\d{2}\.\d{2} \d{2}:\d{2}$/)
  })

  it('formats 12-hour timestamps with AM or PM', () => {
    expect(formatDate(isoDate, '12-hour')).toMatch(/^\d{2}\.\d{2}\.\d{2} \d{2}:\d{2} (AM|PM)$/)
  })
})

describe('toSessionSummary', () => {
  it('keeps only sidebar metadata from a complete generic session', () => {
    const now = new Date().toISOString()
    const summary = toSessionSummary({
      id: randomUUID(),
      title: 'Workspace',
      isDefaultTitle: false,
      createdAt: now,
      updatedAt: now,
      data: { draft: true },
    })
    expect(summary.title).toBe('Workspace')
    expect(summary).not.toHaveProperty('data')
  })
})
