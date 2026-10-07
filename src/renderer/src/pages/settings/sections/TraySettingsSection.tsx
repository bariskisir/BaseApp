/**
 * Renders system-tray icon and tray-dependent startup preferences.
 */

import { Select, Switch, Tooltip } from 'antd'
import { useTranslation } from 'react-i18next'
import type { TrayIconPreset } from '@shared/types'
import { useSettingsActions } from '@renderer/hooks/useSettingsActions'
import { useAppSelector } from '@renderer/store'
import SettingRow from '../components/SettingRow'
import styles from '../SettingsPage.module.scss'

/** Displays system-tray and startup minimization controls. */
const TraySettingsSection = (): React.JSX.Element => {
  const settings = useAppSelector((state) => state.app.settings)
  const platform = useAppSelector((state) => state.app.platform)
  const settingsActions = useSettingsActions()
  const { t } = useTranslation()
  const trayUnavailable = platform === 'linux'

  /** Keeps tray-dependent options disabled whenever their required tray icon is removed. */
  const changeTrayIcon = (showTrayIcon: boolean): void => {
    void settingsActions.saveSettings({
      showTrayIcon,
      ...(showTrayIcon ? {} : { minimizeToTrayOnClose: false, startMinimized: false }),
    })
  }

  /** Enables the required tray icon when a tray-dependent option is selected. */
  const changeMinimizeToTray = (minimizeToTrayOnClose: boolean): void => {
    void settingsActions.saveSettings({
      minimizeToTrayOnClose,
      ...(minimizeToTrayOnClose ? { showTrayIcon: true } : {}),
    })
  }

  /** Enables the required tray icon when minimized startup is selected. */
  const changeStartMinimized = (startMinimized: boolean): void => {
    void settingsActions.saveSettings({
      startMinimized,
      ...(startMinimized ? { showTrayIcon: true } : {}),
    })
  }

  /** Hides the taskbar entry independently of the tray icon. */
  const changeShowTaskbar = (showTaskbar: boolean): void => {
    void settingsActions.saveSettings({ showTaskbar })
  }

  return (
    <div className={styles.settingContainer}>
      <h2 className={styles.groupTitle}>{t('settings.traySettings')}</h2>
      <section className={styles.settingGroup}>
        <SettingRow
          title={t('settings.showTrayIcon')}
          description={t('settings.showTrayIconDescription')}
        >
          <Tooltip title={trayUnavailable ? t('settings.trayUnavailable') : undefined}>
            <Switch
              checked={settings.showTrayIcon}
              disabled={trayUnavailable}
              onChange={changeTrayIcon}
            />
          </Tooltip>
        </SettingRow>
        <SettingRow title={t('settings.trayIcon')} description={t('settings.trayIconDescription')}>
          <Select
            value={settings.trayIcon}
            disabled={trayUnavailable || !settings.showTrayIcon}
            style={{ width: 180 }}
            options={[
              { value: 'default', label: t('settings.trayIconDefault') },
              { value: 'bluetooth', label: t('settings.trayIconBluetooth') },
              { value: 'weather', label: t('settings.trayIconWeather') },
            ]}
            onChange={(trayIcon) =>
              void settingsActions.saveSettings({ trayIcon: trayIcon as TrayIconPreset })
            }
          />
        </SettingRow>
        <SettingRow
          title={t('settings.minimizeToTrayOnClose')}
          description={t('settings.minimizeToTrayOnCloseDescription')}
        >
          <Tooltip title={trayUnavailable ? t('settings.trayUnavailable') : undefined}>
            <Switch
              checked={settings.minimizeToTrayOnClose}
              disabled={trayUnavailable}
              onChange={changeMinimizeToTray}
            />
          </Tooltip>
        </SettingRow>
        <SettingRow
          title={t('settings.startMinimized')}
          description={t('settings.startMinimizedDescription')}
        >
          <Tooltip title={trayUnavailable ? t('settings.trayUnavailable') : undefined}>
            <Switch
              checked={settings.startMinimized}
              disabled={trayUnavailable}
              onChange={changeStartMinimized}
            />
          </Tooltip>
        </SettingRow>
        <SettingRow
          title={t('settings.showTaskbar')}
          description={t('settings.showTaskbarDescription')}
        >
          <Tooltip title={trayUnavailable ? t('settings.trayUnavailable') : undefined}>
            <Switch
              checked={settings.showTaskbar}
              disabled={trayUnavailable}
              onChange={changeShowTaskbar}
            />
          </Tooltip>
        </SettingRow>
      </section>
    </div>
  )
}

export default TraySettingsSection
