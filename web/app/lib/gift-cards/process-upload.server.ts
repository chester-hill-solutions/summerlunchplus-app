import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, Json } from '@/lib/database.types'

import { parseGiftCardCsv, type GiftCardCsvColumnMapping } from './parse-csv'

type UploadType = Database['public']['Enums']['gift_card_upload_type']

type ProcessUploadInput = {
  supabase: SupabaseClient<Database>
  uploadId: string
  uploadType: UploadType
  file: File
  columnMapping?: GiftCardCsvColumnMapping
  defaultProvider?: Database['public']['Enums']['gift_card_provider'] | ''
}

type ProcessUploadResult = {
  totalCards: number
  processedCards: number
  errorMessage?: string
}

const RAW_BUCKET = 'gift-cards-raw'

const uploadRawFile = async (supabase: SupabaseClient<Database>, uploadId: string, file: File) => {
  const buffer = await file.arrayBuffer()
  const filePath = `${uploadId}/${file.name}`

  const { error } = await supabase.storage
    .from(RAW_BUCKET)
    .upload(filePath, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    })

  if (error) {
    throw new Error(error.message)
  }

  return buffer
}

const storeAssets = async (
  supabase: SupabaseClient<Database>,
  assets: Array<{
    upload_id: string
    provider: Database['public']['Enums']['gift_card_provider']
    account_number: string
    pin: string
    value: number
    asset_url: string
    page_count?: number | null
    source_index?: number | null
    metadata?: Json
  }>
) => {
  if (!assets.length) return null

  const { error } = await supabase.from('gift_card_asset').insert(
    assets.map(asset => ({
      upload_id: asset.upload_id,
      provider: asset.provider,
      account_number: asset.account_number,
      pin: asset.pin,
      value: asset.value,
      asset_url: asset.asset_url,
      page_count: asset.page_count ?? null,
      source_index: asset.source_index ?? null,
      metadata: asset.metadata ?? {},
    }))
  )

  return error
}

const processCsvUpload = async (
  supabase: SupabaseClient<Database>,
  uploadId: string,
  csvBuffer: ArrayBuffer,
  columnMapping: GiftCardCsvColumnMapping | undefined,
  defaultProvider: Database['public']['Enums']['gift_card_provider'] | '' | undefined
) => {
  const csvText = new TextDecoder().decode(csvBuffer)
  const { assets, errors } = parseGiftCardCsv(csvText, {
    columnMapping,
    defaultProvider,
  })

  if (errors.length) {
    return { assets: [], errors }
  }

  const rows = assets.map(asset => ({
    upload_id: uploadId,
    value: asset.value,
    provider: asset.provider,
    account_number: asset.accountNumber,
    pin: asset.pin,
    asset_url: asset.url,
    source_index: asset.rowNumber,
    metadata: {
      source: 'csv',
    },
  }))

  const error = await storeAssets(supabase, rows)

  return { assets: rows, errors: error ? [error.message] : [] }
}

export const processGiftCardUpload = async ({
  supabase,
  uploadId,
  uploadType,
  file,
  columnMapping,
  defaultProvider,
}: ProcessUploadInput): Promise<ProcessUploadResult> => {
  try {
    if (uploadType !== 'csv_link') {
      return {
        totalCards: 0,
        processedCards: 0,
        errorMessage: 'Only CSV uploads are supported.',
      }
    }

    const rawBuffer = await file.arrayBuffer()
    try {
      await uploadRawFile(supabase, uploadId, file)
    } catch (error) {
      console.warn('[gift-cards] raw CSV storage upload failed; continuing with parsed upload', {
        uploadId,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    const { assets, errors } = await processCsvUpload(
      supabase,
      uploadId,
      rawBuffer,
      columnMapping,
      defaultProvider
    )
    if (errors.length) {
      return {
        totalCards: assets.length,
        processedCards: assets.length,
        errorMessage: errors.join('; '),
      }
    }

    return {
      totalCards: assets.length,
      processedCards: assets.length,
    }
  } catch (error) {
    return {
      totalCards: 0,
      processedCards: 0,
      errorMessage: error instanceof Error ? error.message : 'Unable to process upload',
    }
  }
}
