const TORONTO_TIME_ZONE = 'America/Toronto'

const torontoDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TORONTO_TIME_ZONE,
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const parseHourMinuteEnv = (name: string, fallback: number) => {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

const isProductionRuntime = process.env.NODE_ENV === 'production'
const RELEASE_HOUR_TORONTO = parseHourMinuteEnv('GIFT_CARD_RELEASE_HOUR_TORONTO', 11)
const RELEASE_MINUTE_TORONTO = parseHourMinuteEnv('GIFT_CARD_RELEASE_MINUTE_TORONTO', isProductionRuntime ? 45 : 0)

const torontoPartsForDate = (date: Date) => {
  const parts = torontoDateTimeFormatter.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''
  return {
    year: Number.parseInt(get('year'), 10),
    month: Number.parseInt(get('month'), 10),
    day: Number.parseInt(get('day'), 10),
    hour: Number.parseInt(get('hour'), 10),
    minute: Number.parseInt(get('minute'), 10),
  }
}

const addDaysToDateParts = (year: number, month: number, day: number, daysAhead: number) => {
  const next = new Date(Date.UTC(year, month - 1, day + daysAhead))
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  }
}

const torontoTimeUtcForDate = (year: number, month: number, day: number, hour: number, minute: number) => {
  for (const utcHour of [16, 17, 15, 18]) {
    const candidate = new Date(Date.UTC(year, month - 1, day, utcHour, minute, 0, 0))
    const toronto = torontoPartsForDate(candidate)
    if (
      toronto.year === year &&
      toronto.month === month &&
      toronto.day === day &&
      toronto.hour === hour &&
      toronto.minute === minute
    ) {
      return candidate
    }
  }

  return null
}

export const nextReleaseAtIso = (classEndsAt: string | null) => {
  if (!classEndsAt) return null
  const end = new Date(classEndsAt)
  if (!Number.isFinite(end.getTime())) return null

  const torontoEnd = torontoPartsForDate(end)
  if (!Number.isFinite(torontoEnd.year) || !Number.isFinite(torontoEnd.month) || !Number.isFinite(torontoEnd.day)) {
    return null
  }

  for (let daysAhead = 0; daysAhead <= 21; daysAhead += 1) {
    const localDate = addDaysToDateParts(torontoEnd.year, torontoEnd.month, torontoEnd.day, daysAhead)
    const weekday = new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day)).getUTCDay()
    if (weekday !== 1 && weekday !== 5) continue

    const candidate = torontoTimeUtcForDate(
      localDate.year,
      localDate.month,
      localDate.day,
      RELEASE_HOUR_TORONTO,
      RELEASE_MINUTE_TORONTO
    )
    if (!candidate) continue
    if (candidate.getTime() < end.getTime()) continue
    return candidate.toISOString()
  }

  return null
}

export const isGiftCardReleasedNow = ({
  releaseAt,
  classEndsAt,
  now = Date.now(),
}: {
  releaseAt: string | null | undefined
  classEndsAt: string | null
  now?: number
}) => {
  const parsedReleaseAt = Date.parse((releaseAt ?? '').trim())
  if (Number.isFinite(parsedReleaseAt)) {
    return parsedReleaseAt <= now
  }

  const fallbackReleaseAt = nextReleaseAtIso(classEndsAt)
  const fallbackReleaseAtMs = Date.parse((fallbackReleaseAt ?? '').trim())
  return Number.isFinite(fallbackReleaseAtMs) && fallbackReleaseAtMs <= now
}
