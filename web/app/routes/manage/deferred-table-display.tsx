import { useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { useFetcher, useLocation } from 'react-router'

import TableDisplay, { type LoaderData } from './table-display'

type DeferredTableDisplayProps = {
  dataPath: string
  fallbackLabel: string
  fallbackTableName: string
  headerActions?: ReactNode
  paginationActions?: ReactNode
}

export default function DeferredTableDisplay({
  dataPath,
  fallbackLabel,
  fallbackTableName,
  headerActions,
  paginationActions,
}: DeferredTableDisplayProps) {
  const fetcher = useFetcher<LoaderData>()
  const location = useLocation()
  const lastRequestedUrlRef = useRef<string | null>(null)

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
  }, [dataRequestUrl])

  const data =
    fetcher.data ??
    ({
      columns: [],
      rows: [],
      label: fallbackLabel,
      tableName: fallbackTableName,
    } satisfies LoaderData)

  return (
    <div className="space-y-2">
      {fetcher.state !== 'idle' && !fetcher.data ? (
        <div className="rounded border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Loading {fallbackLabel.toLowerCase()}...
        </div>
      ) : null}
      <TableDisplay headerActions={headerActions} paginationActions={paginationActions} data={data} />
    </div>
  )
}
