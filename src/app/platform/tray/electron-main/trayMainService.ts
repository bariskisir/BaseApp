import { join } from 'node:path'
import { Disposable, toDisposable } from '@app/base/common/lifecycle'
import { isTraySupported } from '@app/base/common/platform'
import type { TrayIconPreset } from '@app/platform/configuration/common/configuration'
import { IEnvironmentMainService } from '@app/platform/environment/electron-main/environmentMainService'
import { getLocaleResource } from '@app/platform/localization/common/locales'
import { type AppLocale, DEFAULT_APP_LOCALE } from '@app/platform/localization/common/localization'
import { ILogService } from '@app/platform/log/common/log'
import { IProductService } from '@app/platform/product/common/productService'
import { focusBrowserWindow } from '@app/platform/window/electron-main/windowFocus'
import { IWindowManager } from '@app/platform/window/electron-main/windowManager'
import { Menu, Tray, nativeImage } from 'electron'
import type { ITrayMainService, TrayConfiguration } from '../common/tray'

interface NormalizedTrayConfiguration {
  readonly showTrayIcon: boolean
  readonly minimizeToTrayOnClose: boolean
  readonly trayIcon: TrayIconPreset
  readonly uiLanguage: AppLocale
}

const TRAY_ICON_FILES: Record<TrayIconPreset, string> = {
  default: 'icon.png',
  bluetooth: 'tray-icon-bluetooth.png',
  weather: 'tray-icon-weather.png',
}

export class TrayMainService extends Disposable implements ITrayMainService {
  declare readonly _serviceBrand: undefined

  private tray: Tray | null = null
  private configuration: NormalizedTrayConfiguration
  private activeIconFile: string | null = null
  private activeLocale: AppLocale | null = null
  private quitting = false

  constructor(
    @IWindowManager private readonly windowManager: IWindowManager,
    @IEnvironmentMainService private readonly environmentService: IEnvironmentMainService,
    @ILogService private readonly logService: ILogService,
    @IProductService private readonly productService: IProductService,
  ) {
    super()
    this.configuration = this.normalizeConfiguration({
      showTrayIcon: false,
      minimizeToTrayOnClose: false,
    })
    this._register(toDisposable(() => this.destroyTrayIcon()))
  }

  applyConfiguration(config: TrayConfiguration): void {
    this.configuration = this.normalizeConfiguration(config)
    this.updateTrayIcon()
  }

  shouldMinimizeOnClose(): boolean {
    return !this.quitting && this.configuration.minimizeToTrayOnClose && this.tray !== null
  }

  prepareToQuit(): void {
    this.quitting = true
    this.destroyTrayIcon()
  }

  private normalizeConfiguration(config: TrayConfiguration): NormalizedTrayConfiguration {
    const uiLanguage = config.uiLanguage ?? DEFAULT_APP_LOCALE
    if (!isTraySupported(this.environmentService.platform)) {
      return {
        showTrayIcon: false,
        minimizeToTrayOnClose: false,
        trayIcon: 'default',
        uiLanguage,
      }
    }
    return {
      showTrayIcon: config.showTrayIcon,
      minimizeToTrayOnClose: config.minimizeToTrayOnClose,
      trayIcon: config.trayIcon ?? 'default',
      uiLanguage,
    }
  }

  private updateTrayIcon(): void {
    if (this.quitting || !this.configuration.showTrayIcon) {
      this.destroyTrayIcon()
      return
    }
    const iconFile = TRAY_ICON_FILES[this.configuration.trayIcon] ?? TRAY_ICON_FILES.default
    if (this.tray && this.activeIconFile === iconFile) {
      if (this.activeLocale !== this.configuration.uiLanguage) {
        this.applyContextMenu(this.tray, this.configuration.uiLanguage)
      }
      return
    }
    this.destroyTrayIcon()

    try {
      const iconPath = this.environmentService.isPackaged
        ? join(this.environmentService.resourcesPath, iconFile)
        : join(this.environmentService.appPath, 'build', iconFile)
      const sourceImage = nativeImage.createFromPath(iconPath)
      if (sourceImage.isEmpty()) {
        throw new Error(`Tray icon could not be read from ${iconPath}.`)
      }
      const trayImage =
        this.environmentService.platform === 'win32'
          ? sourceImage
          : sourceImage.resize({ width: 16, height: 16 })
      const tray = new Tray(trayImage)
      tray.setToolTip(this.productService.name)
      this.applyContextMenu(tray, this.configuration.uiLanguage)
      tray.on('click', () => this.showWindow())
      this.tray = tray
      this.activeIconFile = iconFile
    } catch (error) {
      this.logService.error('TrayMainService', 'System tray icon could not be created.', error)
      this.tray = null
    }
  }

  private applyContextMenu(tray: Tray, locale: AppLocale): void {
    const labels = getLocaleResource(locale).trayMenu
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: labels.open,
          click: () => this.showWindow(),
        },
        {
          label: labels.settings,
          click: () => this.showSettings(),
        },
        { label: labels.exit, role: 'quit' },
      ]),
    )
    this.activeLocale = locale
  }

  private showWindow(): void {
    focusBrowserWindow(this.windowManager.getMainWindow())
  }

  private showSettings(): void {
    this.showWindow()
    this.windowManager.requestOpenSettings()
  }

  private destroyTrayIcon(): void {
    this.tray?.destroy()
    this.tray = null
    this.activeIconFile = null
    this.activeLocale = null
  }
}
