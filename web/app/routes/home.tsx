import { useFetcher, useLoaderData } from 'react-router'

import type { Route } from './+types/home'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'
import { enforceOnboardingGuard } from '@/lib/auth.server'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await enforceOnboardingGuard(request)
  const { supabase } = createClient(request)
  const now = new Date().toISOString()

  const { data: classes, error: classError } = await supabase
    .from('class')
    .select('id, description, enrollment_open_at, enrollment_close_at')
    .gte('enrollment_close_at', now)
    .order('enrollment_open_at', { ascending: true })
  if (classError) {
    throw new Error(classError.message)
  }

  const { data: sessions } = await supabase
    .from('session')
    .select('class_id, starts_at, ends_at')

  const { data: enrollments } = await supabase
    .from('class_enrollment')
    .select('class_id, status')
    .eq('user_id', auth.user.id)

  const bounds = (sessions || []).reduce<Record<string, { start: string; end: string }>>((acc, session) => {
    if (!session?.class_id) return acc
    const current = acc[session.class_id]
    const start = current?.start ?? session.starts_at
    const end = current?.end ?? session.ends_at
    acc[session.class_id] = {
      start: start && start < session.starts_at ? start : session.starts_at,
      end: end && end > session.ends_at ? end : session.ends_at,
    }
    return acc
  }, {})

  return {
    user: auth.user,
    role: auth.claims.role,
    now,
    classes: (classes || []).map(cls => ({
      ...cls,
      class_start: bounds[cls.id]?.start ?? '',
      class_end: bounds[cls.id]?.end ?? '',
    })),
    enrollments: enrollments ?? [],
  }
}

export async function action({ request }: Route.ActionArgs) {
  const { supabase } = createClient(request)
  const formData = await request.formData()
  const classId = formData.get('classId') as string
  const { data: currentUser } = await supabase.auth.getUser()

  if (!currentUser?.user?.id) {
    return { error: 'Authentication required' }
  }

  const { error } = await supabase.from('class_enrollment').upsert(
    {
      class_id: classId,
      user_id: currentUser.user.id,
      status: 'pending',
    },
    { onConflict: 'class_id,user_id' }
  )

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

type ClassRow = {
  id: string
  description: string
  enrollment_open_at: string
  enrollment_close_at: string
  class_start: string
  class_end: string
}

type LoaderData = {
  user: Awaited<ReturnType<typeof enforceOnboardingGuard>>['user']
  role: string | null
  now: string
  classes: ClassRow[]
  enrollments: { class_id: string; status: string }[]
}

export default function Home() {
  const { classes, enrollments, now } = useLoaderData<LoaderData>()
  const fetcher = useFetcher<typeof action>()
  const statusByClass = new Map(enrollments.map(enrollment => [enrollment.class_id, enrollment.status]))

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-4">
        <h1 className="text-3xl font-semibold">Summer Classes</h1>
        <p className="text-sm text-muted-foreground">Choose a class and complete enrollment while the window is open.</p>
      </header>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Class</TableHead>
            <TableHead>Enrollment starts</TableHead>
            <TableHead>Enrollment ends</TableHead>
            <TableHead>Class starts</TableHead>
            <TableHead>Class ends</TableHead>
            <TableHead>Enroll</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {classes.map(cls => {
            const enrollmentStatus = statusByClass.get(cls.id)
            const isOpen = now >= cls.enrollment_open_at && now <= cls.enrollment_close_at
            const disabled = !isOpen || enrollmentStatus === 'pending' || enrollmentStatus === 'approved'
            return (
              <TableRow key={cls.id}>
                <TableCell>
                  <p className="font-medium text-slate-900">{cls.description}</p>
                </TableCell>
                <TableCell>{formatDate(cls.enrollment_open_at)}</TableCell>
                <TableCell>{formatDate(cls.enrollment_close_at)}</TableCell>
                <TableCell>{cls.class_start ? formatDate(cls.class_start) : 'TBD'}</TableCell>
                <TableCell>{cls.class_end ? formatDate(cls.class_end) : 'TBD'}</TableCell>
                <TableCell>
                  <fetcher.Form method="post" className="flex flex-col gap-1">
                    <input type="hidden" name="classId" value={cls.id} />
                    <Button type="submit" variant={disabled ? 'ghost' : 'default'} size="sm" disabled={disabled}>
                      {enrollmentStatus === 'approved'
                        ? 'Enrolled'
                        : enrollmentStatus === 'pending'
                        ? 'Pending'
                        : isOpen
                        ? 'Enroll'
                        : 'Closed'}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Status: {enrollmentStatus ?? 'not enrolled'}
                    </p>
                  </fetcher.Form>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </main>
  )
}
