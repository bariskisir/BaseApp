import type { DisposableStore } from '../../../base/common/lifecycle'
import type { SyncDescriptor0 } from './descriptors'
import type { ServiceCollection } from './serviceCollection'

export interface ServiceDependency {
  readonly id: ServiceIdentifier<unknown>
  readonly index: number
}

const DI_TARGET = '$di$target'
const DI_DEPENDENCIES = '$di$dependencies'

interface DiTargetObject {
  [DI_TARGET]?: unknown
  [DI_DEPENDENCIES]?: ServiceDependency[]
}

export const _util = {
  serviceIds: new Map<string, ServiceIdentifier<unknown>>(),
  DI_TARGET,
  DI_DEPENDENCIES,
  getServiceDependencies(ctor: object): ServiceDependency[] {
    return (ctor as DiTargetObject)[DI_DEPENDENCIES] ?? []
  },
}

export type BrandedService = { readonly _serviceBrand: undefined }

export interface IConstructorSignature<T, Args extends unknown[] = []> {
  new <Services extends BrandedService[]>(...args: [...Args, ...Services]): T
}

export interface ServicesAccessor {
  get<T>(id: ServiceIdentifier<T>): T
}

export interface ServiceIdentifier<T> {
  (target: unknown, propertyKey: string | symbol | undefined, parameterIndex: number): void
  readonly type: T
}

export type GetLeadingNonServiceArgs<TArgs extends unknown[]> = TArgs extends []
  ? []
  : TArgs extends [...infer TFirst, BrandedService]
    ? GetLeadingNonServiceArgs<TFirst>
    : TArgs

export interface IInstantiationService {
  readonly _serviceBrand: undefined
  createInstance<T>(descriptor: SyncDescriptor0<T>): T
  createInstance<Ctor extends new (...args: never) => unknown, R extends InstanceType<Ctor>>(
    ctor: Ctor,
    ...args: GetLeadingNonServiceArgs<ConstructorParameters<Ctor>>
  ): R
  invokeFunction<R, TS extends unknown[] = []>(
    fn: (accessor: ServicesAccessor, ...args: TS) => R,
    ...args: TS
  ): R
  createChild(services: ServiceCollection, store?: DisposableStore): IInstantiationService
  dispose(): void
}

function storeServiceDependency(
  id: ServiceIdentifier<unknown>,
  target: object,
  index: number,
): void {
  const diTarget = target as DiTargetObject
  if (diTarget[DI_TARGET] === target && diTarget[DI_DEPENDENCIES]) {
    diTarget[DI_DEPENDENCIES].push({ id, index })
  } else {
    diTarget[DI_DEPENDENCIES] = [{ id, index }]
    diTarget[DI_TARGET] = target
  }
}

export function createDecorator<T>(serviceId: string): ServiceIdentifier<T> {
  const existing = _util.serviceIds.get(serviceId)
  if (existing) {
    return existing as ServiceIdentifier<T>
  }

  const id = ((...args: unknown[]): void => {
    const [target, , parameterIndex] = args
    if (
      args.length !== 3 ||
      (typeof target !== 'function' && typeof target !== 'object') ||
      target === null ||
      typeof parameterIndex !== 'number'
    ) {
      throw new Error('@IServiceName-decorator can only be used to decorate a parameter')
    }
    storeServiceDependency(id, target, parameterIndex)
  }) as ServiceIdentifier<T>

  id.toString = () => serviceId

  _util.serviceIds.set(serviceId, id)
  return id
}

export const IInstantiationService = createDecorator<IInstantiationService>('instantiationService')
