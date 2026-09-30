const SEMESTER_ACCESS_GRACE_MS = 40 * 24 * 60 * 60 * 1000

export const semesterAccessExpiresAt = (semesterEndsAt: string | null | undefined) => {
  if (!semesterEndsAt) return null

  const endsAt = new Date(semesterEndsAt)
  if (!Number.isFinite(endsAt.getTime())) return null

  return new Date(endsAt.getTime() + SEMESTER_ACCESS_GRACE_MS)
}

export const isSemesterAccessExpired = ({
  semesterEndsAt,
  now = Date.now(),
}: {
  semesterEndsAt: string | null | undefined
  now?: number
}) => {
  const expiresAt = semesterAccessExpiresAt(semesterEndsAt)
  return expiresAt !== null && expiresAt.getTime() <= now
}
