import type { SyncDescriptor } from './descriptors'
import type { ServiceIdentifier } from './instantiation'

export class ServiceCollection {
  private readonly _entries = new Map<ServiceIdentifier<unknown>, unknown>()

  constructor(...entries: [ServiceIdentifier<unknown>, unknown][]) {
    for (const [id, service] of entries) {
      this.set(id, service)
    }
  }

  set<T>(
    id: ServiceIdentifier<T>,
    instanceOrDescriptor: T | SyncDescriptor<T>,
  ): T | SyncDescriptor<T> | undefined {
    const previous = this._entries.get(id) as T | SyncDescriptor<T> | undefined
    this._entries.set(id, instanceOrDescriptor)
    return previous
  }

  has(id: ServiceIdentifier<unknown>): boolean {
    return this._entries.has(id)
  }

  get<T>(id: ServiceIdentifier<T>): T | SyncDescriptor<T> | undefined {
    return this._entries.get(id) as T | SyncDescriptor<T> | undefined
  }

  entries(): IterableIterator<[ServiceIdentifier<unknown>, unknown]> {
    return this._entries.entries()
  }

  clone(): ServiceCollection {
    return new ServiceCollection(...this._entries)
  }
}
