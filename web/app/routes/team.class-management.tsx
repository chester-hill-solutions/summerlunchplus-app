import { NavLink, Outlet } from 'react-router'

import type { Route } from './+types/team.class-management'
import { cn } from '@/lib/utils'

export const loader = ({ context }: Route.LoaderArgs) => context

const nav = [
  { to: '/team/class-management/semesters', label: 'Semesters' },
  { to: '/team/class-management/cohorts', label: 'Cohorts' },
  { to: '/team/class-management/classes', label: 'Classes' },
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
