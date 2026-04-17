import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, Json } from '@/lib/database.types'
import { extractRequestMetadata } from '@/lib/request-metadata.server'

type RecordLoginEventArgs = {
  supabase: SupabaseClient<Database>
  request: Request
  userId: string
  email: string | null
  loginMethod: string
  metadata?: Json
}

export const recordLoginEvent = async ({
  supabase,
  request,
  userId,
  email,
  loginMethod,
  metadata,
}: RecordLoginEventArgs) => {
  const context = extractRequestMetadata(request)

  const { error } = await supabase.from('login_event').insert({
    user_id: userId,
    email,
    login_method: loginMethod,
    success: true,
    ip_address: context.ipAddress,
    forwarded_for: context.forwardedFor,
    user_agent: context.userAgent,
    accept_language: context.acceptLanguage,
    referer: context.referer,
    origin: context.origin,
    metadata: metadata ?? {},
  })

  if (error) {
    console.error('[login event] insert failed', error)
  }
}
