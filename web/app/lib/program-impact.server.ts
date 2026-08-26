import { adminClient } from '@/lib/supabase/adminClient'

import type { Database } from './database.types'

type ImpactRow = Database['public']['Functions']['get_program_impact']['Returns'][number]

export type ProgramImpactSummary = {
  families: number
  people: number
  children: number
  cards: number
  value: number
}

export type ProgramImpactResult = {
  semesters: Array<{ id: string; name: string; startsAt: string }>
  selectedSemesterId: string | null
  asOf: string
  allRecipients: ProgramImpactSummary
  participating: ProgramImpactSummary
  provisional: ProgramImpactSummary
  rows: ImpactRow[]
  exceptions: {
    graphPeopleFallback: number
    graphChildrenFallback: number
    attendanceThresholdFailure: number
    newestEvidenceFailure: number
    noAcceptedWorkshop: number
  }
}

const sumSummary = (rows: ImpactRow[]): ProgramImpactSummary => ({
  families: rows.length,
  people: rows.reduce((total, row) => total + row.people, 0),
  children: rows.reduce((total, row) => total + row.children, 0),
  cards: rows.reduce((total, row) => total + row.sent_card_count, 0),
  value: rows.reduce((total, row) => total + row.sent_card_value, 0),
})

export async function loadProgramImpact({
  semesterId,
  asOf = new Date().toISOString(),
}: {
  semesterId?: string | null
  asOf?: string
} = {}): Promise<ProgramImpactResult> {
  const [{ data: semesters, error: semesterError }, { data: rows, error: impactError }] = await Promise.all([
    adminClient
      .from('semester')
      .select('id, name, starts_at')
      .order('starts_at', { ascending: false }),
    adminClient.rpc('get_program_impact', {
      p_as_of: asOf,
      p_semester_id: semesterId || undefined,
    }),
  ])

  if (semesterError) throw new Error(`Failed to load semesters: ${semesterError.message}`)
  if (impactError) throw new Error(`Failed to load program impact: ${impactError.message}`)

  const normalizedRows = (rows ?? []) as ImpactRow[]
  const recipientRows = normalizedRows.filter(row => row.sent_card_count > 0)
  const participatingRows = recipientRows.filter(row =>
    row.participation_classification === 'participating' || row.participation_classification === 'provisional'
  )
  const provisionalRows = recipientRows.filter(row => row.participation_classification === 'provisional')

  return {
    semesters: (semesters ?? []).map(semester => ({
      id: semester.id,
      name: semester.name ?? 'Unnamed semester',
      startsAt: semester.starts_at,
    })),
    selectedSemesterId: semesterId || null,
    asOf,
    allRecipients: sumSummary(recipientRows),
    participating: sumSummary(participatingRows),
    provisional: sumSummary(provisionalRows),
    rows: normalizedRows,
    exceptions: {
      graphPeopleFallback: recipientRows.filter(row => row.people_source === 'family_graph').length,
      graphChildrenFallback: recipientRows.filter(row => row.children_source === 'family_graph').length,
      attendanceThresholdFailure: recipientRows.filter(row => row.participation_classification === 'not_participating').length,
      newestEvidenceFailure: recipientRows.filter(
        row => row.eligible_attendance_rows > 0 && row.newest_row_evidence_count === 0
      ).length,
      noAcceptedWorkshop: recipientRows.filter(row => row.eligible_attendance_rows === 0).length,
    },
  }
}
