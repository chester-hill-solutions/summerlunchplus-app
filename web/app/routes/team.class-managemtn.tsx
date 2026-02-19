import { redirect } from 'react-router'

import type { Route } from './+types/team.class-managemtn'

export const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url)
  url.pathname = '/team/class-management'
  throw redirect(url.toString())
}

export default function TeamClassManagemtnRedirect() {
  return null
}
