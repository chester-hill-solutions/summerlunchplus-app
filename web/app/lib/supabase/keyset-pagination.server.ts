export type KeysetPaginationStats = {
  pagesRead: number
  rowsScanned: number
  finalCursor: string | null
}

export async function scanByIdKeyset<Row extends { id: string }>({
  batchSize,
  fetchPage,
  onPage,
}: {
  batchSize: number
  fetchPage: (afterId: string | null) => Promise<Row[]>
  onPage: (rows: Row[]) => Promise<void> | void
}): Promise<KeysetPaginationStats> {
  if (!Number.isFinite(batchSize) || batchSize <= 0) {
    throw new Error(`Invalid keyset batch size: ${batchSize}`)
  }

  let pagesRead = 0
  let rowsScanned = 0
  let afterId: string | null = null

  while (true) {
    const rows = await fetchPage(afterId)
    if (!rows.length) break

    pagesRead += 1
    rowsScanned += rows.length

    await onPage(rows)

    const nextCursor = rows[rows.length - 1]?.id ?? null
    if (!nextCursor) break
    if (afterId && nextCursor <= afterId) {
      throw new Error(`Keyset cursor did not advance: afterId=${afterId}, nextCursor=${nextCursor}`)
    }

    afterId = nextCursor
    if (rows.length < batchSize) break
  }

  return {
    pagesRead,
    rowsScanned,
    finalCursor: afterId,
  }
}
