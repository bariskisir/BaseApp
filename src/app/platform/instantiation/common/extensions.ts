import { type DescriptorConstructor, SyncDescriptor } from './descriptors'
import type { BrandedService, ServiceIdentifier } from './instantiation'

const registry: [ServiceIdentifier<unknown>, SyncDescriptor<unknown>][] = []

export enum InstantiationType {
  Eager = 0,
  Delayed = 1,
}

export function registerSingleton<T, Services extends BrandedService[]>(
  id: ServiceIdentifier<T>,
  ctor: new (...services: Services) => T,
  supportsDelayedInstantiation: InstantiationType,
): void
export function registerSingleton<T>(id: ServiceIdentifier<T>, descriptor: SyncDescriptor<T>): void
export function registerSingleton<T, Services extends BrandedService[]>(
  id: ServiceIdentifier<T>,
  ctorOrDescriptor: (new (...services: Services) => T) | SyncDescriptor<T>,
  supportsDelayedInstantiation?: boolean | InstantiationType,
): void {
  const descriptor =
    ctorOrDescriptor instanceof SyncDescriptor
      ? ctorOrDescriptor
      : new SyncDescriptor<T>(
          ctorOrDescriptor as unknown as DescriptorConstructor<T>,
          [],
          Boolean(supportsDelayedInstantiation),
        )

  registry.push([id, descriptor])
}

export function getSingletonServiceDescriptors(): readonly [
  ServiceIdentifier<unknown>,
  SyncDescriptor<unknown>,
][] {
  return registry
}
