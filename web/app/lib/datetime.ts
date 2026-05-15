const LOCAL_DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

const isValidDateParts = (year: number, month: number, day: number) => {
  if (!Number.isInteger(year) || year < 1) return false
  if (!Number.isInteger(month) || month < 1 || month > 12) return false
  if (!Number.isInteger(day) || day < 1 || day > 31) return false

  const candidate = new Date(Date.UTC(year, month - 1, day))
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  )
}

const isValidTimeParts = (hour: number, minute: number) => {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return false
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return false
  return true
}

export const toLocalDateTimeInputValue = (value: string | null | undefined) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export const getOffsetMinutesForLocalDateTime = (value: string) => {
  if (!LOCAL_DATE_TIME_RE.test(value)) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return String(date.getTimezoneOffset())
}

export const getOffsetMinutesForLocalDate = (value: string) => {
  if (!LOCAL_DATE_RE.test(value)) return ''
  const date = new Date(`${value}T00:00`)
  if (Number.isNaN(date.getTime())) return ''
  return String(date.getTimezoneOffset())
}

export const parseOffsetMinutes = (rawOffset: string) => {
  if (!rawOffset.trim()) return null
  const offset = Number(rawOffset)
  if (!Number.isFinite(offset) || !Number.isInteger(offset)) return null
  if (offset < -14 * 60 || offset > 14 * 60) return null
  return offset
}

export const localDateTimeToUtcIso = (localValue: string, offsetMinutes: number) => {
  const match = LOCAL_DATE_TIME_RE.exec(localValue)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])

  if (!isValidDateParts(year, month, day)) return null
  if (!isValidTimeParts(hour, minute)) return null

  const utcMillis = Date.UTC(year, month - 1, day, hour, minute) + offsetMinutes * 60_000
  return new Date(utcMillis).toISOString()
}

export const localDateToUtcIso = (localDate: string, offsetMinutes: number) => {
  const match = LOCAL_DATE_RE.exec(localDate)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (!isValidDateParts(year, month, day)) return null

  const utcMillis = Date.UTC(year, month - 1, day, 0, 0) + offsetMinutes * 60_000
  return new Date(utcMillis).toISOString()
}
