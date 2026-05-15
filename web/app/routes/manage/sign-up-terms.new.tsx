import { Form, Link, redirect, useActionData, useLoaderData, useNavigation } from 'react-router'
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router'

import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'

type LoaderData = {
  suggestedVersion: number
  initialTitle: string
  initialContent: string
  mode: 'new' | 'duplicate'
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

export async function loader({ request }: LoaderFunctionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    throw redirect('/home', { headers: auth.headers })
  }

  const { supabase, headers } = createClient(request)
  const url = new URL(request.url)
  const duplicateId = url.searchParams.get('duplicate')
  const { data, error } = await supabase
    .from('sign_up_terms')
    .select('version')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Response(error.message, { status: 500, headers })
  }

  let initialTitle = ''
  let initialContent = ''
  let mode: LoaderData['mode'] = 'new'

  if (duplicateId) {
    const { data: duplicateSource, error: duplicateError } = await supabase
      .from('sign_up_terms')
      .select('title, content')
      .eq('id', duplicateId)
      .maybeSingle()

    if (duplicateError || !duplicateSource) {
      throw new Response(duplicateError?.message ?? 'Unable to load duplicate source.', {
        status: 404,
        headers,
      })
    }

    mode = 'duplicate'
    initialTitle = duplicateSource.title
    initialContent = duplicateSource.content
  }

  return {
    suggestedVersion: Number(data?.version ?? 0) + 1,
    initialTitle,
    initialContent,
    mode,
  } satisfies LoaderData
}

export async function action({ request }: ActionFunctionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    return { error: 'Unauthorized' } satisfies ActionData
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

  const slugBase = baseSlugFromTitle(title) || 'terms'
  const slug = `${slugBase}-v${version}`

  if (setActive) {
    const { error: clearError } = await supabase
      .from('sign_up_terms')
      .update({ is_active: false })
      .eq('is_active', true)
    if (clearError) {
      return { error: clearError.message } satisfies ActionData
    }
  }

  const { error: insertError } = await supabase.from('sign_up_terms').insert({
    slug,
    title,
    content,
    version,
    is_active: setActive,
  })

  if (insertError) {
    return { error: insertError.message } satisfies ActionData
  }

  return redirect('/manage/sign-up-terms', { headers })
}

export default function NewSignUpTermsPage() {
  const { suggestedVersion, initialTitle, initialContent, mode } = useLoaderData<typeof loader>()
  const actionData = useActionData() as ActionData | undefined
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">New sign-up terms</h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'duplicate'
              ? 'Duplicate mode: adjust fields before creating the new version.'
              : 'Create a new version using a full-size markdown editor.'}
          </p>
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
              defaultValue={initialTitle}
              className="h-10 rounded border border-input bg-background px-3"
              placeholder="Summerlunch+ Data Privacy Principles"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Version</span>
            <input
              name="version"
              type="number"
              min={1}
              defaultValue={suggestedVersion}
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
            defaultValue={initialContent}
            className="min-h-[60vh] w-full rounded border border-input bg-background px-3 py-2 font-mono text-sm leading-6"
            placeholder="Write markdown terms content here..."
          />
        </label>

        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_active" />
          <span>Set as active after save</span>
        </label>

        {actionData?.error ? <p className="text-sm text-destructive">{actionData.error}</p> : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {isSubmitting ? 'Saving...' : 'Create terms'}
        </button>
      </Form>
    </div>
  )
}
