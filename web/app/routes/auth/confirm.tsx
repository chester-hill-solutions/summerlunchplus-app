
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { createClient } from '@/lib/supabase/server'
import { recordLoginEvent } from '@/lib/login-events.server'
import { type EmailOtpType } from '@supabase/supabase-js'
import { useEffect, useMemo, useState } from 'react'
import { Link, type LoaderFunctionArgs, redirect, useLoaderData } from 'react-router'

type LoaderData = {
  next: string
}

export async function loader({ request }: LoaderFunctionArgs) {
  const requestUrl = new URL(request.url)
  const token_hash = requestUrl.searchParams.get('token_hash')
  const code = requestUrl.searchParams.get('code')
  const type = requestUrl.searchParams.get('type') as EmailOtpType | null
  const _next = requestUrl.searchParams.get('next')
  const next = _next?.startsWith('/') ? _next : '/'
  const { supabase, headers } = createClient(request)

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data: userData } = await supabase.auth.getUser()
      if (userData.user) {
        await recordLoginEvent({
          supabase,
          request,
          userId: userData.user.id,
          email: userData.user.email ?? null,
          loginMethod: 'otp:code',
        })
      }
      return redirect(next, { headers })
    }
    return redirect(`/auth/error?error=${error.message}`)
  }

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    })
    if (!error) {
      const { data: userData } = await supabase.auth.getUser()
      if (userData.user) {
        await recordLoginEvent({
          supabase,
          request,
          userId: userData.user.id,
          email: userData.user.email ?? null,
          loginMethod: `otp:${type}`,
        })
      }
      return redirect(next, { headers })
    }
    return redirect(`/auth/error?error=${error.message}`)
  }

  return { next } satisfies LoaderData
}

export default function ConfirmPage() {
  const { next } = useLoaderData() as LoaderData
  const [error, setError] = useState<string | null>(null)

  const destination = useMemo(() => {
    if (next.startsWith('/')) return next
    return '/'
  }, [next])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const queryParams = new URLSearchParams(window.location.search)
    const hash = window.location.hash
    const hashParams = new URLSearchParams(hash.replace(/^#/, ''))

    const errorCode = queryParams.get('error_code') ?? hashParams.get('error_code')
    const errorDescription = queryParams.get('error_description') ?? hashParams.get('error_description')

    if (errorCode || errorDescription) {
      if (errorCode === 'otp_expired') {
        setError('This reset link has expired or was already used. Please request a new password reset email.')
      } else {
        setError(errorDescription ?? 'Unable to verify link.')
      }
      return
    }

    if (!hash) {
      setError('This confirmation link is invalid or incomplete. Please request a new link.')
      return
    }

    const access_token = hashParams.get('access_token')
    const refresh_token = hashParams.get('refresh_token')
    const type = hashParams.get('type')

    if (!access_token || !refresh_token) {
      setError('This confirmation link is invalid or incomplete. Please request a new link.')
      return
    }

    const supabase = createBrowserClient()
    supabase.auth
      .setSession({ access_token, refresh_token })
      .then(({ error: sessionError }) => {
        if (sessionError) {
          setError(sessionError.message)
          return
        }
        const fallbackDestination = type === 'recovery' ? '/update-password' : '/login'
        window.location.replace(destination || fallbackDestination)
      })
  }, [destination])

  if (error) {
    return (
      <main className="flex min-h-svh items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-md rounded-lg border bg-card p-6">
          <p className="text-sm text-destructive">Unable to verify link: {error}</p>
          <div className="mt-3 flex items-center gap-2">
            <Link to="/forgot-password" className="text-sm underline underline-offset-4">
              Request a new reset link
            </Link>
            <Link to="/login" className="text-sm underline underline-offset-4">
              Back to login
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        Verifying your link...
      </div>
    </main>
  )
}
