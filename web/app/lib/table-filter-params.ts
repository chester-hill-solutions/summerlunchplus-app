export const FILTER_EMPTY_TOKEN = '__none__'

export type FilterClause =
  | { op: 'in'; values: string[] }
  | { op: 'not_in'; values: string[] }
  | { op: 'is_empty' }
  | { op: 'is_not_empty' }

const encodeValue = (value: string) => encodeURIComponent(value)
const decodeValue = (value: string) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export const parseFilterClauseValues = (values: string[]): FilterClause | null => {
  const uniqueValues = Array.from(new Set(values))
  if (!uniqueValues.length) return null

  if (uniqueValues.length === 1) {
    const [single] = uniqueValues
    if (single === 'is_empty') return { op: 'is_empty' }
    if (single === 'is_not_empty') return { op: 'is_not_empty' }
    if (single.startsWith('in:')) {
      const payload = single.slice('in:'.length)
      const parsed = payload ? payload.split(',').map(decodeValue) : []
      return { op: 'in', values: Array.from(new Set(parsed)) }
    }
    if (single.startsWith('not_in:')) {
      const payload = single.slice('not_in:'.length)
      const parsed = payload ? payload.split(',').map(decodeValue) : []
      return { op: 'not_in', values: Array.from(new Set(parsed)) }
    }
  }

  const hasLegacyEmpty = uniqueValues.includes(FILTER_EMPTY_TOKEN)
  const explicitValues = uniqueValues.filter(value => value !== FILTER_EMPTY_TOKEN)

  if (hasLegacyEmpty && !explicitValues.length) {
    return { op: 'is_empty' }
  }
  if (hasLegacyEmpty && explicitValues.length) {
    return { op: 'in', values: Array.from(new Set([...explicitValues, ''])) }
  }
  return { op: 'in', values: explicitValues }
}

export const parseFilterClausesFromSearchParams = (
  searchParams: URLSearchParams,
  columns: string[]
): Record<string, FilterClause> => {
  return columns.reduce<Record<string, FilterClause>>((acc, column) => {
    const values = searchParams.getAll(`f_${column}`)
    const clause = parseFilterClauseValues(values)
    if (clause) {
      acc[column] = clause
    }
    return acc
  }, {})
}

export const serializeFilterClause = (clause: FilterClause): string => {
  if (clause.op === 'is_empty') return 'is_empty'
  if (clause.op === 'is_not_empty') return 'is_not_empty'
  const encodedValues = Array.from(new Set(clause.values)).map(encodeValue)
  return `${clause.op}:${encodedValues.join(',')}`
}

export const filterClauseSignature = (clause: FilterClause): string => {
  if (clause.op === 'is_empty' || clause.op === 'is_not_empty') return clause.op
  return `${clause.op}:${clause.values.slice().sort((a, b) => a.localeCompare(b)).join('|')}`
}

export const matchesFilterClause = (cellValue: string, clause: FilterClause) => {
  if (clause.op === 'is_empty') return cellValue === ''
  if (clause.op === 'is_not_empty') return cellValue !== ''
  if (clause.op === 'in') return clause.values.includes(cellValue)
  return !clause.values.includes(cellValue)
}
