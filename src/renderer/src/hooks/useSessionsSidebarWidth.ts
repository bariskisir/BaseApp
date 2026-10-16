/**
 * Keeps the session sidebar width inside safe viewport limits.
 *
 * The chosen width is persisted with the main-process window state instead of
 * renderer-local storage, so this hook only constrains the value in the Redux store.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { setSessionsSidebarWidth } from '@renderer/store/appSlice'
import { clampSessionsSidebarWidth } from '@renderer/utils/sidebarSizing'

const RESIZING_BODY_CLASS = 'sessions-sidebar-resizing'

/** Current width and the pointer handler that drags the sidebar edge. */
interface SessionsSidebarWidth {
  width: number
  resizing: boolean
  beginResize: (event: React.PointerEvent<HTMLElement>) => void
}

/** Constrains the width of the session sidebar to the current viewport. */
export const useSessionsSidebarWidth = (): SessionsSidebarWidth => {
  const dispatch = useAppDispatch()
  const width = useAppSelector((state) => state.app.sessionsSidebarWidth)
  const [resizing, setResizing] = useState(false)
  const resizeAbortRef = useRef<AbortController | null>(null)

  /** Fits a restored oversized sidebar into the window and keeps it fitting after resizes. */
  useEffect(() => {
    /** Reapplies viewport constraints on mount and after native window size changes. */
    const fitWidth = (): void => {
      const nextWidth = clampSessionsSidebarWidth(width, window.innerWidth)
      if (nextWidth !== width) dispatch(setSessionsSidebarWidth(nextWidth))
    }
    fitWidth()
    window.addEventListener('resize', fitWidth)
    return () => window.removeEventListener('resize', fitWidth)
  }, [dispatch, width])

  /** Releases active pointer listeners if the sidebar is removed mid-drag. */
  useEffect(
    () => () => {
      resizeAbortRef.current?.abort()
      document.body.classList.remove(RESIZING_BODY_CLASS)
    },
    [],
  )

  /** Tracks pointer movement until release to resize the session panel. */
  const beginResize = useCallback(
    (event: React.PointerEvent<HTMLElement>): void => {
      if (event.button !== 0) return
      event.preventDefault()
      resizeAbortRef.current?.abort()
      const controller = new AbortController()
      resizeAbortRef.current = controller
      const startX = event.clientX
      const startWidth = width
      setResizing(true)
      document.body.classList.add(RESIZING_BODY_CLASS)

      /** Applies the horizontal pointer delta within the safe viewport limits. */
      const onMove = (moveEvent: PointerEvent): void => {
        const nextWidth = startWidth + moveEvent.clientX - startX
        dispatch(setSessionsSidebarWidth(clampSessionsSidebarWidth(nextWidth, window.innerWidth)))
      }

      /** Ends dragging and removes the temporary global resize state. */
      const finishResize = (): void => {
        controller.abort()
        if (resizeAbortRef.current === controller) resizeAbortRef.current = null
        document.body.classList.remove(RESIZING_BODY_CLASS)
        setResizing(false)
      }

      window.addEventListener('pointermove', onMove, { signal: controller.signal })
      window.addEventListener('pointerup', finishResize, { signal: controller.signal })
      window.addEventListener('pointercancel', finishResize, { signal: controller.signal })
    },
    [dispatch, width],
  )

  return { width, resizing, beginResize }
}
