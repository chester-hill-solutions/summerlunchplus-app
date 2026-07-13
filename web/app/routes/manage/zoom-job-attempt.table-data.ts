import { loader as zoomJobAttemptLoader } from './zoom-job-attempt'

import type { Route } from './+types/zoom-job-attempt.table-data'

export async function loader(args: Route.LoaderArgs) {
  const url = new URL(args.request.url)
  const dataUrl = new URL('/manage/zoom-job-attempt', url.origin)
  const sourceSearch = new URLSearchParams(url.search)
  sourceSearch.set('_deferTable', '1')
  dataUrl.search = sourceSearch.toString()
  const request = new Request(dataUrl.toString(), args.request)

  return zoomJobAttemptLoader({ ...args, request } as Parameters<typeof zoomJobAttemptLoader>[0])
}
