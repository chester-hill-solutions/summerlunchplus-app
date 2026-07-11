import { expect, test } from '@playwright/test'

import { scanByIdKeyset } from '../../app/lib/supabase/keyset-pagination.server'

const pad = (value: number) => String(value).padStart(4, '0')

test('scanByIdKeyset reads all rows across pages above row-cap-sized datasets', async () => {
  const batchSize = 500
  const rows = Array.from({ length: 1201 }, (_, index) => ({ id: pad(index + 1), value: index + 1 }))
  const visited: string[] = []

  const result = await scanByIdKeyset({
    batchSize,
    fetchPage: async afterId => {
      const filtered = afterId ? rows.filter(row => row.id > afterId) : rows
      return filtered.slice(0, batchSize)
    },
    onPage: pageRows => {
      for (const row of pageRows) {
        visited.push(row.id)
      }
    },
  })

  expect(result.pagesRead).toBe(3)
  expect(result.rowsScanned).toBe(1201)
  expect(result.finalCursor).toBe('1201')
  expect(visited).toHaveLength(1201)
  expect(visited[0]).toBe('0001')
  expect(visited[1200]).toBe('1201')
})

test('scanByIdKeyset returns zero counters for empty scans', async () => {
  const result = await scanByIdKeyset({
    batchSize: 500,
    fetchPage: async () => [],
    onPage: () => {
      throw new Error('onPage should not be called for empty scans')
    },
  })

  expect(result).toEqual({
    pagesRead: 0,
    rowsScanned: 0,
    finalCursor: null,
  })
})

test('scanByIdKeyset fails fast when the cursor does not advance', async () => {
  let callCount = 0

  await expect(
    scanByIdKeyset({
      batchSize: 2,
      fetchPage: async afterId => {
        callCount += 1
        if (!afterId) {
          return [{ id: 'a' }, { id: 'b' }]
        }
        return [{ id: 'a' }, { id: 'b' }]
      },
      onPage: () => {},
    })
  ).rejects.toThrow(/cursor did not advance/i)

  expect(callCount).toBe(2)
})
