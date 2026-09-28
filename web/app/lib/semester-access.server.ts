const addCalendarMonth = (date: Date) => {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()
  const lastDayOfTargetMonth = new Date(Date.UTC(year, month + 2, 0)).getUTCDate()

  return new Date(Date.UTC(
    year,
    month + 1,
    Math.min(day, lastDayOfTargetMonth),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  ))
}

export const semesterAccessExpiresAt = (semesterEndsAt: string | null | undefined) => {
  if (!semesterEndsAt) return null

  const endsAt = new Date(semesterEndsAt)
  if (!Number.isFinite(endsAt.getTime())) return null

  return addCalendarMonth(endsAt)
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
