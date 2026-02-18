
import { createClient } from '@/lib/supabase/server'
import { type LoaderFunctionArgs, redirect } from 'react-router'

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabase, headers } = createClient(request)
  const { data } = await supabase.auth.getUser()

  if (!data?.user) {
    throw redirect('/login', { headers })
  }

  throw redirect('/home', { headers })
}

export default function ProtectedPage() {
  return null
}
