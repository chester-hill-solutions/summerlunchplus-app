import { useFetcher, useLoaderData } from 'react-router'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import { processGiftCardUpload } from '@/lib/gift-cards/process-upload.server'

import type { Database } from '@/lib/database.types'
import type { Route } from './+types/gift-cards'

type UploadRow = Database['public']['Tables']['gift_card_upload']['Row']

const uploadTypeOptions: { label: string; value: Database['public']['Enums']['gift_card_upload_type'] }[] = [
  { label: 'PDF (1 card per page)', value: 'pdf_per_page' },
  { label: 'PDF (1 card per 4 pages)', value: 'pdf_per_4_pages' },
  { label: 'CSV (links)', value: 'csv_link' },
]

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    throw new Response('Forbidden', { status: 403 })
  }

  const { supabase } = createClient(request)
  const { data: uploads } = await supabase
    .from('gift_card_upload')
    .select('id, provider, upload_type, status, total_cards, processed_cards, file_name, error_message, created_at')
    .order('created_at', { ascending: false })

  return {
    uploads: uploads ?? [],
    role: auth.claims.role,
  }
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    return { error: 'You are not allowed to upload gift cards.' }
  }

  const formData = await request.formData()
  const uploadType = formData.get('upload_type') as Database['public']['Enums']['gift_card_upload_type']
  const provider = (formData.get('provider') as string | null)?.trim() ?? ''
  const defaultValueRaw = (formData.get('default_value') as string | null)?.trim() ?? ''
  const file = formData.get('file')

  if (!uploadType) {
    return { error: 'Upload type is required.' }
  }

  if (!file || !(file instanceof File) || file.size === 0) {
    return { error: 'Please choose a file to upload.' }
  }

  const defaultValue = defaultValueRaw ? Number(defaultValueRaw) : undefined
  if (defaultValueRaw && Number.isNaN(defaultValue)) {
    return { error: 'Gift card value must be a number.' }
  }

  if (uploadType !== 'csv_link' && defaultValue == null) {
    return { error: 'Gift card value is required for PDF uploads.' }
  }

  const { supabase, headers } = createClient(request)
  const { data: uploadRow, error: uploadError } = await supabase
    .from('gift_card_upload')
    .insert({
      uploaded_by: auth.user.id,
      provider: provider || null,
      upload_type: uploadType,
      status: 'processing',
      file_name: file.name,
      file_size: file.size,
      metadata: {
        default_value: defaultValue ?? null,
      },
    })
    .select('id')
    .single()

  if (uploadError || !uploadRow?.id) {
    return { error: uploadError?.message ?? 'Unable to start upload.' }
  }

  const result = await processGiftCardUpload({
    supabase,
    uploadId: uploadRow.id,
    uploadType,
    file,
    defaultValue,
    provider: provider || undefined,
  })

  await supabase
    .from('gift_card_upload')
    .update({
      status: result.errorMessage ? 'failed' : 'processed',
      total_cards: result.totalCards,
      processed_cards: result.processedCards,
      error_message: result.errorMessage ?? null,
    })
    .eq('id', uploadRow.id)

  if (result.errorMessage) {
    return { error: result.errorMessage }
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

export default function GiftCardsPage() {
  const { uploads } = useLoaderData<typeof loader>()
  const fetcher = useFetcher<typeof action>()
  const error = fetcher.data?.error
  const loading = fetcher.state === 'submitting'

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Gift card uploads</h1>
        <p className="text-sm text-muted-foreground">
          Upload PDF or CSV batches and track processing results.
        </p>
      </header>

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <fetcher.Form method="post" className="grid gap-4" encType="multipart/form-data">
          <div className="grid gap-2">
            <Label htmlFor="upload_type">Upload type</Label>
            <select
              id="upload_type"
              name="upload_type"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              required
            >
              {uploadTypeOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="provider">Provider (optional)</Label>
            <Input id="provider" name="provider" />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="default_value">Default value (required for PDF)</Label>
            <Input id="default_value" name="default_value" type="number" min="0" step="0.01" />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="file">File</Label>
            <Input id="file" name="file" type="file" required />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? 'Uploading...' : 'Upload batch'}
          </Button>
        </fetcher.Form>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Recent uploads</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-6 py-3 text-left">File</th>
                <th className="px-6 py-3 text-left">Type</th>
                <th className="px-6 py-3 text-left">Provider</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-left">Processed</th>
                <th className="px-6 py-3 text-left">Errors</th>
              </tr>
            </thead>
            <tbody>
              {uploads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-6 text-center text-sm text-muted-foreground">
                    No uploads yet.
                  </td>
                </tr>
              ) : (
                uploads.map(upload => (
                  <tr key={upload.id} className="border-b last:border-b-0">
                    <td className="px-6 py-3 font-medium text-slate-900">
                      {upload.file_name ?? 'Untitled'}
                    </td>
                    <td className="px-6 py-3">{upload.upload_type}</td>
                    <td className="px-6 py-3">{upload.provider ?? '—'}</td>
                    <td className="px-6 py-3 capitalize">{upload.status}</td>
                    <td className="px-6 py-3">
                      {upload.processed_cards}/{upload.total_cards}
                    </td>
                    <td className="px-6 py-3 text-xs text-red-500">
                      {upload.error_message ?? ''}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
