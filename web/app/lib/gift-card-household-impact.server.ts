import { loadProgramImpact } from './program-impact.server'
import { adminClient } from './supabase/adminClient'

export type GiftCardHouseholdImpact = {
  families: number
  people: number
  children: number
  cards: number
  value: number
  activeAttendanceRows: number
  activeAttendanceProfiles: number
  activeAttendanceFamilies: number
  activeAttendancePeople: number
  activeAttendanceChildren: number
  sentCardAttendanceRows: number
  sentCardAttendanceProfiles: number
}

type GiftCardHouseholdSummary = Pick<GiftCardHouseholdImpact, 'families' | 'people' | 'children' | 'cards' | 'value'>

export async function loadGiftCardHouseholdImpact(): Promise<GiftCardHouseholdImpact> {
  const [result, { data: attendanceImpact, error: attendanceImpactError }, { data: sentAllocations, error: allocationError }] = await Promise.all([
    loadProgramImpact(),
    adminClient.rpc('get_attendance_household_impact'),
    adminClient
      .from('gift_card_asset')
      .select('gift_card_allocation(profile_id, class_id)')
      .not('sent_at', 'is', null),
  ])
  if (attendanceImpactError) throw new Error(`Failed to load attendance household impact: ${attendanceImpactError.message}`)
  if (allocationError) throw new Error(`Failed to load sent card allocations: ${allocationError.message}`)

  const recipientRows = result.rows.filter(row => row.sent_card_count > 0)
  const sentAllocationKeys = new Set<string>()
  const sentCardProfileIds = new Set<string>()
  for (const asset of sentAllocations ?? []) {
    const allocation = Array.isArray(asset.gift_card_allocation)
      ? asset.gift_card_allocation[0]
      : asset.gift_card_allocation
    if (!allocation?.profile_id || !allocation.class_id) continue
    sentAllocationKeys.add(`${allocation.profile_id}:${allocation.class_id}`)
    sentCardProfileIds.add(allocation.profile_id)
  }

  const { data: sentAttendance, error: sentAttendanceError } = sentAllocationKeys.size
    ? await adminClient
        .from('class_attendance')
        .select('profile_id, class_id')
        .eq('state', 'active')
        .in('profile_id', Array.from(sentCardProfileIds))
    : { data: [], error: null }
  if (sentAttendanceError) throw new Error(`Failed to load sent card attendance: ${sentAttendanceError.message}`)

  const sentCardAttendance = (sentAttendance ?? []).filter(attendance =>
    sentAllocationKeys.has(`${attendance.profile_id}:${attendance.class_id}`)
  )
  const activeAttendance = attendanceImpact?.[0] ?? {
    attendance_rows: 0,
    attendance_profiles: 0,
    families: 0,
    people: 0,
    children: 0,
  }

  const householdSummary = recipientRows.reduce<GiftCardHouseholdSummary>(
    (summary, row) => ({
      families: summary.families + 1,
      people: summary.people + row.people,
      children: summary.children + row.children,
      cards: summary.cards + row.sent_card_count,
      value: summary.value + row.sent_card_value,
    }),
    { families: 0, people: 0, children: 0, cards: 0, value: 0 }
  )

  return {
    ...householdSummary,
    activeAttendanceRows: activeAttendance.attendance_rows,
    activeAttendanceProfiles: activeAttendance.attendance_profiles,
    activeAttendanceFamilies: activeAttendance.families,
    activeAttendancePeople: activeAttendance.people,
    activeAttendanceChildren: activeAttendance.children,
    sentCardAttendanceRows: sentCardAttendance.length,
    sentCardAttendanceProfiles: new Set(sentCardAttendance.map(row => row.profile_id)).size,
  }
}
