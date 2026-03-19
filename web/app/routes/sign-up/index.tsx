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
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  Link,
  redirect,
  useFetcher,
} from 'react-router'
import { useState } from 'react'

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabase, headers } = createClient(request)

  const { data } = await supabase.auth.getUser()

  if (data.user) {
    throw redirect('/home', { headers })
  }

  return null
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabase, headers } = createClient(request)

  const formData = await request.formData()
  const role = formData.get('role') as 'guardian' | 'student'
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const repeatPassword = formData.get('repeat-password') as string

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
    options: { data: { role } },
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

  return redirect(`/auth/sign-up-details?role=${role}&pid=${profileId}`, { headers })
}

export default function SignUp() {
  const fetcher = useFetcher<typeof action>()
  const error = fetcher.data?.error
  const loading = fetcher.state === 'submitting'
  const [role, setRole] = useState<'guardian' | 'student' | ''>('')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Sign up</CardTitle>
        <CardDescription>Create a new account</CardDescription>
      </CardHeader>
      <CardContent>
        {!role ? (
          <div className="flex gap-4 justify-center">
            <Button
              className="px-8 py-6"
                onClick={() => setRole('guardian')}
              >
                I am a Guardian
              </Button>
            <Button
              className="px-8 py-6"
              onClick={() => setRole('student')}
            >
              I am a Student
            </Button>
          </div>
        ) : (
          <fetcher.Form method="post" className="flex flex-col gap-6">
            <input type="hidden" name="role" value={role} />
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="m@example.com"
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
