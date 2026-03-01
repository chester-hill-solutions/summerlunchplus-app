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
import {
  redirect,
  useFetcher,
  useLoaderData,
  useSearchParams,
} from 'react-router'
import { createClient as createServiceRoleClient } from '@supabase/supabase-js'

// Loader ensures authenticated user and required query params
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabase, headers } = createClient(request)
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw redirect('/auth/sign-up', { headers })

  const url = new URL(request.url)
  const role = url.searchParams.get('role')
  const pid = url.searchParams.get('pid')
  if (!role || !pid) throw redirect('/auth/sign-up', { headers })

  return { role, pid }
}

// Action updates person profile and sends invite to counterpart
export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabase, headers } = createClient(request)
  const url = new URL(request.url)
  const origin = url.origin

  const formData = await request.formData()
  const role = formData.get('role') as 'parent' | 'student'
  const pid = formData.get('pid') as string
  const firstname = (formData.get('firstname') as string)?.trim()
  const surname = (formData.get('surname') as string)?.trim()
  const phone = (formData.get('phone') as string)?.trim()
  const postcode = (formData.get('postcode') as string)?.trim()
  const inviteEmail = (formData.get('invite-email') as string)?.trim()

  if (!firstname || !surname || !phone || !postcode || !inviteEmail) {
    return { error: 'All fields are required' }
  }
  const postalRe = /^[A-Z]\d[A-Z] \d[A-Z]\d$/
  if (!postalRe.test(postcode)) {
    return { error: 'Postal code must match A1A 1A1 format' }
  }

  const { error: updateError } = await supabase
    .from('person')
    .update({ firstname, surname, phone, postcode })
    .eq('id', pid)
  if (updateError) {
    return { error: updateError.message }
  }

  // Send invite using service-role key
  const serviceRoleClient = createServiceRoleClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const targetRole = role === 'student' ? 'parent' : 'student'
  const { error: inviteError } =
    await serviceRoleClient.auth.admin.inviteUserByEmail(inviteEmail, {
      redirectTo: `${origin}/auth/sign-up-details?role=${targetRole}&invitee_pid=${pid}`,
      data: { inviter_pid: pid, inviter_role: role },
    })
  if (inviteError) {
    return { error: inviteError.message }
  }

  return redirect('/home', { headers })
}

export default function SignUpDetails() {
  const fetcher = useFetcher<typeof action>()
  const { role, pid } = useLoaderData() as { role: string; pid: string }
  const [searchParams] = useSearchParams()
  const error = fetcher.data?.error
  const loading = fetcher.state === 'submitting'
  const inviteLabel = role === 'student' ? "Parent's email" : "Student's email"

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Complete your profile</CardTitle>
            <CardDescription>One more step before you can continue</CardDescription>
          </CardHeader>
          <CardContent>
            <fetcher.Form method="post" className="flex flex-col gap-6">
              <input type="hidden" name="role" value={role} />
              <input type="hidden" name="pid" value={pid} />
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
                  pattern="[A-Z]\d[A-Z] \d[A-Z]\d"
                  placeholder="A1A 1A1"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="invite-email">{inviteLabel}</Label>
                <Input id="invite-email" name="invite-email" type="email" required />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Sending invite...' : 'Submit'}
              </Button>
            </fetcher.Form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
