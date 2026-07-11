import { loader as giftCardsLoader } from './gift-cards'

import type { Route } from './+types/gift-cards.table-data'

export async function loader(args: Route.LoaderArgs) {
  const url = new URL(args.request.url)
  const dataUrl = new URL('/manage/gift-cards', url.origin)
  const sourceSearch = new URLSearchParams(url.search)
  sourceSearch.set('_deferTable', '1')
  dataUrl.search = sourceSearch.toString()
  const request = new Request(dataUrl.toString(), args.request)

  return giftCardsLoader({ ...args, request } as Parameters<typeof giftCardsLoader>[0])
}
