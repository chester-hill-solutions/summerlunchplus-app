import { parse } from 'csv-parse/sync'

export type GiftCardCsvAsset = {
  url: string
  accountNumber: string
  pin: string
  value: number
  provider: 'PC' | 'Sobeys'
  rowNumber: number
}

export type GiftCardCsvParseResult = {
  assets: GiftCardCsvAsset[]
  errors: string[]
}

export type GiftCardCsvColumnMapping = {
  url?: string
  account_number?: string
  pin?: string
  value?: string
  provider?: string
}

type ParseOptions = {
  columnMapping?: GiftCardCsvColumnMapping
  defaultProvider?: 'PC' | 'Sobeys' | ''
}

const toNumber = (value: string | number | null | undefined) => {
  if (typeof value === 'number') return Number.isNaN(value) ? null : value
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/[$,]/g, '')
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isNaN(parsed) ? null : parsed
}

const REQUIRED_HEADERS = ['url', 'account_number', 'pin', 'value'] as const

const normalizeHeader = (header: string) => header.trim().toLowerCase().replace(/\s+/g, '_')

const parseProvider = (value: string) => {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'pc') return 'PC'
  if (normalized === 'presidents choice') return 'PC'
  if (normalized === "president's choice") return 'PC'
  if (normalized === 'president’s choice') return 'PC'
  if (normalized === 'sobeys') return 'Sobeys'
  return null
}

const valueFromRow = ({
  row,
  canonicalHeader,
  mappedHeader,
}: {
  row: Record<string, string | undefined>
  canonicalHeader: string
  mappedHeader?: string
}) => {
  const mapped = (mappedHeader ?? '').trim()
  if (mapped) {
    return (row[normalizeHeader(mapped)] ?? '').trim()
  }
  return (row[canonicalHeader] ?? '').trim()
}

export const parseGiftCardCsv = (csvText: string, options: ParseOptions = {}): GiftCardCsvParseResult => {
  const rawRecords = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string | undefined>[]

  const records = rawRecords.map(row => {
    const normalized: Record<string, string | undefined> = {}
    for (const [key, value] of Object.entries(row)) {
      normalized[normalizeHeader(key)] = value
    }
    return normalized
  })

  const assets: GiftCardCsvAsset[] = []
  const errors: string[] = []
  const mapping = options.columnMapping ?? {}
  const defaultProvider = options.defaultProvider ?? ''

  const presentHeaders = new Set<string>()
  for (const row of records) {
    for (const key of Object.keys(row)) {
      presentHeaders.add(key)
    }
  }
  for (const header of REQUIRED_HEADERS) {
    const mappedHeader = (mapping[header as keyof GiftCardCsvColumnMapping] ?? '').trim()
    const expectedHeader = mappedHeader ? normalizeHeader(mappedHeader) : header
    if (!presentHeaders.has(expectedHeader)) {
      errors.push(`Missing required column: ${header}`)
    }
  }

  const mappedProviderHeader = (mapping.provider ?? '').trim()
  if (!defaultProvider) {
    const expectedProviderHeader = mappedProviderHeader ? normalizeHeader(mappedProviderHeader) : 'provider'
    if (!presentHeaders.has(expectedProviderHeader)) {
      errors.push('Missing required provider source: choose a provider column or a default provider value')
    }
  }

  if (errors.length) {
    return { assets: [], errors }
  }

  records.forEach((row, index) => {
    const rowNumber = index + 2
    const url = valueFromRow({ row, canonicalHeader: 'url', mappedHeader: mapping.url })
    const accountNumber = valueFromRow({ row, canonicalHeader: 'account_number', mappedHeader: mapping.account_number })
    const pin = valueFromRow({ row, canonicalHeader: 'pin', mappedHeader: mapping.pin })
    const providerRaw =
      valueFromRow({ row, canonicalHeader: 'provider', mappedHeader: mapping.provider }) ||
      defaultProvider

    if (!url) {
      errors.push(`Row ${rowNumber}: missing url`)
      return
    }
    if (!accountNumber) {
      errors.push(`Row ${rowNumber}: missing account_number`)
      return
    }
    if (!pin) {
      errors.push(`Row ${rowNumber}: missing pin`)
      return
    }

    const provider = parseProvider(providerRaw)
    if (!provider) {
      errors.push(`Row ${rowNumber}: provider must be PC or Sobeys`)
      return
    }

    const valueRaw = valueFromRow({ row, canonicalHeader: 'value', mappedHeader: mapping.value })
    const value = toNumber(valueRaw)
    if (value === null) {
      errors.push(`Row ${rowNumber}: missing gift card value`)
      return
    }

    assets.push({
      url,
      accountNumber,
      pin,
      value,
      provider,
      rowNumber,
    })
  })

  return { assets, errors }
}
