import { Form, Link, redirect, useActionData, useLoaderData, useSearchParams } from 'react-router'

import type { Route } from './+types/home'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { adminClient } from '@/lib/supabase/adminClient'
import { enforceOnboardingGuard } from '@/lib/auth.server'
import { resolveFamilyGraph } from '@/lib/family.server'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import { normalizeEmail } from '@/lib/email-domain'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type FamilyProfile = {
  id: string
  role: 'guardian' | 'student' | string
  firstname: string | null
  surname: string | null
  email: string | null
  user_id: string | null
}

type InviteRow = {
  id: string
  invitee_email: string
  role: 'guardian' | 'student'
  status: string
  created_at: string
}

type EnrollmentRow = {
  id: string
  workshop_id: string | null
  semester_id: string
  status: string
  requested_at: string
  profile_id: string | null
}

type WorkshopRow = {
  id: string
  description: string | null
  semester_id: string
}

type ClassRow = {
  id: string
  workshop_id: string | null
  starts_at: string
  ends_at: string
}

type AttendanceRow = {
  class_id: string
  profile_id: string
  status: 'unknown' | 'present' | 'absent' | null
}

type LoaderData = {
  family: Awaited<ReturnType<typeof resolveFamilyGraph>>
  familyProfiles: FamilyProfile[]
  invites: InviteRow[]
  workshopsById: Record<string, WorkshopRow>
  semesterById: Record<string, { id: string; name: string | null; starts_at: string; ends_at: string }>
  enrollments: EnrollmentRow[]
  classesByWorkshop: Record<string, ClassRow[]>
  attendanceByClass: Record<string, AttendanceRow[]>
  nextClass:
    | {
        workshopId: string
        workshopLabel: string
        starts_at: string
        ends_at: string
      }
    | null
}

type ActionData = {
  ok?: boolean
  error?: string
  message?: string
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))

const personName = (profile: { firstname: string | null; surname: string | null; email: string | null }) => {
  const full = [profile.firstname, profile.surname].filter(Boolean).join(' ').trim()
  return full || profile.email || 'Unnamed'
}

const sendInvite = async ({
  email,
  role,
  origin,
  inviterProfileId,
  inviterRole,
  inviterEmail,
  inviterUserId,
}: {
  email: string
  role: 'guardian' | 'student'
  origin: string
  inviterProfileId: string
  inviterRole: 'guardian' | 'student'
  inviterEmail: string
  inviterUserId: string
}) => {
  const redirectTo = `${origin}/auth/sign-up-details?role=${role}`
  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: {
      inviter_profile_id: inviterProfileId,
      inviter_role: inviterRole,
      inviter_email: inviterEmail,
      role,
    },
  })

  let inviteeUserId = inviteData?.user?.id ?? null
  if (inviteError) {
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        redirectTo,
        data: {
          inviter_profile_id: inviterProfileId,
          inviter_role: inviterRole,
          inviter_email: inviterEmail,
          role,
        },
      },
    })
    if (linkError) {
      return { error: inviteError.message ?? linkError.message ?? 'Unable to send invite', inviteeUserId: null }
    }
    inviteeUserId = linkData?.user?.id ?? inviteeUserId
  }

  const { error: inviteTableError } = await adminClient
    .from('invites')
    .upsert(
      {
        inviter_user_id: inviterUserId,
        invitee_user_id: inviteeUserId,
        invitee_email: email,
        role,
        status: 'pending',
        confirmed_at: null,
      },
      { onConflict: 'invitee_email' }
    )

  if (inviteTableError) {
    return { error: inviteTableError.message, inviteeUserId }
  }

  return { error: null, inviteeUserId }
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await enforceOnboardingGuard(request)
  if (isRoleAtLeast(auth.claims.role, 'instructor')) {
    throw redirect('/manage', { headers: auth.headers })
  }

  const { supabase } = createClient(request)
  const now = Date.now()

  const family = await resolveFamilyGraph(supabase, auth.user.id)

  const { data: familyProfilesRaw } = await adminClient
    .from('profile')
    .select('id, role, firstname, surname, email, user_id')
    .in('id', family.familyProfileIds)

  const familyProfiles = (familyProfilesRaw ?? []) as FamilyProfile[]

  const familyEmails = familyProfiles.map(profile => profile.email).filter((email): email is string => Boolean(email))
  const { data: invitesRaw } = familyEmails.length
    ? await adminClient
        .from('invites')
        .select('id, invitee_email, role, status, created_at')
        .in('invitee_email', familyEmails)
        .in('role', ['guardian', 'student'])
        .order('created_at', { ascending: false })
    : { data: [] }

  const invites = (invitesRaw ?? []) as InviteRow[]

  const { data: enrollmentsRaw } = await supabase
    .from('workshop_enrollment')
    .select('id, workshop_id, semester_id, status, requested_at, profile_id')
    .in('profile_id', family.familyProfileIds)
    .order('requested_at', { ascending: false })

  const enrollments = (enrollmentsRaw ?? []) as EnrollmentRow[]
  const workshopIds = Array.from(new Set(enrollments.map(row => row.workshop_id).filter((id): id is string => Boolean(id))))

  const { data: workshopsRaw } = workshopIds.length
    ? await supabase
        .from('workshop')
        .select('id, description, semester_id')
        .in('id', workshopIds)
    : { data: [] }
  const workshops = (workshopsRaw ?? []) as WorkshopRow[]

  const semesterIds = Array.from(new Set(workshops.map(row => row.semester_id)))
  const { data: semestersRaw } = semesterIds.length
    ? await supabase
        .from('semester')
        .select('id, name, starts_at, ends_at')
        .in('id', semesterIds)
    : { data: [] }

  const workshopsById = Object.fromEntries(workshops.map(workshop => [workshop.id, workshop]))
  const semesterById = Object.fromEntries((semestersRaw ?? []).map(semester => [semester.id, semester])) as LoaderData['semesterById']

  const { data: classesRaw } = workshopIds.length
    ? await supabase
        .from('class')
        .select('id, workshop_id, starts_at, ends_at')
        .in('workshop_id', workshopIds)
        .order('starts_at', { ascending: true })
    : { data: [] }
  const classes = (classesRaw ?? []) as ClassRow[]
  const classesByWorkshop = classes.reduce<Record<string, ClassRow[]>>((acc, classRow) => {
    if (!classRow.workshop_id) return acc
    if (!acc[classRow.workshop_id]) acc[classRow.workshop_id] = []
    acc[classRow.workshop_id].push(classRow)
    return acc
  }, {})

  const classIds = classes.map(classRow => classRow.id)
  const { data: attendanceRaw } = classIds.length
    ? await adminClient
        .from('class_attendance')
        .select('class_id, profile_id, status')
        .in('class_id', classIds)
        .in('profile_id', family.familyProfileIds)
    : { data: [] }
  const attendanceByClass = ((attendanceRaw ?? []) as AttendanceRow[]).reduce<Record<string, AttendanceRow[]>>((acc, row) => {
    if (!acc[row.class_id]) acc[row.class_id] = []
    acc[row.class_id].push(row)
    return acc
  }, {})

  const approvedWorkshopIds = new Set(
    enrollments.filter(enrollment => enrollment.status === 'approved').map(enrollment => enrollment.workshop_id).filter(Boolean)
  )

  const nextClassCandidate = classes
    .filter(classRow => Boolean(classRow.workshop_id) && approvedWorkshopIds.has(classRow.workshop_id) && new Date(classRow.starts_at).getTime() > now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0]

  const nextClass = nextClassCandidate?.workshop_id
    ? {
        workshopId: nextClassCandidate.workshop_id,
        workshopLabel: workshopsById[nextClassCandidate.workshop_id]?.description ?? 'Workshop',
        starts_at: nextClassCandidate.starts_at,
        ends_at: nextClassCandidate.ends_at,
      }
    : null

  return {
    family,
    familyProfiles,
    invites,
    workshopsById,
    semesterById,
    enrollments,
    classesByWorkshop,
    attendanceByClass,
    nextClass,
  } satisfies LoaderData
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await enforceOnboardingGuard(request)
  const { supabase } = createClient(request)
  const family = await resolveFamilyGraph(supabase, auth.user.id)
  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? '')

  if (family.profileRole !== 'guardian') {
    return { error: 'Only guardians can manage family membership.' } satisfies ActionData
  }

  if (intent === 'set_primary_child') {
    const guardianId = String(formData.get('guardian_id') ?? '')
    const childId = String(formData.get('child_id') ?? '')
    if (!guardianId || !childId) return { error: 'Guardian and child are required.' } satisfies ActionData
    if (!family.guardians.some(guardian => guardian.id === guardianId)) return { error: 'Invalid guardian.' } satisfies ActionData
    if (!family.children.some(child => child.id === childId)) return { error: 'Invalid child.' } satisfies ActionData

    await adminClient
      .from('person_guardian_child')
      .update({ primary_child: false })
      .eq('guardian_profile_id', guardianId)

    const { error } = await adminClient
      .from('person_guardian_child')
      .upsert(
        {
          guardian_profile_id: guardianId,
          child_profile_id: childId,
          primary_child: true,
        },
        { onConflict: 'guardian_profile_id,child_profile_id' }
      )

    if (error) return { error: error.message } satisfies ActionData
    return { ok: true, message: 'Primary child updated.' } satisfies ActionData
  }

  if (intent === 'add_child') {
    const firstname = String(formData.get('firstname') ?? '').trim() || null
    const surname = String(formData.get('surname') ?? '').trim() || null
    const rawEmail = String(formData.get('email') ?? '').trim()
    const email = rawEmail ? normalizeEmail(rawEmail) : null

    const { data: childRow, error: childError } = await adminClient
      .from('profile')
      .insert({
        role: 'student',
        firstname,
        surname,
        email,
      })
      .select('id, email')
      .single()

    if (childError || !childRow?.id) {
      return { error: childError?.message ?? 'Unable to add child.' } satisfies ActionData
    }

    await adminClient
      .from('person_guardian_child')
      .upsert(
        {
          guardian_profile_id: family.profileId,
          child_profile_id: childRow.id,
          primary_child: !family.primaryChildByGuardian.get(family.profileId),
        },
        { onConflict: 'guardian_profile_id,child_profile_id' }
      )

    if (email) {
      const inviteResult = await sendInvite({
        email,
        role: 'student',
        origin: new URL(request.url).origin,
        inviterProfileId: family.profileId,
        inviterRole: 'guardian',
        inviterEmail: auth.user.email ?? '',
        inviterUserId: auth.user.id,
      })
      if (inviteResult.error) {
        return { error: inviteResult.error } satisfies ActionData
      }
      if (inviteResult.inviteeUserId) {
        await adminClient.from('profile').update({ user_id: inviteResult.inviteeUserId }).eq('id', childRow.id)
      }
    }

    return { ok: true, message: email ? 'Child added and invite sent.' : 'Child added.' } satisfies ActionData
  }

  if (intent === 'add_guardian') {
    const childId = String(formData.get('child_id') ?? '')
    const rawEmail = String(formData.get('email') ?? '').trim()
    const email = normalizeEmail(rawEmail)
    const firstname = String(formData.get('firstname') ?? '').trim() || null
    const surname = String(formData.get('surname') ?? '').trim() || null

    if (!childId) return { error: 'Select a child for this guardian.' } satisfies ActionData
    if (!family.children.some(child => child.id === childId)) return { error: 'Invalid child.' } satisfies ActionData
    if (!email) return { error: 'Guardian email is required.' } satisfies ActionData

    const { data: guardianProfile, error: guardianError } = await adminClient
      .from('profile')
      .upsert(
        {
          role: 'guardian',
          email,
          firstname,
          surname,
        },
        { onConflict: 'email' }
      )
      .select('id')
      .single()

    if (guardianError || !guardianProfile?.id) {
      return { error: guardianError?.message ?? 'Unable to create guardian.' } satisfies ActionData
    }

    await adminClient
      .from('person_guardian_child')
      .upsert(
        {
          guardian_profile_id: guardianProfile.id,
          child_profile_id: childId,
          primary_child: false,
        },
        { onConflict: 'guardian_profile_id,child_profile_id' }
      )

    const inviteResult = await sendInvite({
      email,
      role: 'guardian',
      origin: new URL(request.url).origin,
      inviterProfileId: family.profileId,
      inviterRole: 'guardian',
      inviterEmail: auth.user.email ?? '',
      inviterUserId: auth.user.id,
    })

    if (inviteResult.error) {
      return { error: inviteResult.error } satisfies ActionData
    }

    if (inviteResult.inviteeUserId) {
      await adminClient.from('profile').update({ user_id: inviteResult.inviteeUserId }).eq('id', guardianProfile.id)
    }

    return { ok: true, message: 'Guardian added and invite sent.' } satisfies ActionData
  }

  if (intent === 'send_or_resend_invite') {
    const profileId = String(formData.get('profile_id') ?? '')
    const role = String(formData.get('role') ?? '')
    const rawEmail = String(formData.get('email') ?? '').trim()
    const email = normalizeEmail(rawEmail)

    if (!profileId) return { error: 'Profile is required.' } satisfies ActionData
    if (role !== 'guardian' && role !== 'student') return { error: 'Invalid role.' } satisfies ActionData
    if (!email) return { error: 'Email is required.' } satisfies ActionData
    if (!family.familyProfileIds.includes(profileId)) return { error: 'Profile is not in this family.' } satisfies ActionData

    await adminClient.from('profile').update({ email }).eq('id', profileId)

    const inviteResult = await sendInvite({
      email,
      role,
      origin: new URL(request.url).origin,
      inviterProfileId: family.profileId,
      inviterRole: 'guardian',
      inviterEmail: auth.user.email ?? '',
      inviterUserId: auth.user.id,
    })

    if (inviteResult.error) return { error: inviteResult.error } satisfies ActionData

    if (inviteResult.inviteeUserId) {
      await adminClient.from('profile').update({ user_id: inviteResult.inviteeUserId }).eq('id', profileId)
    }

    return { ok: true, message: 'Invite sent.' } satisfies ActionData
  }

  return { error: 'Unknown action.' } satisfies ActionData
}

export default function Home() {
  const {
    family,
    familyProfiles,
    invites,
    workshopsById,
    semesterById,
    enrollments,
    classesByWorkshop,
    attendanceByClass,
    nextClass,
  } = useLoaderData<LoaderData>()
  const actionData = useActionData<ActionData>()
  const [searchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'manage-family' ? 'manage-family' : 'family-workshops'

  const workshopEnrollments = enrollments.filter(enrollment => Boolean(enrollment.workshop_id))
  const hasWorkshopEnrollment = workshopEnrollments.length > 0

  const upcomingAndPastByWorkshop = Object.fromEntries(
    Object.entries(classesByWorkshop).map(([workshopId, classes]) => {
      const now = Date.now()
      const upcoming = classes.filter(classRow => new Date(classRow.starts_at).getTime() > now)
      const past = classes.filter(classRow => new Date(classRow.starts_at).getTime() <= now)
      return [workshopId, { upcoming, past }]
    })
  ) as Record<string, { upcoming: ClassRow[]; past: ClassRow[] }>

  const attendanceSummaryForWorkshop = (workshopId: string) => {
    const classes = classesByWorkshop[workshopId] ?? []
    let present = 0
    let absent = 0
    for (const classRow of classes) {
      for (const record of attendanceByClass[classRow.id] ?? []) {
        if (record.status === 'present') present += 1
        if (record.status === 'absent') absent += 1
      }
    }
    return { present, absent }
  }

  return (
    <main className="w-full px-6 py-10 space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold">Family Workshops</h1>
        <p className="text-sm text-muted-foreground">Track enrollments, review classes, and manage your family account.</p>
      </header>

      <div className="flex gap-2">
        <Button asChild variant={tab === 'family-workshops' ? 'default' : 'outline'}>
          <Link to="/home">Family Workshops</Link>
        </Button>
        <Button asChild variant={tab === 'manage-family' ? 'default' : 'outline'}>
          <Link to="/home?tab=manage-family">Manage Family</Link>
        </Button>
      </div>

      {actionData?.error ? <p className="text-sm text-destructive">{actionData.error}</p> : null}
      {actionData?.ok && actionData.message ? <p className="text-sm text-emerald-600">{actionData.message}</p> : null}

      {tab === 'family-workshops' ? (
        <div className="space-y-6">
          {nextClass ? (
            <section className="rounded-lg border bg-card p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Next class</p>
              <p className="mt-1 text-lg font-semibold">{nextClass.workshopLabel}</p>
              <p className="text-sm text-muted-foreground">
                {formatDateTime(nextClass.starts_at)} - {formatDateTime(nextClass.ends_at)}
              </p>
            </section>
          ) : null}

          {!hasWorkshopEnrollment ? (
            <section className="rounded-lg border bg-card p-6 text-center shadow-sm space-y-4">
              <h2 className="text-xl font-semibold">Your family has not enrolled in any workshops</h2>
              <Button asChild>
                <Link to="/enroll">Enroll in a workshop</Link>
              </Button>
            </section>
          ) : (
            <>
              <section className="rounded-lg border bg-card p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">Enrolled workshops</h2>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/enroll">Enroll in a workshop</Link>
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Workshop</TableHead>
                      <TableHead>Semester</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Next class</TableHead>
                      <TableHead>Attendance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workshopEnrollments.map(enrollment => {
                      const workshopId = enrollment.workshop_id as string
                      const workshop = workshopsById[workshopId]
                      const semester = semesterById[enrollment.semester_id]
                      const upcoming = upcomingAndPastByWorkshop[workshopId]?.upcoming ?? []
                      const next = upcoming[0]
                      const attendance = attendanceSummaryForWorkshop(workshopId)

                      return (
                        <TableRow key={enrollment.id}>
                          <TableCell>
                            <a href={`#workshop-${workshopId}`} className="underline decoration-dotted underline-offset-2 hover:text-primary">
                              {workshop?.description ?? 'Workshop'}
                            </a>
                          </TableCell>
                          <TableCell>{semester?.name ?? (semester ? `${formatDate(semester.starts_at)} - ${formatDate(semester.ends_at)}` : enrollment.semester_id.slice(0, 8))}</TableCell>
                          <TableCell className="capitalize">{enrollment.status}</TableCell>
                          <TableCell>{next ? formatDateTime(next.starts_at) : 'No upcoming class'}</TableCell>
                          <TableCell>{`Present: ${attendance.present} · Absent: ${attendance.absent}`}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </section>

              {workshopEnrollments.map(enrollment => {
                const workshopId = enrollment.workshop_id as string
                const workshop = workshopsById[workshopId]
                const grouped = upcomingAndPastByWorkshop[workshopId] ?? { upcoming: [], past: [] }

                return (
                  <section key={`detail-${enrollment.id}`} id={`workshop-${workshopId}`} className="rounded-lg border bg-card p-4 shadow-sm space-y-4">
                    <h3 className="text-lg font-semibold">{workshop?.description ?? 'Workshop'} classes</h3>

                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Upcoming classes</h4>
                      {grouped.upcoming.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No upcoming classes scheduled.</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Starts</TableHead>
                              <TableHead>Ends</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {grouped.upcoming.map(classRow => (
                              <TableRow key={classRow.id}>
                                <TableCell>{formatDateTime(classRow.starts_at)}</TableCell>
                                <TableCell>{formatDateTime(classRow.ends_at)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Past classes & attendance</h4>
                      {grouped.past.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No past classes yet.</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Class date</TableHead>
                              <TableHead>Present</TableHead>
                              <TableHead>Absent</TableHead>
                              <TableHead>Unknown</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {grouped.past.map(classRow => {
                              const records = attendanceByClass[classRow.id] ?? []
                              const present = records.filter(record => record.status === 'present').length
                              const absent = records.filter(record => record.status === 'absent').length
                              const unknown = records.filter(record => record.status === 'unknown' || record.status === null).length

                              return (
                                <TableRow key={classRow.id}>
                                  <TableCell>{formatDateTime(classRow.starts_at)}</TableCell>
                                  <TableCell>{present}</TableCell>
                                  <TableCell>{absent}</TableCell>
                                  <TableCell>{unknown}</TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  </section>
                )
              })}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {family.profileRole !== 'guardian' ? (
            <section className="rounded-lg border bg-card p-4 shadow-sm">
              <p className="text-sm text-muted-foreground">Only guardians can modify family members. Students can still view family details.</p>
            </section>
          ) : null}

          <section className="rounded-lg border bg-card p-4 shadow-sm space-y-3">
            <h2 className="text-lg font-semibold">Family members</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Guardians</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Primary child</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {familyProfiles.filter(profile => profile.role === 'guardian').map(guardian => (
                      <TableRow key={guardian.id}>
                        <TableCell>{personName(guardian)}</TableCell>
                        <TableCell>{guardian.email ?? 'No email'}</TableCell>
                        <TableCell>
                          {family.primaryChildByGuardian.get(guardian.id) ? (
                            <Form method="post" className="flex items-center gap-2">
                              <input type="hidden" name="intent" value="set_primary_child" />
                              <input type="hidden" name="guardian_id" value={guardian.id} />
                              <select name="child_id" defaultValue={family.primaryChildByGuardian.get(guardian.id)} className="h-8 rounded border border-input bg-background px-2 text-xs">
                                {familyProfiles
                                  .filter(profile => profile.role === 'student')
                                  .map(child => (
                                    <option key={child.id} value={child.id}>
                                      {personName(child)}
                                    </option>
                                  ))}
                              </select>
                              <Button type="submit" variant="outline" size="sm">Save</Button>
                            </Form>
                          ) : (
                            <Form method="post" className="flex items-center gap-2">
                              <input type="hidden" name="intent" value="set_primary_child" />
                              <input type="hidden" name="guardian_id" value={guardian.id} />
                              <select name="child_id" className="h-8 rounded border border-input bg-background px-2 text-xs">
                                {familyProfiles
                                  .filter(profile => profile.role === 'student')
                                  .map(child => (
                                    <option key={child.id} value={child.id}>
                                      {personName(child)}
                                    </option>
                                  ))}
                              </select>
                              <Button type="submit" variant="outline" size="sm">Set</Button>
                            </Form>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Children</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Invite</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {familyProfiles.filter(profile => profile.role === 'student').map(child => (
                      <TableRow key={child.id}>
                        <TableCell>{personName(child)}</TableCell>
                        <TableCell>{child.email ?? 'No email'}</TableCell>
                        <TableCell>
                          <Form method="post" className="flex items-center gap-2">
                            <input type="hidden" name="intent" value="send_or_resend_invite" />
                            <input type="hidden" name="profile_id" value={child.id} />
                            <input type="hidden" name="role" value="student" />
                            <Input name="email" type="email" defaultValue={child.email ?? ''} placeholder="child@gmail.com" className="h-8 w-56" required />
                            <Button type="submit" variant="outline" size="sm">
                              {child.user_id ? 'Resend' : 'Send initial invite'}
                            </Button>
                          </Form>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </section>

          {family.profileRole === 'guardian' ? (
            <section className="rounded-lg border bg-card p-4 shadow-sm space-y-4">
              <h2 className="text-lg font-semibold">Invite another guardian</h2>
              <Form method="post" className="grid gap-3 md:grid-cols-4">
                <input type="hidden" name="intent" value="add_guardian" />
                <div className="grid gap-1">
                  <Label htmlFor="guardian-firstname">First name</Label>
                  <Input id="guardian-firstname" name="firstname" />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="guardian-surname">Surname</Label>
                  <Input id="guardian-surname" name="surname" />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="guardian-email">Email</Label>
                  <Input id="guardian-email" name="email" type="email" required />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="guardian-child">Link to child</Label>
                  <select id="guardian-child" name="child_id" className="h-10 rounded border border-input bg-background px-2" required>
                    <option value="">Select child</option>
                    {familyProfiles
                      .filter(profile => profile.role === 'student')
                      .map(child => (
                        <option key={child.id} value={child.id}>
                          {personName(child)}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="md:col-span-4">
                  <Button type="submit">Invite guardian</Button>
                </div>
              </Form>

              <h2 className="text-lg font-semibold">Add child</h2>
              <Form method="post" className="grid gap-3 md:grid-cols-3">
                <input type="hidden" name="intent" value="add_child" />
                <div className="grid gap-1">
                  <Label htmlFor="child-firstname">First name</Label>
                  <Input id="child-firstname" name="firstname" />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="child-surname">Surname</Label>
                  <Input id="child-surname" name="surname" />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="child-email">Email (optional)</Label>
                  <Input id="child-email" name="email" type="email" />
                </div>
                <div className="md:col-span-3">
                  <Button type="submit">Add child</Button>
                </div>
              </Form>
            </section>
          ) : null}

          <section className="rounded-lg border bg-card p-4 shadow-sm space-y-2">
            <h2 className="text-lg font-semibold">Invites</h2>
            {invites.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invites yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map(invite => (
                    <TableRow key={invite.id}>
                      <TableCell>{invite.invitee_email}</TableCell>
                      <TableCell className="capitalize">{invite.role}</TableCell>
                      <TableCell className="capitalize">{invite.status}</TableCell>
                      <TableCell>{formatDate(invite.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        </div>
      )}
    </main>
  )
}
