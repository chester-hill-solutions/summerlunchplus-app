import { createClient } from '@/lib/supabase/server'
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
import {
  normalizeEmail,
} from '@/lib/email-domain'
import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  Link,
  redirect,
  useFetcher,
  useLoaderData,
} from 'react-router'
import { useState } from 'react'

type LoaderData = {
  prefillEmail: string
  prefillRole: 'guardian' | 'student' | ''
  terms: {
    title: string
    version: number
  } | null
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabase, headers } = createClient(request)
  const url = new URL(request.url)
  const rawEmail = normalizeEmail(url.searchParams.get('email') ?? url.searchParams.get('invitee_email') ?? '')
  const roleParam = url.searchParams.get('role')
  const prefillRole = roleParam === 'guardian' || roleParam === 'student' ? roleParam : ''

  const { data } = await supabase.auth.getUser()

  if (data.user) {
    throw redirect('/home', { headers })
  }

  const { data: activeTerms } = await supabase
    .from('sign_up_terms')
    .select('title, version')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    prefillEmail: rawEmail,
    prefillRole,
    terms: activeTerms
      ? {
          title: activeTerms.title,
          version: activeTerms.version,
        }
      : null,
  } satisfies LoaderData
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabase, headers } = createClient(request)

  const formData = await request.formData()
  const role = formData.get('role') as 'guardian' | 'student'
  const email = normalizeEmail((formData.get('email') as string) ?? '')
  const password = formData.get('password') as string
  const repeatPassword = formData.get('repeat-password') as string
  const acceptedTerms = formData.get('terms-consent') === 'on'

  const { data: activeTerms } = await supabase
    .from('sign_up_terms')
    .select('id, content, version')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!activeTerms) {
    return {
      error: 'Terms are unavailable right now. Please try again in a moment.',
    }
  }

  if (!acceptedTerms) {
    return {
      error: 'You must accept the terms to create an account.',
    }
  }

  if (!password) {
    return {
      error: 'Password is required',
    }
  }

  if (password !== repeatPassword) {
    return { error: 'Passwords do not match' }
  }

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { role, sign_up_terms_version: activeTerms.version } },
  })
  if (signUpError || !signUpData.user) {
    return { error: signUpError?.message ?? 'Signup failed' }
  }

  const userId = signUpData.user.id
  const invitedEmail = signUpData.user.email ?? email
  const { data: profileRow, error: profileError } = await supabase
    .from('profile')
    .upsert(
      { user_id: userId, role, email: invitedEmail, password_set: true },
      { onConflict: 'email' }
    )
    .select()
    .single()
  if (profileError || !profileRow?.id) {
    return { error: profileError?.message ?? 'Profile creation failed' }
  }
  const profileId = profileRow.id
  await supabase.auth.updateUser({ data: { role, profile_id: profileId } })

  const { error: consentError } = await supabase.from('sign_up_terms_consent').insert({
    user_id: userId,
    profile_id: profileId,
    email: invitedEmail,
    role,
    sign_up_terms_id: activeTerms.id,
    terms_version: activeTerms.version,
    terms_content: activeTerms.content,
    metadata: { source: 'sign_up' },
  })

  if (consentError) {
    if (consentError.code === '23503') {
      return { error: 'Unable to save consent because the selected terms version is no longer available. Please refresh and try again.' }
    }
    return { error: consentError.message ?? 'Unable to save terms consent' }
  }

  return redirect(`/auth/sign-up-details?role=${role}&pid=${profileId}`, { headers })
}

export default function SignUp() {
  const { terms, prefillEmail, prefillRole } = useLoaderData<typeof loader>()
  const fetcher = useFetcher<typeof action>()
  const error = fetcher.data?.error
  const loading = fetcher.state === 'submitting'
  const [role, setRole] = useState<'guardian' | 'student' | ''>(prefillRole)
  const [email, setEmail] = useState(prefillEmail)

  const termsParams = new URLSearchParams()
  if (email) termsParams.set('email', email)
  if (role) termsParams.set('role', role)
  const termsTo = `/sign-up/terms${termsParams.toString() ? `?${termsParams.toString()}` : ''}`
  const roleLabel = role === 'guardian' ? 'Guardian' : 'Student'
  const alternateRole = role === 'guardian' ? 'student' : 'guardian'
  const alternateRoleLabel = alternateRole === 'guardian' ? 'Guardian' : 'Student'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Welcome to summerlunch+</CardTitle>
        <CardDescription>Create your account to get started with us</CardDescription>
      </CardHeader>
      <CardContent>
        {!role ? (
          <div className="flex gap-4 justify-center">
            <Button className="px-8 py-6" onClick={() => setRole('guardian')}>
              I am a Guardian
            </Button>
            <Button className="px-8 py-6" onClick={() => setRole('student')}>
              I am a Student
            </Button>
          </div>
        ) : (
          <fetcher.Form method="post" className="flex flex-col gap-6">
            <input type="hidden" name="role" value={role} />
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <p>
                You are signing up as <span className="font-semibold">{roleLabel}</span>.
              </p>
              <button
                type="button"
                className="mt-1 underline underline-offset-4"
                onClick={() => setRole(alternateRole)}
              >
                Switch to {alternateRoleLabel} sign-up
              </button>
            </div>
            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="email">Gmail</Label>
                <span className="group relative inline-flex items-center">
                  <button
                    type="button"
                    className="h-5 w-5 rounded-full border border-slate-300 text-xs text-slate-500"
                    aria-label="Email guidance"
                  >
                    ?
                  </button>
                  <span className="pointer-events-none absolute left-0 top-7 z-10 hidden w-72 rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-700 shadow-md group-hover:block group-focus-within:block">
                    You are currently in the {roleLabel} sign-up flow. Use your own email. If
                    this email belongs to your guardian or child, switch to the correct flow.
                  </span>
                </span>
              </div>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="name@gmail.com"
                title="Use a valid Gmail address"
                value={email}
                onChange={event => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="repeat-password">Repeat Password</Label>
              <Input
                id="repeat-password"
                name="repeat-password"
                type="password"
                required
              />
            </div>
            <div className="grid gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
              <p className="text-muted-foreground">Please review the terms before creating your account.</p>
              <label className="flex items-start gap-2 text-foreground">
                <input
                  id="terms-consent"
                  name="terms-consent"
                  type="checkbox"
                  required
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  I have read and agree to the{' '}
                  <Link to={termsTo} className="underline underline-offset-4">
                    Terms and Conditions
                  </Link>
                  .
                </span>
              </label>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating an account...' : 'Next'}
            </Button>
            <div className="mt-4 text-center text-sm">
              Already have an account?{' '}
              <Link to="/login" className="underline underline-offset-4 cursor-pointer">
                Login
              </Link>
            </div>
          </fetcher.Form>
        )}
      </CardContent>
    </Card>
  )
}
