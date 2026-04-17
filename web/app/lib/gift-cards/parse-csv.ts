import { parse } from 'csv-parse/sync'

export type GiftCardCsvAsset = {
  linkUrl: string
  value: number
  provider?: string
  rowNumber: number
}

export type GiftCardCsvParseResult = {
  assets: GiftCardCsvAsset[]
  errors: string[]
}

type ParseOptions = {
  defaultValue?: number
}

const toNumber = (value: string | number | null | undefined) => {
  if (typeof value === 'number') return Number.isNaN(value) ? null : value
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/[$,]/g, '')
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isNaN(parsed) ? null : parsed
}

const pickLink = (row: Record<string, string | undefined>) => {
  return (
    row.link ||
    row.url ||
    row.card_url ||
    row.gift_card_url ||
    row['gift card url'] ||
    ''
  ).trim()
}

export const parseGiftCardCsv = (csvText: string, options: ParseOptions = {}): GiftCardCsvParseResult => {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string | undefined>[]

  const assets: GiftCardCsvAsset[] = []
  const errors: string[] = []
  const defaultValue = options.defaultValue

  records.forEach((row, index) => {
    const rowNumber = index + 2
    const linkUrl = pickLink(row)
    if (!linkUrl) {
      errors.push(`Row ${rowNumber}: missing gift card link`)
      return
    }

    const value = toNumber(row.value || row.amount) ?? defaultValue ?? null
    if (value === null) {
      errors.push(`Row ${rowNumber}: missing gift card value`)
      return
    }

    assets.push({
      linkUrl,
      value,
      provider: row.provider?.trim() || undefined,
      rowNumber,
    })
  })

  return { assets, errors }
}
