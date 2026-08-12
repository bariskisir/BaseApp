/**
 * Renders the reusable settings shell and delegates each category to an isolated section.
 */

import { Activity, Info, Monitor, RefreshCw, ScrollText, Settings2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { setSettingsSection, type SettingsSection } from '@renderer/store/appSlice'
import { cx } from '@renderer/utils/classNames'
import AboutSettingsSection from './sections/AboutSettingsSection'
import GeneralSettingsSection from './sections/GeneralSettingsSection'
import DisplaySettingsSection from './sections/DisplaySettingsSection'
import LoggingSettingsSection from './sections/LoggingSettingsSection'
import TelemetrySettingsSection from './sections/TelemetrySettingsSection'
import UpdatesSettingsSection from './sections/UpdatesSettingsSection'
import styles from './SettingsPage.module.scss'

/** Component rendered for each settings category. */
const SECTION_COMPONENTS: Record<SettingsSection, () => React.JSX.Element> = {
  general: GeneralSettingsSection,
  display: DisplaySettingsSection,
  updates: UpdatesSettingsSection,
  telemetry: TelemetrySettingsSection,
  logging: LoggingSettingsSection,
  about: AboutSettingsSection,
}

/** Renders category navigation and the selected settings section. */
const SettingsPage = (): React.JSX.Element => {
  const dispatch = useAppDispatch()
  const section = useAppSelector((state) => state.app.settingsSection)
  const { t } = useTranslation()
  const menu: Array<{ key: SettingsSection; label: string; icon: React.JSX.Element }> = [
    { key: 'general', label: t('settings.general'), icon: <Settings2 size={17} /> },
    { key: 'display', label: t('settings.display'), icon: <Monitor size={17} /> },
    { key: 'updates', label: t('settings.updates'), icon: <RefreshCw size={17} /> },
    { key: 'telemetry', label: t('settings.telemetry'), icon: <Activity size={17} /> },
    { key: 'logging', label: t('settings.logging'), icon: <ScrollText size={17} /> },
    { key: 'about', label: t('settings.about'), icon: <Info size={17} /> },
  ]
  const ActiveSection = SECTION_COMPONENTS[section]

  return (
    <main className={styles.shell}>
      <aside className={styles.menu}>
        <div className={styles.menuTitle}>{t('settings.title')}</div>
        {menu.map((item) => (
          <button
            type="button"
            className={cx(styles.menuItem, section === item.key && styles.active)}
            key={item.key}
            onClick={() => dispatch(setSettingsSection(item.key))}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </aside>
      <ActiveSection />
    </main>
  )
}

export default SettingsPage
