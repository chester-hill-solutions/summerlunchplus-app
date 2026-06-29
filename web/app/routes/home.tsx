import { Form, Link, redirect, useActionData, useLoaderData, useNavigation, useSearchParams } from 'react-router'

import type { Route } from './+types/home'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { adminClient } from '@/lib/supabase/adminClient'
import { enforceOnboardingGuard } from '@/lib/auth.server'
import { resolveFamilyGraph } from '@/lib/family.server'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import { normalizeEmail } from '@/lib/email-domain'
import { hashZlrToken, newZlrToken } from '@/lib/zoom-jobs/zlr-token.server'
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
        classId: string
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
        classId: nextClassCandidate.id,
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

  if (intent === 'join-class') {
    const classId = String(formData.get('class_id') ?? '')
    if (!classId) return { error: 'Class is required.' } satisfies ActionData

    const { data: classRow, error: classError } = await supabase
      .from('class')
      .select('id, workshop_id, starts_at, ends_at')
      .eq('id', classId)
      .maybeSingle()

    if (classError || !classRow?.id || !classRow.workshop_id) {
      return { error: classError?.message ?? 'Class not found.' } satisfies ActionData
    }

    const { data: enrollments, error: enrollmentError } = await supabase
      .from('workshop_enrollment')
      .select('profile_id')
      .eq('workshop_id', classRow.workshop_id)
      .eq('status', 'approved')
      .in('profile_id', family.familyProfileIds)

    if (enrollmentError) return { error: enrollmentError.message } satisfies ActionData
    const approvedProfileIds = new Set(
      (enrollments ?? []).map(enrollment => enrollment.profile_id).filter((id): id is string => Boolean(id))
    )
    if (!approvedProfileIds.size) {
      return { error: 'Your family is not approved for this class.' } satisfies ActionData
    }

    const profilePriority: string[] = []
    const primaryChildId = family.profileRole === 'guardian' ? (family.primaryChildByGuardian.get(family.profileId) ?? null) : null
    if (primaryChildId) profilePriority.push(primaryChildId)
    for (const child of family.children) profilePriority.push(child.id)
    for (const guardian of family.guardians) profilePriority.push(guardian.id)
    if (family.profileId) profilePriority.push(family.profileId)

    const orderedProfileIds = Array.from(new Set(profilePriority)).filter(profileId => approvedProfileIds.has(profileId))

    if (!orderedProfileIds.length) {
      return { error: 'No eligible family member found for this class.' } satisfies ActionData
    }

    const { data: registrants, error: registrantError } = await adminClient
      .from('class_zoom_registrant')
      .select('id, profile_id')
      .eq('class_id', classId)
      .in('profile_id', orderedProfileIds)

    if (registrantError) return { error: registrantError.message } satisfies ActionData
    if (!registrants?.length) {
      return { error: 'Join link is not ready yet. Please try again in a few minutes.' } satisfies ActionData
    }

    const priorityIndex = new Map(orderedProfileIds.map((profileId, index) => [profileId, index]))
    const registrant = [...registrants].sort((left, right) => {
      const leftRank = priorityIndex.get(left.profile_id) ?? Number.MAX_SAFE_INTEGER
      const rightRank = priorityIndex.get(right.profile_id) ?? Number.MAX_SAFE_INTEGER
      return leftRank - rightRank
    })[0]

    const token = newZlrToken()
    const tokenHash = hashZlrToken(token)
    const expiresAt = new Date(new Date(classRow.ends_at).getTime() + 15 * 60_000).toISOString()
    const { error: tokenError } = await adminClient
      .from('class_zoom_registrant')
      .update({ zlr_token_hash: tokenHash, zlr_expires_at: expiresAt })
      .eq('id', registrant.id)

    if (tokenError) return { error: tokenError.message } satisfies ActionData

    throw redirect(`/zlr/${token}`)
  }

  if (family.profileRole !== 'guardian') {
    return { error: 'Only guardians can manage family membership.' } satisfies ActionData
  }

  if (intent === 'set_primary_child') {
    const childId = String(formData.get('child_id') ?? '')
    if (!childId) return { error: 'Child is required.' } satisfies ActionData
    if (!family.children.some(child => child.id === childId)) return { error: 'Invalid child.' } satisfies ActionData

    const guardianIds = family.guardians.map(guardian => guardian.id)
    if (!guardianIds.length) {
      return { error: 'No guardians found for this family.' } satisfies ActionData
    }

    await adminClient
      .from('person_guardian_child')
      .update({ primary_child: false })
      .in('guardian_profile_id', guardianIds)

    const { data: updatedRows, error } = await adminClient
      .from('person_guardian_child')
      .update({ primary_child: true })
      .in('guardian_profile_id', guardianIds)
      .eq('child_profile_id', childId)
      .select('id')

    if (error) return { error: error.message } satisfies ActionData
    if (!updatedRows?.length) {
      return { error: 'Selected child is not linked to this family.' } satisfies ActionData
    }

    return { ok: true, message: 'Primary child updated for the family.' } satisfies ActionData
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

    const { data: profileRow } = await adminClient
      .from('profile')
      .select('id, user_id')
      .eq('id', profileId)
      .maybeSingle()

    if (!profileRow?.id) {
      return { error: 'Profile not found.' } satisfies ActionData
    }

    if (profileRow.user_id) {
      return { error: 'This account is already active and does not need a new invite.' } satisfies ActionData
    }

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
  const navigation = useNavigation()
  const [searchParams] = useSearchParams()
  const mutationLocked =
    navigation.state !== 'idle' &&
    typeof navigation.formMethod === 'string' &&
    navigation.formMethod.toLowerCase() === 'post'
  const tab = searchParams.get('tab') === 'manage-family' ? 'manage-family' : 'family-workshops'
  const enrollmentStatusParam = searchParams.get('enrollmentStatus')
  const enrollmentStatus = enrollmentStatusParam === 'error' ? 'error' : enrollmentStatusParam === 'success' ? 'success' : null
  const enrollmentMessage = searchParams.get('enrollmentMessage')
  const title = tab === 'manage-family' ? 'Manage Family' : 'Family Workshops'
  const subtitle =
    tab === 'manage-family'
      ? 'Add family members, set one primary child, and manage invitation access.'
      : 'Track enrollments and view upcoming or past class attendance.'

  const inviteByEmail = new Map<string, InviteRow>()
  for (const invite of invites) {
    const key = invite.invitee_email.toLowerCase()
    if (!inviteByEmail.has(key)) {
      inviteByEmail.set(key, invite)
    }
  }

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

  const sortedWorkshopEnrollments = workshopEnrollments
    .slice()
    .sort((a, b) => {
      const workshopIdA = a.workshop_id as string
      const workshopIdB = b.workshop_id as string

      const nextA = upcomingAndPastByWorkshop[workshopIdA]?.upcoming?.[0]?.starts_at ?? null
      const nextB = upcomingAndPastByWorkshop[workshopIdB]?.upcoming?.[0]?.starts_at ?? null

      if (nextA && nextB) {
        const byNextClass = new Date(nextA).getTime() - new Date(nextB).getTime()
        if (byNextClass !== 0) return byNextClass
      } else if (nextA) {
        return -1
      } else if (nextB) {
        return 1
      }

      return a.requested_at.localeCompare(b.requested_at)
    })

  return (
    <main className="w-full px-6 pt-6 pb-10 space-y-6">
      <div className="flex gap-2">
        <Button asChild variant={tab === 'family-workshops' ? 'default' : 'outline'}>
          <Link to="/home">Family Workshops</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/enroll">Manage Enrollments</Link>
        </Button>
        <Button asChild variant={tab === 'manage-family' ? 'default' : 'outline'}>
          <Link to="/home?tab=manage-family">Manage Family</Link>
        </Button>
      </div>

      <header className="space-y-1">
        <h1 className="text-3xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </header>

      {enrollmentMessage && enrollmentStatus ? (
        <p className={enrollmentStatus === 'error' ? 'text-sm text-destructive' : 'text-sm text-emerald-600'}>{enrollmentMessage}</p>
      ) : null}

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
              <Form method="post" className="mt-3">
                <input type="hidden" name="intent" value="join-class" />
                <input type="hidden" name="class_id" value={nextClass.classId} />
                <Button type="submit" disabled={mutationLocked}>JOIN CLASS</Button>
              </Form>
            </section>
          ) : null}

          {!hasWorkshopEnrollment ? (
            <section className="rounded-lg border bg-card p-6 text-center shadow-sm space-y-4">
              <h2 className="text-xl font-semibold">Your family has not enrolled in any workshops</h2>
              <Button asChild>
                <Link to="/enroll">Manage enrollments</Link>
              </Button>
            </section>
          ) : (
            <>
              <section className="rounded-lg border bg-card p-4 shadow-sm space-y-3">
                <h2 className="text-lg font-semibold">Enrolled workshops</h2>
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
                    {sortedWorkshopEnrollments.map(enrollment => {
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
                          <TableCell>
                            {enrollment.status === 'pending' ? (
                              <span
                                className="cursor-help capitalize"
                                title="Your enrollment is under review. Thank you for your patience."
                              >
                                {enrollment.status}
                              </span>
                            ) : (
                              <span className="capitalize">{enrollment.status}</span>
                            )}
                          </TableCell>
                          <TableCell>{next ? formatDateTime(next.starts_at) : 'No upcoming class'}</TableCell>
                          <TableCell>{`Present: ${attendance.present} · Absent: ${attendance.absent}`}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </section>

              {sortedWorkshopEnrollments.map(enrollment => {
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Invite status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {familyProfiles
                  .slice()
                  .sort((a, b) => {
                    const roleA = a.role === 'guardian' ? 0 : 1
                    const roleB = b.role === 'guardian' ? 0 : 1
                    if (roleA !== roleB) return roleA - roleB
                    return personName(a).localeCompare(personName(b))
                  })
                  .map(profile => {
                    const isGuardian = profile.role === 'guardian'
                    const isStudent = profile.role === 'student'
                    const isPrimaryChild = isStudent && family.guardians.some(guardian => guardian.primaryChildId === profile.id)
                    const invite = profile.email ? inviteByEmail.get(profile.email.toLowerCase()) : null
                    const inviteStatus = profile.user_id
                      ? 'Active account'
                      : invite?.status
                        ? `Invite ${invite.status}`
                        : 'No invite sent'

                    return (
                      <TableRow key={profile.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{personName(profile)}</span>
                            {isPrimaryChild ? (
                              <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                                Primary child
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="capitalize">{profile.role}</TableCell>
                        <TableCell>{profile.email ?? 'No email'}</TableCell>
                        <TableCell className="capitalize">{inviteStatus}</TableCell>
                        <TableCell>
                          {family.profileRole === 'guardian' ? (
                            <div className="flex flex-wrap items-center gap-2">
                              {isStudent ? (
                                <Form method="post" className="flex items-center gap-2">
                                  <input type="hidden" name="intent" value="set_primary_child" />
                                  <input type="hidden" name="child_id" value={profile.id} />
                                  <Button type="submit" variant="outline" size="sm" disabled={isPrimaryChild || mutationLocked}>
                                    {isPrimaryChild ? 'Primary' : 'Set primary'}
                                  </Button>
                                </Form>
                              ) : null}
                              {!profile.user_id && (isStudent || isGuardian) ? (
                                <Form method="post" className="flex items-center gap-2">
                                  <input type="hidden" name="intent" value="send_or_resend_invite" />
                                  <input type="hidden" name="profile_id" value={profile.id} />
                                  <input type="hidden" name="role" value={isGuardian ? 'guardian' : 'student'} />
                                  <Input
                                    name="email"
                                    type="email"
                                    defaultValue={profile.email ?? ''}
                                    placeholder={isGuardian ? 'guardian@gmail.com' : 'child@gmail.com'}
                                    className="h-8 w-52"
                                    required
                                    disabled={mutationLocked}
                                  />
                                  <Button type="submit" variant="outline" size="sm" disabled={mutationLocked}>
                                    {invite?.status === 'pending' ? 'Resend invite' : 'Send invite'}
                                  </Button>
                                </Form>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">View only</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}

                {family.profileRole === 'guardian' ? (
                  <>
                    <TableRow>
                      <TableCell className="font-medium">Add child</TableCell>
                      <TableCell>student</TableCell>
                      <TableCell colSpan={3}>
                        <Form method="post" className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="intent" value="add_child" />
                          <Input name="firstname" placeholder="First name" className="h-8 w-32" disabled={mutationLocked} />
                          <Input name="surname" placeholder="Surname" className="h-8 w-32" disabled={mutationLocked} />
                          <Input name="email" type="email" placeholder="Email (optional)" className="h-8 w-52" disabled={mutationLocked} />
                          <Button type="submit" size="sm" disabled={mutationLocked}>Add</Button>
                        </Form>
                      </TableCell>
                    </TableRow>

                    <TableRow>
                      <TableCell className="font-medium">Add guardian</TableCell>
                      <TableCell>guardian</TableCell>
                      <TableCell colSpan={3}>
                        <Form method="post" className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="intent" value="add_guardian" />
                          <Input name="firstname" placeholder="First name" className="h-8 w-32" disabled={mutationLocked} />
                          <Input name="surname" placeholder="Surname" className="h-8 w-32" disabled={mutationLocked} />
                          <Input name="email" type="email" placeholder="guardian@gmail.com" className="h-8 w-52" required disabled={mutationLocked} />
                          <select name="child_id" className="h-8 rounded border border-input bg-background px-2 text-xs" required disabled={mutationLocked}>
                            <option value="">Link to child</option>
                            {familyProfiles
                              .filter(profile => profile.role === 'student')
                              .map(child => (
                                <option key={child.id} value={child.id}>
                                  {personName(child)}
                                </option>
                              ))}
                          </select>
                          <Button type="submit" size="sm" disabled={mutationLocked}>Add</Button>
                        </Form>
                      </TableCell>
                    </TableRow>
                  </>
                ) : null}
              </TableBody>
            </Table>
          </section>
        </div>
      )}
    </main>
  )
}
