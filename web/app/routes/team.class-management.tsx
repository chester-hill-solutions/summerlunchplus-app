import { NavLink, Outlet, redirect } from 'react-router'

import type { Route } from './+types/team.class-management'
import { cn } from '@/lib/utils'
import { requireAuth } from '@/lib/auth.server'

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!['admin', 'manager'].includes(auth.claims.role)) {
    throw redirect('/home', { headers: auth.headers })
  }


  return { role: auth.claims.role }
}

const nav = [
  { to: 'enrollments', label: 'Enrollments' },
  { to: 'classes', label: 'Classes' },
  { to: 'cohorts', label: 'Cohorts' },
  { to: 'semesters', label: 'Semesters' },
]

export default function ClassManagementLayout() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-wide text-muted-foreground">Class Management</p>
        <h1 className="text-2xl font-semibold leading-tight">Plan semesters, cohorts, and classes</h1>
        <p className="text-muted-foreground">
          Organize upcoming terms, group students into cohorts, and schedule classes.
        </p>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto rounded-lg border bg-card px-3 py-2 shadow-sm">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === 'enrollments'}
            className={({ isActive }) =>
              cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </div>

      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <Outlet />
      </div>
    </div>
  )
}
