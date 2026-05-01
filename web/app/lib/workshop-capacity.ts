export type WorkshopCapacitySource = {
  id: string
  capacity: number | null
  wait_list_capacity: number | null
}

export type WorkshopEnrollmentSource = {
  workshop_id: string | null
  status: string | null
}

export type WorkshopCapacitySnapshot = {
  workshopId: string
  capacity: number
  waitListCapacity: number
  approvedCount: number
  waitlistedCount: number
  pendingCount: number
  capacityRemaining: number
  waitListRemaining: number
}

export type WorkshopEnrollmentAction = 'enroll' | 'waitlist' | 'full'

const toNonNegativeInteger = (value: number | null | undefined) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  return Math.max(0, Math.trunc(value))
}

const emptySnapshot = (workshopId: string, capacity: number, waitListCapacity: number): WorkshopCapacitySnapshot => ({
  workshopId,
  capacity,
  waitListCapacity,
  approvedCount: 0,
  waitlistedCount: 0,
  pendingCount: 0,
  capacityRemaining: capacity,
  waitListRemaining: waitListCapacity,
})

export const buildWorkshopCapacityMap = (
  workshops: WorkshopCapacitySource[],
  enrollments: WorkshopEnrollmentSource[]
) => {
  const byWorkshopId = new Map<string, WorkshopCapacitySnapshot>()

  for (const workshop of workshops) {
    const capacity = toNonNegativeInteger(workshop.capacity)
    const waitListCapacity = toNonNegativeInteger(workshop.wait_list_capacity)
    byWorkshopId.set(workshop.id, emptySnapshot(workshop.id, capacity, waitListCapacity))
  }

  for (const enrollment of enrollments) {
    if (!enrollment.workshop_id) continue
    const snapshot = byWorkshopId.get(enrollment.workshop_id)
    if (!snapshot) continue

    if (enrollment.status === 'approved') {
      snapshot.approvedCount += 1
      continue
    }

    if (enrollment.status === 'waitlisted') {
      snapshot.waitlistedCount += 1
      continue
    }

    if (enrollment.status === 'pending') {
      snapshot.pendingCount += 1
    }
  }

  for (const snapshot of byWorkshopId.values()) {
    snapshot.capacityRemaining = Math.max(snapshot.capacity - snapshot.approvedCount, 0)
    snapshot.waitListRemaining = Math.max(snapshot.waitListCapacity - snapshot.waitlistedCount, 0)
  }

  return byWorkshopId
}

export const getWorkshopEnrollmentAction = (snapshot: WorkshopCapacitySnapshot): WorkshopEnrollmentAction => {
  if (snapshot.approvedCount < snapshot.capacity) return 'enroll'
  if (snapshot.waitlistedCount < snapshot.waitListCapacity) return 'waitlist'
  return 'full'
}
