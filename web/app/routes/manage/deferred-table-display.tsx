import { useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { useFetcher, useLocation } from 'react-router'

import TableDisplay, { type LoaderData } from './table-display'

type DeferredTableDisplayProps = {
  dataPath: string
  fallbackData: LoaderData
  headerActions?: ReactNode
  paginationActions?: ReactNode
}

export default function DeferredTableDisplay({
  dataPath,
  fallbackData,
  headerActions,
  paginationActions,
}: DeferredTableDisplayProps) {
  const fetcher = useFetcher<LoaderData>()
  const location = useLocation()
  const lastRequestedUrlRef = useRef<string | null>(null)
  const lastResolvedDataRef = useRef<LoaderData | null>(null)

  const dataRequestUrl = useMemo(() => {
    const [basePath, existingQuery = ''] = dataPath.split('?')
    const next = new URLSearchParams(existingQuery)
    const routeSearch = new URLSearchParams(location.search)
    for (const [key, value] of routeSearch.entries()) {
      next.set(key, value)
    }
    const query = next.toString()
    return query ? `${basePath}?${query}` : basePath
  }, [dataPath, location.search])

  useEffect(() => {
    if (lastRequestedUrlRef.current === dataRequestUrl) return
    lastRequestedUrlRef.current = dataRequestUrl
    fetcher.load(dataRequestUrl)
  }, [dataRequestUrl, fetcher])

  useEffect(() => {
    if (!fetcher.data) return
    lastResolvedDataRef.current = fetcher.data
  }, [fetcher.data])

  const resolvedData = fetcher.data ?? lastResolvedDataRef.current ?? fallbackData
  const data: LoaderData = {
    ...resolvedData,
    label: fallbackData.label,
    tableName: fallbackData.tableName,
  }

  const rowLoadingMessage =
    fetcher.state !== 'idle'
      ? fetcher.data || lastResolvedDataRef.current
        ? 'Refreshing table rows...'
        : 'Loading table rows...'
      : null

  const mergedPaginationActions =
    rowLoadingMessage || paginationActions ? (
      <div className="flex items-center gap-2">
        {rowLoadingMessage ? (
          <span className="rounded border border-border bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground">
            {rowLoadingMessage}
          </span>
        ) : null}
        {paginationActions}
      </div>
    ) : undefined

  return (
    <TableDisplay
      headerActions={headerActions}
      paginationActions={mergedPaginationActions}
      data={data}
    />
  )
}
