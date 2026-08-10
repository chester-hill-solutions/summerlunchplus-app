export const participantStatusFromAnswer = (value: unknown) => {
  if (typeof value !== 'string') return 'N/A'
  const normalized = value.trim().toLowerCase()
  if (!normalized) return 'N/A'
  if (normalized === 'no' || normalized.startsWith('no -')) return 'New'
  if (normalized === 'yes' || normalized.startsWith('yes -')) return 'Returning'
  return 'N/A'
}
