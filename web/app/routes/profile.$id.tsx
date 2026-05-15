import { redirect, useActionData, useLoaderData } from 'react-router'

import type { Route } from './+types/profile.$id'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/server'

type ActionData = {
  error?: string
  success?: boolean
}

export const meta = ({ data }: Route.MetaArgs) => {
  const title = data?.isOwnProfile ? 'My Profile' : 'Profile'
  return [
    { title },
    { name: 'description', content: title },
  ]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase, headers } = createClient(request)
  const { data } = await supabase.auth.getUser()

  if (!data.user) {
    throw redirect('/login', { headers })
  }

  const profileUserId = params.profileID
  if (!profileUserId) {
    throw redirect(`/profile/${data.user.id}`, { headers })
  }

  const isOwnProfile = data.user.id === profileUserId

  const { data: profile } = await supabase
    .from('profile')
    .select('id, user_id, role, email, firstname, surname, phone, postcode')
    .eq('user_id', profileUserId)
    .maybeSingle()

  return {
    user: data.user,
    profile: profile ?? null,
    isOwnProfile,
  }
}

export async function action({ request, params }: Route.ActionArgs) {
  const { supabase, headers } = createClient(request)
  const { data } = await supabase.auth.getUser()

  if (!data.user) {
    throw redirect('/login', { headers })
  }

  const profileUserId = params.profileID
  if (!profileUserId || data.user.id !== profileUserId) {
    return { error: 'You can only change your own password.' } satisfies ActionData
  }

  const formData = await request.formData()
  const currentPassword = String(formData.get('current_password') ?? '')
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirm_password') ?? '')

  if (!currentPassword) {
    return { error: 'Current password is required.' } satisfies ActionData
  }
  if (!password) {
    return { error: 'Password is required.' } satisfies ActionData
  }
  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters.' } satisfies ActionData
  }
  if (password !== confirmPassword) {
    return { error: 'Passwords do not match.' } satisfies ActionData
  }

  // Supabase recommended pattern for signed-in password updates
  const updatePayload = {
    password,
    currentPassword,
  } as unknown as Parameters<typeof supabase.auth.updateUser>[0]

  const { error } = await supabase.auth.updateUser({
    ...updatePayload,
  })
  if (error) {
    return { error: error.message } satisfies ActionData
  }

  return { success: true } satisfies ActionData
}

export default function ProfileById() {
  const { user, profile, isOwnProfile } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>() as ActionData | undefined

  const profileName =
    [profile?.firstname, profile?.surname].filter(Boolean).join(' ').trim() || profile?.email || user.email || 'Profile'
  const viewedUserId = profile?.user_id ?? user.id

  return (
    <main className="flex min-h-svh w-full flex-col items-center justify-center px-6 py-10">
      <div className="w-full space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{isOwnProfile ? 'My Profile' : 'Profile'}</CardTitle>
            <CardDescription>{profileName}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{profile?.email ?? user.email ?? '-'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">User ID</span>
              <span className="font-mono text-xs">{viewedUserId}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Role</span>
              <span className="font-medium capitalize">{profile?.role ?? '-'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Phone</span>
              <span className="font-medium">{profile?.phone ?? '-'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Postcode</span>
              <span className="font-medium">{profile?.postcode ?? '-'}</span>
            </div>
          </CardContent>
        </Card>

        {isOwnProfile ? (
          <Card>
            <CardHeader>
              <CardTitle>Change password</CardTitle>
              <CardDescription>Update your password for this account.</CardDescription>
            </CardHeader>
            <CardContent>
              <form method="post" className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="current_password">Current password</Label>
                  <Input id="current_password" name="current_password" type="password" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">New password</Label>
                  <Input id="password" name="password" type="password" required minLength={8} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="confirm_password">Confirm new password</Label>
                  <Input id="confirm_password" name="confirm_password" type="password" required minLength={8} />
                </div>

                {actionData?.error ? <p className="text-sm text-destructive">{actionData.error}</p> : null}
                {actionData?.success ? <p className="text-sm text-emerald-700">Password updated successfully.</p> : null}

                <Button type="submit">Save password</Button>
              </form>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  )
}
