import { Disposable } from '@app/base/common/lifecycle'
import { ensureNoDisposablesAreLeakedInTestSuite } from '@app/base/test/common/utils'
import { TestInstantiationService } from '@app/platform/instantiation/test/common/instantiationServiceMock'
import {
  type IWorkbenchContribution,
  WorkbenchContributionsRegistry,
  WorkbenchPhase,
  getWorkbenchContributionsRegistry,
} from '@app/workbench/common/contributions'
import {
  SettingsRegistry,
  getSettingsRegistry,
  registerSettingsCategory,
} from '@app/workbench/common/settingsRegistry'
import { ViewsRegistry, getViewsRegistry, registerView } from '@app/workbench/common/views'
import { describe, expect, it } from 'vitest'

describe('workbench registries (views, settings, contributions)', () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite()

  it('registers, sorts, and disposes view descriptors in ViewsRegistry', () => {
    const registry = getViewsRegistry()
    let changes = 0
    disposables.add(registry.onDidChangeViews(() => (changes += 1)))

    const regB = disposables.add(
      registerView({
        id: 'test.view.b',
        titleKey: 'nav.sessions',
        iconId: 'files',
        defaultLocation: 'tertiarybar',
        order: 20,
        factory: () => () => ({}),
      }),
    )
    const regA = disposables.add(
      registerView({
        id: 'test.view.a',
        titleKey: 'nav.settings',
        iconId: 'settings-gear',
        defaultLocation: 'sidebar',
        order: 10,
        factory: () => () => ({}),
      }),
    )

    expect(registry.getView('test.view.a')?.defaultLocation).toBe('sidebar')
    expect(registry.getView('test.view.b')?.defaultLocation).toBe('tertiarybar')
    const ids = registry.getViews().map((v) => v.id)
    expect(ids.indexOf('test.view.a')).toBeLessThan(ids.indexOf('test.view.b'))

    regA.dispose()
    regB.dispose()
    expect(registry.getView('test.view.a')).toBeUndefined()
    expect(changes).toBeGreaterThanOrEqual(4)

    const isolatedViews = disposables.add(new ViewsRegistry())
    expect(() =>
      isolatedViews.registerView({
        id: '   ',
        titleKey: 'nav.sessions',
        iconId: 'files',
        defaultLocation: 'sidebar',
        order: 1,
        factory: () => () => ({}),
      }),
    ).toThrow()
    isolatedViews.clearForTest()
    const isoReg = disposables.add(
      isolatedViews.registerView({
        id: 'iso.view',
        titleKey: 'nav.sessions',
        iconId: 'files',
        defaultLocation: 'sidebar',
        order: 1,
        factory: () => () => ({}),
      }),
    )
    isolatedViews.clearForTest()
    expect(isolatedViews.getViews()).toEqual([])
    isoReg.dispose()
  })

  it('registers, orders, and disposes settings categories in SettingsRegistry', () => {
    const registry = getSettingsRegistry()
    let changes = 0
    disposables.add(registry.onDidChangeCategories(() => (changes += 1)))

    const reg = disposables.add(
      registerSettingsCategory({
        id: 'test.settings.cat',
        titleKey: 'settings.general',
        iconId: 'settings-gear',
        order: 99,
        component: () => ({}),
      }),
    )
    expect(registry.getCategory('test.settings.cat')?.order).toBe(99)
    expect(registry.getCategories().some((c) => c.id === 'test.settings.cat')).toBe(true)
    reg.dispose()
    expect(registry.getCategory('test.settings.cat')).toBeUndefined()
    expect(changes).toBeGreaterThanOrEqual(2)

    const isolatedSettings = disposables.add(new SettingsRegistry())
    expect(() =>
      isolatedSettings.registerCategory({
        id: '',
        titleKey: 'settings.general',
        iconId: 'settings-gear',
        order: 1,
        component: () => ({}),
      }),
    ).toThrow()
    isolatedSettings.clearForTest()
    const isoCat = disposables.add(
      isolatedSettings.registerCategory({
        id: 'iso.cat',
        titleKey: 'settings.general',
        iconId: 'settings-gear',
        order: 1,
        component: () => ({}),
      }),
    )
    isolatedSettings.clearForTest()
    expect(isolatedSettings.getCategories()).toEqual([])
    isoCat.dispose()
  })

  it('instantiates workbench contributions cleanly via WorkbenchContributionsRegistry', async () => {
    let created = 0
    let disposed = false
    class SampleContribution extends Disposable implements IWorkbenchContribution {
      constructor() {
        super()
        created += 1
      }

      override dispose(): void {
        disposed = true
        super.dispose()
      }
    }

    expect(getWorkbenchContributionsRegistry()).toBeDefined()
    const registry = disposables.add(new WorkbenchContributionsRegistry())
    registry.registerWorkbenchContribution(
      'test.workbench.contrib',
      SampleContribution,
      WorkbenchPhase.BlockRestore,
    )
    const di = disposables.add(new TestInstantiationService())
    registry.start(di)
    await registry.whenRestored
    expect(created).toBe(1)
    registry.clearForTest()
    expect(disposed).toBe(true)
  })
})
