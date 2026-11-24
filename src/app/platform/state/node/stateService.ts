import { RunOnceScheduler } from '@app/base/common/async'
import { onUnexpectedError } from '@app/base/common/errors'
import { Disposable } from '@app/base/common/lifecycle'
import { isObject } from '@app/base/common/types'
import { readJsonFileSync, writeJsonFileSyncAtomic } from '@app/base/node/atomicFile'
import type { IStateService } from '../common/state'

const DEFAULT_SAVE_DELAY_MS = 250

export class StateService extends Disposable implements IStateService {
  declare readonly _serviceBrand: undefined

  private readonly _database: Map<string, unknown>
  private readonly _saveScheduler: RunOnceScheduler
  private _dirty = false

  constructor(
    private readonly filePath: string,
    saveDelayMs: number = DEFAULT_SAVE_DELAY_MS,
  ) {
    super()
    this._database = this.loadDatabase()
    this._saveScheduler = this._register(
      new RunOnceScheduler(() => {
        this.writeToDisk()
      }, saveDelayMs),
    )
  }

  getItem<T>(key: string, defaultValue: T): T
  getItem<T>(key: string): T | undefined
  getItem<T>(key: string, defaultValue?: T): T | undefined {
    const value = this._database.get(key)
    if (value === undefined) {
      return defaultValue
    }
    return value as T
  }

  setItem(key: string, data: unknown): void {
    if (data === undefined) {
      this.removeItem(key)
      return
    }
    if (this._database.has(key) && Object.is(this._database.get(key), data)) {
      return
    }
    this._database.set(key, data)
    this._dirty = true
    this._saveScheduler.schedule()
  }

  removeItem(key: string): void {
    if (!this._database.delete(key)) {
      return
    }
    this._dirty = true
    this._saveScheduler.schedule()
  }

  flush(): void {
    this._saveScheduler.cancel()
    this.writeToDisk()
  }

  override dispose(): void {
    this.flush()
    super.dispose()
  }

  private loadDatabase(): Map<string, unknown> {
    try {
      const raw = readJsonFileSync(this.filePath)
      if (!isObject(raw)) {
        return new Map()
      }
      return new Map(Object.entries(raw))
    } catch {
      return new Map()
    }
  }

  private writeToDisk(): void {
    if (!this._dirty) {
      return
    }
    this._dirty = false
    try {
      writeJsonFileSyncAtomic(this.filePath, Object.fromEntries(this._database))
    } catch (error) {
      onUnexpectedError(error)
    }
  }
}
