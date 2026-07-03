import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link, useFetcher } from 'react-router'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'

import type { Database } from '@/lib/database.types'
import type { Route } from './+types/gift-cards.upload'

type ExpectedColumnKey = 'url' | 'account_number' | 'pin' | 'value' | 'provider'

type GiftCardCsvColumnMapping = {
  url: string
  account_number: string
  pin: string
  value: string
  provider: string
}

const expectedColumns: Array<{ key: ExpectedColumnKey; label: string; required: boolean }> = [
  { key: 'url', label: 'URL column', required: true },
  { key: 'account_number', label: 'Account number column', required: true },
  { key: 'pin', label: 'PIN column', required: true },
  { key: 'value', label: 'Value column', required: true },
  { key: 'provider', label: 'Provider column', required: false },
]

const parseCsvHeaderLine = (line: string) => {
  const cells: string[] = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]
    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (char === ',' && !inQuotes) {
      cells.push(cell.trim())
      cell = ''
      continue
    }
    cell += char
  }

  cells.push(cell.trim())
  return cells.filter(Boolean)
}

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '_')

const autoMatchHeader = (headers: string[], expected: ExpectedColumnKey) => {
  const byNormalized = new Map(headers.map(header => [normalizeHeader(header), header]))
  if (byNormalized.has(expected)) return byNormalized.get(expected) ?? ''
  if (expected === 'url') {
    return byNormalized.get('link') ?? byNormalized.get('gift_card_url') ?? ''
  }
  if (expected === 'value') {
    return byNormalized.get('amount') ?? ''
  }
  return ''
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    throw new Response('Forbidden', { status: 403 })
  }

  return {}
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    return { error: 'You are not allowed to upload gift cards.' }
  }

  const formData = await request.formData()
  const uploadType = 'csv_link' as Database['public']['Enums']['gift_card_upload_type']
  const file = formData.get('file')
  const defaultProviderRaw = (formData.get('default_provider') as string | null)?.trim() ?? ''
  const defaultProvider =
    defaultProviderRaw === 'PC' || defaultProviderRaw === 'Sobeys'
      ? (defaultProviderRaw as Database['public']['Enums']['gift_card_provider'])
      : ''

  const columnMapping: GiftCardCsvColumnMapping = {
    url: (formData.get('map_url') as string | null)?.trim() ?? '',
    account_number: (formData.get('map_account_number') as string | null)?.trim() ?? '',
    pin: (formData.get('map_pin') as string | null)?.trim() ?? '',
    value: (formData.get('map_value') as string | null)?.trim() ?? '',
    provider: (formData.get('map_provider') as string | null)?.trim() ?? '',
  }

  if (!file || !(file instanceof File) || file.size === 0) {
    return { error: 'Please choose a file to upload.' }
  }

  const lowerName = file.name.trim().toLowerCase()
  if (!lowerName.endsWith('.csv')) {
    return { error: 'Upload must be a CSV file.' }
  }

  const { supabase, headers } = createClient(request)
  const { processGiftCardUpload } = await import('@/lib/gift-cards/process-upload.server')
  const { data: uploadRow, error: uploadError } = await supabase
    .from('gift_card_upload')
    .insert({
      uploaded_by: auth.user.id,
      provider: defaultProvider || null,
      upload_type: uploadType,
      status: 'processing',
      file_name: file.name,
      file_size: file.size,
      metadata: {
        column_mapping: columnMapping,
        default_provider: defaultProvider || null,
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
    columnMapping,
    defaultProvider,
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

export default function GiftCardsUploadPage() {
  const fetcher = useFetcher<typeof action>()
  const error = fetcher.data?.error
  const success = Boolean((fetcher.data as { success?: boolean } | undefined)?.success)
  const loading = fetcher.state === 'submitting'
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const uploadProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [preparingHeaders, setPreparingHeaders] = useState(false)
  const [prepareProgress, setPrepareProgress] = useState(0)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [mappingByColumn, setMappingByColumn] = useState<Record<ExpectedColumnKey, string>>({
    url: '',
    account_number: '',
    pin: '',
    value: '',
    provider: '',
  })

  const mappingOptions = useMemo(() => csvHeaders, [csvHeaders])

  useEffect(() => {
    if (loading) {
      if (!uploadProgressTimerRef.current) {
        uploadProgressTimerRef.current = setInterval(() => {
          setUploadProgress(prev => (prev >= 90 ? prev : prev + 6))
        }, 120)
      }
      setUploadProgress(prev => (prev >= 10 ? prev : 10))
      return
    }

    if (uploadProgressTimerRef.current) {
      clearInterval(uploadProgressTimerRef.current)
      uploadProgressTimerRef.current = null
    }

    if (uploadProgress > 0) {
      setUploadProgress(100)
      const timeout = setTimeout(() => setUploadProgress(0), 350)
      return () => clearTimeout(timeout)
    }
  }, [loading, uploadProgress])

  useEffect(
    () => () => {
      if (uploadProgressTimerRef.current) clearInterval(uploadProgressTimerRef.current)
    },
    []
  )

  const loadHeadersFromFile = async (file: File | null | undefined) => {
    if (!file) {
      setCsvHeaders([])
      setMappingByColumn({
        url: '',
        account_number: '',
        pin: '',
        value: '',
        provider: '',
      })
      setPreparingHeaders(false)
      setPrepareProgress(0)
      return
    }

    setPreparingHeaders(true)
    setPrepareProgress(15)
    const text = await file.text()
    setPrepareProgress(65)
    const firstLine = text.split(/\r?\n/).find(line => line.trim()) ?? ''
    const headers = parseCsvHeaderLine(firstLine)
    setCsvHeaders(headers)

    setMappingByColumn({
      url: autoMatchHeader(headers, 'url'),
      account_number: autoMatchHeader(headers, 'account_number'),
      pin: autoMatchHeader(headers, 'pin'),
      value: autoMatchHeader(headers, 'value'),
      provider: autoMatchHeader(headers, 'provider'),
    })
    setPrepareProgress(100)
    setTimeout(() => {
      setPreparingHeaders(false)
      setPrepareProgress(0)
    }, 200)
  }

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    await loadHeadersFromFile(file)
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Upload gift cards</h1>
        <p className="text-sm text-muted-foreground">Upload a CSV, map your columns, and optionally set a default provider.</p>
        <Button asChild variant="outline" size="sm">
          <Link to="/manage/gift-cards">Back to assets</Link>
        </Button>
      </header>

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <fetcher.Form
          method="post"
          className="grid gap-4"
          encType="multipart/form-data"
          onSubmit={() => setUploadProgress(prev => (prev >= 10 ? prev : 10))}
        >
          <div className="grid gap-2">
            <Label htmlFor="file">File</Label>
            <Input ref={fileInputRef} id="file" name="file" type="file" accept=".csv,text/csv" required onChange={onFileChange} />
          </div>

          {mappingOptions.length ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="default_provider">Default provider (optional)</Label>
                <select
                  id="default_provider"
                  name="default_provider"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue=""
                >
                  <option value="">Use mapped provider column</option>
                  <option value="PC">PC</option>
                  <option value="Sobeys">Sobeys</option>
                </select>
              </div>

              <div className="grid gap-3 rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Map your CSV headers to expected columns.</p>
                {expectedColumns.map(column => (
                  <div key={column.key} className="grid gap-2">
                    <Label htmlFor={`map_${column.key}`}>
                      {column.label}
                      {column.required ? ' *' : ''}
                    </Label>
                    <select
                      id={`map_${column.key}`}
                      name={`map_${column.key}`}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={mappingByColumn[column.key]}
                      onChange={event =>
                        setMappingByColumn(prev => ({
                          ...prev,
                          [column.key]: event.target.value,
                        }))
                      }
                      required={column.required}
                    >
                      <option value="">{column.required ? 'Select CSV column' : 'Optional'}</option>
                      {mappingOptions.map(header => (
                        <option key={`${column.key}-${header}`} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-md border p-3 text-xs text-muted-foreground">
              Upload a CSV first to load header mappings.
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
          {success && <p className="text-sm text-emerald-600">Upload complete.</p>}

          {(preparingHeaders || loading || uploadProgress > 0) && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{preparingHeaders ? 'Reading CSV headers...' : 'Uploading batch...'}</span>
                <span>{preparingHeaders ? prepareProgress : uploadProgress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded bg-muted/40">
                <div
                  className="h-full bg-primary transition-[width] duration-200"
                  style={{ width: `${preparingHeaders ? prepareProgress : uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          <Button
            type={mappingOptions.length ? 'submit' : 'button'}
            disabled={loading}
            className="cursor-pointer"
            onClick={
              mappingOptions.length
                ? undefined
                : async () => {
                  await loadHeadersFromFile(fileInputRef.current?.files?.[0] ?? null)
                }
            }
          >
            {mappingOptions.length ? (loading ? 'Uploading...' : 'Upload batch') : preparingHeaders ? 'Loading headers...' : 'Upload CSV'}
          </Button>
        </fetcher.Form>
      </div>
    </div>
  )
}
