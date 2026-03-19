import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/database.types'

export type SignUpDetailsStatus = {
  isComplete: boolean
  profileId: string | null
  role: string | null
}

export async function getSignUpDetailsStatus(
  supabase: SupabaseClient<Database>,
  userId: string,
  roleOverride?: string | null
): Promise<SignUpDetailsStatus> {
  const { data: profile, error } = await supabase
    .from('profile')
    .select('id, role, firstname, surname, phone, postcode, partner_program')
    .eq('user_id', userId)
    .single()

  if (error || !profile?.id) {
    return { isComplete: false, profileId: null, role: roleOverride ?? null }
  }

  const role = roleOverride && roleOverride !== 'unassigned' ? roleOverride : profile.role ?? roleOverride ?? null
  const baseComplete = Boolean(
    profile.firstname && profile.surname && profile.phone && profile.postcode && profile.partner_program
  )

  if (role === 'guardian') {
    const { data: relationship } = await supabase
      .from('person_guardian_child')
      .select('id')
      .eq('guardian_profile_id', profile.id)
      .limit(1)
      .maybeSingle()
    const hasChildLink = Boolean(relationship?.id)
    return { isComplete: baseComplete && hasChildLink, profileId: profile.id, role }
  }

  return { isComplete: baseComplete, profileId: profile.id, role }
}
