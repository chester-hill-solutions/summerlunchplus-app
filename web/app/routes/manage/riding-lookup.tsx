import { Form, useActionData, useLoaderData, useNavigation } from 'react-router'

import { requireAuth } from '@/lib/auth.server'
import { adminClient } from '@/lib/supabase/adminClient'
import { isRoleAtLeast } from '@/lib/roles'
import { ridingLookupProvider } from '@/lib/riding-lookup.server'

import type { Route } from './+types/riding-lookup'

type MissingRidingProfile = {
  id: string
  role: string | null
  firstname: string | null
  surname: string | null
  email: string | null
  postcode: string | null
  riding_lookup_status: string | null
  riding_lookup_error: string | null
  riding_lookup_last_attempt_at: string | null
}

type ActionData = {
  error?: string
  result?: {
    attempted: number
    matched: number
    notFound: number
    failed: number
    districtNotSeeded: number
    skippedMissingPostcode: number
  }
}

const normalizePostcode = (value: string) => value.replace(/\s+/g, '').toUpperCase()

const profileLabel = (profile: MissingRidingProfile) => {
  const name = [profile.firstname?.trim(), profile.surname?.trim()].filter(Boolean).join(' ')
  if (name) return name
  if (profile.email?.trim()) return profile.email.trim()
  return profile.id
}

const resolveCandidates = async (limit: number) => {
  const { data, error } = await adminClient
    .from('profile')
    .select(
      'id, role, firstname, surname, email, postcode, federal_electoral_district_name, riding_lookup_status, riding_lookup_error, riding_lookup_last_attempt_at'
    )
    .is('federal_electoral_district_name', null)
    .order('riding_lookup_last_attempt_at', { ascending: true, nullsFirst: true })
    .limit(limit)

  if (error) {
    throw new Error(error.message)
  }

  return ((data ?? []) as Array<MissingRidingProfile & { federal_electoral_district_name: string | null }>).filter(
    profile => profile.role === 'guardian' || profile.role === 'student'
  )
}

const refreshProfileRiding = async (profile: MissingRidingProfile) => {
  const attemptedAt = new Date().toISOString()
  const postcode = typeof profile.postcode === 'string' ? normalizePostcode(profile.postcode) : ''
  if (!postcode) {
    await adminClient
      .from('profile')
      .update({ riding_lookup_last_attempt_at: attemptedAt })
      .eq('id', profile.id)
    return { outcome: 'skipped_missing_postcode' as const }
  }

  const lookup = await ridingLookupProvider.lookupByPostcode(postcode)

  if (lookup.status === 'matched') {
    const { data: districtRow } = await (adminClient.from('federal_electoral_district') as any)
      .select('name')
      .eq('name', lookup.districtName)
      .maybeSingle()

    if (districtRow?.name) {
      const { error } = await adminClient
        .from('profile')
        .update({
          federal_electoral_district_name: districtRow.name,
          riding_lookup_status: 'matched',
          riding_lookup_error: null,
          riding_lookup_last_attempt_at: attemptedAt,
        })
        .eq('id', profile.id)

      if (error) throw new Error(error.message)
      return { outcome: 'matched' as const }
    }

    const { error } = await adminClient
      .from('profile')
      .update({
        federal_electoral_district_name: null,
        riding_lookup_status: 'not_found',
        riding_lookup_error: 'district_not_seeded',
        riding_lookup_last_attempt_at: attemptedAt,
      })
      .eq('id', profile.id)
    if (error) throw new Error(error.message)
    return { outcome: 'district_not_seeded' as const }
  }

  if (lookup.status === 'not_found') {
    const { error } = await adminClient
      .from('profile')
      .update({
        federal_electoral_district_name: null,
        riding_lookup_status: 'not_found',
        riding_lookup_error: null,
        riding_lookup_last_attempt_at: attemptedAt,
      })
      .eq('id', profile.id)
    if (error) throw new Error(error.message)
    return { outcome: 'not_found' as const }
  }

  const { error } = await adminClient
    .from('profile')
    .update({
      riding_lookup_status: 'error',
      riding_lookup_error: lookup.reason,
      riding_lookup_last_attempt_at: attemptedAt,
    })
    .eq('id', profile.id)
  if (error) throw new Error(error.message)
  return { outcome: 'failed' as const }
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'admin')) {
    throw new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const { data: missingWithPostcodeRaw } = await adminClient
    .from('profile')
    .select(
      'id, role, firstname, surname, email, postcode, riding_lookup_status, riding_lookup_error, riding_lookup_last_attempt_at'
    )
    .is('federal_electoral_district_name', null)
    .not('postcode', 'is', null)
    .order('riding_lookup_last_attempt_at', { ascending: true, nullsFirst: true })
    .limit(300)

  const { count: missingWithoutPostcodeCount } = await adminClient
    .from('profile')
    .select('id', { count: 'exact', head: true })
    .is('federal_electoral_district_name', null)
    .or('postcode.is.null,postcode.eq.')

  const missingWithPostcode = (missingWithPostcodeRaw ?? []) as MissingRidingProfile[]

  return {
    missingWithPostcode,
    missingWithoutPostcodeCount: missingWithoutPostcodeCount ?? 0,
  }
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'admin')) {
    return { error: 'Unauthorized' } satisfies ActionData
  }

  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? '')

  let candidates: MissingRidingProfile[] = []

  if (intent === 'retry-selected') {
    const profileIds = formData
      .getAll('profile_id')
      .map(value => String(value).trim())
      .filter(Boolean)

    if (!profileIds.length) {
      return { error: 'Select at least one profile to retry.' } satisfies ActionData
    }

    const { data, error } = await adminClient
      .from('profile')
      .select('id, role, firstname, surname, email, postcode, riding_lookup_status, riding_lookup_error, riding_lookup_last_attempt_at')
      .in('id', profileIds)

    if (error) {
      return { error: error.message } satisfies ActionData
    }
    candidates = (data ?? []) as MissingRidingProfile[]
  } else if (intent === 'retry-batch') {
    const maxProfilesRaw = Number(formData.get('max_profiles') ?? 50)
    const maxProfiles = Number.isFinite(maxProfilesRaw) && maxProfilesRaw > 0 ? Math.min(300, Math.floor(maxProfilesRaw)) : 50
    try {
      candidates = await resolveCandidates(maxProfiles)
    } catch (error) {
      return { error: (error as Error).message } satisfies ActionData
    }
  } else {
    return { error: 'Unsupported action.' } satisfies ActionData
  }

  const result = {
    attempted: 0,
    matched: 0,
    notFound: 0,
    failed: 0,
    districtNotSeeded: 0,
    skippedMissingPostcode: 0,
  }

  for (const profile of candidates) {
    try {
      const refresh = await refreshProfileRiding(profile)
      result.attempted += 1
      if (refresh.outcome === 'matched') result.matched += 1
      else if (refresh.outcome === 'not_found') result.notFound += 1
      else if (refresh.outcome === 'failed') result.failed += 1
      else if (refresh.outcome === 'district_not_seeded') result.districtNotSeeded += 1
      else if (refresh.outcome === 'skipped_missing_postcode') result.skippedMissingPostcode += 1
    } catch (error) {
      result.attempted += 1
      result.failed += 1
      console.error('[riding lookup] manual retry failed', {
        profileId: profile.id,
        profile: profileLabel(profile),
        error,
      })
    }
  }

  return { result } satisfies ActionData
}

export default function RidingLookupPage() {
  const { missingWithPostcode, missingWithoutPostcodeCount } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>() as ActionData | undefined
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm uppercase tracking-wide text-muted-foreground">System</p>
        <h1 className="text-2xl font-semibold">Riding lookup retries</h1>
        <p className="text-sm text-muted-foreground">
          Retry federal riding lookup for profiles that are still missing a district.
        </p>
      </header>

      <section className="rounded-lg border bg-card p-4 space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Current queue</h2>
        <div className="grid gap-2 text-sm md:grid-cols-2">
          <p><span className="font-medium">Missing riding with postcode:</span> {missingWithPostcode.length}</p>
          <p><span className="font-medium">Missing riding without postcode:</span> {missingWithoutPostcodeCount}</p>
        </div>
      </section>

      <Form method="post" className="rounded-lg border bg-card p-4 space-y-3">
        <input type="hidden" name="intent" value="retry-batch" />
        <label className="grid gap-1 text-sm md:max-w-xs">
          <span className="text-muted-foreground">Retry first N missing profiles (1-300)</span>
          <input
            name="max_profiles"
            type="number"
            min={1}
            max={300}
            defaultValue={50}
            className="h-10 rounded border border-input bg-background px-3"
          />
        </label>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {isSubmitting ? 'Retrying...' : 'Retry batch'}
        </button>
      </Form>

      {missingWithPostcode.length ? (
        <Form method="post" className="rounded-lg border bg-card p-4 space-y-3">
          <input type="hidden" name="intent" value="retry-selected" />
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Profiles missing riding</h2>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md border border-input px-3 py-1.5 text-xs font-medium disabled:opacity-60"
            >
              Retry selected
            </button>
          </div>
          <div className="max-h-[26rem] overflow-auto rounded border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Pick</th>
                  <th className="px-3 py-2">Profile</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Postcode</th>
                  <th className="px-3 py-2">Lookup status</th>
                  <th className="px-3 py-2">Last attempt</th>
                </tr>
              </thead>
              <tbody>
                {missingWithPostcode.map(profile => (
                  <tr key={profile.id} className="border-t">
                    <td className="px-3 py-2 align-top">
                      <input type="checkbox" name="profile_id" value={profile.id} />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="font-medium">{profileLabel(profile)}</div>
                      <div className="text-xs text-muted-foreground">{profile.id}</div>
                    </td>
                    <td className="px-3 py-2 align-top">{profile.role ?? 'N/A'}</td>
                    <td className="px-3 py-2 align-top">{profile.postcode ?? 'N/A'}</td>
                    <td className="px-3 py-2 align-top">
                      {profile.riding_lookup_status ?? 'not_attempted'}
                      {profile.riding_lookup_error ? ` (${profile.riding_lookup_error})` : ''}
                    </td>
                    <td className="px-3 py-2 align-top">{profile.riding_lookup_last_attempt_at ?? 'Never'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Form>
      ) : null}

      {actionData?.error ? (
        <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {actionData.error}
        </section>
      ) : null}

      {actionData?.result ? (
        <section className="rounded-lg border bg-card p-4 space-y-2 text-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Last retry result</h2>
          <div className="grid gap-2 md:grid-cols-2">
            <p><span className="font-medium">Attempted:</span> {actionData.result.attempted}</p>
            <p><span className="font-medium">Matched:</span> {actionData.result.matched}</p>
            <p><span className="font-medium">Not found:</span> {actionData.result.notFound}</p>
            <p><span className="font-medium">District not seeded:</span> {actionData.result.districtNotSeeded}</p>
            <p><span className="font-medium">Failed:</span> {actionData.result.failed}</p>
            <p><span className="font-medium">Skipped missing postcode:</span> {actionData.result.skippedMissingPostcode}</p>
          </div>
        </section>
      ) : null}
    </div>
  )
}
