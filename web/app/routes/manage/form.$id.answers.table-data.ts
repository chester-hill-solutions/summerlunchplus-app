import { loader as formAnswersLoader } from './form.$id.answers'

import type { Route } from './+types/form.$id.answers.table-data'

export async function loader(args: Route.LoaderArgs) {
  const url = new URL(args.request.url)
  const dataUrl = new URL(`/manage/form/${args.params.formID}/answers`, url.origin)
  const sourceSearch = new URLSearchParams(url.search)
  sourceSearch.set('_deferTable', '1')
  dataUrl.search = sourceSearch.toString()
  const request = new Request(dataUrl.toString(), args.request)

  return formAnswersLoader({ ...args, request } as Parameters<typeof formAnswersLoader>[0])
}
