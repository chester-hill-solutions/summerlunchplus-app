import type { LoaderFunctionArgs } from 'react-router'

import { requireAuth } from '@/lib/auth.server'
import { adminClient } from '@/lib/supabase/adminClient'
import { type Database } from '@/lib/database.types'
import { isRoleAtLeast } from '@/lib/roles'
import { createTableLoader } from '@/routes/manage/table-loader'

const baseLoader = createTableLoader('class-enrollment')

const ENROLLMENT_STATUS_ORDER: Record<Database['public']['Enums']['workshop_enrollment_status'], number> = {
  pending: 0,
  waitlisted: 1,
  revoked: 2,
  approved: 3,
  rejected: 4,
}

const toTime = (value: unknown) => {
  if (typeof value !== 'string' || !value) return Number.POSITIVE_INFINITY
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed
}

export async function loadWorkshopEnrollmentData(request: Request) {
  const auth = await requireAuth(request)
  const canManageEnrollments = isRoleAtLeast(auth.claims.role, 'admin')
  const base = await baseLoader(
    { request } as LoaderFunctionArgs,
    { includeForeignKeyOptions: canManageEnrollments }
  )

  const rows = (base.rows ?? []) as Array<Record<string, unknown>>
  const workshopIds = Array.from(
    new Set(rows.map(row => (typeof row.workshop_id === 'string' ? row.workshop_id : '')).filter(Boolean))
  )
  const profileIds = Array.from(
    new Set(rows.map(row => (typeof row.profile_id === 'string' ? row.profile_id : '')).filter(Boolean))
  )

  const approvedByWorkshopId = rows.reduce((acc, row) => {
    const workshopId = typeof row.workshop_id === 'string' ? row.workshop_id : ''
    const status = typeof row.status === 'string' ? row.status : ''
    if (!workshopId || status !== 'approved') {
      return acc
    }
    acc.set(workshopId, (acc.get(workshopId) ?? 0) + 1)
    return acc
  }, new Map<string, number>())

  let workshopCapacityById = new Map<string, number>()
  if (workshopIds.length) {
    const { data: workshopRows, error: workshopError } = await adminClient
      .from('workshop')
      .select('id, capacity')
      .in('id', workshopIds)

    if (!workshopError) {
      workshopCapacityById = (workshopRows ?? []).reduce((acc, workshop) => {
        if (!workshop.id) {
          return acc
        }
        acc.set(workshop.id, workshop.capacity)
        return acc
      }, new Map<string, number>())
    }
  }

  let openSignalsByProfileId = new Map<string, Array<{ severity: string; summary: string }>>()

  if (profileIds.length) {
    const { data: openSignals, error: openSignalsError } = await adminClient
      .from('suspicious_signal')
      .select('family_profile_ids, severity, summary, priority_score')
      .eq('status', 'open')
      .order('priority_score', { ascending: false })
      .order('created_at', { ascending: false })

    if (!openSignalsError) {
      openSignalsByProfileId = (openSignals ?? []).reduce(
        (acc, signal) => {
          for (const profileId of signal.family_profile_ids ?? []) {
            if (!profileIds.includes(profileId)) continue
            const existing = acc.get(profileId) ?? []
            existing.push({ severity: signal.severity, summary: signal.summary })
            acc.set(profileId, existing)
          }
          return acc
        },
        new Map<string, Array<{ severity: string; summary: string }>>()
      )
    }
  }

  const enrichedRows: Array<Record<string, unknown>> = rows.map(row => {
    const workshopId = typeof row.workshop_id === 'string' ? row.workshop_id : ''
    const approved = workshopId ? approvedByWorkshopId.get(workshopId) ?? 0 : 0
    const capacity = workshopId ? workshopCapacityById.get(workshopId) ?? null : null

    const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
    const profileSignals = profileId ? openSignalsByProfileId.get(profileId) ?? [] : []

    const baseRow = {
      ...row,
      enrolled_capacity: capacity === null ? `${approved}/-` : `${approved}/${capacity}`,
      riding_display: '...',
      geo_locations_display: '...',
      giftcard_display: '...',
      prior_participation_display: '...',
      profile_hover_top_discrepancy: '',
      profile_hover_more_discrepancies: '',
      profile_hover_name: '',
      profile_hover_parent_name: '',
      profile_hover_email: '',
      profile_hover_student_phone: '',
      profile_hover_parent_email: '',
      profile_hover_parent_phone: '',
      profile_hover_student_geo: '',
      profile_hover_parent_geo: '',
      profile_hover_student_submitted_address: '',
      profile_hover_parent_address: '',
    }

    if (!profileSignals.length) {
      return baseRow
    }

    const hasHigh = profileSignals.some(signal => signal.severity === 'high')
    const primarySignal = profileSignals[0]
    const countLabel = profileSignals.length === 1 ? '1 open signal' : `${profileSignals.length} open signals`

    return {
      ...baseRow,
      _row_class: hasHigh ? 'bg-amber-50' : 'bg-amber-50/70',
      _row_signal_summary: `${countLabel}: ${primarySignal.summary}`,
    }
  })

  enrichedRows.sort((left, right) => {
    const leftStatus =
      typeof left.status === 'string'
        ? (left.status as Database['public']['Enums']['workshop_enrollment_status'])
        : 'rejected'
    const rightStatus =
      typeof right.status === 'string'
        ? (right.status as Database['public']['Enums']['workshop_enrollment_status'])
        : 'rejected'

    const statusDiff = ENROLLMENT_STATUS_ORDER[leftStatus] - ENROLLMENT_STATUS_ORDER[rightStatus]
    if (statusDiff !== 0) {
      return statusDiff
    }

    const timeDiff = toTime(right.requested_at) - toTime(left.requested_at)
    if (timeDiff !== 0) {
      return timeDiff
    }

    const leftId = typeof left.id === 'string' ? left.id : ''
    const rightId = typeof right.id === 'string' ? right.id : ''
    return leftId.localeCompare(rightId)
  })

  let columns = base.columns.includes('enrolled_capacity')
    ? base.columns
    : [...base.columns.slice(0, 2), 'enrolled_capacity', ...base.columns.slice(2)]

  if (!columns.includes('riding_display')) {
    const profileIndex = columns.indexOf('profile_display')
    if (profileIndex >= 0) {
      columns = [...columns.slice(0, profileIndex + 1), 'riding_display', ...columns.slice(profileIndex + 1)]
    } else {
      columns = [...columns, 'riding_display']
    }
  }

  if (!columns.includes('giftcard_display')) {
    const geoLocationsIndex = columns.indexOf('geo_locations_display')
    if (geoLocationsIndex >= 0) {
      columns = [...columns.slice(0, geoLocationsIndex + 1), 'giftcard_display', ...columns.slice(geoLocationsIndex + 1)]
    } else {
      const ridingIndex = columns.indexOf('riding_display')
      if (ridingIndex >= 0) {
        columns = [...columns.slice(0, ridingIndex + 1), 'giftcard_display', ...columns.slice(ridingIndex + 1)]
      } else {
        const profileIndex = columns.indexOf('profile_display')
        if (profileIndex >= 0) {
          columns = [...columns.slice(0, profileIndex + 1), 'giftcard_display', ...columns.slice(profileIndex + 1)]
        } else {
          columns = [...columns, 'giftcard_display']
        }
      }
    }
  }

  if (!columns.includes('geo_locations_display')) {
    const ridingIndex = columns.indexOf('riding_display')
    if (ridingIndex >= 0) {
      columns = [...columns.slice(0, ridingIndex + 1), 'geo_locations_display', ...columns.slice(ridingIndex + 1)]
    } else {
      const profileIndex = columns.indexOf('profile_display')
      if (profileIndex >= 0) {
        columns = [...columns.slice(0, profileIndex + 1), 'geo_locations_display', ...columns.slice(profileIndex + 1)]
      } else {
        columns = [...columns, 'geo_locations_display']
      }
    }
  }

  if (!columns.includes('prior_participation_display')) {
    const giftcardIndex = columns.indexOf('giftcard_display')
    if (giftcardIndex >= 0) {
      columns = [
        ...columns.slice(0, giftcardIndex + 1),
        'prior_participation_display',
        ...columns.slice(giftcardIndex + 1),
      ]
    } else {
      const profileIndex = columns.indexOf('profile_display')
      if (profileIndex >= 0) {
        columns = [...columns.slice(0, profileIndex + 1), 'prior_participation_display', ...columns.slice(profileIndex + 1)]
      } else {
        columns = [...columns, 'prior_participation_display']
      }
    }
  }

  if (columns.includes('semester_title')) {
    columns = [...columns.filter(column => column !== 'semester_title'), 'semester_title']
  } else if (columns.includes('semester_range')) {
    columns = [...columns.filter(column => column !== 'semester_range'), 'semester_range']
  }

  const baseColumnMeta = (base.columnMeta ?? {}) as Record<
    string,
    {
      label?: string
      truncate?: boolean
      filterable?: boolean
      numeric?: boolean
      maxChars?: number
      minWidth?: number
      preferredWidth?: number
      fitContentOnLoad?: boolean
      hoverCard?: unknown
    }
  >

  return {
    ...base,
    columns,
    rows: enrichedRows,
    columnMeta: {
      ...baseColumnMeta,
      profile_display: {
        ...(baseColumnMeta.profile_display ?? {}),
        hoverCard: {
          titleField: 'profile_hover_name',
          titleFallback: 'N/A',
          columns: {
            rightTitleField: 'profile_hover_parent_name',
            rightTitleFallback: 'Parent',
            left: [
              { label: '', field: 'profile_hover_email', fallback: '' },
              { label: '', field: 'profile_hover_student_phone', fallback: '' },
              { label: '', field: 'profile_hover_student_geo', fallback: '' },
              { label: '', field: 'profile_hover_student_submitted_address', fallback: '' },
            ],
            right: [
              { label: '', field: 'profile_hover_parent_email', fallback: '' },
              { label: '', field: 'profile_hover_parent_phone', fallback: '' },
              { label: '', field: 'profile_hover_parent_geo', fallback: '' },
              { label: '', field: 'profile_hover_parent_address', fallback: '' },
            ],
          },
          fields: [
            { label: 'Top Discrepancy', field: 'profile_hover_top_discrepancy' },
            { label: 'More Open', field: 'profile_hover_more_discrepancies' },
          ],
        },
      },
      enrolled_capacity: {
        label: 'enrolled',
      },
      riding_display: {
        label: 'riding',
      },
      geo_locations_display: {
        label: 'geo locations',
        fitContentOnLoad: true,
      },
      giftcard_display: {
        label: 'giftcard',
        maxChars: 6,
      },
      prior_participation_display: {
        label: 'been before?',
        minWidth: 60,
        preferredWidth: 60,
      },
      semester_title: {
        label: 'semester',
      },
      semester_range: {
        label: 'semester',
      },
    },
    canEditStatus: isRoleAtLeast(auth.claims.role, 'staff'),
    editorConfig: canManageEnrollments ? base.editorConfig : undefined,
    foreignKeyOptions: canManageEnrollments ? base.foreignKeyOptions : undefined,
  }
}
