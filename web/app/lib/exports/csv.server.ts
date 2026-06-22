const escapeCsvValue = (value: unknown) => {
  const text = value == null ? '' : String(value)
  if (text.includes('"')) {
    const escaped = text.replaceAll('"', '""')
    return `"${escaped}"`
  }
  if (text.includes(',') || text.includes('\n') || text.includes('\r')) {
    return `"${text}"`
  }
  return text
}

export const buildCsv = ({
  columns,
  rows,
}: {
  columns: string[]
  rows: Array<Record<string, unknown>>
}) => {
  const header = columns.map(escapeCsvValue).join(',')
  const body = rows.map(row => columns.map(column => escapeCsvValue(row[column])).join(',')).join('\n')
  return `${header}\n${body}`
}
