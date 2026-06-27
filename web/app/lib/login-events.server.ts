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
    ip_selected: context.ipSelected,
    ip_selected_source: context.ipSelectedSource,
    ip_chain: context.ipChain,
    ip_parse_version: context.ipParseVersion,
    ip_parse_confidence: context.ipParseConfidence,
    ip_parse_notes: context.ipParseNotes,
    ip_classification: context.ipClassification,
    ip_confidence_level: context.ipConfidenceLevel,
    ip_reason_codes: context.ipReasonCodes,
    ip_reason_text: context.ipReasonText,
    ip_classifier_version: context.ipClassifierVersion,
    proxy_provider_match: context.proxyProviderMatch,
    proxy_match_cidr: context.proxyMatchCidr,
    forwarded_for: context.forwardedFor,
    user_agent: context.userAgent,
    accept_language: context.acceptLanguage,
    referer: context.referer,
    origin: context.origin,
    request_headers: context.requestHeaders,
    metadata: metadata ?? {},
  })

  if (error) {
    console.error('[login event] insert failed', error)
  }
}
