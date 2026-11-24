import '@app/base/browser/codicons.scss'
import '@app/workbench/browser/media/workbench.scss'
import '@app/workbench/browser/media/scrollbar.scss'
import '@app/workbench/electron-browser/workbench.desktop.main'

import { DesktopMain } from '@app/workbench/electron-browser/desktop.main'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Renderer root element was not found.')
}

const desktop = new DesktopMain(rootElement)
void desktop.open()
