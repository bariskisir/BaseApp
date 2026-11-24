import { isObject, isString } from '../../../base/common/types'

export interface IRegistry {
  add(id: string, data: object): void
  knows(id: string): boolean
  as<T>(id: string): T
  clearForTest(): void
}

class RegistryImpl implements IRegistry {
  private readonly data = new Map<string, object>()

  add(id: string, data: object): void {
    if (!isString(id) || id.length === 0) {
      throw new Error('Registry id must be a non-empty string')
    }
    if (!isObject(data)) {
      throw new Error('Registry contribution data must be an object')
    }
    if (this.data.has(id)) {
      throw new Error(`There is already an extension registered with id '${id}'`)
    }
    this.data.set(id, data)
  }

  knows(id: string): boolean {
    return this.data.has(id)
  }

  as<T>(id: string): T {
    return (this.data.get(id) ?? null) as T
  }

  clearForTest(): void {
    this.data.clear()
  }
}

export const Registry: IRegistry = new RegistryImpl()
