export const DATE_FORMATS = ['dmy', 'mdy', 'ymd', 'locale'] as const

export type DateFormat = (typeof DATE_FORMATS)[number]

export const TIME_FORMATS = ['24-hour', '12-hour'] as const

export type TimeFormat = (typeof TIME_FORMATS)[number]

const pad = (value: number): string => value.toString().padStart(2, '0')

const formatCalendarDate = (date: Date, dateFormat: DateFormat, locale: string): string => {
  const day = pad(date.getDate())
  const month = pad(date.getMonth() + 1)
  const year = String(date.getFullYear())

  switch (dateFormat) {
    case 'mdy':
      return `${month}/${day}/${year}`
    case 'ymd':
      return `${year}-${month}-${day}`
    case 'locale':
      return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date)
    default:
      return `${day}.${month}.${year}`
  }
}

export const formatDate = (
  isoDate: string,
  timeFormat: TimeFormat,
  dateFormat: DateFormat = 'dmy',
  locale = 'en',
): string => {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const calendarDate = formatCalendarDate(date, dateFormat, locale)
  const minutes = pad(date.getMinutes())
  const localHours = date.getHours()

  if (timeFormat === '12-hour') {
    const period = localHours >= 12 ? 'PM' : 'AM'
    return `${calendarDate} ${pad(localHours % 12 || 12)}:${minutes} ${period}`
  }
  return `${calendarDate} ${pad(localHours)}:${minutes}`
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB'] as const

export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1)
  const unit = BYTE_UNITS[exponent] ?? 'B'
  if (exponent === 0) {
    return `${Math.round(bytes)} ${unit}`
  }
  const value = bytes / 1024 ** exponent
  return `${value >= 100 ? Math.round(value) : Number(value.toFixed(1))} ${unit}`
}
