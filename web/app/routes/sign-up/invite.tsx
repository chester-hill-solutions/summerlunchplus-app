import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/adminClient'
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
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router'
import { redirect, useFetcher, useLoaderData } from 'react-router'

type LoaderData = {
  email: string
  role: string
  inviteId: string | null
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabase, headers } = createClient(request)
  const { data: userData } = await supabase.auth.getUser()

  if (!userData.user) {
    throw redirect('/login', { headers })
  }

  const { data: profile } = await supabase
    .from('profile')
    .select('id, email, password_set')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  const email = profile?.email ?? userData.user.email ?? null

  if (!email) {
    throw redirect('/login', { headers })
  }

  if (profile?.password_set) {
    throw redirect('/auth/sign-up-details', { headers })
  }

  const { data: invite } = await supabase
    .from('invites')
    .select('id, role, status')
    .eq('invitee_email', email)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    email,
    role: invite?.role ?? 'guardian',
    inviteId: invite?.id ?? null,
  }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabase, headers } = createClient(request)

  const formData = await request.formData()
  const password = formData.get('password') as string
  const repeatPassword = formData.get('repeat-password') as string
  const inviteId = formData.get('inviteId') as string | null

  if (!password) {
    return { error: 'Password is required' }
  }

  if (password !== repeatPassword) {
    return { error: 'Passwords do not match' }
  }

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    return { error: 'Session unavailable' }
  }

  const authUser = userData.user

  const ensureLinkedProfile = async () => {
    const { data: directProfile, error: directProfileError } = await supabase
      .from('profile')
      .select('id')
      .eq('user_id', authUser.id)
      .maybeSingle()

    if (directProfileError) {
      return { profileId: null, error: directProfileError.message }
    }

    if (directProfile?.id) {
      return { profileId: directProfile.id, error: null }
    }

    const normalizedEmail = authUser.email?.trim().toLowerCase()
    if (!normalizedEmail) {
      return { profileId: null, error: 'Unable to find your profile. Please contact support.' }
    }

    const { data: inviteRoleRow } = inviteId
      ? await adminClient.from('invites').select('role').eq('id', inviteId).maybeSingle()
      : { data: null }
    const inviteRole = inviteRoleRow?.role

    const profileLookup = adminClient
      .from('profile')
      .select('id, user_id, role')
      .eq('email', normalizedEmail)
      .limit(1)

    const { data: profileByEmail, error: profileByEmailError } =
      inviteRole === 'guardian' || inviteRole === 'student'
        ? await profileLookup.eq('role', inviteRole).maybeSingle()
        : await profileLookup.maybeSingle()

    if (profileByEmailError || !profileByEmail?.id) {
      return {
        profileId: null,
        error: profileByEmailError?.message ?? 'Unable to find your profile. Please contact support.',
      }
    }

    if (profileByEmail.user_id && profileByEmail.user_id !== authUser.id) {
      return { profileId: null, error: 'This invite is already linked to another account.' }
    }

    const { error: roleSeedError } = await adminClient
      .from('user_roles')
      .upsert(
        {
          user_id: authUser.id,
          role: profileByEmail.role,
          assigned_by: authUser.id,
        },
        { onConflict: 'user_id' }
      )

    if (roleSeedError) {
      return { profileId: null, error: roleSeedError.message }
    }

    const { error: relinkError } = await adminClient
      .from('profile')
      .update({ user_id: authUser.id })
      .eq('id', profileByEmail.id)

    if (relinkError) {
      return { profileId: null, error: relinkError.message }
    }

    return { profileId: profileByEmail.id, error: null }
  }

  const { profileId, error: ensureProfileError } = await ensureLinkedProfile()
  if (ensureProfileError || !profileId) {
    return { error: ensureProfileError ?? 'Unable to prepare your profile. Please contact support.' }
  }

  const { error: updatePasswordError } = await supabase.auth.updateUser({ password })
  if (updatePasswordError) {
    return { error: updatePasswordError.message }
  }

  const { error: passwordSetError } = await adminClient
    .from('profile')
    .update({ password_set: true })
    .eq('id', profileId)

  if (passwordSetError) {
    return { error: passwordSetError.message }
  }

  await supabase.rpc('sync_auto_assigned_forms_for_user', { p_user_id: authUser.id })

  if (inviteId) {
    await supabase
      .from('invites')
      .update({
        status: 'confirmed',
        invitee_user_id: authUser.id,
        confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', inviteId)
  }

  return redirect('/auth/sign-up-details', { headers })
}

export default function InviteSignUp() {
  const loaderData = useLoaderData() as LoaderData
  const fetcher = useFetcher<typeof action>()
  const error = fetcher.data?.error
  const loading = fetcher.state === 'submitting'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Complete invite</CardTitle>
        <CardDescription>Set your password to continue</CardDescription>
      </CardHeader>
      <CardContent>
        <fetcher.Form method="post" className="flex flex-col gap-6">
          <input type="hidden" name="inviteId" value={loaderData.inviteId ?? ''} />
          <div className="grid gap-2">
            <Label htmlFor="email">Gmail</Label>
            <Input id="email" name="email" value={loaderData.email} readOnly />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="repeat-password">Repeat Password</Label>
            <Input id="repeat-password" name="repeat-password" type="password" required />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Saving...' : 'Set password'}
          </Button>
        </fetcher.Form>
      </CardContent>
    </Card>
  )
}
