import { Form, Link, redirect, useActionData, useLoaderData, useNavigation } from 'react-router'
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router'

import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'

type LoaderData = {
  term: {
    id: string
    title: string
    content: string
    version: number
    is_active: boolean
  }
}

type ActionData = {
  error?: string
}

const baseSlugFromTitle = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40)

export async function loader({ request, params }: LoaderFunctionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    throw redirect('/home', { headers: auth.headers })
  }

  const termId = params.termId
  if (!termId) {
    throw redirect('/manage/sign-up-terms', { headers: auth.headers })
  }

  const { supabase, headers } = createClient(request)
  const { data: term, error: termError } = await supabase
    .from('sign_up_terms')
    .select('id, title, content, version, is_active')
    .eq('id', termId)
    .maybeSingle()

  if (termError || !term) {
    throw redirect('/manage/sign-up-terms', { headers })
  }

  const { data: consentRows, error: consentError } = await supabase
    .from('sign_up_terms_consent')
    .select('id')
    .eq('sign_up_terms_id', termId)
    .limit(1)

  if (consentError) {
    throw new Response(consentError.message, { status: 500, headers })
  }

  if ((consentRows ?? []).length > 0) {
    throw redirect('/manage/sign-up-terms', { headers })
  }

  return {
    term: {
      id: term.id,
      title: term.title,
      content: term.content,
      version: term.version,
      is_active: term.is_active,
    },
  } satisfies LoaderData
}

export async function action({ request, params }: ActionFunctionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    return { error: 'Unauthorized' } satisfies ActionData
  }

  const termId = params.termId
  if (!termId) {
    return { error: 'Missing term record.' } satisfies ActionData
  }

  const { supabase, headers } = createClient(request)
  const formData = await request.formData()

  const title = String(formData.get('title') ?? '').trim()
  const content = String(formData.get('content') ?? '').trim()
  const versionRaw = String(formData.get('version') ?? '').trim()
  const setActive = formData.get('is_active') === 'on'

  if (!title) {
    return { error: 'Title is required.' } satisfies ActionData
  }
  if (!content) {
    return { error: 'Terms content is required.' } satisfies ActionData
  }

  const version = Number(versionRaw)
  if (!Number.isInteger(version) || version <= 0) {
    return { error: 'Version must be a positive whole number.' } satisfies ActionData
  }

  const { data: consentRows, error: consentError } = await supabase
    .from('sign_up_terms_consent')
    .select('id')
    .eq('sign_up_terms_id', termId)
    .limit(1)

  if (consentError) {
    return { error: consentError.message } satisfies ActionData
  }

  if ((consentRows ?? []).length > 0) {
    return {
      error: 'This version already has consent records and can no longer be edited. Duplicate it instead.',
    } satisfies ActionData
  }

  if (setActive) {
    const { error: clearError } = await supabase
      .from('sign_up_terms')
      .update({ is_active: false })
      .eq('is_active', true)
      .neq('id', termId)

    if (clearError) {
      return { error: clearError.message } satisfies ActionData
    }
  }

  const slug = `${baseSlugFromTitle(title) || 'terms'}-v${version}`
  const { error: updateError } = await supabase
    .from('sign_up_terms')
    .update({
      title,
      content,
      version,
      slug,
      is_active: setActive,
    })
    .eq('id', termId)

  if (updateError) {
    return { error: updateError.message } satisfies ActionData
  }

  return redirect('/manage/sign-up-terms', { headers })
}

export default function EditSignUpTermsPage() {
  const { term } = useLoaderData<typeof loader>()
  const actionData = useActionData() as ActionData | undefined
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Edit sign-up terms</h1>
          <p className="text-sm text-muted-foreground">You can edit only terms versions without consent records.</p>
        </div>
        <Link to="/manage/sign-up-terms" className="rounded-md border border-input px-3 py-2 text-sm hover:bg-muted">
          Back
        </Link>
      </div>

      <Form method="post" className="space-y-4 rounded-lg border bg-card p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Title</span>
            <input
              name="title"
              required
              defaultValue={term.title}
              className="h-10 rounded border border-input bg-background px-3"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Version</span>
            <input
              name="version"
              type="number"
              min={1}
              defaultValue={term.version}
              required
              className="h-10 w-32 rounded border border-input bg-background px-3"
            />
          </label>
        </div>

        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Content (Markdown)</span>
          <textarea
            name="content"
            required
            defaultValue={term.content}
            className="min-h-[60vh] w-full rounded border border-input bg-background px-3 py-2 font-mono text-sm leading-6"
          />
        </label>

        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_active" defaultChecked={term.is_active} />
          <span>Set as active after save</span>
        </label>

        {actionData?.error ? <p className="text-sm text-destructive">{actionData.error}</p> : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {isSubmitting ? 'Saving...' : 'Save changes'}
        </button>
      </Form>
    </div>
  )
}
