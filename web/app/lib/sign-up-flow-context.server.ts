import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/database.types'

export type SignUpFlowContext = {
  invitedStudent: boolean
  invitedGuardianByStudent: boolean
  skipSlugs: string[]
}

const EMPTY_CONTEXT: SignUpFlowContext = {
  invitedStudent: false,
  invitedGuardianByStudent: false,
  skipSlugs: [],
}

export async function getSignUpFlowContext(
  supabase: SupabaseClient<Database>,
  params: { email: string | null; role: 'guardian' | 'student' }
): Promise<SignUpFlowContext> {
  if (!params.email) {
    return EMPTY_CONTEXT
  }

  const { data: invite } = await supabase
    .from('invites')
    .select('inviter_user_id, role')
    .eq('invitee_email', params.email)
    .neq('status', 'revoked')
    .maybeSingle()

  if (!invite?.role) {
    return EMPTY_CONTEXT
  }

  const invitedStudent = invite.role === 'student'
  let invitedGuardianByStudent = false

  if (invite.role === 'guardian' && invite.inviter_user_id) {
    const { data: inviterProfile } = await supabase
      .from('profile')
      .select('role')
      .eq('user_id', invite.inviter_user_id)
      .maybeSingle()

    invitedGuardianByStudent = inviterProfile?.role === 'student'
  }

  const skipSlugs: string[] = []
  if (params.role === 'student' && invitedStudent) {
    skipSlugs.push('guardian_details')
  }
  if (params.role === 'guardian' && invitedGuardianByStudent) {
    skipSlugs.push('child_email')
  }

  return {
    invitedStudent,
    invitedGuardianByStudent,
    skipSlugs,
  }
}
