import { redirect, useLoaderData } from 'react-router'

import type { Route } from './+types/profile'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

  return { user: data.user }
}

export default function Profile() {
  const { user } = useLoaderData<typeof loader>()

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-4xl flex-col items-center justify-center px-6 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{user.email}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">User ID</span>
            <span className="font-mono text-xs">{user.id}</span>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
