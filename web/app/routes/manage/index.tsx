import { useEffect, useMemo, useState } from 'react'
import { Link, useFetcher, useNavigate } from 'react-router'

import { createLoaderProfile } from '@/lib/loader-profile.server'

import type { Route } from './+types/index'

type ClassAttendanceCatalog = {
  days: Array<{
    key: string
    label: string
    workshops: Array<{
      id: string
      description: string
      classes: Array<{
        id: string
        startsAt: string
        endsAt: string
      }>
    }>
  }>
}

type FlowStep = 'root' | 'day' | 'workshop' | 'class'

const formatClassDateTime = (startsAt: string, endsAt: string) => {
  const starts = new Date(startsAt)
  const ends = new Date(endsAt)
  const fallback = `${startsAt} - ${endsAt}`

  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) {
    return fallback
  }

  const dateLabel = new Intl.DateTimeFormat('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(starts)

  const timeLabel = `${new Intl.DateTimeFormat('en-CA', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(starts)} - ${new Intl.DateTimeFormat('en-CA', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(ends)}`

  return `${dateLabel} ${timeLabel}`
}

export const loader = async ({ request }: Route.LoaderArgs) => {
  const profile = createLoaderProfile({
    name: 'manage_overview_loader',
    request,
  })
  profile.complete({
    cardCount: 2,
  })
  return null
}

export default function TeamOverviewPage() {
  const navigate = useNavigate()
  const attendanceCatalogFetcher = useFetcher<ClassAttendanceCatalog>()
  const [step, setStep] = useState<FlowStep>('root')
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null)
  const [selectedWorkshopId, setSelectedWorkshopId] = useState<string | null>(null)

  useEffect(() => {
    if (attendanceCatalogFetcher.state !== 'idle' || attendanceCatalogFetcher.data) return
    attendanceCatalogFetcher.load('/manage/class-attendance-card-data')
  }, [attendanceCatalogFetcher])

  const shouldLogInstrumentation =
    import.meta.env.DEV || import.meta.env.VITE_ENABLE_ROUTER_INSTRUMENTATION === 'true'

  useEffect(() => {
    if (!shouldLogInstrumentation) return
    if (attendanceCatalogFetcher.state === 'loading') {
      console.info('[router-instrumentation]', {
        event: 'manage_class_attendance_catalog_loading',
      })
      return
    }

    if (attendanceCatalogFetcher.state === 'idle' && attendanceCatalogFetcher.data) {
      console.info('[router-instrumentation]', {
        event: 'manage_class_attendance_catalog_loaded',
        dayCount: attendanceCatalogFetcher.data.days.length,
      })
    }
  }, [attendanceCatalogFetcher.data, attendanceCatalogFetcher.state, shouldLogInstrumentation])

  const catalogDays = attendanceCatalogFetcher.data?.days ?? []
  const selectedDay = useMemo(
    () => catalogDays.find(day => day.key === selectedDayKey) ?? null,
    [catalogDays, selectedDayKey]
  )
  const selectedWorkshop = useMemo(
    () => selectedDay?.workshops.find(workshop => workshop.id === selectedWorkshopId) ?? null,
    [selectedDay, selectedWorkshopId]
  )
  const isCatalogLoading = attendanceCatalogFetcher.state !== 'idle' && !attendanceCatalogFetcher.data

  const resetToRoot = () => {
    setStep('root')
    setSelectedDayKey(null)
    setSelectedWorkshopId(null)
  }

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm uppercase tracking-wide text-muted-foreground">Manage</p>
        <h1 className="text-2xl font-semibold leading-tight">Admin workspace</h1>
      </header>

      {step === 'root' ? (
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            className="h-36 w-full sm:w-[17.5rem] rounded-lg border bg-card px-3 py-3 text-left shadow-sm transition hover:-translate-y-0.5"
            onClick={() => setStep('day')}
          >
            <h2 className="text-lg font-semibold leading-tight">Manage Class Attendance</h2>
            <p className="mt-2 text-sm text-muted-foreground">Select day, workshop, and class session.</p>
          </button>

          <Link
            to="/manage/workshop-enrollment"
            className="h-36 w-full sm:w-[17.5rem] rounded-lg border bg-card px-3 py-3 shadow-sm transition hover:-translate-y-0.5"
          >
            <h2 className="text-lg font-semibold leading-tight">Manage Workshop Enrollments</h2>
            <p className="mt-2 text-sm text-muted-foreground">Open the workshop enrollment queue.</p>
          </Link>
        </div>
      ) : null}

      {step === 'day' ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-input px-3 py-1 text-sm font-medium text-foreground hover:bg-muted"
              onClick={resetToRoot}
            >
              Back
            </button>
            <h2 className="text-lg font-semibold">Select day of week</h2>
          </div>

          {isCatalogLoading ? (
            <p className="text-sm text-muted-foreground">Loading class attendance options...</p>
          ) : (
            <div className="flex flex-wrap gap-2.5">
              {catalogDays.map(day => (
                <button
                  key={day.key}
                  type="button"
                  className="h-28 w-full sm:w-[15rem] rounded-lg border bg-card px-3 py-3 text-left shadow-sm transition hover:-translate-y-0.5"
                  onClick={() => {
                    setSelectedDayKey(day.key)
                    setSelectedWorkshopId(null)
                    setStep('workshop')
                  }}
                >
                  <h3 className="text-lg font-semibold leading-tight">{day.label}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{day.workshops.length} workshops</p>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {step === 'workshop' ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-input px-3 py-1 text-sm font-medium text-foreground hover:bg-muted"
              onClick={() => setStep('day')}
            >
              Back
            </button>
            <h2 className="text-lg font-semibold">Select workshop</h2>
          </div>

          <div className="flex flex-wrap gap-2.5">
            {(selectedDay?.workshops ?? []).map(workshop => (
              <button
                key={workshop.id}
                type="button"
                className="h-28 w-full sm:w-[19rem] rounded-lg border bg-card px-3 py-3 text-left shadow-sm transition hover:-translate-y-0.5"
                onClick={() => {
                  setSelectedWorkshopId(workshop.id)
                  setStep('class')
                }}
              >
                <h3 className="text-base font-semibold leading-tight">{workshop.description}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{workshop.classes.length} class sessions</p>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {step === 'class' ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-input px-3 py-1 text-sm font-medium text-foreground hover:bg-muted"
              onClick={() => setStep('workshop')}
            >
              Back
            </button>
            <h2 className="text-lg font-semibold">Select class date and time</h2>
          </div>

          <div className="flex flex-wrap gap-2.5">
            {(selectedWorkshop?.classes ?? []).map(classItem => (
              <button
                key={classItem.id}
                type="button"
                className="h-28 w-full sm:w-[19rem] rounded-lg border bg-card px-3 py-3 text-left shadow-sm transition hover:-translate-y-0.5"
                onClick={() => {
                  const params = new URLSearchParams()
                  params.set('scopeClassId', classItem.id)
                  params.set('scopeSource', 'manage-card-flow')
                  navigate(`/manage/class-attendance?${params.toString()}`)
                }}
              >
                <h3 className="text-base font-semibold leading-tight">
                  {formatClassDateTime(classItem.startsAt, classItem.endsAt)}
                </h3>
                <p className="mt-2 text-xs text-muted-foreground">Class ID: {classItem.id.slice(0, 8)}</p>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
