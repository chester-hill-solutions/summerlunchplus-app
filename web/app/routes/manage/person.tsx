import { Link, NavLink, Outlet, redirect, useLoaderData, useLocation } from 'react-router'

import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'
import { adminClient } from '@/lib/supabase/adminClient'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { LoaderFunctionArgs } from 'react-router'
import type { PersonLoaderData, ProfileRow, SuspiciousSignalRow } from './person.shared'
import { profileLabel } from './person.shared'

const parsePrimaryIp = (ip: unknown, forwardedFor: string | null | undefined) => {
  if (typeof ip === 'string' && ip.trim()) return ip.trim()
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    const first = forwardedFor
      .split(',')
      .map(part => part.trim())
      .find(Boolean)
    if (first) return first
  }
  return null
}

const personTabs = [
  { to: '/manage/person', label: 'Overview' },
  { to: '/manage/person/family', label: 'Family' },
  { to: '/manage/person/enrollments', label: 'Enrollments' },
  { to: '/manage/person/form-submissions', label: 'Form submissions' },
  { to: '/manage/person/attendance', label: 'Attendance' },
  { to: '/manage/person/discrepancies', label: 'Discrepancies' },
]

export async function loader({ request }: LoaderFunctionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    throw redirect('/home', { headers: auth.headers })
  }

  const url = new URL(request.url)
  const profileIdParam = url.searchParams.get('profileId')
  const userIdParam = url.searchParams.get('userId')

  if (!profileIdParam && !userIdParam) {
    throw redirect('/manage/participants', { headers: auth.headers })
  }

  const profileQuery = adminClient
    .from('profile')
    .select('id, user_id, role, firstname, surname, email, phone, street_address, city, province, postcode, date_of_birth')

  const { data: profileRow } = profileIdParam
    ? await profileQuery.eq('id', profileIdParam).maybeSingle()
    : await profileQuery.eq('user_id', userIdParam as string).maybeSingle()

  if (!profileRow?.id) {
    throw redirect('/manage/participants', { headers: auth.headers })
  }

  const [latestFormSubmissionResult, latestLoginEventResult] = await Promise.all([
    adminClient
      .from('form_submission')
      .select('submitted_at, ip_address, forwarded_for')
      .eq('profile_id', profileRow.id)
      .order('submitted_at', { ascending: false })
      .limit(1),
    profileRow.user_id
      ? adminClient
          .from('login_event')
          .select('event_at, ip_address, forwarded_for')
          .eq('user_id', profileRow.user_id)
          .order('event_at', { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ])

  const ipCandidates = [
    ...(latestFormSubmissionResult.data ?? []).map(row => ({
      source: 'form_submission' as const,
      occurred_at: typeof row.submitted_at === 'string' ? row.submitted_at : '',
      ip_address: parsePrimaryIp(row.ip_address, typeof row.forwarded_for === 'string' ? row.forwarded_for : null),
    })),
    ...((latestLoginEventResult.data ?? []) as Array<Record<string, unknown>>).map(row => ({
      source: 'login_event' as const,
      occurred_at: typeof row.event_at === 'string' ? row.event_at : '',
      ip_address: parsePrimaryIp(row.ip_address, typeof row.forwarded_for === 'string' ? row.forwarded_for : null),
    })),
  ].filter(row => row.ip_address && row.occurred_at)

  const uniqueIps = Array.from(new Set(ipCandidates.map(row => row.ip_address as string)))
  const geoByIp = new Map<
    string,
    {
      country_code: string | null
      region: string | null
      city: string | null
      timezone: string | null
      latitude: number | null
      longitude: number | null
    }
  >()

  if (uniqueIps.length) {
    const { data: geoRows } = await (adminClient.from('ip_geolocation_cache' as any) as any)
      .select('ip, country_code, region, city, timezone, latitude, longitude')
      .in('ip', uniqueIps)

    for (const row of geoRows ?? []) {
      if (typeof row.ip !== 'string') continue
      geoByIp.set(row.ip, {
        country_code: typeof row.country_code === 'string' ? row.country_code : null,
        region: typeof row.region === 'string' ? row.region : null,
        city: typeof row.city === 'string' ? row.city : null,
        timezone: typeof row.timezone === 'string' ? row.timezone : null,
        latitude: typeof row.latitude === 'number' ? row.latitude : null,
        longitude: typeof row.longitude === 'number' ? row.longitude : null,
      })
    }
  }

  const ipEvidence = ipCandidates
    .map(row => {
      const ipAddress = row.ip_address as string
      const geo = geoByIp.get(ipAddress)
      return {
        source: row.source,
        occurred_at: row.occurred_at,
        ip_address: ipAddress,
        country_code: geo?.country_code ?? null,
        region: geo?.region ?? null,
        city: geo?.city ?? null,
        timezone: geo?.timezone ?? null,
        latitude: geo?.latitude ?? null,
        longitude: geo?.longitude ?? null,
      }
    })
    .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))

  const seen = new Set<string>([profileRow.id])
  const queue: string[] = [profileRow.id]
  const edges: Array<{ guardian_profile_id: string; child_profile_id: string; primary_child: boolean }> = []

  while (queue.length) {
    const batch = queue.splice(0, queue.length)
    const { data: batchEdges } = await adminClient
      .from('person_guardian_child')
      .select('guardian_profile_id, child_profile_id, primary_child')
      .or(`guardian_profile_id.in.(${batch.join(',')}),child_profile_id.in.(${batch.join(',')})`)

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

  const [{ data: familyProfilesRaw }, { data: enrollmentRowsRaw }, { data: suspiciousSignalsRaw }] = await Promise.all([
    adminClient
      .from('profile')
      .select('id, user_id, role, firstname, surname, email, phone, street_address, city, province, postcode, date_of_birth')
      .in('id', familyProfileIds),
    adminClient
      .from('workshop_enrollment')
      .select('id, profile_id, workshop_id, semester_id, status, requested_at')
      .in('profile_id', familyProfileIds)
      .order('requested_at', { ascending: false }),
    adminClient
      .from('suspicious_signal')
      .select('id, subject_profile_id, family_profile_ids, signal_type, severity, priority_score, priority_reason, summary, details, status, created_at, resolved_at, resolution_note')
      .order('priority_score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  const familyProfiles = (familyProfilesRaw ?? []) as ProfileRow[]
  const enrollments = (enrollmentRowsRaw ?? []) as PersonLoaderData['enrollments']
  const suspiciousSignals = ((suspiciousSignalsRaw ?? []) as SuspiciousSignalRow[]).filter(signal =>
    signal.family_profile_ids?.some(profileId => familyProfileIds.includes(profileId))
  )

  const familyUserIds = Array.from(
    new Set(familyProfiles.map(profile => profile.user_id).filter((userId): userId is string => Boolean(userId)))
  )

  const { data: profileLinkedSubmissionsRaw } = familyProfileIds.length
    ? await adminClient
        .from('form_submission')
        .select('id, profile_id, user_id, form_id, submitted_at')
        .in('profile_id', familyProfileIds)
        .order('submitted_at', { ascending: false })
    : { data: [] }

  const { data: userLinkedSubmissionsRaw } = familyUserIds.length
    ? await adminClient
        .from('form_submission')
        .select('id, profile_id, user_id, form_id, submitted_at')
        .in('user_id', familyUserIds)
        .order('submitted_at', { ascending: false })
    : { data: [] }

  const formSubmissionsById = new Map<string, PersonLoaderData['formSubmissions'][number]>()
  for (const submission of [
    ...((profileLinkedSubmissionsRaw ?? []) as PersonLoaderData['formSubmissions']),
    ...((userLinkedSubmissionsRaw ?? []) as PersonLoaderData['formSubmissions']),
  ]) {
    if (!submission.id || !submission.form_id) continue
    formSubmissionsById.set(submission.id, submission)
  }

  const formSubmissions = Array.from(formSubmissionsById.values()).sort(
    (left, right) => new Date(right.submitted_at).getTime() - new Date(left.submitted_at).getTime()
  )

  const primaryChildByGuardian: Record<string, string> = {}
  for (const edge of edges) {
    if (edge.primary_child) {
      primaryChildByGuardian[edge.guardian_profile_id] = edge.child_profile_id
    }
  }

  const workshopIds = Array.from(new Set(enrollments.map(row => row.workshop_id).filter((id): id is string => Boolean(id))))

  const { data: workshopsRaw } = workshopIds.length
    ? await adminClient
        .from('workshop')
        .select('id, description, semester_id')
        .in('id', workshopIds)
    : { data: [] }

  const workshopById = Object.fromEntries((workshopsRaw ?? []).map(workshop => [workshop.id, workshop])) as PersonLoaderData['workshopById']

  const formIds = Array.from(new Set(formSubmissions.map(row => row.form_id).filter((id): id is string => Boolean(id))))

  const { data: formsRaw } = formIds.length
    ? await adminClient
        .from('form')
        .select('id, name')
        .in('id', formIds)
    : { data: [] }

  const formNameById = Object.fromEntries(
    (formsRaw ?? []).map(formRow => [formRow.id, formRow.name ?? formRow.id.slice(0, 8)])
  ) as PersonLoaderData['formNameById']

  const semesterIds = Array.from(new Set((workshopsRaw ?? []).map(workshop => workshop.semester_id).filter(Boolean)))
  const { data: semestersRaw } = semesterIds.length
    ? await adminClient
        .from('semester')
        .select('id, name, starts_at, ends_at')
        .in('id', semesterIds)
    : { data: [] }

  const semesterById = Object.fromEntries((semestersRaw ?? []).map(semester => [semester.id, semester])) as PersonLoaderData['semesterById']

  const { data: classesRaw } = workshopIds.length
    ? await adminClient
        .from('class')
        .select('id, workshop_id, starts_at, ends_at')
        .in('workshop_id', workshopIds)
        .order('starts_at', { ascending: true })
    : { data: [] }

  const classByWorkshop = (classesRaw ?? []).reduce<PersonLoaderData['classByWorkshop']>((acc, classRow) => {
    if (!classRow.workshop_id) return acc
    if (!acc[classRow.workshop_id]) acc[classRow.workshop_id] = []
    acc[classRow.workshop_id].push({ id: classRow.id, starts_at: classRow.starts_at, ends_at: classRow.ends_at })
    return acc
  }, {})

  const classIds = (classesRaw ?? []).map(classRow => classRow.id)
  const { data: attendanceRaw } = classIds.length
    ? await adminClient
        .from('class_attendance')
        .select('class_id, profile_id, status')
        .in('class_id', classIds)
        .in('profile_id', familyProfileIds)
    : { data: [] }

  const attendanceByClass = (attendanceRaw ?? []).reduce<PersonLoaderData['attendanceByClass']>((acc, row) => {
    if (!acc[row.class_id]) acc[row.class_id] = []
    acc[row.class_id].push({ profile_id: row.profile_id, status: row.status })
    return acc
  }, {})

  return {
    profile: profileRow as ProfileRow,
    ipEvidence,
    familyProfiles,
    primaryChildByGuardian,
    enrollments,
    workshopById,
    formSubmissions,
    formNameById,
    semesterById,
    classByWorkshop,
    attendanceByClass,
    suspiciousSignals,
  } satisfies PersonLoaderData
}

export default function ManagePersonLayoutPage() {
  const data = useLoaderData() as PersonLoaderData
  const { profile, suspiciousSignals } = data
  const location = useLocation()
  const returnTo = new URLSearchParams(location.search).get('returnTo')
  const backTo = returnTo && returnTo.startsWith('/') ? returnTo : '/manage/participants'
  const openSignalCount = suspiciousSignals.filter(signal => signal.status === 'open').length

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{profileLabel(profile)}</h1>
          <p className="text-sm text-muted-foreground">
            Review participant details, family links, enrollments, attendance, and discrepancy alerts.
          </p>
          <p className="text-xs text-muted-foreground">
            {openSignalCount > 0 ? `${openSignalCount} open discrepancy signal${openSignalCount === 1 ? '' : 's'}` : 'No open discrepancy signals'}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to={backTo}>Back</Link>
        </Button>
      </div>

      <nav className="flex flex-wrap gap-2 border-b pb-2">
        {personTabs.map(tab => (
          <NavLink
            key={tab.to}
            to={{ pathname: tab.to, search: location.search }}
            end={tab.to === '/manage/person'}
            className={({ isActive }) =>
              cn(
                'rounded-md px-3 py-1.5 text-sm',
                isActive ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-muted'
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Outlet context={data} />
    </div>
  )
}
