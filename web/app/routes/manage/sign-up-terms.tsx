import { Form, Link, redirect, useActionData, useLoaderData, useNavigation } from 'react-router'
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router'

import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'

type TermsRow = {
  id: string
  slug: string
  title: string
  version: number
  is_active: boolean
  updated_at: string
  consentCount: number
}

type ActionData = {
  error?: string
}

const formatDateTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export async function loader({ request }: LoaderFunctionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    throw redirect('/home', { headers: auth.headers })
  }

  const { supabase, headers } = createClient(request)
  const { data, error } = await supabase
    .from('sign_up_terms')
    .select('id, slug, title, version, is_active, updated_at')
    .order('version', { ascending: false })

  if (error) {
    throw new Response(error.message, { status: 500, headers })
  }

  const ids = (data ?? []).map(row => row.id)
  const { data: consentRows } = ids.length
    ? await supabase
        .from('sign_up_terms_consent')
        .select('sign_up_terms_id')
        .in('sign_up_terms_id', ids)
    : { data: [] }

  const consentCounts = new Map<string, number>()
  for (const row of consentRows ?? []) {
    const key = String(row.sign_up_terms_id ?? '')
    if (!key) continue
    consentCounts.set(key, (consentCounts.get(key) ?? 0) + 1)
  }

  return {
    rows: (data ?? []).map(row => ({
      ...row,
      consentCount: consentCounts.get(row.id) ?? 0,
    })) as TermsRow[],
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    return { error: 'Unauthorized' } satisfies ActionData
  }

  const { supabase, headers } = createClient(request)
  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? '')
  const termId = String(formData.get('term_id') ?? '').trim()

  if (!termId) {
    return { error: 'Missing term record.' } satisfies ActionData
  }

  if (intent === 'set-active') {
    const { error: disableError } = await supabase
      .from('sign_up_terms')
      .update({ is_active: false })
      .eq('is_active', true)
      .neq('id', termId)

    if (disableError) {
      return { error: disableError.message } satisfies ActionData
    }

    const { error: activateError } = await supabase
      .from('sign_up_terms')
      .update({ is_active: true })
      .eq('id', termId)

    if (activateError) {
      return { error: activateError.message } satisfies ActionData
    }

    return redirect('/manage/sign-up-terms', { headers })
  }

  return { error: 'Unsupported action.' } satisfies ActionData
}

export default function SignUpTermsTablePage() {
  const { rows } = useLoaderData<typeof loader>()
  const actionData = useActionData() as ActionData | undefined
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Sign-up terms</h1>
          <p className="text-sm text-muted-foreground">
            Create and version terms documents, duplicate existing entries, and keep a single active version.
          </p>
        </div>
        <Link
          to="/manage/sign-up-terms/new"
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          New
        </Link>
      </div>

      {actionData?.error ? <p className="text-sm text-destructive">{actionData.error}</p> : null}

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full table-auto text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Version</th>
              <th className="px-4 py-2 text-left">Title</th>
              <th className="px-4 py-2 text-left">Slug</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Updated</th>
              <th className="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id} className={index % 2 === 0 ? 'bg-card' : ''}>
                <td className="px-4 py-2 font-mono">v{row.version}</td>
                <td className="px-4 py-2">{row.title}</td>
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{row.slug}</td>
                <td className="px-4 py-2">
                  {row.is_active ? (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">active</span>
                  ) : (
                    <span className="rounded bg-muted px-2 py-0.5 text-xs">inactive</span>
                  )}
                </td>
                <td className="px-4 py-2 text-muted-foreground">{formatDateTime(row.updated_at)}</td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/manage/sign-up-terms/new?duplicate=${encodeURIComponent(row.id)}`}
                      className="rounded border border-input px-2 py-1 text-xs hover:bg-muted"
                    >
                      Duplicate
                    </Link>

                    {row.consentCount === 0 ? (
                      <Link
                        to={`/manage/sign-up-terms/${encodeURIComponent(row.id)}/edit`}
                        className="rounded border border-input px-2 py-1 text-xs hover:bg-muted"
                      >
                        Edit
                      </Link>
                    ) : (
                      <span
                        title="Cannot edit this version because consent records already exist. Duplicate it to create a new editable version."
                        className="inline-block"
                      >
                        <button
                          type="button"
                          disabled
                          className="rounded border border-input px-2 py-1 text-xs opacity-60"
                        >
                          Edit
                        </button>
                      </span>
                    )}

                    <Form method="post">
                      <input type="hidden" name="intent" value="set-active" />
                      <input type="hidden" name="term_id" value={row.id} />
                      <button
                        type="submit"
                        disabled={isSubmitting || row.is_active}
                        className="rounded border border-input px-2 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Set active
                      </button>
                    </Form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
