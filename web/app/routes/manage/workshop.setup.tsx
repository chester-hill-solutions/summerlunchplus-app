import { Link, Form, redirect, useActionData, useLoaderData } from 'react-router'
import { useEffect, useMemo, useState } from 'react'

import { requireAuth } from '@/lib/auth.server'
import {
  getOffsetMinutesForLocalDateTime,
  localDateTimeToUtcIso,
  parseOffsetMinutes,
  toLocalDateTimeInputValue,
} from '@/lib/datetime'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'

import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router'

const DEFAULT_RETURN_TO = '/manage/workshop'
const BYDAY_VALUES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const
type ByDay = (typeof BYDAY_VALUES)[number]

const byDayToWeekday: Record<ByDay, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
}

const weekdayToByDay: Record<number, ByDay> = {
  0: 'SU',
  1: 'MO',
  2: 'TU',
  3: 'WE',
  4: 'TH',
  5: 'FR',
  6: 'SA',
}

type ActionData = {
  error?: string
  values?: Record<string, string>
  byday?: ByDay[]
}

const safeReturnTo = (input: string | null) => {
  if (!input) return DEFAULT_RETURN_TO
  if (!input.startsWith('/')) return DEFAULT_RETURN_TO
  if (input.startsWith('//')) return DEFAULT_RETURN_TO
  if (input.includes('://')) return DEFAULT_RETURN_TO
  return input
}

const parseDateTimeWithOffset = (value: string, rawOffset: FormDataEntryValue | null) => {
  const offset = parseOffsetMinutes(typeof rawOffset === 'string' ? rawOffset : '')
  if (offset === null) return null

  const utcIso = localDateTimeToUtcIso(value, offset)
  if (!utcIso) return null

  const date = new Date(utcIso)
  if (Number.isNaN(date.getTime())) return null
  return date
}

const toInteger = (value: string) => {
  const num = Number(value)
  if (!Number.isInteger(num) || num < 0) return null
  return num
}

const firstOccurrenceOnOrAfter = (start: Date, weekday: number) => {
  const occurrence = new Date(start)
  const delta = (weekday - occurrence.getDay() + 7) % 7
  occurrence.setDate(occurrence.getDate() + delta)
  return occurrence
}

const buildRecurringClassStarts = (start: Date, until: Date, byday: ByDay[]) => {
  const starts: Date[] = []
  for (const day of byday) {
    let occurrence = firstOccurrenceOnOrAfter(start, byDayToWeekday[day])
    while (occurrence.getTime() <= until.getTime()) {
      starts.push(new Date(occurrence))
      occurrence = new Date(occurrence)
      occurrence.setDate(occurrence.getDate() + 7)
    }
  }

  starts.sort((a, b) => a.getTime() - b.getTime())
  const deduped: Date[] = []
  const seen = new Set<number>()
  for (const startAt of starts) {
    const key = startAt.getTime()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(startAt)
  }
  return deduped
}

export async function loader({ request }: LoaderFunctionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    throw redirect('/home', { headers: auth.headers })
  }

  const { supabase } = createClient(request)
  const { data: semesters, error } = await supabase
    .from('semester')
    .select('id, name, description, starts_at, ends_at, enrollment_open_at, enrollment_close_at')
    .order('starts_at', { ascending: true })

  if (error) {
    throw new Response(error.message, { status: 500, headers: auth.headers })
  }

  const url = new URL(request.url)
  return {
    semesters: semesters ?? [],
    returnTo: safeReturnTo(url.searchParams.get('returnTo')),
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    throw redirect('/home', { headers: auth.headers })
  }

  const formData = await request.formData()
  const returnTo = safeReturnTo(typeof formData.get('return_to') === 'string' ? String(formData.get('return_to')) : null)

  const values: Record<string, string> = {
    semester_id: String(formData.get('semester_id') ?? ''),
    description: String(formData.get('description') ?? ''),
    enrollment_open_at: String(formData.get('enrollment_open_at') ?? ''),
    enrollment_close_at: String(formData.get('enrollment_close_at') ?? ''),
    capacity: String(formData.get('capacity') ?? ''),
    wait_list_capacity: String(formData.get('wait_list_capacity') ?? ''),
    class_start_at: String(formData.get('class_start_at') ?? ''),
    class_end_at: String(formData.get('class_end_at') ?? ''),
    until: String(formData.get('until') ?? ''),
  }

  const byday = formData
    .getAll('byday')
    .map(value => String(value))
    .filter((value): value is ByDay => BYDAY_VALUES.includes(value as ByDay))

  if (!values.semester_id) {
    return { error: 'Semester is required.', values, byday } satisfies ActionData
  }

  const capacity = toInteger(values.capacity)
  const waitListCapacity = toInteger(values.wait_list_capacity)
  if (capacity === null || waitListCapacity === null) {
    return { error: 'Capacity values must be non-negative whole numbers.', values, byday } satisfies ActionData
  }

  const classStartAt = parseDateTimeWithOffset(values.class_start_at, formData.get('class_start_at__tz_offset'))
  const classEndAt = parseDateTimeWithOffset(values.class_end_at, formData.get('class_end_at__tz_offset'))
  const until = parseDateTimeWithOffset(values.until, formData.get('until__tz_offset'))

  if (!classStartAt || !classEndAt) {
    return { error: 'Class start and end are required.', values, byday } satisfies ActionData
  }
  if (classEndAt.getTime() <= classStartAt.getTime()) {
    return { error: 'Class end must be after class start.', values, byday } satisfies ActionData
  }
  if (!until) {
    return { error: 'Recurrence until datetime is required.', values, byday } satisfies ActionData
  }
  if (!byday.length) {
    return { error: 'Select at least one recurring weekday.', values, byday } satisfies ActionData
  }

  const enrollmentOpenAt = values.enrollment_open_at
    ? parseDateTimeWithOffset(values.enrollment_open_at, formData.get('enrollment_open_at__tz_offset'))
    : null
  const enrollmentCloseAt = values.enrollment_close_at
    ? parseDateTimeWithOffset(values.enrollment_close_at, formData.get('enrollment_close_at__tz_offset'))
    : null
  if (values.enrollment_open_at && !enrollmentOpenAt) {
    return { error: 'Enrollment open datetime is invalid.', values, byday } satisfies ActionData
  }
  if (values.enrollment_close_at && !enrollmentCloseAt) {
    return { error: 'Enrollment close datetime is invalid.', values, byday } satisfies ActionData
  }
  if (enrollmentOpenAt && enrollmentCloseAt && enrollmentOpenAt.getTime() >= enrollmentCloseAt.getTime()) {
    return { error: 'Enrollment close must be after enrollment open.', values, byday } satisfies ActionData
  }

  const durationMs = classEndAt.getTime() - classStartAt.getTime()
  const starts = buildRecurringClassStarts(classStartAt, until, byday)
  if (!starts.length) {
    return {
      error: 'No class instances were generated. Remember: recurrence uses inclusive UNTIL semantics.',
      values,
      byday,
    } satisfies ActionData
  }

  const { supabase } = createClient(request)
  const { data: workshopRow, error: workshopError } = await supabase
    .from('workshop')
    .insert({
      semester_id: values.semester_id,
      description: values.description || null,
      enrollment_open_at: enrollmentOpenAt ? enrollmentOpenAt.toISOString() : null,
      enrollment_close_at: enrollmentCloseAt ? enrollmentCloseAt.toISOString() : null,
      capacity,
      wait_list_capacity: waitListCapacity,
    })
    .select('id')
    .single()

  if (workshopError || !workshopRow?.id) {
    return { error: workshopError?.message ?? 'Unable to create workshop.', values, byday } satisfies ActionData
  }

  const classRows = starts.map(startAt => ({
    workshop_id: workshopRow.id,
    starts_at: startAt.toISOString(),
    ends_at: new Date(startAt.getTime() + durationMs).toISOString(),
  }))

  const { error: classError } = await supabase.from('class').insert(classRows)
  if (classError) {
    return { error: `Workshop created, but class generation failed: ${classError.message}`, values, byday } satisfies ActionData
  }

  throw redirect(returnTo, { headers: auth.headers })
}

export default function WorkshopSetupPage() {
  const { semesters, returnTo } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>() as ActionData | undefined
  const [timezone, setTimezone] = useState('Local time')

  const [selectedSemesterId, setSelectedSemesterId] = useState(actionData?.values?.semester_id ?? '')
  const [enrollmentOpenAtValue, setEnrollmentOpenAtValue] = useState(actionData?.values?.enrollment_open_at ?? '')
  const [enrollmentCloseAtValue, setEnrollmentCloseAtValue] = useState(actionData?.values?.enrollment_close_at ?? '')
  const [untilValue, setUntilValue] = useState(actionData?.values?.until ?? '')

  const initialStart = actionData?.values?.class_start_at ?? ''
  const defaultByDay = useMemo<ByDay[]>(() => {
    if (!initialStart) return []
    const date = new Date(initialStart)
    if (Number.isNaN(date.getTime())) return []
    return [weekdayToByDay[date.getDay()]]
  }, [initialStart])

  const [selectedByDay, setSelectedByDay] = useState<ByDay[]>(actionData?.byday?.length ? actionData.byday : defaultByDay)
  const [manuallyChangedByDay, setManuallyChangedByDay] = useState(Boolean(actionData?.byday?.length))
  const [startValue, setStartValue] = useState(initialStart)
  const [classEndValue, setClassEndValue] = useState(actionData?.values?.class_end_at ?? '')

  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time')
  }, [])

  const onSemesterChange = (semesterId: string) => {
    setSelectedSemesterId(semesterId)
    const semester = semesters.find(item => item.id === semesterId)
    if (!semester) {
      setEnrollmentOpenAtValue('')
      setEnrollmentCloseAtValue('')
      setUntilValue('')
      return
    }
    setEnrollmentOpenAtValue(toLocalDateTimeInputValue(semester.enrollment_open_at))
    setEnrollmentCloseAtValue(toLocalDateTimeInputValue(semester.enrollment_close_at))
    setUntilValue(toLocalDateTimeInputValue(semester.ends_at))
  }

  const selectedSemester = semesters.find(item => item.id === selectedSemesterId)

  const onStartChange = (value: string) => {
    setStartValue(value)
    if (manuallyChangedByDay) return
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return
    setSelectedByDay([weekdayToByDay[date.getDay()]])
  }

  const toggleByDay = (day: ByDay) => {
    setManuallyChangedByDay(true)
    setSelectedByDay(current => (current.includes(day) ? current.filter(item => item !== day) : [...current, day]))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Setup a Workshop</h1>
          <p className="text-sm text-muted-foreground">
            Create workshop details and auto-generate recurring classes using weekly BYDAY recurrence.
          </p>
        </div>
        <Link
          to={returnTo}
          className="inline-flex h-10 items-center rounded-md border border-input px-4 text-sm font-medium hover:bg-muted"
        >
          Cancel
        </Link>
      </div>

      <Form method="post" className="space-y-6 rounded-lg border bg-card p-5">
        <input type="hidden" name="return_to" value={returnTo} />
        <input
          type="hidden"
          name="enrollment_open_at__tz_offset"
          value={enrollmentOpenAtValue ? getOffsetMinutesForLocalDateTime(enrollmentOpenAtValue) : ''}
        />
        <input
          type="hidden"
          name="enrollment_close_at__tz_offset"
          value={enrollmentCloseAtValue ? getOffsetMinutesForLocalDateTime(enrollmentCloseAtValue) : ''}
        />
        <input
          type="hidden"
          name="class_start_at__tz_offset"
          value={startValue ? getOffsetMinutesForLocalDateTime(startValue) : ''}
        />
        <input
          type="hidden"
          name="class_end_at__tz_offset"
          value={classEndValue ? getOffsetMinutesForLocalDateTime(classEndValue) : ''}
        />
        <input
          type="hidden"
          name="until__tz_offset"
          value={untilValue ? getOffsetMinutesForLocalDateTime(untilValue) : ''}
        />

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Workshop details</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span>Semester</span>
              <select
                name="semester_id"
                value={selectedSemesterId}
                onChange={event => onSemesterChange(event.target.value)}
                required
                className="h-10 rounded border border-input bg-background px-2"
              >
                <option value="">Select a semester</option>
                {semesters.map(semester => (
                  <option key={semester.id} value={semester.id}>
                    {semester.name?.trim() || `${semester.starts_at} - ${semester.ends_at}`}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm">
              <span>Description</span>
              <input
                name="description"
                defaultValue={actionData?.values?.description ?? ''}
                className="h-10 rounded border border-input bg-background px-2"
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span>Enrollment opens ({timezone})</span>
              <input
                name="enrollment_open_at"
                type="datetime-local"
                value={enrollmentOpenAtValue}
                onChange={event => setEnrollmentOpenAtValue(event.target.value)}
                className="h-10 rounded border border-input bg-background px-2"
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span>Enrollment closes ({timezone})</span>
              <input
                name="enrollment_close_at"
                type="datetime-local"
                value={enrollmentCloseAtValue}
                onChange={event => setEnrollmentCloseAtValue(event.target.value)}
                className="h-10 rounded border border-input bg-background px-2"
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span>Capacity</span>
              <input
                name="capacity"
                type="number"
                min={0}
                defaultValue={actionData?.values?.capacity ?? '0'}
                required
                className="h-10 w-28 rounded border border-input bg-background px-2"
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span>Wait list capacity</span>
              <input
                name="wait_list_capacity"
                type="number"
                min={0}
                defaultValue={actionData?.values?.wait_list_capacity ?? '0'}
                required
                className="h-10 w-28 rounded border border-input bg-background px-2"
              />
            </label>
          </div>

          {selectedSemester ? (
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="text-sm font-semibold">Selected semester details</p>
              <p className="text-sm text-muted-foreground">
                {selectedSemester.name?.trim() || 'Unnamed semester'}
              </p>
              {selectedSemester.description ? (
                <p className="mt-1 text-xs text-muted-foreground">{selectedSemester.description}</p>
              ) : null}
              <dl className="mt-2 grid gap-1 text-xs text-muted-foreground md:grid-cols-2">
                <div>
                  <dt className="font-medium text-foreground">Semester starts</dt>
                  <dd>{new Date(selectedSemester.starts_at).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Semester ends</dt>
                  <dd>{new Date(selectedSemester.ends_at).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Enrollment opens</dt>
                  <dd>{selectedSemester.enrollment_open_at ? new Date(selectedSemester.enrollment_open_at).toLocaleString() : 'Not set'}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Enrollment closes</dt>
                  <dd>{selectedSemester.enrollment_close_at ? new Date(selectedSemester.enrollment_close_at).toLocaleString() : 'Not set'}</dd>
                </div>
              </dl>
            </div>
          ) : null}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Class schedule</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span>First class starts ({timezone})</span>
              <input
                name="class_start_at"
                type="datetime-local"
                required
                value={startValue}
                onChange={event => onStartChange(event.target.value)}
                className="h-10 rounded border border-input bg-background px-2"
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span>First class ends ({timezone})</span>
              <input
                name="class_end_at"
                type="datetime-local"
                required
                value={classEndValue}
                onChange={event => setClassEndValue(event.target.value)}
                className="h-10 rounded border border-input bg-background px-2"
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span>Repeat until ({timezone})</span>
              <input
                name="until"
                type="datetime-local"
                required
                value={untilValue}
                onChange={event => setUntilValue(event.target.value)}
                className="h-10 rounded border border-input bg-background px-2"
              />
            </label>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Repeat on weekdays (BYDAY)</p>
            <div className="flex flex-wrap gap-2">
              {BYDAY_VALUES.map(day => {
                const selected = selectedByDay.includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleByDay(day)}
                    className={
                      selected
                        ? 'rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground'
                        : 'rounded-md border border-input px-3 py-1.5 text-xs font-semibold hover:bg-muted'
                    }
                  >
                    {day}
                  </button>
                )
              })}
            </div>
            {selectedByDay.map(day => (
              <input key={day} type="hidden" name="byday" value={day} />
            ))}
            <p className="text-xs text-muted-foreground">
              Choose the weekdays you want. We will create classes on those days up to and including the date/time in “Repeat until”.
            </p>
          </div>
        </section>

        {actionData?.error ? <p className="text-sm font-medium text-destructive">{actionData.error}</p> : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="inline-flex h-11 items-center rounded-md bg-[var(--brand-pink)] px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-95"
          >
            Create workshop and classes
          </button>
          <p className="text-xs text-muted-foreground">
            We create classes on your selected weekdays, starting from your first class, until the “Repeat until” date/time.
          </p>
          <p className="text-xs text-muted-foreground">
            If a class starts before the “Repeat until” time but ends after it, that class will still be created.
          </p>
        </div>
      </Form>
    </div>
  )
}
