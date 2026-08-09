/**
 * Renders the left-side global action rail.
 */

import type { AppSettingsPatch } from '@shared/types'
import AppNavigationActions from './AppNavigationActions'
import styles from './AppSidebar.module.scss'

interface AppSidebarProps {
  onSettingsChange: (patch: AppSettingsPatch) => Promise<void>
}

/** Displays theme, pinning, and settings actions in the left navbar. */
const AppSidebar = ({ onSettingsChange }: AppSidebarProps): React.JSX.Element => {
  return (
    <aside className={`${styles.container} no-drag`}>
      <AppNavigationActions placement="left" onSettingsChange={onSettingsChange} />
    </aside>
  )
}

export default AppSidebar
