import { redirect } from 'react-router'

import type { Route } from './+types/profile'
import { createClient } from '@/lib/supabase/server'

export const meta = ({ }: Route.MetaArgs) => {
  return [
    { title: 'Profile' },
    { name: 'description', content: 'Profile' },
  ]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers } = createClient(request)
  const { data } = await supabase.auth.getUser()

  if (!data.user) {
    throw redirect('/login', { headers })
  }

  throw redirect(`/profile/${data.user.id}`, { headers })
}

export default function Profile() {
  return null
}
