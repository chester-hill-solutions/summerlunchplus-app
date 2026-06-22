import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { Link, useLocation } from 'react-router'
import { LogOut, User as UserIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type NavbarProps = {
  user: User | null
  role: string | null
}

export function Navbar({ user, role }: NavbarProps) {
  const location = useLocation()
  const isManagePage = location.pathname === '/manage' || location.pathname.startsWith('/manage/')

  return (
    <header className={cn('h-16 border-b bg-background/80 backdrop-blur', isManagePage ? 'sticky top-0 z-50' : '')}>
      <div className="flex h-full w-full items-center justify-between px-6">
        <Link
          to="/"
          className="text-3xl font-black tracking-tight text-[var(--color-summer)]"
        >
          summerlunch+
        </Link>

        {user ? <AuthenticatedNav role={role} email={user.email ?? null} userId={user.id} /> : <UnauthenticatedNav />}
      </div>
    </header>
  )
}

function UnauthenticatedNav() {
  return (
    <div className="flex items-center gap-4 text-sm font-medium">
      <Link to="/login">Login</Link>
      <Link to="/sign-up">Sign up</Link>
    </div>
  )
}

function AuthenticatedNav({ role, email, userId }: { role: string | null; email: string | null; userId: string }) {
  return (
    <div className="flex items-center gap-2">
      {import.meta.env.DEV && (
        <>
          <span className="text-xs text-muted-foreground">Your role: {role ?? 'unknown'}</span>
          <span className="text-xs text-muted-foreground">Your email: {email ?? 'unknown'}</span>
        </>
      )}
      {(role === 'admin' || role === 'manager') && (
        <Button variant="ghost" asChild>
          <Link to="/manage">Manage</Link>
        </Button>
      )}
      <IconButton to={`/profile/${userId}`} label="Profile">
        <UserIcon className="size-5" />
      </IconButton>
      <IconButton to="/logout" label="Logout">
        <LogOut className="size-5" />
      </IconButton>
    </div>
  )
}

type IconButtonProps = {
  to: string
  label: string
  children: ReactNode
}

function IconButton({ to, label, children }: IconButtonProps) {
  return (
    <Button variant="ghost" size="icon" asChild className={cn('rounded-full')}>
      <Link to={to} aria-label={label} title={label}>
        {children}
        <span className="sr-only">{label}</span>
      </Link>
    </Button>
  )
}

Navbar.displayName = 'Navbar'
