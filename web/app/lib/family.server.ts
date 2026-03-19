import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/database.types'

type ProfileRow = {
  id: string
  role: string | null
  firstname: string | null
  surname: string | null
}

type GuardianChildRow = {
  guardian_profile_id: string
  child_profile_id: string
  primary_child: boolean
}

export type FamilyMember = ProfileRow & {
  primaryChildId?: string | null
}

export type FamilyGraph = {
  profileId: string
  profileRole: string | null
  familyProfileIds: string[]
  guardians: FamilyMember[]
  children: FamilyMember[]
  primaryChildByGuardian: Map<string, string>
}

const buildMember = (profile: ProfileRow, primaryChildByGuardian: Map<string, string>) => ({
  ...profile,
  primaryChildId: primaryChildByGuardian.get(profile.id) ?? null,
})

export async function resolveFamilyGraph(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<FamilyGraph> {
  const { data: profileRow, error: profileError } = await supabase
    .from('profile')
    .select('id, role, firstname, surname')
    .eq('user_id', userId)
    .single()

  if (profileError || !profileRow?.id) {
    throw new Error(profileError?.message ?? 'Profile not found')
  }

  const profileId = profileRow.id
  const profileRole = profileRow.role
  const seen = new Set<string>([profileId])
  const queue: string[] = [profileId]
  const edges: GuardianChildRow[] = []

  while (queue.length) {
    const batch = queue.splice(0, queue.length)
    const { data: batchEdges, error: edgeError } = await supabase
      .from('person_guardian_child')
      .select('guardian_profile_id, child_profile_id, primary_child')
      .or(`guardian_profile_id.in.(${batch.join(',')}),child_profile_id.in.(${batch.join(',')})`)

    if (edgeError) {
      throw new Error(edgeError.message)
    }

    for (const edge of batchEdges ?? []) {
      edges.push(edge)
      if (!seen.has(edge.guardian_profile_id)) {
        seen.add(edge.guardian_profile_id)
        queue.push(edge.guardian_profile_id)
      }
      if (!seen.has(edge.child_profile_id)) {
        seen.add(edge.child_profile_id)
        queue.push(edge.child_profile_id)
      }
    }
  }

  const familyProfileIds = Array.from(seen)
  const { data: profiles, error: profilesError } = await supabase
    .from('profile')
    .select('id, role, firstname, surname')
    .in('id', familyProfileIds)

  if (profilesError) {
    throw new Error(profilesError.message)
  }

  const primaryChildByGuardian = new Map<string, string>()
  for (const edge of edges) {
    if (edge.primary_child) {
      primaryChildByGuardian.set(edge.guardian_profile_id, edge.child_profile_id)
    }
  }

  const guardians = (profiles ?? [])
    .filter(profile => profile.role === 'guardian')
    .map(profile => buildMember(profile, primaryChildByGuardian))
  const children = (profiles ?? [])
    .filter(profile => profile.role === 'student')
    .map(profile => buildMember(profile, primaryChildByGuardian))

  return {
    profileId,
    profileRole,
    familyProfileIds,
    guardians,
    children,
    primaryChildByGuardian,
  }
}
