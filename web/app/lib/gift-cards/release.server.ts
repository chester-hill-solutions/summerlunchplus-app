const TORONTO_TIME_ZONE = 'America/Toronto'
const ELIGIBILITY_TIMING_ENABLED =
  (process.env.GIFT_CARD_ELIGIBILITY_TIMING_ENABLED ?? 'true').trim().toLowerCase() !== 'false'

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
    weekday: get('weekday'),
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

const weekdayIndexByLabel: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

export const classWeekFridayNoonTorontoIso = (classAtIso: string | null) => {
  if (!classAtIso) return null
  const classAt = new Date(classAtIso)
  if (!Number.isFinite(classAt.getTime())) return null

  const local = torontoPartsForDate(classAt)
  const weekday = weekdayIndexByLabel[local.weekday]

  if (!Number.isFinite(weekday)) return null

  const daysSinceMonday = (weekday + 6) % 7
  const monday = addDaysToDateParts(local.year, local.month, local.day, -daysSinceMonday)
  const friday = addDaysToDateParts(monday.year, monday.month, monday.day, 4)
  const fridayNoon = torontoTimeUtcForDate(friday.year, friday.month, friday.day, 12, 0)
  return fridayNoon ? fridayNoon.toISOString() : null
}

export const eligibleAfterIso = (qualificationSinceAtIso: string | null) => {
  if (!qualificationSinceAtIso) return null
  const qualificationSinceAt = new Date(qualificationSinceAtIso)
  if (!Number.isFinite(qualificationSinceAt.getTime())) return null
  return new Date(qualificationSinceAt.getTime() + 6 * 60 * 60 * 1000).toISOString()
}

const maxIso = (leftIso: string | null, rightIso: string | null) => {
  const leftMs = Date.parse((leftIso ?? '').trim())
  const rightMs = Date.parse((rightIso ?? '').trim())
  if (!Number.isFinite(leftMs) && !Number.isFinite(rightMs)) return null
  if (!Number.isFinite(leftMs)) return rightIso
  if (!Number.isFinite(rightMs)) return leftIso
  return leftMs >= rightMs ? leftIso : rightIso
}

export const releaseReadyAtIso = ({
  classAtIso,
  qualificationSinceAtIso,
}: {
  classAtIso: string | null
  qualificationSinceAtIso: string | null
}) => {
  const fridayNoon = classWeekFridayNoonTorontoIso(classAtIso)
  const eligibleAfter = eligibleAfterIso(qualificationSinceAtIso)
  return maxIso(fridayNoon, eligibleAfter)
}

export const isReleaseReadyNow = ({
  releaseReadyAt,
  now = Date.now(),
}: {
  releaseReadyAt: string | null | undefined
  now?: number
}) => {
  const releaseReadyAtMs = Date.parse((releaseReadyAt ?? '').trim())
  return Number.isFinite(releaseReadyAtMs) && releaseReadyAtMs <= now
}

export const isEligibilityTimingEnabled = () => ELIGIBILITY_TIMING_ENABLED

type ReleaseResolutionSource =
  | 'availability_state'
  | 'missing_availability_state'
  | 'release_ready_at'
  | 'computed_with_qualification'
  | 'legacy_release'
  | 'unresolved'

type GiftCardReleaseMetadata = {
  release_at?: string | null
  release_ready_at?: string | null
  qualification_since_at?: string | null
  availability_state?: string | null
} | null

const validIsoOrNull = (value: string | null | undefined) => {
  const trimmed = (value ?? '').trim()
  return Number.isFinite(Date.parse(trimmed)) ? trimmed : null
}

const legacyEffectiveReleaseAtIso = ({
  releaseAt,
  classEndsAt,
}: {
  releaseAt: string | null | undefined
  classEndsAt: string | null
}) => validIsoOrNull(releaseAt) ?? validIsoOrNull(nextReleaseAtIso(classEndsAt))

const normalizeAvailabilityState = (value: string | null | undefined) => {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'available' || normalized === 'true') return 'available'
  if (normalized === 'unavailable' || normalized === 'false') return 'unavailable'
  return null
}

export const resolveGiftCardReleaseFromTiming = ({
  metadata,
  classAt,
  classEndsAt,
  now = Date.now(),
  eligibilityTimingEnabled = isEligibilityTimingEnabled(),
}: {
  metadata: GiftCardReleaseMetadata
  classAt: string | null
  classEndsAt: string | null
  now?: number
  eligibilityTimingEnabled?: boolean
}) => {
  const releasedAtOrNull = (value: string | null) => {
    if (!value) return false
    return Date.parse(value) <= now
  }

  if (!eligibilityTimingEnabled) {
    const effectiveReleaseAt = legacyEffectiveReleaseAtIso({ releaseAt: metadata?.release_at, classEndsAt })
    return {
      source: (effectiveReleaseAt ? 'legacy_release' : 'unresolved') as ReleaseResolutionSource,
      effectiveReleaseAt,
      isReleased: releasedAtOrNull(effectiveReleaseAt),
    }
  }

  const explicitReadyAt = validIsoOrNull(metadata?.release_ready_at)
  if (explicitReadyAt) {
    return {
      source: 'release_ready_at' as ReleaseResolutionSource,
      effectiveReleaseAt: explicitReadyAt,
      isReleased: releasedAtOrNull(explicitReadyAt),
    }
  }

  const qualificationSinceAt = validIsoOrNull(metadata?.qualification_since_at)
  if (qualificationSinceAt) {
    const computedReadyAt = validIsoOrNull(
      releaseReadyAtIso({
        classAtIso: classAt,
        qualificationSinceAtIso: qualificationSinceAt,
      })
    )

    if (computedReadyAt) {
      return {
        source: 'computed_with_qualification' as ReleaseResolutionSource,
        effectiveReleaseAt: computedReadyAt,
        isReleased: releasedAtOrNull(computedReadyAt),
      }
    }
  }

  const legacyReleaseAt = legacyEffectiveReleaseAtIso({ releaseAt: metadata?.release_at, classEndsAt })
  return {
    source: (legacyReleaseAt ? 'legacy_release' : 'unresolved') as ReleaseResolutionSource,
    effectiveReleaseAt: legacyReleaseAt,
    isReleased: releasedAtOrNull(legacyReleaseAt),
  }
}

export const resolveGiftCardRelease = ({
  metadata,
  classAt,
  classEndsAt,
  now = Date.now(),
  eligibilityTimingEnabled = isEligibilityTimingEnabled(),
}: {
  metadata: GiftCardReleaseMetadata
  classAt: string | null
  classEndsAt: string | null
  now?: number
  eligibilityTimingEnabled?: boolean
}) => {
  const availabilityState = normalizeAvailabilityState(metadata?.availability_state)
  if (availabilityState === 'available') {
    return {
      source: 'availability_state' as ReleaseResolutionSource,
      effectiveReleaseAt: null,
      isReleased: true,
    }
  }

  if (availabilityState === 'unavailable') {
    return {
      source: 'availability_state' as ReleaseResolutionSource,
      effectiveReleaseAt: null,
      isReleased: false,
    }
  }

  return {
    source: 'missing_availability_state' as ReleaseResolutionSource,
    effectiveReleaseAt: null,
    isReleased: false,
  }
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
