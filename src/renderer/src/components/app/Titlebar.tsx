/**
 * Renders the draggable desktop title bar and workspace controls.
 */

import { useEffect, useState } from 'react'
import { Button, Slider, Tooltip } from 'antd'
import { PanelLeftClose, PanelRightClose, PanelTopClose, PanelTopOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import logoUrl from '../../../../../build/icon.svg'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { useSettingsActions } from '@renderer/hooks/useSettingsActions'
import { setCompactMode, setPage, setSessionsSidebarOpen } from '@renderer/store/appSlice'
import { WINDOW_OPACITY_LIMITS } from '@shared/types'
import { cx } from '@renderer/utils/classNames'
import AppNavigationActions from './AppNavigationActions'
import WindowControls from './WindowControls'
import styles from './Titlebar.module.scss'

interface TitlebarActionProps {
  label: string
  icon: React.ReactNode
  disabled?: boolean
  onClick: () => void
}

/** Renders one labelled title-bar action with consistent tooltip placement. */
const TitlebarAction = ({
  label,
  icon,
  disabled = false,
  onClick,
}: TitlebarActionProps): React.JSX.Element => (
  <Tooltip placement="bottom" title={label}>
    <Button
      className={cx(styles.titleButton)}
      type="text"
      aria-label={label}
      disabled={disabled}
      icon={icon}
      onClick={onClick}
    />
  </Tooltip>
)

/** Places primary navigation and the session-sidebar control in the desktop title bar. */
const Titlebar = (): React.JSX.Element => {
  const dispatch = useAppDispatch()
  const page = useAppSelector((state) => state.app.page)
  const sidebarOpen = useAppSelector((state) => state.app.sessionsSidebarOpen)
  const compactMode = useAppSelector((state) => state.app.compactMode)
  const navbarPosition = useAppSelector((state) => state.app.settings.navbarPosition)
  const platform = useAppSelector((state) => state.app.platform)
  const { t } = useTranslation()
  const settingsActions = useSettingsActions()
  const persistedOpacity = useAppSelector((state) => state.app.settings.windowOpacity)
  const [opacityPercent, setOpacityPercent] = useState(() => Math.round(persistedOpacity * 100))

  /** Keeps the slider in sync when opacity is persisted elsewhere. */
  useEffect(() => {
    setOpacityPercent(Math.round(persistedOpacity * 100))
  }, [persistedOpacity])

  /** Previews opacity live while dragging without writing settings on every step. */
  const previewOpacity = (percent: number): void => {
    setOpacityPercent(percent)
    void window.app.setWindowOpacity(percent / 100).catch(() => undefined)
  }

  /** Persists the dragged opacity once the slider is released. */
  const commitOpacity = (percent: number): void => {
    const windowOpacity =
      Math.round(percent / 100 / WINDOW_OPACITY_LIMITS.step) * WINDOW_OPACITY_LIMITS.step
    void settingsActions.saveSettings({ windowOpacity })
  }

  return (
    <header
      className={cx(
        styles.container,
        platform === 'darwin' && styles.nativeWindowControls,
        'drag-region',
      )}
    >
      <div className={cx(styles.topActions, 'no-drag')}>
        <TitlebarAction
          label={t('app.name')}
          icon={<img className={styles.titleLogo} src={logoUrl} alt="" />}
          onClick={() => dispatch(setPage('home'))}
        />
        {page === 'home' && (
          <>
            <TitlebarAction
              label={t(sidebarOpen ? 'sidebar.hideSidebar' : 'sidebar.showSidebar')}
              disabled={compactMode}
              icon={sidebarOpen ? <PanelLeftClose size={18} /> : <PanelRightClose size={18} />}
              onClick={() => dispatch(setSessionsSidebarOpen(!sidebarOpen))}
            />
            <TitlebarAction
              label={t(compactMode ? 'workspace.fullView' : 'workspace.compactView')}
              icon={compactMode ? <PanelTopOpen size={18} /> : <PanelTopClose size={18} />}
              onClick={() => dispatch(setCompactMode(!compactMode))}
            />
            {compactMode && (
              <Tooltip
                placement="bottom"
                title={`${t('settings.windowOpacity')}: ${opacityPercent}%`}
              >
                <Slider
                  className={cx(styles.opacitySlider)}
                  min={Math.round(WINDOW_OPACITY_LIMITS.min * 100)}
                  max={Math.round(WINDOW_OPACITY_LIMITS.max * 100)}
                  step={Math.round(WINDOW_OPACITY_LIMITS.step * 100)}
                  value={opacityPercent}
                  onChange={previewOpacity}
                  onChangeComplete={commitOpacity}
                />
              </Tooltip>
            )}
          </>
        )}
      </div>
      <div className={styles.rightActions}>
        {navbarPosition === 'top' && !compactMode && <AppNavigationActions placement="top" />}
        <WindowControls />
      </div>
    </header>
  )
}

export default Titlebar
