import { Disposable } from '@app/base/common/lifecycle'

export abstract class Component extends Disposable {
  constructor(readonly id: string) {
    super()
  }
}
