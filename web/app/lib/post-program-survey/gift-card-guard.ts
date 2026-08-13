export const isLastWorkshopClass = ({
  classId,
  classEndsAt,
  workshopClasses,
}: {
  classId: string
  classEndsAt: string
  workshopClasses: Array<{ id: string; ends_at: string }>
}) => {
  const latestEndsAt = workshopClasses.reduce<string | null>((latest, row) => (!latest || row.ends_at > latest ? row.ends_at : latest), null)
  return latestEndsAt === classEndsAt && workshopClasses.some(row => row.id === classId)
}
