import { Disposable } from '@app/base/common/lifecycle'
import { ensureNoDisposablesAreLeakedInTestSuite } from '@app/base/test/common/utils'
import { SyncDescriptor } from '@app/platform/instantiation/common/descriptors'
import {
  InstantiationType,
  getSingletonServiceDescriptors,
  registerSingleton,
} from '@app/platform/instantiation/common/extensions'
import {
  IInstantiationService,
  createDecorator,
} from '@app/platform/instantiation/common/instantiation'
import { InstantiationService } from '@app/platform/instantiation/common/instantiationService'
import { ServiceCollection } from '@app/platform/instantiation/common/serviceCollection'
import {
  TestInstantiationService,
  createServices,
} from '@app/platform/instantiation/test/common/instantiationServiceMock'
import { describe, expect, it } from 'vitest'

interface IAlpha {
  readonly _serviceBrand: undefined
  readonly name: string
}
const IAlpha = createDecorator<IAlpha>('test.alpha')

interface IBeta {
  readonly _serviceBrand: undefined
  readonly value: number
}
const IBeta = createDecorator<IBeta>('test.beta')

interface ICycleA {
  readonly _serviceBrand: undefined
}
const ICycleA = createDecorator<ICycleA>('test.cycleA')

interface ICycleB {
  readonly _serviceBrand: undefined
}
const ICycleB = createDecorator<ICycleB>('test.cycleB')

class AlphaImpl extends Disposable implements IAlpha {
  declare readonly _serviceBrand: undefined
  readonly name = 'alpha'
}

class BetaImpl implements IBeta {
  declare readonly _serviceBrand: undefined
  constructor(@IAlpha readonly alpha: IAlpha) {}
  get value(): number {
    return this.alpha.name.length
  }
}

class Consumer {
  constructor(
    readonly prefix: string,
    @IAlpha readonly alpha: IAlpha,
    @IBeta readonly beta: IBeta,
  ) {}
}

class CycleAImpl implements ICycleA {
  declare readonly _serviceBrand: undefined
  constructor(@ICycleB readonly b: ICycleB) {}
}

class CycleBImpl implements ICycleB {
  declare readonly _serviceBrand: undefined
  constructor(@ICycleA readonly a: ICycleA) {}
}

describe('instantiation and DI container', () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite()

  it('resolves constructor dependencies, SyncDescriptors, leading args, and child containers', () => {
    const services = new ServiceCollection([IAlpha, new SyncDescriptor(AlphaImpl)])
    services.set(IBeta, new SyncDescriptor(BetaImpl))

    const container = disposables.add(new InstantiationService(services, true))
    const consumer = container.createInstance(Consumer, 'hello')
    expect(consumer.prefix).toBe('hello')
    expect(consumer.alpha.name).toBe('alpha')
    expect(consumer.beta.value).toBe(5)

    const resolvedSelf = container.invokeFunction((accessor) => accessor.get(IInstantiationService))
    expect(resolvedSelf).toBe(container)

    const child = disposables.add(
      container.createChild(
        new ServiceCollection([IAlpha, { _serviceBrand: undefined, name: 'override' }]),
      ),
    )
    expect(child.invokeFunction((accessor) => accessor.get(IAlpha).name)).toBe('override')
    expect(child.invokeFunction((accessor) => accessor.get(IBeta).value)).toBe(5)
  })

  it('detects missing strict dependencies and cyclic dependency graphs', () => {
    const empty = disposables.add(new InstantiationService(new ServiceCollection(), true))
    expect(() => empty.invokeFunction((accessor) => accessor.get(IAlpha))).toThrow()

    const cyclicServices = new ServiceCollection(
      [ICycleA, new SyncDescriptor(CycleAImpl)],
      [ICycleB, new SyncDescriptor(CycleBImpl)],
    )
    const cyclic = disposables.add(new InstantiationService(cyclicServices, true))
    expect(() => cyclic.invokeFunction((accessor) => accessor.get(ICycleA))).toThrow(/cycle/i)
  })

  it('supports TestInstantiationService stubs, class stubs, createServices, and registerSingleton', () => {
    const testDi = createServices(disposables, [[IAlpha, AlphaImpl]])
    expect(testDi.get(IAlpha).name).toBe('alpha')

    testDi.stub(IBeta, { value: 99 })
    expect(testDi.get(IBeta).value).toBe(99)

    testDi.stubInstance(Consumer, { prefix: 'stubbed' })
    const stubbed = testDi.createInstance(Consumer, 'ignored')
    expect(stubbed.prefix).toBe('stubbed')

    const child = disposables.add(testDi.createChild(new ServiceCollection()))
    expect(child).toBeInstanceOf(TestInstantiationService)
    expect(child.createInstance(Consumer, 'x').prefix).toBe('stubbed')

    const ISampleSingleton = createDecorator<{ readonly _serviceBrand: undefined }>(
      'test.singleton',
    )
    class SampleSingleton {
      declare readonly _serviceBrand: undefined
    }
    registerSingleton(ISampleSingleton, SampleSingleton, InstantiationType.Delayed)
    expect(getSingletonServiceDescriptors().some(([id]) => id === ISampleSingleton)).toBe(true)

    expect(createDecorator<IAlpha>('test.alpha')).toBe(IAlpha)
    expect(() => (IAlpha as unknown as () => void)()).toThrow()

    class DescriptorConsumer {
      constructor(@IAlpha readonly alpha: IAlpha) {}
    }

    const optCollection = new ServiceCollection([IAlpha, new SyncDescriptor(AlphaImpl)])
    const visitedIds: string[] = []
    for (const [id] of optCollection.entries()) {
      visitedIds.push(id.toString())
    }
    expect(visitedIds).toEqual(['test.alpha'])

    const optDi = disposables.add(new InstantiationService(optCollection, true))
    const optInst = optDi.createInstance(new SyncDescriptor(DescriptorConsumer))
    expect(optInst.alpha.name).toBe('alpha')

    optDi.dispose()
    expect(() => optDi.invokeFunction((accessor) => accessor.get(IAlpha))).toThrow()
  })
})
