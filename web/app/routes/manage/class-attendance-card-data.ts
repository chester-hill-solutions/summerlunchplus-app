import { requireAuth } from '@/lib/auth.server'
import { createLoaderProfile } from '@/lib/loader-profile.server'
import { adminClient } from '@/lib/supabase/adminClient'
import { isRoleAtLeast } from '@/lib/roles'

import type { Route } from './+types/class-attendance-card-data'

const WEEKDAY_DEFS = [
  { key: 'monday', label: 'Monday', pattern: /\bmon(?:day)?\b/i },
  { key: 'tuesday', label: 'Tuesday', pattern: /\btue(?:s|sday)?\b/i },
  { key: 'wednesday', label: 'Wednesday', pattern: /\bwed(?:nesday)?\b/i },
  { key: 'thursday', label: 'Thursday', pattern: /\bthu(?:r|rs|rsday)?\b/i },
  { key: 'friday', label: 'Friday', pattern: /\bfri(?:day)?\b/i },
  { key: 'saturday', label: 'Saturday', pattern: /\bsat(?:urday)?\b/i },
  { key: 'sunday', label: 'Sunday', pattern: /\bsun(?:day)?\b/i },
] as const

type WeekdayKey = (typeof WEEKDAY_DEFS)[number]['key'] | 'other'

const WEEKDAY_LABEL_BY_KEY: Record<WeekdayKey, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
  other: 'Other',
}

const WEEKDAY_ORDER: WeekdayKey[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'other',
]

const getWeekdayKeyFromWorkshopDescription = (value: string | null | undefined): WeekdayKey => {
  const normalized = (value ?? '').trim()
  for (const def of WEEKDAY_DEFS) {
    if (def.pattern.test(normalized)) return def.key
  }
  return 'other'
}

export async function loader({ request }: Route.LoaderArgs) {
  const profile = createLoaderProfile({
    name: 'class_attendance_card_data_loader',
    request,
  })

  const auth = await requireAuth(request)
  profile.mark('require_auth', {
    role: auth.claims.role,
    emailHint: auth.emailHint,
  })

  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    throw new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const { data: classes, error: classesError } = await adminClient
    .from('class')
    .select('id, workshop_id, starts_at, ends_at')
    .order('starts_at', { ascending: true })

  if (classesError) {
    throw new Response(classesError.message, { status: 500, headers: auth.headers })
  }

  const workshopIds = Array.from(
    new Set((classes ?? []).map(row => row.workshop_id).filter((id): id is string => Boolean(id)))
  )

  const { data: workshops, error: workshopsError } = workshopIds.length
    ? await adminClient
        .from('workshop')
        .select('id, description')
        .in('id', workshopIds)
    : { data: [], error: null }

  if (workshopsError) {
    throw new Response(workshopsError.message, { status: 500, headers: auth.headers })
  }

  const workshopById = new Map((workshops ?? []).map(row => [row.id, row]))

  const daysMap = new Map<
    WeekdayKey,
    {
      key: WeekdayKey
      label: string
      workshops: Map<
        string,
        {
          id: string
          description: string
          classes: Array<{
            id: string
            startsAt: string
            endsAt: string
          }>
        }
      >
    }
  >()

  for (const classRow of classes ?? []) {
    if (!classRow.workshop_id) continue
    const workshop = workshopById.get(classRow.workshop_id)
    if (!workshop) continue

    const workshopDescription = (workshop.description ?? '').trim() || 'Unnamed workshop'
    const weekdayKey = getWeekdayKeyFromWorkshopDescription(workshopDescription)
    const dayBucket =
      daysMap.get(weekdayKey) ??
      {
        key: weekdayKey,
        label: WEEKDAY_LABEL_BY_KEY[weekdayKey],
        workshops: new Map(),
      }

    const workshopBucket =
      dayBucket.workshops.get(workshop.id) ??
      {
        id: workshop.id,
        description: workshopDescription,
        classes: [],
      }

    workshopBucket.classes.push({
      id: classRow.id,
      startsAt: classRow.starts_at,
      endsAt: classRow.ends_at,
    })

    dayBucket.workshops.set(workshop.id, workshopBucket)
    daysMap.set(weekdayKey, dayBucket)
  }

  const days = Array.from(daysMap.values())
    .sort((left, right) => WEEKDAY_ORDER.indexOf(left.key) - WEEKDAY_ORDER.indexOf(right.key))
    .map(day => ({
      key: day.key,
      label: day.label,
      workshops: Array.from(day.workshops.values())
        .sort((left, right) => left.description.localeCompare(right.description))
        .map(workshop => ({
          ...workshop,
          classes: workshop.classes.sort(
            (left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime()
          ),
        })),
    }))

  profile.complete({
    dayCount: days.length,
    workshopCount: days.reduce((sum, day) => sum + day.workshops.length, 0),
    classCount: days.reduce(
      (sum, day) => sum + day.workshops.reduce((workshopSum, workshop) => workshopSum + workshop.classes.length, 0),
      0
    ),
  })

  return {
    days,
  }
}
