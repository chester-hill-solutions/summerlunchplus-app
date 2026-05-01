import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { Link } from 'react-router'
import { LogOut, User as UserIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type NavbarProps = {
  user: User | null
  role: string | null
}

export function Navbar({ user, role }: NavbarProps) {
  return (
    <header className="border-b bg-background/80 backdrop-blur">
      <div className="flex w-full items-center justify-between px-6 py-4">
        <Link
          to="/"
          className="text-2xl font-black tracking-tight text-[var(--color-summer)]"
        >
          summerlunch+
        </Link>

        {user ? <AuthenticatedNav role={role} email={user.email ?? null} /> : <UnauthenticatedNav />}
      </div>
    </header>
  )
}

function UnauthenticatedNav() {
  return (
    <div className="flex items-center gap-3">
      <Button variant="ghost" asChild>
        <Link to="/login">Login</Link>
      </Button>
      <Button asChild>
        <Link to="/sign-up">Sign up</Link>
      </Button>
    </div>
  )
}

function AuthenticatedNav({ role, email }: { role: string | null; email: string | null }) {
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
      <IconButton to="/profile" label="Profile">
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
