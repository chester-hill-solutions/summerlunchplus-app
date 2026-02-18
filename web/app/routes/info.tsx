import { Link } from 'react-router'

import type { Route } from './+types/info'
import { Button } from '@/components/ui/button'

export const meta = ({ }: Route.MetaArgs) => {
  return [
    { title: 'Public Info' },
    { name: 'description', content: 'Public information page' },
  ]
}

export default function InfoPage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-4xl flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          This is the public home page, you are not logged in
        </h1>
        <p className="text-muted-foreground">Access your account to see the private home.</p>
      </div>
      <Button asChild>
        <Link to="/login">Login</Link>
      </Button>
    </main>
  )
}
