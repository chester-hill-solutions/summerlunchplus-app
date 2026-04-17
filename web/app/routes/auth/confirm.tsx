
import { createClient } from '@/lib/supabase/server'
import { recordLoginEvent } from '@/lib/login-events.server'
import { type EmailOtpType } from '@supabase/supabase-js'
import { type LoaderFunctionArgs, redirect } from 'react-router'

export async function loader({ request }: LoaderFunctionArgs) {
  const requestUrl = new URL(request.url)
  const token_hash = requestUrl.searchParams.get('token_hash')
  const type = requestUrl.searchParams.get('type') as EmailOtpType | null
  const _next = requestUrl.searchParams.get('next')
  const next = _next?.startsWith('/') ? _next : '/'

  if (token_hash && type) {
    const { supabase, headers } = createClient(request)
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
    } else {
      return redirect(`/auth/error?error=${error?.message}`)
    }
  }

  // redirect the user to an error page with some instructions
  return redirect(`/auth/error?error=No token hash or type`)
}
