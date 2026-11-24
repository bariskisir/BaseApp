import { Barrier } from '@app/base/common/async'
import { onUnexpectedError } from '@app/base/common/errors'
import { Disposable, isDisposable } from '@app/base/common/lifecycle'
import {
  type BrandedService,
  type IConstructorSignature,
  IInstantiationService,
  type ServiceIdentifier,
  type ServicesAccessor,
  _util,
} from '@app/platform/instantiation/common/instantiation'
import { ILogService } from '@app/platform/log/common/log'
import { Registry } from '@app/platform/registry/common/platform'

export enum WorkbenchPhase {
  BlockStartup = 1,
  BlockRestore = 2,
  AfterRestored = 3,
  Eventually = 4,
}

export interface IWorkbenchContribution {
  dispose?(): void
}

export const WorkbenchExtensions = {
  Workbench: 'baseapp.workbench.contributions',
} as const

export type WorkbenchContributionCtor<Services extends BrandedService[] = BrandedService[]> =
  | IConstructorSignature<IWorkbenchContribution>
  | (new (...services: Services) => IWorkbenchContribution)

export interface IWorkbenchContributionsRegistry {
  registerWorkbenchContribution<Services extends BrandedService[]>(
    id: string,
    ctor: WorkbenchContributionCtor<Services>,
    phase: WorkbenchPhase,
  ): void
  start(accessor: ServicesAccessor): void
  readonly whenRestored: Promise<void>
}

interface RegisteredContribution {
  readonly id: string
  readonly ctor: new (...args: never[]) => IWorkbenchContribution
  readonly phase: WorkbenchPhase
}

interface LifecyclePhaseProvider {
  readonly phase: WorkbenchPhase
  when(phase: WorkbenchPhase): Promise<void>
}

const ORDERED_PHASES: readonly WorkbenchPhase[] = [
  WorkbenchPhase.BlockStartup,
  WorkbenchPhase.BlockRestore,
  WorkbenchPhase.AfterRestored,
  WorkbenchPhase.Eventually,
]

function tryGetService<T>(accessor: ServicesAccessor, id: ServiceIdentifier<T>): T | undefined {
  try {
    return accessor.get(id)
  } catch {
    return undefined
  }
}

export class WorkbenchContributionsRegistry
  extends Disposable
  implements IWorkbenchContributionsRegistry
{
  private readonly contributionsByPhase = new Map<WorkbenchPhase, RegisteredContribution[]>()
  private readonly registeredIds = new Set<string>()
  private readonly instantiatedIds = new Set<string>()
  private restoredBarrier = new Barrier()
  private instantiationService: IInstantiationService | undefined
  private logService: ILogService | undefined
  private lifecycleService: LifecyclePhaseProvider | undefined
  private started = false

  get whenRestored(): Promise<void> {
    return this.restoredBarrier.wait().then(() => undefined)
  }

  registerWorkbenchContribution<Services extends BrandedService[]>(
    id: string,
    ctor: WorkbenchContributionCtor<Services>,
    phase: WorkbenchPhase,
  ): void {
    const normalizedId = id.trim()
    if (normalizedId.length === 0) {
      throw new Error('Workbench contribution id must be a non-empty string')
    }
    if (this.registeredIds.has(normalizedId)) {
      return
    }
    this.registeredIds.add(normalizedId)

    const entry: RegisteredContribution = {
      id: normalizedId,
      ctor: ctor as new (...args: never[]) => IWorkbenchContribution,
      phase,
    }

    let bucket = this.contributionsByPhase.get(phase)
    if (!bucket) {
      bucket = []
      this.contributionsByPhase.set(phase, bucket)
    }
    bucket.push(entry)

    if (this.started && this.instantiationService) {
      if (!this.lifecycleService || this.lifecycleService.phase >= phase) {
        this.instantiateContribution(entry)
      }
    }
  }

  start(accessor: ServicesAccessor): void {
    if (this.started || this.isDisposed) {
      return
    }
    this.started = true
    this.instantiationService = accessor.get(IInstantiationService)
    this.logService = tryGetService(accessor, ILogService)

    const lifecycleId = _util.serviceIds.get('workbenchLifecycleService') as
      ServiceIdentifier<LifecyclePhaseProvider> | undefined
    this.lifecycleService = lifecycleId ? tryGetService(accessor, lifecycleId) : undefined

    if (!this.lifecycleService) {
      for (const phase of ORDERED_PHASES) {
        this.runPhase(phase)
      }
      return
    }

    const lifecycle = this.lifecycleService
    for (const phase of ORDERED_PHASES) {
      if (lifecycle.phase >= phase) {
        this.runPhase(phase)
      } else {
        void lifecycle.when(phase).then(() => {
          if (!this.isDisposed && this.started) {
            this.runPhase(phase)
          }
        })
      }
    }
  }

  clearForTest(): void {
    this._store.clear()
    this.contributionsByPhase.clear()
    this.registeredIds.clear()
    this.instantiatedIds.clear()
    this.restoredBarrier = new Barrier()
    this.instantiationService = undefined
    this.logService = undefined
    this.lifecycleService = undefined
    this.started = false
  }

  private runPhase(phase: WorkbenchPhase): void {
    this.instantiateByPhase(phase)
    if (phase === WorkbenchPhase.AfterRestored) {
      this.restoredBarrier.open()
    }
  }

  private instantiateByPhase(phase: WorkbenchPhase): void {
    const entries = this.contributionsByPhase.get(phase)
    if (!entries) {
      return
    }
    for (const entry of [...entries]) {
      this.instantiateContribution(entry)
    }
  }

  private instantiateContribution(entry: RegisteredContribution): void {
    if (this.isDisposed || !this.instantiationService || this.instantiatedIds.has(entry.id)) {
      return
    }
    this.instantiatedIds.add(entry.id)
    try {
      const instance = this.instantiationService.createInstance(entry.ctor)
      if (isDisposable(instance)) {
        this._register(instance)
      }
    } catch (error) {
      this.logService?.error(
        'WorkbenchContributions',
        `Failed to instantiate workbench contribution "${entry.id}".`,
        error,
      )
      onUnexpectedError(error)
    }
  }
}

const workbenchContributionsRegistry = new WorkbenchContributionsRegistry()
Registry.add(WorkbenchExtensions.Workbench, workbenchContributionsRegistry)

export function getWorkbenchContributionsRegistry(): IWorkbenchContributionsRegistry {
  return Registry.knows(WorkbenchExtensions.Workbench)
    ? Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
    : workbenchContributionsRegistry
}

export function registerWorkbenchContribution<Services extends BrandedService[]>(
  id: string,
  ctor: WorkbenchContributionCtor<Services>,
  phase: WorkbenchPhase,
): void {
  getWorkbenchContributionsRegistry().registerWorkbenchContribution(id, ctor, phase)
}
