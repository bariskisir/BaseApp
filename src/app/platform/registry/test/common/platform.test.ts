import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { ensureNoDisposablesAreLeakedInTestSuite } from '@app/base/test/common/utils'
import { CommandsRegistry } from '@app/platform/commands/common/commands'
import { TestInstantiationService } from '@app/platform/instantiation/test/common/instantiationServiceMock'
import { LOCALE_RESOURCES, getLocaleResource } from '@app/platform/localization/common/locales'
import { APP_LOCALES, DEFAULT_APP_LOCALE } from '@app/platform/localization/common/localization'
import { DEFAULT_PRODUCT_INFO, ProductService } from '@app/platform/product/common/productService'
import { Registry } from '@app/platform/registry/common/platform'
import { ExternalUrlPolicy } from '@app/platform/security/common/externalUrlPolicy'
import { describe, expect, it } from 'vitest'

function flattenKeys(record: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const [key, value] of Object.entries(record)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...flattenKeys(value as Record<string, unknown>, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys.sort()
}

function collectWorkbenchFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return []
  }
  const results: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name === 'test') {
      continue
    }
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectWorkbenchFiles(full))
    } else if (extname(entry.name) === '.ts') {
      results.push(full)
    }
  }
  return results
}

describe('platform registries, commands, security, product, and localization', () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite()

  it('registers and retrieves Registry contributions cleanly', () => {
    const key = 'test.registry.sample'
    const payload = { ok: true }
    Registry.add(key, payload)
    expect(Registry.knows(key)).toBe(true)
    expect(Registry.as<typeof payload>(key)).toBe(payload)
    expect(() => Registry.add('', payload)).toThrow()
    expect(() => Registry.add(key, payload)).toThrow()
    expect(Registry.as('test.registry.missing')).toBeNull()
  })

  it('registers and executes commands cleanly via CommandsRegistry', () => {
    const cmdReg = disposables.add(
      CommandsRegistry.registerCommand('test.cmd.sample', (_accessor, arg) => `ran:${String(arg)}`),
    )

    const cmd = CommandsRegistry.getCommand('test.cmd.sample')
    expect(cmd).toBeDefined()
    const di = disposables.add(new TestInstantiationService())
    expect(cmd?.handler(di, 'ok')).toBe('ran:ok')
    expect(CommandsRegistry.getCommands().has('test.cmd.sample')).toBe(true)

    cmdReg.dispose()
    expect(CommandsRegistry.getCommand('test.cmd.sample')).toBeUndefined()
  })

  it('enforces ExternalUrlPolicy and ProductService metadata', () => {
    const product = new ProductService('2.0.0')
    expect(product.version).toBe('2.0.0')
    expect(product.name).toBe(DEFAULT_PRODUCT_INFO.name)
    expect(product.repositoryUrl).toContain('https://github.com/')

    const policy = new ExternalUrlPolicy(product)
    expect(policy.isAllowed('https://github.com/bariskisir/BaseApp')).toBe(true)
    expect(policy.isAllowed('http://github.com/bariskisir/BaseApp')).toBe(false)
    expect(policy.isAllowed('https://user:pass@github.com/bariskisir/BaseApp')).toBe(false)
    expect(policy.isAllowed('https://github.com:8443/bariskisir/BaseApp')).toBe(false)
    expect(policy.isAllowed('https://evil.example/path')).toBe(false)
    expect(policy.isAllowed('not-a-url')).toBe(false)
    expect(policy.isAllowed('javascript:alert(1)')).toBe(false)
    expect(() => policy.assertAllowed('https://evil.example')).toThrow('not allowed')
  })

  it('maintains 10-locale key parity and verifies every workbench translation key exists', () => {
    expect(APP_LOCALES).toHaveLength(10)
    expect(DEFAULT_APP_LOCALE).toBe('en')
    expect(getLocaleResource('unknown' as 'en')).toBe(LOCALE_RESOURCES.en)

    const enKeys = flattenKeys(LOCALE_RESOURCES.en as unknown as Record<string, unknown>)
    for (const locale of APP_LOCALES) {
      const resource = getLocaleResource(locale)
      const localeKeys = flattenKeys(resource as unknown as Record<string, unknown>)
      expect(localeKeys).toEqual(enKeys)
    }

    const enKeySet = new Set(enKeys)
    const workbenchFiles = collectWorkbenchFiles(join(process.cwd(), 'src', 'app', 'workbench'))
    const missingKeys: string[] = []
    const literalKeyPattern = /\bt\(\s*'([a-zA-Z0-9_.]+)'/g

    for (const file of workbenchFiles) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(literalKeyPattern)) {
        const key = match[1]
        if (key && !enKeySet.has(key)) {
          missingKeys.push(`${file}: ${key}`)
        }
      }
    }

    expect(missingKeys).toEqual([])
  })
})
