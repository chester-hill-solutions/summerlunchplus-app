import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router'
import { redirect, useFetcher, useLoaderData } from 'react-router'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { getProfileSignUpCompletion } from '@/lib/onboarding.server'
import { adminClient } from '@/lib/supabase/adminClient'
import { createClient } from '@/lib/supabase/server'

type GuardianRow = {
  id: string
  firstname: string | null
  surname: string | null
  email: string | null
  isComplete: boolean
}

type LoaderData = {
  pid: string
  guardians: GuardianRow[]
}

const resolveStudentProfile = async (
  supabase: ReturnType<typeof createClient>['supabase'],
  userId: string,
  pidParam: string | null
) => {
  if (pidParam) {
    const { data } = await supabase
      .from('profile')
      .select('id, role, email')
      .eq('id', pidParam)
      .eq('user_id', userId)
      .maybeSingle()
    return data
  }

  const { data } = await supabase
    .from('profile')
    .select('id, role, email')
    .eq('user_id', userId)
    .single()
  return data
}

const sendGuardianInvite = async ({
  guardianEmail,
  origin,
  inviterProfileId,
  inviterEmail,
  inviterUserId,
}: {
  guardianEmail: string
  origin: string
  inviterProfileId: string
  inviterEmail: string
  inviterUserId: string
}) => {
  const redirectTo = `${origin}/auth/sign-up-details?role=guardian`

  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    guardianEmail,
    {
      redirectTo,
      data: {
        inviter_profile_id: inviterProfileId,
        inviter_role: 'student',
        inviter_email: inviterEmail,
        role: 'guardian',
      },
    }
  )

  let inviteeUserId = inviteData?.user?.id ?? null

  if (inviteError) {
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'invite',
      email: guardianEmail,
      options: {
        redirectTo,
        data: {
          inviter_profile_id: inviterProfileId,
          inviter_role: 'student',
          inviter_email: inviterEmail,
          role: 'guardian',
        },
      },
    })

    if (linkError) {
      return {
        error: inviteError.message ?? linkError.message ?? 'Unable to resend guardian invite',
      }
    }

    inviteeUserId = linkData?.user?.id ?? inviteeUserId
  }

  const { error: inviteTableError } = await adminClient
    .from('invites')
    .upsert(
      {
        inviter_user_id: inviterUserId,
        invitee_user_id: inviteeUserId,
        invitee_email: guardianEmail,
        role: 'guardian',
        status: 'pending',
        confirmed_at: null,
      },
      { onConflict: 'invitee_email' }
    )

  if (inviteTableError) {
    return { error: inviteTableError.message }
  }

  return { error: null }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabase, headers } = createClient(request)
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    throw redirect('/login', { headers })
  }

  const url = new URL(request.url)
  const studentProfile = await resolveStudentProfile(
    supabase,
    userData.user.id,
    url.searchParams.get('pid')
  )

  if (!studentProfile?.id || studentProfile.role !== 'student') {
    throw redirect('/auth/sign-up-details', { headers })
  }

  const invitedStudent = Boolean(
    studentProfile.email &&
      (await supabase
        .from('invites')
        .select('id')
        .eq('invitee_email', studentProfile.email)
        .eq('role', 'student')
        .limit(1)
        .maybeSingle())?.data?.id
  )

  const studentComplete = await getProfileSignUpCompletion(
    supabase,
    studentProfile.id,
    'student',
    invitedStudent ? { skipSlugs: ['guardian_details'] } : undefined
  )

  if (!studentComplete) {
    throw redirect(`/auth/sign-up-details?role=student&pid=${studentProfile.id}`, { headers })
  }

  const { data: guardianLinks } = await supabase
    .from('person_guardian_child')
    .select('guardian_profile_id')
    .eq('child_profile_id', studentProfile.id)

  const guardianIds = (guardianLinks ?? [])
    .map(link => link.guardian_profile_id)
    .filter((id): id is string => Boolean(id))

  const guardians = guardianIds.length
    ? (
        await supabase
          .from('profile')
          .select('id, firstname, surname, email')
          .in('id', guardianIds)
      ).data ?? []
    : []

  const guardianRows: GuardianRow[] = await Promise.all(
    guardians.map(async guardian => ({
      id: guardian.id,
      firstname: guardian.firstname,
      surname: guardian.surname,
      email: guardian.email,
      isComplete: await getProfileSignUpCompletion(supabase, guardian.id, 'guardian'),
    }))
  )

  const waitingOnGuardians =
    guardianRows.length === 0 || guardianRows.some(guardian => !guardian.isComplete)

  if (!waitingOnGuardians) {
    throw redirect('/home', { headers })
  }

  return {
    pid: studentProfile.id,
    guardians: guardianRows,
  } satisfies LoaderData
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabase } = createClient(request)
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    return { error: 'Session unavailable' }
  }

  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? '')
  const guardianId = String(formData.get('guardian_id') ?? '')
  const pid = String(formData.get('pid') ?? '')

  if (intent !== 'resend_guardian_invite') {
    return { error: 'Unknown intent' }
  }
  if (!guardianId || !pid) {
    return { error: 'Missing guardian information' }
  }

  const { data: studentProfile } = await supabase
    .from('profile')
    .select('id, email')
    .eq('id', pid)
    .eq('user_id', userData.user.id)
    .eq('role', 'student')
    .maybeSingle()

  if (!studentProfile?.id) {
    return { error: 'Student profile not found' }
  }

  const { data: link } = await supabase
    .from('person_guardian_child')
    .select('id')
    .eq('child_profile_id', studentProfile.id)
    .eq('guardian_profile_id', guardianId)
    .maybeSingle()

  if (!link?.id) {
    return { error: 'Guardian link not found' }
  }

  const { data: guardianProfile } = await supabase
    .from('profile')
    .select('email')
    .eq('id', guardianId)
    .maybeSingle()

  if (!guardianProfile?.email) {
    return { error: 'Guardian email is missing' }
  }

  const origin = new URL(request.url).origin
  const inviteResult = await sendGuardianInvite({
    guardianEmail: guardianProfile.email,
    origin,
    inviterProfileId: studentProfile.id,
    inviterEmail: userData.user.email ?? '',
    inviterUserId: userData.user.id,
  })

  if (inviteResult.error) {
    return { error: inviteResult.error }
  }

  return { ok: true, message: `Invite resent to ${guardianProfile.email}` }
}

export default function WaitingOnGuardianPage() {
  const { pid, guardians } = useLoaderData() as LoaderData
  const fetcher = useFetcher<typeof action>()
  const loading = fetcher.state === 'submitting'

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Waiting on guardian</CardTitle>
            <CardDescription>
              Your sign-up is complete. A guardian still needs to complete their sign-up details and
              consent.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {guardians.length ? (
              <div className="rounded-md border border-slate-200">
                {guardians.map(guardian => {
                  const guardianName =
                    [guardian.firstname, guardian.surname].filter(Boolean).join(' ') ||
                    guardian.email ||
                    'Guardian'

                  return (
                    <div
                      key={guardian.id}
                      className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 last:border-b-0 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900">{guardianName}</p>
                        {guardian.email ? (
                          <p className="text-xs text-slate-500">{guardian.email}</p>
                        ) : (
                          <p className="text-xs text-slate-500">No email on file</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-xs uppercase tracking-wide ${
                            guardian.isComplete ? 'text-emerald-600' : 'text-slate-400'
                          }`}
                        >
                          {guardian.isComplete ? 'Complete' : 'Pending'}
                        </span>
                        {!guardian.isComplete && guardian.email ? (
                          <fetcher.Form method="post">
                            <input type="hidden" name="intent" value="resend_guardian_invite" />
                            <input type="hidden" name="pid" value={pid} />
                            <input type="hidden" name="guardian_id" value={guardian.id} />
                            <Button type="submit" variant="outline" size="sm" disabled={loading}>
                              {loading ? 'Sending...' : 'Resend invite'}
                            </Button>
                          </fetcher.Form>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                No guardians are linked yet. Ask program staff for support adding a guardian.
              </p>
            )}

            {fetcher.data?.error ? <p className="text-sm text-red-500">{fetcher.data.error}</p> : null}
            {fetcher.data?.ok ? <p className="text-sm text-emerald-600">{fetcher.data.message}</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
