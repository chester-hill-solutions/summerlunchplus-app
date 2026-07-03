import { loader as classAttendanceLoader } from './class-attendance'

import type { Route } from './+types/class-attendance.table-data'

export async function loader(args: Route.LoaderArgs) {
  const url = new URL(args.request.url)
  const dataUrl = new URL('/manage/class-attendance', url.origin)
  const sourceSearch = new URLSearchParams(url.search)
  sourceSearch.set('_deferTable', '1')
  dataUrl.search = sourceSearch.toString()
  const request = new Request(dataUrl.toString(), args.request)

  return classAttendanceLoader({ ...args, request } as Parameters<typeof classAttendanceLoader>[0])
}
