/**
 * Renders the draggable desktop title bar and workspace controls.
 */

import { Button, Tooltip } from 'antd'
import { PanelLeftClose, PanelRightClose, PanelTopClose, PanelTopOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import logoUrl from '../../../../../build/icon.svg'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import type { AppSettingsPatch } from '@shared/types'
import { setCompactMode, setPage, setSessionsSidebarOpen } from '@renderer/store/appSlice'
import AppNavigationActions from './AppNavigationActions'
import WindowControls from './WindowControls'
import styles from './Titlebar.module.scss'

interface TitlebarProps {
  onSettingsChange: (patch: AppSettingsPatch) => Promise<void>
}

/** Places primary navigation and the session-sidebar control in the desktop title bar. */
const Titlebar = ({ onSettingsChange }: TitlebarProps): React.JSX.Element => {
  const dispatch = useAppDispatch()
  const page = useAppSelector((state) => state.app.page)
  const sidebarOpen = useAppSelector((state) => state.app.sessionsSidebarOpen)
  const compactMode = useAppSelector((state) => state.app.compactMode)
  const navbarPosition = useAppSelector((state) => state.app.settings.navbarPosition)
  const platform = useAppSelector((state) => state.app.platform)
  const { t } = useTranslation()

  return (
    <header
      className={`${styles.container} ${platform === 'darwin' ? styles.nativeWindowControls : ''} drag-region`}
    >
      <div className={`${styles.topActions} no-drag`}>
        <Tooltip placement="bottom" title={t('app.name')}>
          <Button
            className={styles.titleButton ?? ''}
            type="text"
            aria-label={t('app.name')}
            icon={<img className={styles.titleLogo} src={logoUrl} alt="" />}
            onClick={() => dispatch(setPage('home'))}
          />
        </Tooltip>
        {page === 'home' && (
          <>
            <Tooltip
              placement="bottom"
              title={t(sidebarOpen ? 'sidebar.hideSidebar' : 'sidebar.showSidebar')}
            >
              <Button
                className={styles.titleButton ?? ''}
                type="text"
                aria-label={t(sidebarOpen ? 'sidebar.hideSidebar' : 'sidebar.showSidebar')}
                disabled={compactMode}
                icon={sidebarOpen ? <PanelLeftClose size={18} /> : <PanelRightClose size={18} />}
                onClick={() => dispatch(setSessionsSidebarOpen(!sidebarOpen))}
              />
            </Tooltip>
            <Tooltip
              placement="bottom"
              title={t(compactMode ? 'workspace.fullView' : 'workspace.compactView')}
            >
              <Button
                className={styles.titleButton ?? ''}
                type="text"
                aria-label={t(compactMode ? 'workspace.fullView' : 'workspace.compactView')}
                icon={compactMode ? <PanelTopOpen size={18} /> : <PanelTopClose size={18} />}
                onClick={() => dispatch(setCompactMode(!compactMode))}
              />
            </Tooltip>
          </>
        )}
      </div>
      <div className={styles.rightActions}>
        {navbarPosition === 'top' && !compactMode && (
          <AppNavigationActions placement="top" onSettingsChange={onSettingsChange} />
        )}
        <WindowControls />
      </div>
    </header>
  )
}

export default Titlebar
