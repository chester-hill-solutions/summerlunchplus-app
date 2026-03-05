import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { LoaderFunctionArgs, ActionFunctionArgs } from 'react-router'
import { redirect, useFetcher, useLoaderData } from 'react-router'
import { adminClient } from '@/lib/supabase/adminClient'
import { useState } from 'react'

// Loader ensures authenticated user and required query params
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabase, headers } = createClient(request)
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw redirect('/auth/sign-up', { headers })

  const url = new URL(request.url)
  const role = url.searchParams.get('role')
  const pidParam = url.searchParams.get('pid')
  let pid = pidParam
  if (!role || !pid) {
    const { data: personRow } = await supabase
      .from('person')
      .select('id')
      .eq('user_id', data.user.id)
      .single()
    if (!personRow?.id) throw redirect('/auth/sign-up', { headers })
    pid = personRow.id
  }
  if (!pid) throw redirect('/auth/sign-up', { headers })
  const resolvedPid = pid

  const step = (url.searchParams.get('step') as 'details' | 'invite') || 'details'
  const inviterPid = url.searchParams.get('inviter_pid')
  const inviterRole = (url.searchParams.get('inviter_role') as 'parent' | 'student') ?? null

  let firstname: string | null = null,
    surname: string | null = null,
    phone: string | null = null,
    postcode: string | null = null

  if (step === 'invite') {
    const { data: personData } = await supabase
      .from('person')
      .select('firstname, surname, phone, postcode')
      .eq('id', pid)
      .single()
    firstname = personData?.firstname ?? null
    surname = personData?.surname ?? null
    phone = personData?.phone ?? null
    postcode = personData?.postcode ?? null
  }

  return { role, pid: resolvedPid, step, firstname, surname, phone, postcode, inviterPid, inviterRole }
}

// Action updates person profile and sends invite to counterpart
export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabase, headers } = createClient(request)
  const url = new URL(request.url)
  const origin = url.origin

  const formData = await request.formData()
  const role = formData.get('role') as 'parent' | 'student'
  const pid = formData.get('pid') as string

  const step = formData.get('step') as string
  const firstname = (formData.get('firstname') as string)?.trim()
  const surname = (formData.get('surname') as string)?.trim()
  const phone = (formData.get('phone') as string)?.trim()
  const postcode = (formData.get('postcode') as string)?.trim()
  const inviteEmail = (formData.get('invite-email') as string)?.trim()
  const postalRe = /^[A-Z]\d[A-Z] \d[A-Z]\d$/
  const { data: currentUser } = await supabase.auth.getUser()
  const inviterEmail = currentUser?.user?.email ?? ''

  if (step === 'details') {
    if (!firstname || !surname || !phone || !postcode) {
      return { error: 'All fields are required' }
    }
    if (!postalRe.test(postcode)) {
      return { error: 'Postal code must match A1A 1A1 format' }
    }

    const { data: updatedPerson, error: updateError } = await supabase
      .from('person')
      .upsert(
        { id: pid, firstname, surname, phone, postcode, email: inviterEmail },
        { onConflict: 'id' }
      )
      .select('id')
      .single()
    if (updateError || !updatedPerson?.id) {
      return { error: updateError?.message ?? 'Unable to save profile' }
    }
    return redirect(`/auth/sign-up-details?role=${role}&pid=${pid}&step=invite`, { headers })
  }

  if (step === 'invite') {
    if (!inviteEmail) {
      return { error: 'Invite email is required' }
    }

    const targetRole = role === 'student' ? 'parent' : 'student'
    const redirectTo = `${origin}/auth/sign-up-details?role=${targetRole}`
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(inviteEmail, {
      redirectTo,
      data: { inviter_pid: pid, inviter_role: role, inviter_email: inviterEmail },
    })
    if (inviteError || !inviteData?.user?.id) {
      return { error: inviteError?.message ?? 'Unable to send invite' }
    }

    const inviteeUserId = inviteData.user.id
    const { data: inviteeRow, error: inviteeError } = await supabase
      .from('person')
      .upsert(
        {
          user_id: inviteeUserId,
          email: inviteEmail,
          role: targetRole,
        },
        { onConflict: 'email' }
      )
      .select('id')
      .single()
    if (inviteeError || !inviteeRow?.id) {
      return { error: inviteeError?.message ?? 'Unable to prepare invitee profile' }
    }
    const inviteePid = inviteeRow.id

    const childId = role === 'parent' ? inviteePid : pid
    const parentId = role === 'parent' ? pid : inviteePid
    await supabase
      .from('person_parent')
      .upsert(
        { person_id: childId, parent_id: parentId },
        { onConflict: 'person_id,parent_id' }
      )

    return redirect('/home', { headers })
  }
}

export default function SignUpDetails() {
  const fetcher = useFetcher<typeof action>()
  const {
    role,
    pid,
    step: initialStep,
    firstname,
    surname,
    phone,
    postcode: loaderPostcode,
  } = useLoaderData() as {
    role: string
    pid: string
    step: 'details' | 'invite'
    firstname: string | null
    surname: string | null
    phone: string | null
    postcode: string | null
  }
  const [step, setStep] = useState<'details' | 'invite'>(initialStep as any)
  const [postcode, setPostcode] = useState(loaderPostcode ?? '')
  const error = fetcher.data?.error
  const loading = fetcher.state === 'submitting'
  const inviteLabel = role === 'student' ? "Parent's email" : "Student's email"

  const formatPC = (val: string) => {
    const raw = val.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (raw.length <= 3) return raw
    return raw.slice(0, 3) + ' ' + raw.slice(3, 6)
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">
              {step === 'details' ? 'Complete your profile' : 'Invite a Parent/Student'}
            </CardTitle>
            <CardDescription>
              {step === 'details'
                ? 'One more step before you can continue'
                : 'Send an invite to your counterpart'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === 'details' ? (
              <fetcher.Form method="post" className="flex flex-col gap-6">
                <input type="hidden" name="role" value={role} />
                <input type="hidden" name="pid" value={pid} />
                <input type="hidden" name="step" value="details" />
                <div className="grid gap-2">
                  <Label htmlFor="firstname">First name</Label>
                  <Input id="firstname" name="firstname" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="surname">Surname</Label>
                  <Input id="surname" name="surname" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" name="phone" type="tel" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="postcode">Postal Code</Label>
                  <Input
                    id="postcode"
                    name="postcode"
                    value={postcode}
                    onChange={e => setPostcode(formatPC(e.target.value))}
                    placeholder="A1A 1A1"
                    required
                  />
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading}
                  onClick={() => setStep('invite')}
                >
                  {loading ? 'Saving...' : 'Next'}
                </Button>
              </fetcher.Form>
              ) : (
              <fetcher.Form method="post" className="flex flex-col gap-6">
                <input type="hidden" name="role" value={role} />
                <input type="hidden" name="pid" value={pid} />
                <input type="hidden" name="step" value="invite" />
                <input type="hidden" name="firstname" value={firstname ?? ''} />
                <input type="hidden" name="surname" value={surname ?? ''} />
                <input type="hidden" name="phone" value={phone ?? ''} />
                <input type="hidden" name="postcode" value={postcode ?? ''} />
                <div className="grid gap-2">
                  <Label htmlFor="invite-email">{inviteLabel}</Label>
                  <Input id="invite-email" name="invite-email" type="email" required />
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Sending invite...' : 'Send Invite'}
                </Button>
              </fetcher.Form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
