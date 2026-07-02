import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { createClient } from '@/lib/supabase/server'
import AuthStickerBackground from '@/components/auth/sticker-background'
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
import { type EmailOtpType } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { Link, type ActionFunctionArgs, type LoaderFunctionArgs, redirect, useFetcher } from 'react-router'

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const token_hash = requestUrl.searchParams.get('token_hash')
  const type = requestUrl.searchParams.get('type') as EmailOtpType | null
  const { supabase, headers } = createClient(request)

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return redirect(`/auth/error?error=${encodeURIComponent(error.message)}`)
    }
    return redirect('/update-password', { headers })
  }

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (error) {
      return redirect(`/auth/error?error=${encodeURIComponent(error.message)}`)
    }
    return redirect('/update-password', { headers })
  }

  return null
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabase, headers } = createClient(request)
  const formData = await request.formData()
  const password = formData.get('password') as string

  if (!password) {
    return { error: 'Password is required' }
  }

  const { error } = await supabase.auth.updateUser({ password: password })

  if (error) {
    return {
      error: error instanceof Error ? error.message : 'An error occurred',
    }
  }

  // Redirect to home page after successful password update
  return redirect('/home', { headers })
}

export default function Page() {
  const fetcher = useFetcher<typeof action>()
  const [ready, setReady] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const error = fetcher.data?.error
  const loading = fetcher.state === 'submitting'

  useEffect(() => {
    if (typeof window === 'undefined') return

    const supabase = createBrowserClient()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
        setAuthError(null)
      }
    })

    const hash = window.location.hash
    const hashParams = new URLSearchParams(hash.replace(/^#/, ''))
    const access_token = hashParams.get('access_token')
    const refresh_token = hashParams.get('refresh_token')

    if (access_token && refresh_token) {
      supabase.auth
        .signOut({ scope: 'local' })
        .then(() => supabase.auth.setSession({ access_token, refresh_token }))
        .then(({ error: sessionError }) => {
          if (sessionError) {
            setAuthError(sessionError.message)
            return
          }

          setReady(true)
          setAuthError(null)
          const cleanUrl = window.location.pathname + window.location.search
          window.history.replaceState({}, '', cleanUrl)
        })
      return () => subscription.unsubscribe()
    }

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) {
        setAuthError(sessionError.message)
        setReady(false)
        return
      }

      if (data.session) {
        setReady(true)
        setAuthError(null)
        return
      }

      setReady(false)
      setAuthError('This reset link is invalid or expired. Please request a new password reset email.')
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthStickerBackground dense>
      <div className="w-full">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Reset Your Password</CardTitle>
              <CardDescription>
                {ready
                  ? 'Please enter your new password below.'
                  : 'Verifying your recovery link...'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {authError ? (
                <div className="space-y-4">
                  <p className="text-sm text-red-500">{authError}</p>
                  <div className="text-sm">
                    <Link to="/forgot-password" className="underline underline-offset-4">
                      Request a new reset link
                    </Link>
                  </div>
                </div>
              ) : (
                <fetcher.Form method="post">
                  <div className="flex flex-col gap-6">
                    <div className="grid gap-2">
                      <Label htmlFor="password">New password</Label>
                      <Input
                        id="password"
                        name="password"
                        type="password"
                        placeholder="New password"
                        required
                        disabled={!ready}
                      />
                    </div>
                    {error && <p className="text-sm text-red-500">{error}</p>}
                    <Button type="submit" className="w-full" disabled={loading || !ready}>
                      {loading ? 'Saving...' : 'Save new password'}
                    </Button>
                  </div>
                </fetcher.Form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AuthStickerBackground>
  )
}
