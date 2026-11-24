import { Disposable, toDisposable } from '@app/base/common/lifecycle'
import { ServiceCollection } from '@app/platform/instantiation/common/serviceCollection'
import { INativeHostService } from '@app/platform/native/common/native'
import {
  NATIVE_HOST_CHANNEL_NAME,
  NativeHostChannelClient,
} from '@app/platform/native/common/nativeIpc'
import {
  DEFAULT_PRODUCT_INFO,
  IProductService,
  ProductService,
} from '@app/platform/product/common/productService'
import { Workbench } from '@app/workbench/browser/workbench'
import {
  IMainProcessService,
  MainProcessService,
} from '@app/workbench/services/ipc/electron-browser/mainProcessService'

export class DesktopMain extends Disposable {
  constructor(private readonly container: HTMLElement) {
    super()
  }

  async open(): Promise<void> {
    const mainProcessService = this._register(new MainProcessService())
    const nativeHostService = new NativeHostChannelClient(
      mainProcessService.getChannel(NATIVE_HOST_CHANNEL_NAME),
    )

    const version = await nativeHostService.getVersion().catch(() => DEFAULT_PRODUCT_INFO.version)
    const productService = new ProductService(version)

    const serviceCollection = new ServiceCollection()
    serviceCollection.set(IMainProcessService, mainProcessService)
    serviceCollection.set(INativeHostService, nativeHostService)
    serviceCollection.set(IProductService, productService)

    if (typeof window !== 'undefined') {
      const handleBeforeUnload = (): void => {
        this.dispose()
      }
      window.addEventListener('beforeunload', handleBeforeUnload)
      this._register(
        toDisposable(() => {
          window.removeEventListener('beforeunload', handleBeforeUnload)
        }),
      )
    }

    const workbench = this._register(new Workbench(this.container, serviceCollection))
    await workbench.startup()
  }
}
