import { type DisposableStore, dispose, isDisposable } from '../../../base/common/lifecycle'
import { type DescriptorConstructor, SyncDescriptor, type SyncDescriptor0 } from './descriptors'
import {
  type GetLeadingNonServiceArgs,
  IInstantiationService,
  type ServiceIdentifier,
  type ServicesAccessor,
  _util,
} from './instantiation'
import { ServiceCollection } from './serviceCollection'

export class InstantiationService implements IInstantiationService {
  declare readonly _serviceBrand: undefined

  private _isDisposed = false
  private readonly _services: ServiceCollection
  private readonly _strict: boolean
  private readonly _parent: InstantiationService | undefined
  private readonly _servicesToMaybeDispose = new Set<unknown>()
  private readonly _children = new Set<InstantiationService>()
  private readonly _activeStack: ServiceIdentifier<unknown>[]

  constructor(
    services: ServiceCollection = new ServiceCollection(),
    strict = true,
    parent?: InstantiationService,
  ) {
    this._services = services
    this._strict = strict
    this._parent = parent
    this._activeStack = parent ? parent._activeStack : []
    this._services.set(IInstantiationService, this)
  }

  dispose(): void {
    if (this._isDisposed) {
      return
    }
    this._isDisposed = true

    dispose(this._children)
    this._children.clear()

    for (const candidate of this._servicesToMaybeDispose) {
      if (isDisposable(candidate)) {
        candidate.dispose()
      }
    }
    this._servicesToMaybeDispose.clear()
  }

  createChild(services: ServiceCollection, store?: DisposableStore): IInstantiationService {
    this._throwIfDisposed()

    const parent = this
    const child = new (class extends InstantiationService {
      override dispose(): void {
        parent._children.delete(child)
        super.dispose()
      }
    })(services, this._strict, this)

    this._children.add(child)
    store?.add(child)
    return child
  }

  invokeFunction<R, TS extends unknown[] = []>(
    fn: (accessor: ServicesAccessor, ...args: TS) => R,
    ...args: TS
  ): R {
    this._throwIfDisposed()

    let done = false
    try {
      const accessor: ServicesAccessor = {
        get: <T>(id: ServiceIdentifier<T>): T => {
          if (done) {
            throw new Error(
              'Service accessor is only valid during the invocation of its target method',
            )
          }
          const result = this._getOrCreateServiceInstance(id)
          if (result === undefined) {
            this._throwIfStrict(`[invokeFunction] unknown service '${id.toString()}'`)
          }
          return result as T
        },
      }
      return fn(accessor, ...args)
    } finally {
      done = true
    }
  }

  createInstance<T>(descriptor: SyncDescriptor0<T>): T
  createInstance<Ctor extends new (...args: never) => unknown, R extends InstanceType<Ctor>>(
    ctor: Ctor,
    ...args: GetLeadingNonServiceArgs<ConstructorParameters<Ctor>>
  ): R
  createInstance(
    ctorOrDescriptor:
      DescriptorConstructor<unknown> | SyncDescriptor<unknown> | SyncDescriptor0<unknown>,
    ...rest: unknown[]
  ): unknown {
    this._throwIfDisposed()

    if (ctorOrDescriptor instanceof SyncDescriptor) {
      return this._createInstance(
        ctorOrDescriptor.ctor,
        ctorOrDescriptor.staticArguments.concat(rest),
      )
    }
    if (
      typeof ctorOrDescriptor === 'object' &&
      ctorOrDescriptor !== null &&
      'ctor' in ctorOrDescriptor
    ) {
      return this._createInstance(ctorOrDescriptor.ctor as DescriptorConstructor<unknown>, rest)
    }
    return this._createInstance(ctorOrDescriptor, rest)
  }

  private _throwIfDisposed(): void {
    if (this._isDisposed) {
      throw new Error('InstantiationService has been disposed')
    }
  }

  private _throwIfStrict(message: string): void {
    if (this._strict) {
      throw new Error(message)
    }
  }

  private _createInstance<T>(ctor: DescriptorConstructor<T>, staticArgs: unknown[]): T {
    const serviceDependencies = [..._util.getServiceDependencies(ctor)].sort(
      (first, second) => first.index - second.index,
    )

    const serviceArgs: unknown[] = []
    for (const dependency of serviceDependencies) {
      const service = this._getOrCreateServiceInstance(dependency.id)
      if (service === undefined) {
        this._throwIfStrict(
          `[createInstance] ${ctor.name} depends on unknown service '${dependency.id.toString()}'`,
        )
      }
      serviceArgs.push(service)
    }

    const firstDependency = serviceDependencies[0]
    const firstServiceArgPos = firstDependency ? firstDependency.index : staticArgs.length

    let adjustedArgs = staticArgs
    if (adjustedArgs.length !== firstServiceArgPos) {
      const delta = firstServiceArgPos - adjustedArgs.length
      if (delta > 0) {
        adjustedArgs = adjustedArgs.concat(new Array<unknown>(delta))
      } else {
        adjustedArgs = adjustedArgs.slice(0, firstServiceArgPos)
      }
    }

    return Reflect.construct(ctor, adjustedArgs.concat(serviceArgs)) as T
  }

  private _getOrCreateServiceInstance<T>(id: ServiceIdentifier<T>): T | undefined {
    if (this._services.has(id)) {
      const entry = this._services.get(id)
      if (entry instanceof SyncDescriptor) {
        return this._createAndCacheServiceInstance(id, entry)
      }
      return entry
    }

    if (this._parent) {
      return this._parent._getOrCreateServiceInstance(id)
    }

    return undefined
  }

  private _createAndCacheServiceInstance<T>(
    id: ServiceIdentifier<T>,
    descriptor: SyncDescriptor<T>,
  ): T {
    if (descriptor.supportsDelayedInstantiation) {
      return this._createDelayedServiceProxy(id, descriptor)
    }

    const instance = this._instantiateDescriptor(id, descriptor)
    this._services.set(id, instance)
    this._servicesToMaybeDispose.add(instance)
    return instance
  }

  private _instantiateDescriptor<T>(id: ServiceIdentifier<T>, descriptor: SyncDescriptor<T>): T {
    const existingIndex = this._activeStack.indexOf(id)
    if (existingIndex !== -1) {
      const cycleChain = [...this._activeStack.slice(existingIndex), id]
        .map((serviceId) => serviceId.toString())
        .join(' -> ')
      throw new Error(`Dependency cycle detected: ${cycleChain}`)
    }

    this._activeStack.push(id)
    try {
      return this._createInstance(descriptor.ctor, [...descriptor.staticArguments])
    } finally {
      this._activeStack.pop()
    }
  }

  private _createDelayedServiceProxy<T>(
    id: ServiceIdentifier<T>,
    descriptor: SyncDescriptor<T>,
  ): T {
    let realInstance: T | undefined

    const resolveRealInstance = (): T => {
      if (realInstance !== undefined) {
        return realInstance
      }
      this._throwIfDisposed()
      realInstance = this._instantiateDescriptor(id, descriptor)
      this._servicesToMaybeDispose.add(realInstance)
      return realInstance
    }

    const proxy = new Proxy({} as object, {
      get(_target, propKey: PropertyKey): unknown {
        if (propKey === 'then' || propKey === '_serviceBrand') {
          return undefined
        }
        const instance = resolveRealInstance() as Record<PropertyKey, unknown>
        const value = Reflect.get(instance, propKey, instance)
        if (typeof value === 'function') {
          return value.bind(instance)
        }
        return value
      },
      set(_target, propKey: PropertyKey, value: unknown): boolean {
        const instance = resolveRealInstance() as Record<PropertyKey, unknown>
        return Reflect.set(instance, propKey, value, instance)
      },
    }) as T

    this._services.set(id, proxy)
    return proxy
  }
}
