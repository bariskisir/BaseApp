export type DescriptorConstructor<T> = new (...args: never) => T

export class SyncDescriptor<T> {
  readonly ctor: DescriptorConstructor<T>
  readonly staticArguments: unknown[]
  readonly supportsDelayedInstantiation: boolean

  constructor(
    ctor: DescriptorConstructor<T>,
    staticArguments: unknown[] = [],
    supportsDelayedInstantiation = false,
  ) {
    this.ctor = ctor
    this.staticArguments = staticArguments
    this.supportsDelayedInstantiation = supportsDelayedInstantiation
  }
}

export interface SyncDescriptor0<T> {
  readonly ctor: new () => T
}
