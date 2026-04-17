import { expect, test } from '@playwright/test'

import { parseGiftCardCsv } from '../../app/lib/gift-cards/parse-csv'

test('parses csv links with explicit values', () => {
  const csv = `link,value,provider
https://example.com/card-1,40,Provider A
https://example.com/card-2,25.50,Provider B
`

  const result = parseGiftCardCsv(csv)

  expect(result.errors).toEqual([])
  expect(result.assets).toEqual([
    {
      linkUrl: 'https://example.com/card-1',
      value: 40,
      provider: 'Provider A',
      rowNumber: 2,
    },
    {
      linkUrl: 'https://example.com/card-2',
      value: 25.5,
      provider: 'Provider B',
      rowNumber: 3,
    },
  ])
})

test('uses default value when missing', () => {
  const csv = `url
https://example.com/card-1
`

  const result = parseGiftCardCsv(csv, { defaultValue: 40 })

  expect(result.errors).toEqual([])
  expect(result.assets).toEqual([
    {
      linkUrl: 'https://example.com/card-1',
      value: 40,
      provider: undefined,
      rowNumber: 2,
    },
  ])
})

test('reports missing fields', () => {
  const csv = `link,value
,
https://example.com/card-2,
`

  const result = parseGiftCardCsv(csv)

  expect(result.assets).toEqual([])
  expect(result.errors).toEqual([
    'Row 2: missing gift card link',
    'Row 3: missing gift card value',
  ])
})
