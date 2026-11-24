import {
  type DisposableStore,
  type IDisposable,
  isDisposable,
  toDisposable,
} from '@app/base/common/lifecycle'
import { SyncDescriptor } from '@app/platform/instantiation/common/descriptors'
import type {
  GetLeadingNonServiceArgs,
  ServiceIdentifier,
  ServicesAccessor,
} from '@app/platform/instantiation/common/instantiation'
import { InstantiationService } from '@app/platform/instantiation/common/instantiationService'
import { ServiceCollection } from '@app/platform/instantiation/common/serviceCollection'

export class TestInstantiationService
  extends InstantiationService
  implements IDisposable, ServicesAccessor
{
  private readonly classStubs = new Map<unknown, unknown>()
  private readonly parentTestService: TestInstantiationService | undefined

  constructor(
    private readonly testServices: ServiceCollection = new ServiceCollection(),
    strict = false,
    parent?: InstantiationService,
  ) {
    super(testServices, strict, parent)
    if (parent instanceof TestInstantiationService) {
      this.parentTestService = parent
    }
  }

  get<T>(service: ServiceIdentifier<T>): T {
    return this.invokeFunction((accessor) => accessor.get(service))
  }

  set<T>(service: ServiceIdentifier<T>, instance: T): T {
    this.testServices.set(service, instance)
    return instance
  }

  stub<T>(service: ServiceIdentifier<T>, partial: Partial<T>): T {
    const existing = this.testServices.get(service)
    const target =
      existing && !(existing instanceof SyncDescriptor)
        ? Object.assign(existing as object, partial)
        : ({ ...partial } as T)
    this.testServices.set(service, target as T)
    return target as T
  }

  stubInstance<T>(ctor: new (...args: never[]) => T, instance: Partial<T>): void {
    this.classStubs.set(ctor, instance)
  }

  private getClassStub(ctor: unknown): unknown {
    return this.classStubs.get(ctor) ?? this.parentTestService?.getClassStub(ctor)
  }

  override createInstance<T>(descriptor: SyncDescriptor<T>): T
  override createInstance<
    Ctor extends new (...args: never[]) => unknown,
    R extends InstanceType<Ctor>,
  >(ctor: Ctor, ...args: GetLeadingNonServiceArgs<ConstructorParameters<Ctor>>): R
  override createInstance(ctorOrDescriptor: unknown, ...rest: unknown[]): unknown {
    const stub = this.getClassStub(ctorOrDescriptor)
    if (stub !== undefined) {
      return stub
    }
    const baseCreateInstance = super.createInstance as (
      ctor: unknown,
      ...args: unknown[]
    ) => unknown
    return baseCreateInstance.call(this, ctorOrDescriptor, ...rest)
  }

  override createChild(services: ServiceCollection): TestInstantiationService {
    return new TestInstantiationService(services, false, this)
  }
}

export type ServiceIdCtorPair<T = unknown> = readonly [
  id: ServiceIdentifier<T>,
  ctorOrInstance: T | (new (...args: never[]) => T),
]

export function createServices(
  disposables: Pick<DisposableStore, 'add'>,
  services: readonly ServiceIdCtorPair[],
): TestInstantiationService {
  const serviceCollection = new ServiceCollection()
  const serviceIds: ServiceIdentifier<unknown>[] = []

  for (const [id, ctorOrInstance] of services) {
    if (!serviceCollection.has(id)) {
      if (typeof ctorOrInstance === 'function') {
        serviceCollection.set(
          id,
          new SyncDescriptor(ctorOrInstance as new (...args: never[]) => unknown),
        )
      } else {
        serviceCollection.set(id, ctorOrInstance)
      }
    }
    serviceIds.push(id)
  }

  const instantiationService = disposables.add(
    new TestInstantiationService(serviceCollection, true),
  )
  disposables.add(
    toDisposable(() => {
      for (const id of serviceIds) {
        const entry = serviceCollection.get(id)
        if (isDisposable(entry)) {
          entry.dispose()
        }
      }
    }),
  )
  return instantiationService
}
