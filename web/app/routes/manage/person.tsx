import { Link, redirect, useLoaderData } from 'react-router'

import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'
import { adminClient } from '@/lib/supabase/adminClient'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import type { LoaderFunctionArgs } from 'react-router'

type ProfileRow = {
  id: string
  user_id: string | null
  role: string | null
  firstname: string | null
  surname: string | null
  email: string | null
  phone: string | null
  street_address: string | null
  city: string | null
  province: string | null
  postcode: string | null
  date_of_birth: string | null
}

type LoaderData = {
  profile: ProfileRow
  familyProfiles: ProfileRow[]
  primaryChildByGuardian: Record<string, string>
  enrollments: Array<{
    id: string
    profile_id: string | null
    workshop_id: string | null
    semester_id: string
    status: string
    requested_at: string
  }>
  workshopById: Record<string, { id: string; description: string | null; semester_id: string }>
  semesterById: Record<string, { id: string; name: string | null; starts_at: string; ends_at: string }>
  classByWorkshop: Record<string, Array<{ id: string; starts_at: string; ends_at: string }>>
  attendanceByClass: Record<string, Array<{ profile_id: string; status: string | null }>>
}

const formatDate = (value: string | null) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

const formatDateTime = (value: string | null) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

const profileLabel = (profile: ProfileRow) => {
  const fullName = [profile.firstname, profile.surname].filter(Boolean).join(' ').trim()
  return fullName || profile.email || profile.id.slice(0, 8)
}

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

  const { data: familyProfilesRaw } = await adminClient
    .from('profile')
    .select('id, user_id, role, firstname, surname, email, phone, street_address, city, province, postcode, date_of_birth')
    .in('id', familyProfileIds)

  const familyProfiles = (familyProfilesRaw ?? []) as ProfileRow[]

  const primaryChildByGuardian: Record<string, string> = {}
  for (const edge of edges) {
    if (edge.primary_child) {
      primaryChildByGuardian[edge.guardian_profile_id] = edge.child_profile_id
    }
  }

  const { data: enrollmentRowsRaw } = await adminClient
    .from('workshop_enrollment')
    .select('id, profile_id, workshop_id, semester_id, status, requested_at')
    .in('profile_id', familyProfileIds)
    .order('requested_at', { ascending: false })

  const enrollments = (enrollmentRowsRaw ?? []) as LoaderData['enrollments']
  const workshopIds = Array.from(new Set(enrollments.map(row => row.workshop_id).filter((id): id is string => Boolean(id))))

  const { data: workshopsRaw } = workshopIds.length
    ? await adminClient
        .from('workshop')
        .select('id, description, semester_id')
        .in('id', workshopIds)
    : { data: [] }

  const workshopById = Object.fromEntries((workshopsRaw ?? []).map(workshop => [workshop.id, workshop])) as LoaderData['workshopById']

  const semesterIds = Array.from(new Set((workshopsRaw ?? []).map(workshop => workshop.semester_id).filter(Boolean)))
  const { data: semestersRaw } = semesterIds.length
    ? await adminClient
        .from('semester')
        .select('id, name, starts_at, ends_at')
        .in('id', semesterIds)
    : { data: [] }

  const semesterById = Object.fromEntries((semestersRaw ?? []).map(semester => [semester.id, semester])) as LoaderData['semesterById']

  const { data: classesRaw } = workshopIds.length
    ? await adminClient
        .from('class')
        .select('id, workshop_id, starts_at, ends_at')
        .in('workshop_id', workshopIds)
        .order('starts_at', { ascending: true })
    : { data: [] }

  const classByWorkshop = (classesRaw ?? []).reduce<LoaderData['classByWorkshop']>((acc, classRow) => {
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

  const attendanceByClass = (attendanceRaw ?? []).reduce<LoaderData['attendanceByClass']>((acc, row) => {
    if (!acc[row.class_id]) acc[row.class_id] = []
    acc[row.class_id].push({ profile_id: row.profile_id, status: row.status })
    return acc
  }, {})

  return {
    profile: profileRow as ProfileRow,
    familyProfiles,
    primaryChildByGuardian,
    enrollments,
    workshopById,
    semesterById,
    classByWorkshop,
    attendanceByClass,
  } satisfies LoaderData
}

export default function ManagePersonDashboardPage() {
  const { profile, familyProfiles, primaryChildByGuardian, enrollments, workshopById, semesterById, classByWorkshop, attendanceByClass } =
    useLoaderData() as LoaderData

  const profileById = new Map(familyProfiles.map(item => [item.id, item]))

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{profileLabel(profile)}</h1>
          <p className="text-sm text-muted-foreground">Dense participant dashboard for profile, family graph, enrollments, and class activity.</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/manage/participants">Back to participants</Link>
        </Button>
      </div>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Personal information</h2>
        <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
          <p><span className="font-medium">Profile ID:</span> {profile.id}</p>
          <p><span className="font-medium">User ID:</span> {profile.user_id ?? '-'}</p>
          <p><span className="font-medium">Role:</span> {profile.role ?? '-'}</p>
          <p><span className="font-medium">Email:</span> {profile.email ?? '-'}</p>
          <p><span className="font-medium">Phone:</span> {profile.phone ?? '-'}</p>
          <p><span className="font-medium">DOB:</span> {formatDate(profile.date_of_birth)}</p>
          <p className="md:col-span-2"><span className="font-medium">Address:</span> {[profile.street_address, profile.city, profile.province, profile.postcode].filter(Boolean).join(', ') || '-'}</p>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Family members</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>User linked</TableHead>
              <TableHead>Primary child</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {familyProfiles
              .slice()
              .sort((a, b) => profileLabel(a).localeCompare(profileLabel(b)))
              .map(member => {
                const primaryChildId = primaryChildByGuardian[member.id]
                const primaryChild = primaryChildId ? profileById.get(primaryChildId) : null
                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      <Link to={`/manage/person?profileId=${member.id}`} className="underline decoration-dotted underline-offset-2 hover:text-primary">
                        {profileLabel(member)}
                      </Link>
                    </TableCell>
                    <TableCell className="capitalize">{member.role ?? '-'}</TableCell>
                    <TableCell>{member.email ?? '-'}</TableCell>
                    <TableCell>{member.user_id ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{primaryChild ? profileLabel(primaryChild) : '-'}</TableCell>
                  </TableRow>
                )
              })}
          </TableBody>
        </Table>
      </section>

      <section className="rounded-lg border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Workshop enrollments</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Profile</TableHead>
              <TableHead>Semester</TableHead>
              <TableHead>Workshop</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Requested</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {enrollments.map(enrollment => {
              const enrolledProfile = enrollment.profile_id ? profileById.get(enrollment.profile_id) : null
              const workshop = enrollment.workshop_id ? workshopById[enrollment.workshop_id] : null
              const semester = semesterById[enrollment.semester_id]
              return (
                <TableRow key={enrollment.id}>
                  <TableCell>{enrolledProfile ? profileLabel(enrolledProfile) : '-'}</TableCell>
                  <TableCell>{semester?.name ?? enrollment.semester_id.slice(0, 8)}</TableCell>
                  <TableCell>{workshop?.description ?? '-'}</TableCell>
                  <TableCell className="capitalize">{enrollment.status}</TableCell>
                  <TableCell>{formatDateTime(enrollment.requested_at)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </section>

      <section className="rounded-lg border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Class schedule and attendance</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Workshop</TableHead>
              <TableHead>Class starts</TableHead>
              <TableHead>Class ends</TableHead>
              <TableHead>Attendance present</TableHead>
              <TableHead>Attendance absent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(classByWorkshop).flatMap(([workshopId, classes]) =>
              classes.map(classRow => {
                const attendanceRows = attendanceByClass[classRow.id] ?? []
                const present = attendanceRows.filter(row => row.status === 'present').length
                const absent = attendanceRows.filter(row => row.status === 'absent').length
                return (
                  <TableRow key={classRow.id}>
                    <TableCell>{workshopById[workshopId]?.description ?? workshopId.slice(0, 8)}</TableCell>
                    <TableCell>{formatDateTime(classRow.starts_at)}</TableCell>
                    <TableCell>{formatDateTime(classRow.ends_at)}</TableCell>
                    <TableCell>{present}</TableCell>
                    <TableCell>{absent}</TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  )
}
