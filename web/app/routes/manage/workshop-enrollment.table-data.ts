import { loader as workshopEnrollmentLoader } from './workshop-enrollment'

import type { Route } from './+types/workshop-enrollment.table-data'

export async function loader(args: Route.LoaderArgs) {
  const url = new URL(args.request.url)
  const dataUrl = new URL('/manage/workshop-enrollment', url.origin)
  const sourceSearch = new URLSearchParams(url.search)
  sourceSearch.set('_deferTable', '1')
  dataUrl.search = sourceSearch.toString()
  const request = new Request(dataUrl.toString(), args.request)

  return workshopEnrollmentLoader({ ...args, request } as Parameters<typeof workshopEnrollmentLoader>[0])
}
