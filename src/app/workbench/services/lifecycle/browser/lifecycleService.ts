import { Barrier } from '@app/base/common/async'
import { Emitter, type Event } from '@app/base/common/event'
import { Disposable } from '@app/base/common/lifecycle'
import { InstantiationType, registerSingleton } from '@app/platform/instantiation/common/extensions'
import { createDecorator } from '@app/platform/instantiation/common/instantiation'
import { WorkbenchPhase } from '@app/workbench/common/contributions'

export interface IWorkbenchLifecycleService {
  readonly _serviceBrand: undefined
  readonly phase: WorkbenchPhase
  readonly onDidChangePhase: Event<WorkbenchPhase>
  setPhase(phase: WorkbenchPhase): void
  when(phase: WorkbenchPhase): Promise<void>
}

export const IWorkbenchLifecycleService = createDecorator<IWorkbenchLifecycleService>(
  'workbenchLifecycleService',
)

export class WorkbenchLifecycleService extends Disposable implements IWorkbenchLifecycleService {
  declare readonly _serviceBrand: undefined

  private readonly _onDidChangePhase = this._register(new Emitter<WorkbenchPhase>())
  readonly onDidChangePhase: Event<WorkbenchPhase> = this._onDidChangePhase.event

  private _phase: WorkbenchPhase = WorkbenchPhase.BlockStartup
  private readonly phaseBarriers = new Map<WorkbenchPhase, Barrier>()

  get phase(): WorkbenchPhase {
    return this._phase
  }

  setPhase(phase: WorkbenchPhase): void {
    if (phase < this._phase) {
      throw new Error('Workbench lifecycle phase cannot go backwards')
    }
    if (phase === this._phase) {
      return
    }
    this._phase = phase
    for (const [targetPhase, barrier] of this.phaseBarriers) {
      if (targetPhase <= this._phase) {
        barrier.open()
      }
    }
    this._onDidChangePhase.fire(this._phase)
  }

  async when(phase: WorkbenchPhase): Promise<void> {
    if (phase <= this._phase) {
      return
    }
    let barrier = this.phaseBarriers.get(phase)
    if (!barrier) {
      barrier = new Barrier()
      this.phaseBarriers.set(phase, barrier)
    }
    await barrier.wait()
  }
}

registerSingleton(IWorkbenchLifecycleService, WorkbenchLifecycleService, InstantiationType.Eager)
