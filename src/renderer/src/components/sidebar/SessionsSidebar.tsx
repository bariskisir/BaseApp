/**
 * Manages generic sessions in the collapsible workspace sidebar.
 */

import { useEffect, useRef, useState } from 'react'
import { Button, Dropdown, Empty, Input, Modal, Tooltip, type MenuProps } from 'antd'
import { FileText, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SessionSummary } from '@shared/types'
import { useTheme } from '@renderer/context/ThemeProvider'
import { useSessionActions } from '@renderer/hooks/useSessionActions'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { setSessionsSidebarWidth } from '@renderer/store/appSlice'
import { formatDate } from '@renderer/utils/formatters'
import { clampSessionsSidebarWidth } from '@renderer/utils/sidebarSizing'
import styles from './SessionsSidebar.module.scss'

const SIDEBAR_WIDTH_KEY = 'sessionsSidebarWidth'

/** Renders resize, create, open, rename, and guarded delete actions for local sessions. */
const SessionsSidebar = (): React.JSX.Element => {
  const sessions = useAppSelector((state) => state.app.sessions)
  const currentSession = useAppSelector((state) => state.app.currentSession)
  const timeFormat = useAppSelector((state) => state.app.settings.timeFormat)
  const sidebarOpen = useAppSelector((state) => state.app.sessionsSidebarOpen)
  const sidebarWidth = useAppSelector((state) => state.app.sessionsSidebarWidth)
  const dispatch = useAppDispatch()
  const actions = useSessionActions()
  const { t } = useTranslation()
  const { theme } = useTheme()
  const light = theme === 'light'
  const [renameTarget, setRenameTarget] = useState<SessionSummary | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)
  const [resizing, setResizing] = useState(false)
  const resizeAbortRef = useRef<AbortController | null>(null)
  const onlyEmptySession =
    sessions.length === 1 &&
    currentSession !== null &&
    sessions[0]?.id === currentSession?.id &&
    Object.keys(currentSession.data).length === 0

  /** Restores the previously dragged sidebar width from renderer-local storage. */
  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY)
    if (stored === null) return
    const parsed = Number(stored)
    if (Number.isFinite(parsed)) {
      dispatch(setSessionsSidebarWidth(clampSessionsSidebarWidth(parsed, window.innerWidth)))
    }
  }, [dispatch])

  /** Persists the selected sidebar width across application restarts. */
  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth))
  }, [sidebarWidth])

  /** Shrinks an oversized sidebar when the application window becomes narrower. */
  useEffect(() => {
    /** Reapplies viewport constraints after native window size changes. */
    const onResize = (): void => {
      const nextWidth = clampSessionsSidebarWidth(sidebarWidth, window.innerWidth)
      if (nextWidth !== sidebarWidth) dispatch(setSessionsSidebarWidth(nextWidth))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [dispatch, sidebarWidth])

  /** Releases active pointer listeners if compact mode removes the sidebar mid-drag. */
  useEffect(
    () => () => {
      resizeAbortRef.current?.abort()
      document.body.classList.remove('sessions-sidebar-resizing')
    },
    [],
  )

  /** Tracks pointer movement until release to resize the session panel. */
  const beginResize = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    resizeAbortRef.current?.abort()
    const controller = new AbortController()
    resizeAbortRef.current = controller
    const startX = event.clientX
    const startWidth = sidebarWidth
    setResizing(true)
    document.body.classList.add('sessions-sidebar-resizing')

    /** Applies the horizontal pointer delta within the safe viewport limits. */
    const onMove = (moveEvent: PointerEvent): void => {
      const nextWidth = startWidth + moveEvent.clientX - startX
      dispatch(setSessionsSidebarWidth(clampSessionsSidebarWidth(nextWidth, window.innerWidth)))
    }

    /** Ends dragging and removes the temporary global resize state. */
    const finishResize = (): void => {
      controller.abort()
      if (resizeAbortRef.current === controller) resizeAbortRef.current = null
      document.body.classList.remove('sessions-sidebar-resizing')
      setResizing(false)
    }

    window.addEventListener('pointermove', onMove, { signal: controller.signal })
    window.addEventListener('pointerup', finishResize, { signal: controller.signal })
    window.addEventListener('pointercancel', finishResize, { signal: controller.signal })
  }

  /** Resolves a generated title from the active interface locale while preserving custom names. */
  const displayTitle = (item: SessionSummary): string =>
    item.isDefaultTitle ? t('sessions.newSession') : item.title

  /** Opens the rename dialog with the selected session's current title. */
  const beginRename = (item: SessionSummary): void => {
    setRenameTarget(item)
    setRenameValue(displayTitle(item))
  }

  /** Persists the edited title and closes the dialog after a successful update. */
  const commitRename = async (): Promise<void> => {
    if (!renameTarget || !renameValue.trim()) return
    setRenaming(true)
    const renamed = await actions.renameSession(renameTarget.id, renameValue.trim())
    setRenaming(false)
    if (renamed) setRenameTarget(null)
  }

  /** Deletes all history when useful content exists and keeps the fresh replacement selected. */
  const deleteAllSessions = async (): Promise<void> => {
    if (deletingAll || onlyEmptySession) return
    setDeletingAll(true)
    try {
      await actions.deleteAllSessions()
    } finally {
      setDeletingAll(false)
    }
  }

  /** Builds the right-click context menu for a single session row. */
  const sessionMenu = (item: SessionSummary): MenuProps => ({
    items: [
      { key: 'rename', icon: <Pencil size={14} />, label: t('common.rename') },
      { type: 'divider' },
      {
        key: 'delete',
        danger: true,
        disabled: onlyEmptySession,
        icon: <Trash2 size={14} />,
        label: t('common.delete'),
      },
    ],
    /** Handles a session context-menu action without opening the underlying row. */
    onClick: ({ key, domEvent }) => {
      domEvent.stopPropagation()
      if (key === 'rename') beginRename(item)
      if (key === 'delete') void actions.deleteSession(item.id)
    },
  })

  return (
    <>
      <aside
        className={`${styles.container} ${sidebarOpen ? '' : styles.collapsed} ${resizing ? styles.resizing : ''}`}
        data-sidebar-width={sidebarWidth}
        aria-hidden={!sidebarOpen}
      >
        {sidebarOpen && (
          <>
            <div className={styles.resizeHandle} aria-hidden="true" onPointerDown={beginResize} />
            <header className={styles.header}>
              <span>{t('nav.sessions')}</span>
              <div className={styles.headerActions}>
                <Tooltip title={t('sessions.deleteAll')}>
                  <Button
                    type="text"
                    danger
                    size="small"
                    aria-label={t('sessions.deleteAll')}
                    icon={<Trash2 size={15} />}
                    disabled={deletingAll || sessions.length === 0 || onlyEmptySession}
                    onClick={() => void deleteAllSessions()}
                  />
                </Tooltip>
                <Tooltip title={t('sessions.newSession')}>
                  <Button
                    type="text"
                    size="small"
                    aria-label={t('sessions.newSession')}
                    icon={<Plus size={15} />}
                    onClick={() => void actions.createSession()}
                  />
                </Tooltip>
              </div>
            </header>

            <div className={styles.scrollArea}>
              {sessions.length === 0 ? (
                <div className={styles.emptyWrap}>
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={t('sessions.emptyTitle')}
                  />
                </div>
              ) : (
                <div className={styles.list}>
                  {sessions.map((item) => (
                    <Dropdown key={item.id} menu={sessionMenu(item)} trigger={['contextMenu']}>
                      <div
                        className={`${styles.item} ${currentSession?.id === item.id ? styles.active : ''}`}
                      >
                        <button
                          type="button"
                          className={styles.openButton}
                          onClick={() => void actions.openSession(item.id)}
                        >
                          <span className={styles.fileIcon}>
                            <FileText size={14} />
                          </span>
                          <span className={styles.itemBody}>
                            <span className={styles.itemTitle}>{displayTitle(item)}</span>
                            <span className={styles.itemMeta}>
                              {formatDate(item.updatedAt, timeFormat)}
                            </span>
                          </span>
                        </button>
                        <Tooltip title={t('common.delete')}>
                          <Button
                            className={styles.deleteButton ?? ''}
                            type="text"
                            danger
                            size="small"
                            aria-label={t('common.delete')}
                            icon={<Trash2 size={13} />}
                            disabled={onlyEmptySession}
                            onClick={() => void actions.deleteSession(item.id)}
                          />
                        </Tooltip>
                      </div>
                    </Dropdown>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </aside>
      <Modal
        title={t('sessions.renameSession')}
        open={renameTarget !== null}
        okText={t('common.rename')}
        cancelText={t('common.cancel')}
        confirmLoading={renaming}
        okButtonProps={{
          disabled: !renameValue.trim(),
          ...(light ? { ghost: true as const } : {}),
        }}
        onOk={() => void commitRename()}
        onCancel={() => setRenameTarget(null)}
        destroyOnHidden
      >
        <Input
          className={styles.renameInput}
          value={renameValue}
          maxLength={200}
          autoFocus
          placeholder={t('sessions.renameSession')}
          onChange={(event) => setRenameValue(event.target.value)}
          onPressEnter={() => void commitRename()}
        />
      </Modal>
    </>
  )
}

export default SessionsSidebar
