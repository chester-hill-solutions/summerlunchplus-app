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
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          summerlunch+
        </Link>

        {user ? <AuthenticatedNav role={role} /> : <UnauthenticatedNav />}
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

function AuthenticatedNav({ role }: { role: string | null }) {
  return (
    <div className="flex items-center gap-2">
      {import.meta.env.DEV && (
        <span className="text-xs text-muted-foreground">Your role: {role ?? 'unknown'}</span>
      )}
      {(role === 'admin' || role === 'manager') && (
        <Button variant="ghost" asChild>
          <Link to="/team">Team</Link>
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
    <Button variant="ghost" size="icon" asChild className={cn('rounded-full')} aria-label={label}>
      <Link to={to}>{children}</Link>
    </Button>
  )
}

Navbar.displayName = 'Navbar'
