import TableDisplay from './table-display'
import type { Route } from './+types/families'
import { createTableLoader } from './table-loader'

const shouldLogFamiliesInstrumentation =
  process.env.NODE_ENV !== 'production' || process.env.VITE_ENABLE_ROUTER_INSTRUMENTATION === 'true'

const baseLoader = createTableLoader('person-guardian-child')

export async function loader(args: Route.LoaderArgs) {
  const startedAt = Date.now()
  if (shouldLogFamiliesInstrumentation) {
    console.info('[manage-families-loader]', {
      event: 'start',
      at: new Date().toISOString(),
      pathname: new URL(args.request.url).pathname,
    })
  }

  const result = await baseLoader(args)

  if (shouldLogFamiliesInstrumentation) {
    console.info('[manage-families-loader]', {
      event: 'complete',
      at: new Date().toISOString(),
      pathname: new URL(args.request.url).pathname,
      durationMs: Date.now() - startedAt,
      rowCount: Array.isArray(result?.rows) ? result.rows.length : null,
    })
  }

  return result
}

export default function FamiliesTablePage() {
  return <TableDisplay />
}
