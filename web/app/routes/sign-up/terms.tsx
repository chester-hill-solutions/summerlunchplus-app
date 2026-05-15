import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { LoaderFunctionArgs } from 'react-router'
import { Link, useLoaderData } from 'react-router'

type LoaderData = {
  backTo: string
  terms: {
    title: string
    content: string
    version: number
  } | null
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabase } = createClient(request)
  const url = new URL(request.url)

  const email = url.searchParams.get('email') ?? url.searchParams.get('invitee_email') ?? ''
  const role = url.searchParams.get('role')
  const signUpParams = new URLSearchParams()
  if (email) signUpParams.set('email', email)
  if (role === 'guardian' || role === 'student') {
    signUpParams.set('role', role)
  }
  const backTo = `/sign-up${signUpParams.toString() ? `?${signUpParams.toString()}` : ''}`

  const { data: activeTerms } = await supabase
    .from('sign_up_terms')
    .select('title, content, version')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    backTo,
    terms: activeTerms
      ? {
          title: activeTerms.title,
          content: activeTerms.content,
          version: activeTerms.version,
        }
      : null,
  } satisfies LoaderData
}

export default function SignUpTermsPage() {
  const { backTo, terms } = useLoaderData<typeof loader>()
  const content = (terms?.content ?? 'Terms are unavailable right now. Please try again later.').replace(/\\n/g, '\n')

  return (
    <Card>
      <CardHeader className="space-y-0 pb-0">
        <CardTitle className="text-2xl">{terms?.title ?? 'Terms and Consent'}</CardTitle>
        <p className="text-xs text-muted-foreground">Version: {terms?.version ?? 'N/A'}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          {content}
        </div>
        <Button asChild className="w-full">
          <Link to={backTo}>Back to sign up</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
