import { loader as classLoader } from './class'

import type { Route } from './+types/class.table-data'

export async function loader(args: Route.LoaderArgs) {
  const url = new URL(args.request.url)
  const dataUrl = new URL('/manage/class', url.origin)
  const sourceSearch = new URLSearchParams(url.search)
  sourceSearch.set('_deferTable', '1')
  dataUrl.search = sourceSearch.toString()
  const request = new Request(dataUrl.toString(), args.request)

  return classLoader({ ...args, request } as Parameters<typeof classLoader>[0])
}
