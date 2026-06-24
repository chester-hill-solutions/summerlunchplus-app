import { createClient } from '@/lib/supabase/server'
import type { LoaderFunctionArgs } from 'react-router'

import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

const baseLoader = createTableLoader('profile')
const IN_CLAUSE_BATCH_SIZE = 150

type ProfileRow = {
  id: string
  role: string | null
  firstname: string | null
  surname: string | null
  email: string | null
  phone: string | null
}

type GuardianChildRow = {
  guardian_profile_id: string
  child_profile_id: string
  primary_child: boolean
}

const chunkArray = <T,>(items: T[], size: number) => {
  if (size <= 0 || !items.length) return [] as T[][]
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

const formatProfileLabel = (profile: ProfileRow | null | undefined, fallbackId: string) => {
  const firstname = typeof profile?.firstname === 'string' ? profile.firstname.trim() : ''
  const surname = typeof profile?.surname === 'string' ? profile.surname.trim() : ''
  const email = typeof profile?.email === 'string' ? profile.email.trim() : ''
  const phone = typeof profile?.phone === 'string' ? profile.phone.trim() : ''
  const role = typeof profile?.role === 'string' ? profile.role.trim() : ''
  const fullName = [firstname, surname].filter(Boolean).join(' ').trim()
  const displayName = fullName || email || `ID ${fallbackId}`

  return [
    displayName,
    `Role: ${role || '-'}`,
    `Email: ${email || '-'}`,
    `Phone: ${phone || '-'}`,
  ].join(' | ')
}

const getPreferredRelatedId = (
  relatedRows: Array<{ profileId: string; primary: boolean }> | undefined
) =>
  (relatedRows ?? [])
    .slice()
    .sort((left, right) => {
      if (left.primary !== right.primary) {
        return Number(right.primary) - Number(left.primary)
      }
      return left.profileId.localeCompare(right.profileId)
    })[0]?.profileId ?? null

export async function loader(args: LoaderFunctionArgs) {
  const base = await baseLoader(args)
  const rows = (base.rows ?? []) as Array<Record<string, unknown>>
  if (!rows.length) {
    return {
      ...base,
      columns: ['profile_info', 'related_profile_info'],
      columnMeta: {
        ...(base.columnMeta ?? {}),
        profile_info: { label: 'Profile information' },
        related_profile_info: { label: 'Related child/guardian' },
      },
    }
  }

  const profileIds = Array.from(
    new Set(rows.map(row => (typeof row.id === 'string' ? row.id : '')).filter(Boolean))
  )

  const { supabase } = createClient(args.request)

  const guardiansByChildId = new Map<string, Array<{ profileId: string; primary: boolean }>>()
  const childrenByGuardianId = new Map<string, Array<{ profileId: string; primary: boolean }>>()

  for (const idChunk of chunkArray(profileIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await supabase
      .from('person_guardian_child')
      .select('guardian_profile_id, child_profile_id, primary_child')
      .or(`guardian_profile_id.in.(${idChunk.join(',')}),child_profile_id.in.(${idChunk.join(',')})`)

    if (error) {
      throw new Response(error.message, { status: 500 })
    }

    for (const edge of (data ?? []) as GuardianChildRow[]) {
      const guardians = guardiansByChildId.get(edge.child_profile_id) ?? []
      guardians.push({ profileId: edge.guardian_profile_id, primary: edge.primary_child })
      guardiansByChildId.set(edge.child_profile_id, guardians)

      const children = childrenByGuardianId.get(edge.guardian_profile_id) ?? []
      children.push({ profileId: edge.child_profile_id, primary: edge.primary_child })
      childrenByGuardianId.set(edge.guardian_profile_id, children)
    }
  }

  const relatedProfileIds = new Set<string>()
  for (const row of rows) {
    const profileId = typeof row.id === 'string' ? row.id : ''
    if (!profileId) continue

    const role = typeof row.role === 'string' ? row.role : null
    let relatedId: string | null = null

    if (role === 'guardian') {
      relatedId = getPreferredRelatedId(childrenByGuardianId.get(profileId))
    } else if (role === 'student') {
      relatedId = getPreferredRelatedId(guardiansByChildId.get(profileId))
    } else {
      relatedId =
        getPreferredRelatedId(childrenByGuardianId.get(profileId)) ??
        getPreferredRelatedId(guardiansByChildId.get(profileId))
    }

    if (relatedId) {
      relatedProfileIds.add(relatedId)
    }
  }

  const relatedProfilesById = new Map<string, ProfileRow>()
  for (const idChunk of chunkArray(Array.from(relatedProfileIds), IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await supabase
      .from('profile')
      .select('id, role, firstname, surname, email, phone')
      .in('id', idChunk)

    if (error) {
      throw new Response(error.message, { status: 500 })
    }

    for (const profile of (data ?? []) as ProfileRow[]) {
      relatedProfilesById.set(profile.id, profile)
    }
  }

  const enrichedRows = rows.map(row => {
    const profileId = typeof row.id === 'string' ? row.id : ''
    const role = typeof row.role === 'string' ? row.role : null
    let relatedId: string | null = null

    if (profileId) {
      if (role === 'guardian') {
        relatedId = getPreferredRelatedId(childrenByGuardianId.get(profileId))
      } else if (role === 'student') {
        relatedId = getPreferredRelatedId(guardiansByChildId.get(profileId))
      } else {
        relatedId =
          getPreferredRelatedId(childrenByGuardianId.get(profileId)) ??
          getPreferredRelatedId(guardiansByChildId.get(profileId))
      }
    }

    const baseProfile: ProfileRow = {
      id: profileId,
      role: typeof row.role === 'string' ? row.role : null,
      firstname: typeof row.firstname === 'string' ? row.firstname : null,
      surname: typeof row.surname === 'string' ? row.surname : null,
      email: typeof row.email === 'string' ? row.email : null,
      phone: typeof row.phone === 'string' ? row.phone : null,
    }

    return {
      ...row,
      profile_info: formatProfileLabel(baseProfile, profileId),
      related_profile_info: relatedId
        ? formatProfileLabel(relatedProfilesById.get(relatedId), relatedId)
        : '-',
    }
  })

  return {
    ...base,
    rows: enrichedRows,
    columns: ['profile_info', 'related_profile_info'],
    columnMeta: {
      ...(base.columnMeta ?? {}),
      profile_info: { label: 'Profile information' },
      related_profile_info: { label: 'Related child/guardian' },
    },
  }
}

export default function ProfileTablePage() {
  return <TableDisplay />
}
