import { useEffect, useRef, useState } from 'react'
import { Form, Link, redirect, useActionData, useLoaderData, useNavigation, useSearchParams } from 'react-router'

import type { Route } from './+types/home'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { adminClient } from '@/lib/supabase/adminClient'
import { enforceOnboardingGuard } from '@/lib/auth.server'
import { getMaskedEmailHint, normalizeEmail } from '@/lib/email-domain'
import { resolveGiftCardRelease } from '@/lib/gift-cards/release.server'
import { resolveFamilyGraph } from '@/lib/family.server'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
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

type LoaderData = {
  family: Awaited<ReturnType<typeof resolveFamilyGraph>>
  familyProfiles: FamilyProfile[]
  invites: InviteRow[]
  workshopsById: Record<string, WorkshopRow>
  semesterById: Record<string, { id: string; name: string | null; starts_at: string; ends_at: string }>
  enrollments: EnrollmentRow[]
  classesByWorkshop: Record<string, ClassRow[]>
  joinUrlByClass: Record<string, string>
  giftCardLinkByClass: Record<string, string>
  selectedProfileIdByClass: Record<string, string>
  selectedPhotoStatusByClass: Record<string, string>
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

type ToastState = {
  tone: 'success' | 'error'
  message: string
} | null

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

const shouldLogHomeInstrumentation =
  process.env.NODE_ENV !== 'production' || process.env.VITE_ENABLE_ROUTER_INSTRUMENTATION === 'true'

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
  const startedAt = Date.now()
  const auth = await enforceOnboardingGuard(request)
  if (isRoleAtLeast(auth.claims.role, 'instructor')) {
    throw redirect('/manage', { headers: auth.headers })
  }

  const { supabase } = createClient(request)
  const now = Date.now()

  const family = await resolveFamilyGraph(supabase, auth.user.id)

  const [familyProfilesResponse, enrollmentsResponse] = await Promise.all([
    adminClient
      .from('profile')
      .select('id, role, firstname, surname, email, user_id')
      .in('id', family.familyProfileIds),
    supabase
      .from('workshop_enrollment')
      .select('id, workshop_id, semester_id, status, requested_at, profile_id')
      .in('profile_id', family.familyProfileIds)
      .order('requested_at', { ascending: false }),
  ])

  const familyProfilesRaw = familyProfilesResponse.data
  const enrollmentsRaw = enrollmentsResponse.data

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

  const enrollments = (enrollmentsRaw ?? []) as EnrollmentRow[]
  if (shouldLogHomeInstrumentation) {
    console.info('[home-instrumentation]', {
      event: 'home_loader_base',
      emailHint: getMaskedEmailHint(auth.user.email),
      role: auth.claims.role,
      familyProfiles: family.familyProfileIds.length,
      enrollmentCount: enrollments.length,
      durationMs: Date.now() - startedAt,
    })
  }

  if (!enrollments.length) {
    return {
      family,
      familyProfiles,
      invites,
      workshopsById: {},
      semesterById: {},
      enrollments,
      classesByWorkshop: {},
      joinUrlByClass: {},
      giftCardLinkByClass: {},
      selectedProfileIdByClass: {},
      selectedPhotoStatusByClass: {},
      nextClass: null,
    } satisfies LoaderData
  }

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
  const classAtById = Object.fromEntries(
    classes.map(classRow => [classRow.id, classRow.starts_at || classRow.ends_at])
  ) as Record<string, string>
  const classEndsAtById = Object.fromEntries(classes.map(classRow => [classRow.id, classRow.ends_at])) as Record<string, string>

  const classIds = classes.map(classRow => classRow.id)

  const { data: registrantsRaw } = classIds.length
    ? await adminClient
        .from('class_zoom_registrant')
        .select('class_id, profile_id, zoom_join_url')
        .in('class_id', classIds)
        .in('profile_id', family.familyProfileIds)
    : { data: [] }

  const registrantsByClass = ((registrantsRaw ?? []) as Array<{ class_id: string; profile_id: string; zoom_join_url: string | null }>).reduce<
    Record<string, Array<{ profile_id: string; zoom_join_url: string | null }>>
  >((acc, row) => {
    if (!acc[row.class_id]) acc[row.class_id] = []
    acc[row.class_id].push({ profile_id: row.profile_id, zoom_join_url: row.zoom_join_url })
    return acc
  }, {})

  const approvedWorkshopIds = new Set(
    enrollments.filter(enrollment => enrollment.status === 'approved').map(enrollment => enrollment.workshop_id).filter(Boolean)
  )

  const approvedProfileIdsByWorkshopId = enrollments.reduce<Record<string, Set<string>>>((acc, enrollment) => {
    if (enrollment.status !== 'approved' || !enrollment.workshop_id || !enrollment.profile_id) return acc
    if (!acc[enrollment.workshop_id]) acc[enrollment.workshop_id] = new Set<string>()
    acc[enrollment.workshop_id].add(enrollment.profile_id)
    return acc
  }, {})

  const profilePriority: string[] = []
  const primaryChildId = family.profileRole === 'guardian' ? (family.primaryChildByGuardian.get(family.profileId) ?? null) : null

  if (family.profileRole === 'student') {
    profilePriority.push(family.profileId)
  } else if (primaryChildId) {
    profilePriority.push(primaryChildId)
  }

  for (const child of family.children) profilePriority.push(child.id)
  for (const guardian of family.guardians) profilePriority.push(guardian.id)
  if (family.profileId) profilePriority.push(family.profileId)

  const orderedFamilyProfileIds = Array.from(new Set(profilePriority))
  const profileRankById = new Map(orderedFamilyProfileIds.map((profileId, index) => [profileId, index]))

  const joinUrlByClass = classes.reduce<Record<string, string>>((acc, classRow) => {
    if (!classRow.workshop_id) return acc
    const approvedSet = approvedProfileIdsByWorkshopId[classRow.workshop_id]
    if (!approvedSet?.size) return acc

    const registrants = registrantsByClass[classRow.id] ?? []
    const registrantByProfileId = new Map(registrants.map(registrant => [registrant.profile_id, registrant]))

    for (const profileId of orderedFamilyProfileIds) {
      if (!approvedSet.has(profileId)) continue
      const joinUrl = registrantByProfileId.get(profileId)?.zoom_join_url?.trim() ?? ''
      if (!joinUrl) continue
      acc[classRow.id] = joinUrl
      break
    }

    return acc
  }, {})

  const selectedProfileIdByClass = classes.reduce<Record<string, string>>((acc, classRow) => {
    if (!classRow.workshop_id) return acc
    const approvedSet = approvedProfileIdsByWorkshopId[classRow.workshop_id]
    if (!approvedSet?.size) return acc

    for (const profileId of orderedFamilyProfileIds) {
      if (!approvedSet.has(profileId)) continue
      acc[classRow.id] = profileId
      break
    }

    return acc
  }, {})

  const { data: attendanceRowsRaw } = classIds.length
    ? await adminClient
        .from('class_attendance')
        .select('class_id, profile_id, photo_status')
        .in('class_id', classIds)
        .in('profile_id', family.familyProfileIds)
    : { data: [] }

  const attendanceRows = (attendanceRowsRaw ?? []) as Array<{
    class_id: string
    profile_id: string
    photo_status: string | null
  }>
  const attendanceByClassAndProfile = new Map(attendanceRows.map(row => [`${row.class_id}::${row.profile_id}`, row]))

  const selectedPhotoStatusByClass = Object.entries(selectedProfileIdByClass).reduce<Record<string, string>>((acc, [classId, profileId]) => {
    const key = `${classId}::${profileId}`
    const status = attendanceByClassAndProfile.get(key)?.photo_status
    if (typeof status === 'string' && status) {
      acc[classId] = status
    }
    return acc
  }, {})

  const { data: allocationRowsRaw } = classIds.length
    ? await adminClient
        .from('gift_card_allocation')
        .select('id, class_id, profile_id, status, blocked, reminder_sent_at, metadata')
        .in('class_id', classIds)
        .in('profile_id', family.familyProfileIds)
    : { data: [] }

  const giftCardLinkByClass = ((allocationRowsRaw ?? []) as Array<{
    id: string
    class_id: string
    profile_id: string
    status: 'allocated' | 'sent' | 'opened'
    blocked: boolean
    reminder_sent_at: string | null
    metadata: {
      release_at?: string | null
      release_ready_at?: string | null
      qualification_since_at?: string | null
    } | null
  }>).reduce<
    Record<
      string,
      {
        href: string
        rank: number
      }
    >
  >((acc, row) => {
    if (row.blocked) return acc
    const released = resolveGiftCardRelease({
      metadata: row.metadata,
      classAt: classAtById[row.class_id] ?? null,
      classEndsAt: classEndsAtById[row.class_id] ?? null,
      now,
    }).isReleased
    const availableByReminder = Boolean(row.reminder_sent_at && (row.status === 'sent' || row.status === 'opened'))
    if (!released && !availableByReminder) return acc

    const rank = profileRankById.get(row.profile_id) ?? Number.MAX_SAFE_INTEGER
    const existing = acc[row.class_id]
    if (existing && existing.rank <= rank) return acc

    acc[row.class_id] = {
      href: `/glr/${row.id}`,
      rank,
    }
    return acc
  }, {})

  const giftCardLinkByClassFinal = Object.fromEntries(
    Object.entries(giftCardLinkByClass).map(([classId, value]) => [classId, value.href])
  ) as Record<string, string>

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
    joinUrlByClass,
    giftCardLinkByClass: giftCardLinkByClassFinal,
    selectedProfileIdByClass,
    selectedPhotoStatusByClass,
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
    joinUrlByClass,
    giftCardLinkByClass,
    selectedProfileIdByClass,
    selectedPhotoStatusByClass,
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

  const sortedFamilyProfiles = familyProfiles
    .slice()
    .sort((a, b) => {
      const roleA = a.role === 'guardian' ? 0 : 1
      const roleB = b.role === 'guardian' ? 0 : 1
      if (roleA !== roleB) return roleA - roleB
      return personName(a).localeCompare(personName(b))
    })

  const workshopEnrollments = enrollments.filter(enrollment => Boolean(enrollment.workshop_id))
  const hasWorkshopEnrollment = workshopEnrollments.length > 0
  const hasPendingWorkshopEnrollment = workshopEnrollments.some(enrollment => enrollment.status === 'pending')
  const shouldShowEnrollmentBanner =
    enrollmentStatus === 'error' || (enrollmentStatus === 'success' && hasPendingWorkshopEnrollment)

  const joinableByWorkshop = Object.fromEntries(
    Object.entries(classesByWorkshop).map(([workshopId, classes]) => {
      const now = Date.now()
      const joinable = classes.filter(classRow => new Date(classRow.ends_at).getTime() + 15 * 60_000 > now)
      return [workshopId, joinable]
    })
  ) as Record<string, ClassRow[]>

  const [uploadModalState, setUploadModalState] = useState<{
    open: boolean
    classId: string
    profileId: string
    workshopLabel: string
    startsAt: string
  }>({
    open: false,
    classId: '',
    profileId: '',
    workshopLabel: '',
    startsAt: '',
  })
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadResults, setUploadResults] = useState<Array<{ fileName: string; ok: boolean; error?: string }>>([])
  const [toast, setToast] = useState<ToastState>(null)
  const [photoStatusOverrideByClass, setPhotoStatusOverrideByClass] = useState<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const resetUploadModal = () => {
    setUploadFiles([])
    setUploadProgress(0)
    setUploading(false)
    setUploadMessage(null)
    setUploadError(null)
    setUploadResults([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  useEffect(() => {
    if (!uploadModalState.open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !uploading) {
        setUploadModalState(prev => ({ ...prev, open: false }))
        resetUploadModal()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [uploadModalState.open, uploading])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const uploadSelectedPhotos = async () => {
    if (!uploadFiles.length || !uploadModalState.classId || !uploadModalState.profileId || uploading) return

    setUploadError(null)
    setUploadMessage(null)
    setUploadResults([])
    setUploading(true)
    setUploadProgress(0)

    const formData = new FormData()
    formData.set('class_id', uploadModalState.classId)
    formData.set('profile_id', uploadModalState.profileId)
    for (const file of uploadFiles) {
      formData.append('photos', file)
    }

    const response = await new Promise<{ status: number; body: unknown }>(resolve => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/home/class-photos/upload')
      xhr.responseType = 'json'
      xhr.upload.onprogress = event => {
        if (!event.lengthComputable) return
        setUploadProgress(Math.round((event.loaded / event.total) * 100))
      }
      xhr.onload = () => resolve({ status: xhr.status, body: xhr.response })
      xhr.onerror = () => resolve({ status: 0, body: { error: 'Network error while uploading images.' } })
      xhr.send(formData)
    })

    const body = response.body as {
      message?: string
      error?: string
      uploadedCount?: number
      results?: Array<{ fileName: string; ok: boolean; error?: string }>
    }

    if (response.status < 200 || response.status >= 300 || body.error) {
      setUploadError(body.error ?? 'Failed to upload photos.')
      setUploadResults(body.results ?? [])
      setToast({ tone: 'error', message: body.error ?? 'Failed to upload photos.' })
      setUploading(false)
      return
    }

    setUploadProgress(100)
    setUploadMessage(body.message ?? 'Photos uploaded.')
    setUploadResults(body.results ?? [])
    if (typeof body.uploadedCount === 'number' && body.uploadedCount > 0 && uploadModalState.classId) {
      setPhotoStatusOverrideByClass(prev => ({ ...prev, [uploadModalState.classId]: 'uploaded' }))
    }
    setUploading(false)
    setToast({ tone: 'success', message: body.message ?? 'Photos uploaded.' })
    setUploadModalState(prev => ({ ...prev, open: false }))
    resetUploadModal()
  }

  const sortedWorkshopEnrollments = workshopEnrollments
    .slice()
    .sort((a, b) => {
      const workshopIdA = a.workshop_id as string
      const workshopIdB = b.workshop_id as string

      const nextA = joinableByWorkshop[workshopIdA]?.[0]?.starts_at ?? null
      const nextB = joinableByWorkshop[workshopIdB]?.[0]?.starts_at ?? null

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

  const renderJoinControl = ({
    enrollmentStatus,
    classRow,
  }: {
    enrollmentStatus: string
    classRow: ClassRow
  }) => {
    const now = Date.now()
    const startsAtMs = new Date(classRow.starts_at).getTime()
    const endsAtMs = new Date(classRow.ends_at).getTime()
    const closed = Number.isFinite(endsAtMs) && now > endsAtMs + 15 * 60_000
    const joinOpen =
      Number.isFinite(startsAtMs) &&
      Number.isFinite(endsAtMs) &&
      now >= startsAtMs - 15 * 60_000 &&
      now <= endsAtMs + 15 * 60_000

    if (enrollmentStatus !== 'approved') {
      return <span className="text-xs text-muted-foreground">Available after acceptance</span>
    }

    if (closed) {
      return (
        <Button size="sm" variant="outline" disabled>
          CLOSED
        </Button>
      )
    }

    if (!joinOpen) {
      return <span className="text-xs text-muted-foreground">Opens 15 min before class</span>
    }

    if (!joinUrlByClass[classRow.id]) {
      return <span className="text-xs text-muted-foreground">Link pending</span>
    }

    return (
      <Button asChild size="sm">
        <a href={joinUrlByClass[classRow.id]} target="_blank" rel="noreferrer">
          JOIN CLASS
        </a>
      </Button>
    )
  }

  const renderPhotoControl = ({
    enrollmentStatus,
    classRow,
    workshopLabel,
    mobile = false,
  }: {
    enrollmentStatus: string
    classRow: ClassRow
    workshopLabel: string
    mobile?: boolean
  }) => {
    const now = Date.now()
    const endsAtMs = new Date(classRow.ends_at).getTime()
    const closed = Number.isFinite(endsAtMs) && now > endsAtMs + 15 * 60_000
    const selectedProfileId = selectedProfileIdByClass[classRow.id]
    const photoStatus =
      photoStatusOverrideByClass[classRow.id] ?? selectedPhotoStatusByClass[classRow.id] ?? ''

    if (enrollmentStatus !== 'approved' || !closed || !selectedProfileId) {
      return <span className="text-xs text-muted-foreground">-</span>
    }

    if (photoStatus) {
      const statusToneClass =
        photoStatus === 'accepted'
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
          : photoStatus === 'rejected'
            ? 'border-destructive/40 bg-destructive/10 text-destructive'
            : 'border-amber-300 bg-amber-50 text-amber-700'
      return (
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusToneClass}`}>
          {photoStatus}
        </span>
      )
    }

    return (
      <Button
        size="sm"
        className={mobile ? 'w-full' : ''}
        onClick={() => {
          resetUploadModal()
          setUploadModalState({
            open: true,
            classId: classRow.id,
            profileId: selectedProfileId,
            workshopLabel,
            startsAt: classRow.starts_at,
          })
        }}
      >
        Upload Images
      </Button>
    )
  }

  const renderGiftCardControl = ({
    enrollmentStatus,
    classRow,
  }: {
    enrollmentStatus: string
    classRow: ClassRow
  }) => {
    if (enrollmentStatus !== 'approved') {
      return <span className="text-xs text-muted-foreground">Available after acceptance</span>
    }

    const href = giftCardLinkByClass[classRow.id]
    if (!href) {
      return <span className="text-xs text-muted-foreground">Not available yet</span>
    }

    return (
      <Button asChild size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700">
        <a href={href} target="_blank" rel="noreferrer">
          GIFT CARD
        </a>
      </Button>
    )
  }

  return (
    <main className="w-full px-2 pt-4 pb-10 space-y-6 sm:px-6 sm:pt-6">
      {toast ? (
        <div
          className={`fixed bottom-4 right-4 z-50 rounded border px-3 py-2 text-sm shadow-md ${
            toast.tone === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
              : 'border-destructive/40 bg-destructive/10 text-destructive'
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
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

      {enrollmentMessage && enrollmentStatus && shouldShowEnrollmentBanner ? (
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
                <div className="space-y-3 md:hidden">
                  {sortedWorkshopEnrollments.map(enrollment => {
                    const workshopId = enrollment.workshop_id as string
                    const workshop = workshopsById[workshopId]
                    const semester = semesterById[enrollment.semester_id]
                    const upcoming = joinableByWorkshop[workshopId] ?? []
                    const next = upcoming[0]

                    return (
                      <article key={`mobile-enrollment-${enrollment.id}`} className="rounded-lg border bg-muted/20 p-3 space-y-2">
                        <a href={`#workshop-${workshopId}`} className="block text-sm font-semibold underline decoration-dotted underline-offset-2 hover:text-primary">
                          {workshop?.description ?? 'Workshop'}
                        </a>
                        <p className="text-xs text-muted-foreground">
                          {semester?.name ?? (semester ? `${formatDate(semester.starts_at)} - ${formatDate(semester.ends_at)}` : enrollment.semester_id.slice(0, 8))}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {enrollment.status === 'pending' ? 'pending (under review)' : enrollment.status}
                        </p>
                        <p className="text-xs text-muted-foreground">Next class: {next ? formatDateTime(next.starts_at) : 'No upcoming class'}</p>
                      </article>
                    )
                  })}
                </div>

                <div className="hidden md:block">
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
                        const upcoming = joinableByWorkshop[workshopId] ?? []
                        const next = upcoming[0]

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
                            <TableCell>{next ? 'Join from class list below' : '-'}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </section>

              {sortedWorkshopEnrollments.map(enrollment => {
                const workshopId = enrollment.workshop_id as string
                const workshop = workshopsById[workshopId]
                const classSchedule = classesByWorkshop[workshopId] ?? []

                return (
                  <section key={`detail-${enrollment.id}`} id={`workshop-${workshopId}`} className="rounded-lg border bg-card p-4 shadow-sm space-y-4">
                    <h3 className="text-lg font-semibold">{workshop?.description ?? 'Workshop'} classes</h3>

                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Class schedule</h4>
                      {classSchedule.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No classes scheduled.</p>
                      ) : (
                        <>
                          <div className="hidden md:block">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Starts</TableHead>
                                  <TableHead>Ends</TableHead>
                                  <TableHead>Join</TableHead>
                                  <TableHead>Photos</TableHead>
                                  <TableHead>Gift card</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {classSchedule.map(classRow => (
                                  <TableRow key={classRow.id}>
                                    <TableCell>{formatDateTime(classRow.starts_at)}</TableCell>
                                    <TableCell>{formatDateTime(classRow.ends_at)}</TableCell>
                                    <TableCell>{renderJoinControl({ enrollmentStatus: enrollment.status, classRow })}</TableCell>
                                    <TableCell>
                                      {renderPhotoControl({
                                        enrollmentStatus: enrollment.status,
                                        classRow,
                                        workshopLabel: workshop?.description ?? 'Workshop',
                                      })}
                                    </TableCell>
                                    <TableCell>{renderGiftCardControl({ enrollmentStatus: enrollment.status, classRow })}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>

                          <div className="space-y-3 md:hidden">
                            {classSchedule.map(classRow => (
                              <article key={`mobile-${classRow.id}`} className="rounded-lg border bg-muted/20 p-3 space-y-3">
                                <div className="space-y-1">
                                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Starts</p>
                                  <p className="text-sm font-medium">{formatDateTime(classRow.starts_at)}</p>
                                </div>
                                <div className="space-y-1">
                                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Ends</p>
                                  <p className="text-sm font-medium">{formatDateTime(classRow.ends_at)}</p>
                                </div>
                                <div className="space-y-2">
                                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Join</p>
                                  {renderJoinControl({ enrollmentStatus: enrollment.status, classRow })}
                                </div>
                                <div className="space-y-2">
                                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Photos</p>
                                  {renderPhotoControl({
                                    enrollmentStatus: enrollment.status,
                                    classRow,
                                    workshopLabel: workshop?.description ?? 'Workshop',
                                    mobile: true,
                                  })}
                                </div>
                                <div className="space-y-2">
                                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Gift card</p>
                                  {renderGiftCardControl({ enrollmentStatus: enrollment.status, classRow })}
                                </div>
                              </article>
                            ))}
                          </div>
                        </>
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
            <div className="space-y-3 md:hidden">
              {sortedFamilyProfiles.map(profile => {
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
                  <article key={`mobile-family-${profile.id}`} className="rounded-lg border bg-muted/20 p-3 space-y-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{personName(profile)}</p>
                        {isPrimaryChild ? (
                          <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                            Primary child
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground capitalize">{profile.role}</p>
                      <p className="text-xs text-muted-foreground">{profile.email ?? 'No email'}</p>
                      <p className="text-xs text-muted-foreground capitalize">{inviteStatus}</p>
                    </div>

                    {family.profileRole === 'guardian' ? (
                      <div className="space-y-2">
                        {isStudent ? (
                          <Form method="post">
                            <input type="hidden" name="intent" value="set_primary_child" />
                            <input type="hidden" name="child_id" value={profile.id} />
                            <Button type="submit" variant="outline" size="sm" className="w-full" disabled={isPrimaryChild || mutationLocked}>
                              {isPrimaryChild ? 'Primary child' : 'Set primary child'}
                            </Button>
                          </Form>
                        ) : null}

                        {!profile.user_id && (isStudent || isGuardian) ? (
                          <Form method="post" className="space-y-2">
                            <input type="hidden" name="intent" value="send_or_resend_invite" />
                            <input type="hidden" name="profile_id" value={profile.id} />
                            <input type="hidden" name="role" value={isGuardian ? 'guardian' : 'student'} />
                            <Input
                              name="email"
                              type="email"
                              defaultValue={profile.email ?? ''}
                              placeholder={isGuardian ? 'guardian@gmail.com' : 'child@gmail.com'}
                              className="h-9 w-full"
                              required
                              disabled={mutationLocked}
                            />
                            <Button type="submit" variant="outline" size="sm" className="w-full" disabled={mutationLocked}>
                              {invite?.status === 'pending' ? 'Resend invite' : 'Send invite'}
                            </Button>
                          </Form>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">View only</span>
                    )}
                  </article>
                )
              })}

              {family.profileRole === 'guardian' ? (
                <>
                  <article className="rounded-lg border bg-muted/20 p-3 space-y-2">
                    <p className="text-sm font-semibold">Add child</p>
                    <Form method="post" className="space-y-2">
                      <input type="hidden" name="intent" value="add_child" />
                      <Input name="firstname" placeholder="First name" className="h-9 w-full" disabled={mutationLocked} />
                      <Input name="surname" placeholder="Surname" className="h-9 w-full" disabled={mutationLocked} />
                      <Input name="email" type="email" placeholder="Email (optional)" className="h-9 w-full" disabled={mutationLocked} />
                      <Button type="submit" className="w-full" disabled={mutationLocked}>Add child</Button>
                    </Form>
                  </article>

                  <article className="rounded-lg border bg-muted/20 p-3 space-y-2">
                    <p className="text-sm font-semibold">Add guardian</p>
                    <Form method="post" className="space-y-2">
                      <input type="hidden" name="intent" value="add_guardian" />
                      <Input name="firstname" placeholder="First name" className="h-9 w-full" disabled={mutationLocked} />
                      <Input name="surname" placeholder="Surname" className="h-9 w-full" disabled={mutationLocked} />
                      <Input name="email" type="email" placeholder="guardian@gmail.com" className="h-9 w-full" required disabled={mutationLocked} />
                      <select name="child_id" className="h-9 w-full rounded border border-input bg-background px-2 text-sm" required disabled={mutationLocked}>
                        <option value="">Link to child</option>
                        {familyProfiles
                          .filter(profile => profile.role === 'student')
                          .map(child => (
                            <option key={child.id} value={child.id}>
                              {personName(child)}
                            </option>
                          ))}
                      </select>
                      <Button type="submit" className="w-full" disabled={mutationLocked}>Add guardian</Button>
                    </Form>
                  </article>
                </>
              ) : null}
            </div>

            <div className="hidden md:block">
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
                  {sortedFamilyProfiles.map(profile => {
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
            </div>
          </section>
        </div>
      )}

      {uploadModalState.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-lg border bg-card p-5 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Upload class photos</h2>
                <p className="text-xs text-muted-foreground">
                  {uploadModalState.workshopLabel} - {formatDateTime(uploadModalState.startsAt)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={uploading}
                onClick={() => {
                  setUploadModalState(prev => ({ ...prev, open: false }))
                  resetUploadModal()
                }}
              >
                Close
              </Button>
            </div>

            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={event => {
                  const picked = Array.from(event.target.files ?? [])
                  setUploadFiles(picked)
                  setUploadError(null)
                  setUploadMessage(null)
                  setUploadResults([])
                }}
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  Choose images
                </Button>
                <p className="text-xs text-muted-foreground">
                  {uploadFiles.length === 0
                    ? 'No files selected'
                    : `${uploadFiles.length} file${uploadFiles.length === 1 ? '' : 's'} selected`}
                </p>
              </div>
              {uploadFiles.length > 0 ? (
                <div className="max-h-28 overflow-auto rounded border p-2 text-xs text-muted-foreground space-y-1">
                  {uploadFiles.map(file => (
                    <p key={`${file.name}-${file.size}`}>{file.name}</p>
                  ))}
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">
                On mobile, this supports camera roll and direct camera capture where available.
              </p>
            </div>

            {uploading || uploadProgress > 0 ? (
              <div className="space-y-2">
                <div className="h-2 w-full overflow-hidden rounded bg-muted">
                  <div className="h-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(uploadProgress, 100))}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">Upload progress: {uploadProgress}%</p>
              </div>
            ) : null}

            {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
            {uploadMessage ? <p className="text-sm text-emerald-700">{uploadMessage}</p> : null}

            {uploadResults.length > 0 ? (
              <div className="max-h-40 overflow-auto rounded border p-2 text-xs space-y-1">
                {uploadResults.map(result => (
                  <p key={`${result.fileName}-${result.ok ? 'ok' : 'err'}`} className={result.ok ? 'text-emerald-700' : 'text-destructive'}>
                    {result.ok ? 'Uploaded' : 'Failed'}: {result.fileName}
                    {result.error ? ` (${result.error})` : ''}
                  </p>
                ))}
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                disabled={uploading}
                onClick={() => {
                  setUploadModalState(prev => ({ ...prev, open: false }))
                  resetUploadModal()
                }}
              >
                Cancel
              </Button>
              <Button onClick={() => void uploadSelectedPhotos()} disabled={uploading || uploadFiles.length === 0}>
                {uploading ? 'Uploading...' : `Upload ${uploadFiles.length > 0 ? uploadFiles.length : ''} image${uploadFiles.length === 1 ? '' : 's'}`}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
