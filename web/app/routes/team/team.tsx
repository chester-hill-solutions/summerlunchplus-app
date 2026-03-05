import { NavLink, Outlet, redirect, useLoaderData } from 'react-router'
import { requireAuth } from '@/lib/auth.server'
import { cn } from '@/lib/utils'
import { teamPages } from './nav'

const ADMIN_ROLES = new Set(['admin', 'manager'])

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)

  if (!ADMIN_ROLES.has(auth.claims.role)) {
    throw redirect('/home', { headers: auth.headers })
  }

  return { role: auth.claims.role }
}

const teamNav = teamPages

export default function TeamLayout() {
  useLoaderData<typeof loader>()

  return (
    <main className="flex w-full flex-col gap-6 px-6 py-8 lg:flex-row">
      <aside className="w-full lg:w-56">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-muted-foreground">Team</h2>
          <nav className="mt-3 space-y-1">
            {teamNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/team'}
                className={({ isActive }) =>
                  cn(
                    'block rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground hover:bg-muted'
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </aside>

      <section className="flex-1 space-y-6">
        <Outlet />
      </section>
    </main>
  )
}
