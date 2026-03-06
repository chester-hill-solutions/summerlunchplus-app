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

  const { data: workshops, error: workshopError } = await supabase
    .from('workshop')
    .select('id, description, enrollment_open_at, enrollment_close_at')
    .gte('enrollment_close_at', now)
    .order('enrollment_open_at', { ascending: true })
  if (workshopError) {
    throw new Error(workshopError.message)
  }

  const { data: sessions } = await supabase
    .from('session')
    .select('workshop_id, starts_at, ends_at')

  const { data: enrollments } = await supabase
    .from('workshop_enrollment')
    .select('workshop_id, status')
    .eq('user_id', auth.user.id)

  const bounds = (sessions || []).reduce<Record<string, { start: string; end: string }>>((acc, session) => {
    if (!session?.workshop_id) return acc
    const current = acc[session.workshop_id]
    const start = current?.start ?? session.starts_at
    const end = current?.end ?? session.ends_at
      acc[session.workshop_id] = {
      start: start && start < session.starts_at ? start : session.starts_at,
      end: end && end > session.ends_at ? end : session.ends_at,
    }
    return acc
  }, {})

  return {
    user: auth.user,
    role: auth.claims.role,
    now,
    workshops: (workshops || []).map(workshop => ({
      ...workshop,
      workshop_start: bounds[workshop.id]?.start ?? '',
      workshop_end: bounds[workshop.id]?.end ?? '',
    })),
    enrollments: enrollments ?? [],
  }
}

export async function action({ request }: Route.ActionArgs) {
  const { supabase } = createClient(request)
  const formData = await request.formData()
  const workshopId = formData.get('workshopId') as string
  const { data: currentUser } = await supabase.auth.getUser()

  if (!currentUser?.user?.id) {
    return { error: 'Authentication required' }
  }

  const { error } = await supabase.from('workshop_enrollment').upsert(
    {
      workshop_id: workshopId,
      user_id: currentUser.user.id,
      status: 'pending',
    },
    { onConflict: 'workshop_id,user_id' }
  )

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

type WorkshopRow = {
  id: string
  description: string
  enrollment_open_at: string
  enrollment_close_at: string
  workshop_start: string
  workshop_end: string
}

type LoaderData = {
  user: Awaited<ReturnType<typeof enforceOnboardingGuard>>['user']
  role: string | null
  now: string
  workshops: WorkshopRow[]
  enrollments: { workshop_id: string; status: string }[]
}

export default function Home() {
  const { workshops, enrollments, now } = useLoaderData<LoaderData>()
  const fetcher = useFetcher<typeof action>()
  const statusByWorkshop = new Map(enrollments.map(enrollment => [enrollment.workshop_id, enrollment.status]))

  return (
    <main className="w-full px-6 py-12">
      <header className="mb-4">
        <h1 className="text-3xl font-semibold">Summer Workshops</h1>
        <p className="text-sm text-muted-foreground">Choose a workshop and complete enrollment while the window is open.</p>
      </header>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Workshop</TableHead>
            <TableHead>Enrollment starts</TableHead>
            <TableHead>Enrollment ends</TableHead>
            <TableHead>Workshop starts</TableHead>
            <TableHead>Workshop ends</TableHead>
            <TableHead>Enroll</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {workshops.map(workshop => {
            const enrollmentStatus = statusByWorkshop.get(workshop.id)
            const isOpen = now >= workshop.enrollment_open_at && now <= workshop.enrollment_close_at
            const disabled = !isOpen || enrollmentStatus === 'pending' || enrollmentStatus === 'approved'
            return (
              <TableRow key={workshop.id}>
                <TableCell>
                  <p className="font-medium text-slate-900">{workshop.description}</p>
                </TableCell>
                <TableCell>{formatDate(workshop.enrollment_open_at)}</TableCell>
                <TableCell>{formatDate(workshop.enrollment_close_at)}</TableCell>
                <TableCell>{workshop.workshop_start ? formatDate(workshop.workshop_start) : 'TBD'}</TableCell>
                <TableCell>{workshop.workshop_end ? formatDate(workshop.workshop_end) : 'TBD'}</TableCell>
                <TableCell>
                  <fetcher.Form method="post" className="flex flex-col gap-1">
                    <input type="hidden" name="workshopId" value={workshop.id} />
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
