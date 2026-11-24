import './codicons.scss'
import { clearNode } from './dom'

const SVG_NS = 'http://www.w3.org/2000/svg'

export const CODICON_NAMES = [
  'files',
  'settings-gear',
  'search',
  'add',
  'trash',
  'pin',
  'pinned',
  'edit',
  'close',
  'chrome-minimize',
  'chrome-maximize',
  'chrome-restore',
  'chrome-close',
  'layout-sidebar-left',
  'layout-sidebar-left-off',
  'layout-sidebar-right',
  'layout-sidebar-right-off',
  'layout',
  'screen-full',
  'screen-normal',
  'color-mode',
  'sun',
  'moon',
  'device-desktop',
  'info',
  'warning',
  'error',
  'check',
  'chevron-down',
  'refresh',
  'folder-opened',
  'cloud-download',
  'cloud-upload',
  'discard',
  'link-external',
  'shield',
  'window',
  'panel-bottom',
  'panel-bottom-off',
  'cpu',
  'globe',
  'pass',
  'loading',
  'minus',
  'plus',
  'clear-all',
  'zoom-in',
  'zoom-out',
  'arrow-swap',
] as const

export type CodiconName = (typeof CODICON_NAMES)[number]

interface CodiconPathSpec {
  readonly d: string
  readonly fill?: 'currentColor' | 'none'
  readonly fillRule?: 'evenodd' | 'nonzero'
  readonly stroke?: 'currentColor' | 'none'
  readonly strokeWidth?: number
  readonly strokeLinecap?: 'round' | 'square' | 'butt'
  readonly strokeLinejoin?: 'round' | 'miter' | 'bevel'
}

const CODICON_PATHS: Record<CodiconName, readonly CodiconPathSpec[]> = {
  files: [
    {
      d: 'M13.71 4.29l-3-3L10 1H5L4 2v2H2L1 5v9l1 1h8l1-1v-2h2l1-1V5l-.29-.71zM10 14H2V5h2v6l1 1h5v2zm3-3H5V2h4v3.5l.5.5H13v5zm-3-6V2.41L12.59 5H10z',
      fillRule: 'evenodd',
    },
  ],
  'settings-gear': [
    {
      d: 'M9.1 4.4L8.6 2H7.4l-.5 2.4-.7.3-2-1.3-.9.8 1.3 2-.2.7-2.4.5v1.2l2.4.5.3.8-1.3 2 .8.8 2-1.3.8.3.4 2.3h1.2l.5-2.4.8-.3 2 1.3.8-.8-1.3-2 .3-.8 2.3-.4V7.4l-2.4-.5-.3-.8 1.3-2-.8-.8-2 1.3-.7-.2z',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.15,
      strokeLinejoin: 'round',
    },
    {
      d: 'M8 5.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5z',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.15,
    },
  ],
  search: [
    {
      d: 'M6.5 2.25a4.25 4.25 0 1 0 0 8.5 4.25 4.25 0 0 0 0-8.5z',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.25,
    },
    {
      d: 'M9.6 9.6L14 14',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.3,
      strokeLinecap: 'round',
    },
  ],
  add: [
    {
      d: 'M14 7v1H8v6H7V8H1V7h6V1h1v6h6z',
    },
  ],
  trash: [
    {
      d: 'M10 3h3v1h-1v9l-1 1H4l-1-1V4H2V3h3V2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1zM9 2H6v1h3V2zM4 13h7V4H4v9zm2-8H5v7h1V5zm1 0h1v7H7V5zm2 0h1v7H9V5z',
      fillRule: 'evenodd',
    },
  ],
  pin: [
    {
      d: 'M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.902-1.414.707-.195-.195.512-1.22.707-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72.345.022.68.076 1.013.16l3.134-3.133a2.772 2.772 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146zm.122 2.11a.5.5 0 0 1-.122.51L6.293 6.878a.5.5 0 0 1-.511.12H5.78l-.014-.004a4.507 4.507 0 0 0-.288-.076 4.922 4.922 0 0 0-.765-.116c-.422-.028-.836.008-1.175.15l5.51 5.509c.141-.34.177-.753.149-1.175a4.924 4.924 0 0 0-.192-1.054l-.004-.013v-.001a.5.5 0 0 1 .12-.512l3.536-3.535a.5.5 0 0 1 .532-.115l.096.022c.087.017.208.034.344.034.114 0 .23-.011.343-.04L9.927 2.028c-.029.113-.04.23-.04.343a1.779 1.779 0 0 0 .062.46z',
      fillRule: 'evenodd',
    },
  ],
  pinned: [
    {
      d: 'M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.902-1.414.707-.195-.195.512-1.22.707-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72.345.022.68.076 1.013.16l3.134-3.133a2.772 2.772 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146z',
    },
  ],
  edit: [
    {
      d: 'M13.23 1h-1.46L3.52 9.25l-.16.22L1 13.59 2.41 15l4.12-2.36.22-.16L15 4.23V2.77L13.23 1zM2.41 13.59l1.51-3 1.45 1.45-2.96 1.55zm3.83-2.06L4.47 9.76l8-8 1.77 1.77-8 8z',
      fillRule: 'evenodd',
    },
  ],
  close: [
    {
      d: 'M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z',
      fillRule: 'evenodd',
    },
  ],
  'chrome-minimize': [
    {
      d: 'M14 8v1H3V8h11z',
    },
  ],
  'chrome-maximize': [
    {
      d: 'M3 3v10h10V3H3zm9 9H4V4h8v8z',
      fillRule: 'evenodd',
    },
  ],
  'chrome-restore': [
    {
      d: 'M3 5v9h9V5H3zm8 8H4V6h7v7z',
      fillRule: 'evenodd',
    },
    {
      d: 'M5 5h1V4h7v7h-1v1h2V3H5v2z',
    },
  ],
  'chrome-close': [
    {
      d: 'M7.116 8l-4.558 4.558.884.884L8 8.884l4.558 4.558.884-.884L8.884 8l4.558-4.558-.884-.884L8 7.116 3.442 2.558l-.884.884L7.116 8z',
      fillRule: 'evenodd',
    },
  ],
  'layout-sidebar-left': [
    {
      d: 'M2 1L1 2v12l1 1h12l1-1V2l-1-1H2zm12 13H7V2h7v12z',
      fillRule: 'evenodd',
    },
  ],
  'layout-sidebar-left-off': [
    {
      d: 'M2 1L1 2v12l1 1h12l1-1V2l-1-1H2zm4 13H2V2h4v12zm8 0H7V2h7v12z',
      fillRule: 'evenodd',
    },
  ],
  'layout-sidebar-right': [
    {
      d: 'M2 1L1 2v12l1 1h12l1-1V2l-1-1H2zm7 13H2V2h7v12z',
      fillRule: 'evenodd',
    },
  ],
  'layout-sidebar-right-off': [
    {
      d: 'M2 1L1 2v12l1 1h12l1-1V2l-1-1H2zm7 13H2V2h7v12zm5 0h-4V2h4v12z',
      fillRule: 'evenodd',
    },
  ],
  layout: [
    {
      d: 'M3 2L2 3v10l1 1h4l1-1V3L7 2H3zm0 11V3h4v10H3zm7-11l-1 1v4l1 1h4l1-1V3l-1-1h-4zm0 5V3h4v4h-4zm0 2l-1 1v3l1 1h4l1-1v-3l-1-1h-4zm0 4v-3h4v3h-4z',
      fillRule: 'evenodd',
    },
  ],
  'screen-full': [
    {
      d: 'M2 6V2h4v1H3v3H2zm8-4h4v4h-1V3h-3V2zM2 10h1v3h3v1H2v-4zm11 0h1v4h-4v-1h3v-3z',
    },
  ],
  'screen-normal': [
    {
      d: 'M5 2h1v4H2V5h3V2zm5 0h1v3h3v1h-4V2zM2 10h4v4H5v-3H2v-1zm8 0h4v1h-3v3h-1v-4z',
    },
  ],
  'color-mode': [
    {
      d: 'M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 13V2a6 6 0 1 1 0 12z',
      fillRule: 'evenodd',
    },
  ],
  sun: [
    {
      d: 'M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.2,
    },
    {
      d: 'M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.05 1.05M11.55 11.55l1.05 1.05M12.6 3.4l-1.05 1.05M4.45 11.55L3.4 12.6',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.2,
      strokeLinecap: 'round',
    },
  ],
  moon: [
    {
      d: 'M13.2 10.3A5.5 5.5 0 0 1 5.7 2.8a5.5 5.5 0 1 0 7.5 7.5z',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.2,
      strokeLinejoin: 'round',
    },
  ],
  'device-desktop': [
    {
      d: 'M2 2L1 3v8l1 1h5v1H5v1h6v-1H9v-1h5l1-1V3l-1-1H2zm12 9H2V3h12v8z',
      fillRule: 'evenodd',
    },
  ],
  info: [
    {
      d: 'M8.568 1.031A6.8 6.8 0 0 1 12.76 3.05a7.06 7.06 0 0 1 .46 9.39 6.85 6.85 0 0 1-8.58 1.74 7 7 0 0 1-3.12-3.5 7.12 7.12 0 0 1-.23-4.71 7 7 0 0 1 2.77-3.79 6.8 6.8 0 0 1 4.508-1.149zM9.04 13.88a5.89 5.89 0 0 0 3.41-2.07 6.07 6.07 0 0 0-.4-8.06 5.82 5.82 0 0 0-7.43-.74 6.06 6.06 0 0 0 .5 10.29 5.81 5.81 0 0 0 3.92.58zM7.375 6h1.25V5h-1.25v1zm1.25 1v4h-1.25V7h1.25z',
      fillRule: 'evenodd',
    },
  ],
  warning: [
    {
      d: 'M7.56 1h.88l6.54 12.26-.44.74H1.44L1 13.26 7.56 1zM8 2.28L2.28 13H13.7L8 2.28zM8.625 12v-1h-1.25v1h1.25zm-1.25-2V6h1.25v4h-1.25z',
      fillRule: 'evenodd',
    },
  ],
  error: [
    {
      d: 'M8.6 1c1.6.1 3.1.9 4.2 2 1.3 1.4 2 3.1 2 5.1 0 1.6-.6 3.1-1.6 4.4-1 1.2-2.4 2.1-4 2.4-1.6.3-3.2.1-4.6-.7-1.4-.8-2.5-2-3.1-3.5C.9 9.2.8 7.5 1.3 6c.5-1.6 1.4-2.9 2.8-3.8C5.4 1.3 7 .9 8.6 1zm.5 12.9c1.3-.3 2.5-1 3.4-2.1.8-1.1 1.3-2.4 1.2-3.8 0-1.6-.6-3.2-1.7-4.3-1-1-2.2-1.6-3.6-1.7-1.3-.1-2.7.2-3.8 1-1.1.8-1.9 1.9-2.3 3.3-.4 1.3-.4 2.7.2 4 .6 1.3 1.5 2.3 2.7 3 1.2.7 2.6.9 3.9.6zM7.9 7.5L10.3 5l.7.7-2.4 2.5 2.4 2.5-.7.7-2.4-2.5-2.4 2.5-.7-.7 2.4-2.5-2.4-2.5.7-.7 2.4 2.5z',
      fillRule: 'evenodd',
    },
  ],
  check: [
    {
      d: 'M14.431 3.323l-8.47 10-.79-.036-3.35-4.77.818-.574 2.978 4.24 8.051-9.506.764.646z',
      fillRule: 'evenodd',
    },
  ],
  'chevron-down': [
    {
      d: 'M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z',
      fillRule: 'evenodd',
    },
  ],
  refresh: [
    {
      d: 'M4.681 3H2V2h3.5l.5.5V6H5V4a5 5 0 1 0 4.53-.761l.302-.954A6 6 0 1 1 4.681 3z',
      fillRule: 'evenodd',
    },
  ],
  'folder-opened': [
    {
      d: 'M1.5 14h11l.48-.37 2.63-7-.48-.63H14V3.5l-.5-.5H7.71l-.86-.85L6.5 2h-5l-.5.5v11l.5.5zM2 3h4.29l.86.85.35.15H13v2H8.5l-.35.15-.86.85H3.5l-.47.34-1 3.08L2 3zm10.13 10H2.19l1.67-5H7.5l.35-.15.86-.85h5.79l-2.37 6z',
      fillRule: 'evenodd',
    },
  ],
  'cloud-download': [
    {
      d: 'M4.2 11.2H3.5A2.5 2.5 0 0 1 3.2 6.2a4.2 4.2 0 0 1 8.1-1 3 3 0 0 1 1.2 5.7',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    {
      d: 'M8 8v6M5.5 11.5L8 14l2.5-2.5',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  'cloud-upload': [
    {
      d: 'M4.2 11.2H3.5A2.5 2.5 0 0 1 3.2 6.2a4.2 4.2 0 0 1 8.1-1 3 3 0 0 1 1.2 5.7',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    {
      d: 'M8 14V8M5.5 10.5L8 8l2.5 2.5',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  discard: [
    {
      d: 'M3.5 2v3.5L4 6h3.5V5H4.979l.941-.941a3.552 3.552 0 1 1 5.023 5.023L5.746 14.28l.72.72 5.198-5.198A4.57 4.57 0 0 0 5.2 3.339l-.7.7V2h-1z',
      fillRule: 'evenodd',
    },
  ],
  'link-external': [
    {
      d: 'M1.5 1H6v1H2v12h12v-4h1v4.5l-.5.5h-13l-.5-.5v-13l.5-.5z',
    },
    {
      d: 'M15 1.5V8h-1V2.707L7.243 9.465l-.707-.708L13.293 2H8V1h6.5l.5.5z',
    },
  ],
  shield: [
    {
      d: 'M8 1.5l5.5 2v4.3c0 3.3-2.3 5.8-5.5 6.7-3.2-.9-5.5-3.4-5.5-6.7V3.5L8 1.5z',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.2,
      strokeLinejoin: 'round',
    },
  ],
  window: [
    {
      d: 'M14.5 2h-13l-.5.5v11l.5.5h13l.5-.5v-11l-.5-.5zM14 13H2V6h12v7zm0-8H2V3h12v2z',
      fillRule: 'evenodd',
    },
  ],
  'panel-bottom': [
    {
      d: 'M2 1L1 2v12l1 1h12l1-1V2l-1-1H2zm12 8H2V2h12v7z',
      fillRule: 'evenodd',
    },
  ],
  'panel-bottom-off': [
    {
      d: 'M2 1L1 2v12l1 1h12l1-1V2l-1-1H2zm12 8H2V2h12v7zm0 5H2v-4h12v4z',
      fillRule: 'evenodd',
    },
  ],
  cpu: [
    {
      d: 'M4.5 4.5h7v7h-7zM6.75 6.75h2.5v2.5h-2.5z',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.15,
      strokeLinejoin: 'round',
    },
    {
      d: 'M6.25 2v2.5M9.75 2v2.5M6.25 11.5V14M9.75 11.5V14M2 6.25h2.5M2 9.75h2.5M11.5 6.25H14M11.5 9.75H14',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.15,
      strokeLinecap: 'round',
    },
  ],
  globe: [
    {
      d: 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2z',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.15,
    },
    {
      d: 'M8 2c-1.8 1.7-2.6 3.7-2.6 6s.8 4.3 2.6 6c1.8-1.7 2.6-3.7 2.6-6S9.8 3.7 8 2zM2.3 6h11.4M2.3 10h11.4',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.1,
    },
  ],
  pass: [
    {
      d: 'M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 13a6 6 0 1 1 0-12 6 6 0 0 1 0 12z',
      fillRule: 'evenodd',
    },
    {
      d: 'M11.47 5.22L7.25 9.44 5.53 7.72l-.71.71 2.08 2.08h.7l4.58-4.58-.71-.71z',
    },
  ],
  loading: [
    {
      d: 'M8 2a6 6 0 1 1-5.2 3',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
    },
  ],
  minus: [
    {
      d: 'M3 7.5h10v1H3v-1z',
    },
  ],
  plus: [
    {
      d: 'M14 7v1H8v6H7V8H1V7h6V1h1v6h6z',
    },
  ],
  'clear-all': [
    {
      d: 'M10 12.6l.7.7 1.6-1.6 1.6 1.6.8-.7L13 11l1.7-1.6-.8-.8-1.6 1.7-1.6-1.7-.7.8 1.6 1.6-1.6 1.6zM1 4h14V3H1v1zm0 3h14V6H1v1zm8 2.5V9H1v1h8v-.5zM9 13v-1H1v1h8z',
      fillRule: 'evenodd',
    },
  ],
  'zoom-in': [
    {
      d: 'M6.5 2.25a4.25 4.25 0 1 0 0 8.5 4.25 4.25 0 0 0 0-8.5z',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.2,
    },
    {
      d: 'M9.6 9.6L14 14M6.5 4.5v4M4.5 6.5h4',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.25,
      strokeLinecap: 'round',
    },
  ],
  'zoom-out': [
    {
      d: 'M6.5 2.25a4.25 4.25 0 1 0 0 8.5 4.25 4.25 0 0 0 0-8.5z',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.2,
    },
    {
      d: 'M9.6 9.6L14 14M4.5 6.5h4',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.25,
      strokeLinecap: 'round',
    },
  ],
  'arrow-swap': [
    {
      d: 'M4.207 15.061L1 11.854v-.707L4.207 7.94l.707.707-2.353 2.354H15v1H2.56l2.354 2.353-.707.707zm7.586-7L15 4.854v-.707L11.793.94l-.707.707L13.439 4H1v1h12.44l-2.354 2.354.707.707z',
      fillRule: 'evenodd',
    },
  ],
}

function createCodiconSvg(name: CodiconName, size: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('fill', 'currentColor')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')

  for (const spec of CODICON_PATHS[name]) {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', spec.d)
    if (spec.fill !== undefined) {
      path.setAttribute('fill', spec.fill)
    }
    if (spec.fillRule !== undefined) {
      path.setAttribute('fill-rule', spec.fillRule)
      path.setAttribute('clip-rule', spec.fillRule)
    }
    if (spec.stroke !== undefined) {
      path.setAttribute('stroke', spec.stroke)
    }
    if (spec.strokeWidth !== undefined) {
      path.setAttribute('stroke-width', String(spec.strokeWidth))
    }
    if (spec.strokeLinecap !== undefined) {
      path.setAttribute('stroke-linecap', spec.strokeLinecap)
    }
    if (spec.strokeLinejoin !== undefined) {
      path.setAttribute('stroke-linejoin', spec.strokeLinejoin)
    }
    svg.appendChild(path)
  }

  return svg
}

export function renderCodicon(name: CodiconName, size = 16): HTMLSpanElement {
  const span = document.createElement('span')
  span.className = `codicon codicon-${name}`
  span.setAttribute('aria-hidden', 'true')
  span.appendChild(createCodiconSvg(name, size))
  return span
}

export function setCodicon(element: HTMLElement, name: CodiconName, size = 16): void {
  if (element.classList.contains('codicon')) {
    const toRemove: string[] = []
    for (const token of element.classList) {
      if (token.startsWith('codicon-') && token !== 'codicon') {
        toRemove.push(token)
      }
    }
    if (toRemove.length > 0) {
      element.classList.remove(...toRemove)
    }
    element.classList.add(`codicon-${name}`)
    clearNode(element)
    element.appendChild(createCodiconSvg(name, size))
    return
  }

  clearNode(element)
  element.appendChild(renderCodicon(name, size))
}
