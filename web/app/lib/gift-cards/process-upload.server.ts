import { PDFDocument } from 'pdf-lib'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, Json } from '@/lib/database.types'

import { parseGiftCardCsv } from './parse-csv'

type UploadType = Database['public']['Enums']['gift_card_upload_type']

type ProcessUploadInput = {
  supabase: SupabaseClient<Database>
  uploadId: string
  uploadType: UploadType
  file: File
  defaultValue?: number
  provider?: string
}

type ProcessUploadResult = {
  totalCards: number
  processedCards: number
  errorMessage?: string
}

const RAW_BUCKET = 'gift-cards-raw'
const PROCESSED_BUCKET = 'gift-cards-processed'

const buildStorageAssetUrl = (bucket: string, path: string) => `storage://${bucket}/${path}`

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
  defaultValue: number | undefined,
  provider: string | undefined
) => {
  const csvText = new TextDecoder().decode(csvBuffer)
  const { assets, errors } = parseGiftCardCsv(csvText, { defaultValue })

  if (errors.length) {
    return { assets: [], errors }
  }

  const rows = assets.map(asset => ({
    upload_id: uploadId,
    value: asset.value,
    asset_url: asset.linkUrl,
    source_index: asset.rowNumber,
    metadata: {
      provider: asset.provider ?? provider ?? null,
      source: 'csv',
    },
  }))

  const error = await storeAssets(supabase, rows)

  return { assets: rows, errors: error ? [error.message] : [] }
}

const processPdfUpload = async (
  supabase: SupabaseClient<Database>,
  uploadId: string,
  pdfBuffer: ArrayBuffer,
  uploadType: UploadType,
  defaultValue: number,
  provider: string | undefined
) => {
  const pdfDoc = await PDFDocument.load(pdfBuffer)
  const totalPages = pdfDoc.getPageCount()
  const chunkSize = uploadType === 'pdf_per_4_pages' ? 4 : 1
  const assets: Array<{
    upload_id: string
    value: number
    asset_url: string
    page_count: number
    source_index: number
    metadata: Json
  }> = []

  for (let start = 0; start < totalPages; start += chunkSize) {
    const end = Math.min(start + chunkSize, totalPages)
    const pageIndexes = Array.from({ length: end - start }, (_, index) => start + index)
    const chunk = await PDFDocument.create()
    const pages = await chunk.copyPages(pdfDoc, pageIndexes)
    pages.forEach(page => chunk.addPage(page))
    const bytes = await chunk.save()
    const filePath = `${uploadId}/card-${assets.length + 1}.pdf`

    const { error } = await supabase.storage
      .from(PROCESSED_BUCKET)
      .upload(filePath, bytes, { contentType: 'application/pdf', upsert: true })

    if (error) {
      return { assets: [], errors: [error.message] }
    }

    assets.push({
      upload_id: uploadId,
      value: defaultValue,
      asset_url: buildStorageAssetUrl(PROCESSED_BUCKET, filePath),
      page_count: pages.length,
      source_index: start + 1,
      metadata: {
        provider: provider ?? null,
        source: 'pdf',
      },
    })
  }

  const error = await storeAssets(supabase, assets)

  return { assets, errors: error ? [error.message] : [] }
}

export const processGiftCardUpload = async ({
  supabase,
  uploadId,
  uploadType,
  file,
  defaultValue,
  provider,
}: ProcessUploadInput): Promise<ProcessUploadResult> => {
  try {
    const rawBuffer = await uploadRawFile(supabase, uploadId, file)

    if (uploadType === 'csv_link') {
      const { assets, errors } = await processCsvUpload(supabase, uploadId, rawBuffer, defaultValue, provider)
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
    }

    if (defaultValue == null || Number.isNaN(defaultValue)) {
      return {
        totalCards: 0,
        processedCards: 0,
        errorMessage: 'Gift card value is required for PDF uploads.',
      }
    }

    const { assets, errors } = await processPdfUpload(
      supabase,
      uploadId,
      rawBuffer,
      uploadType,
      defaultValue,
      provider
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
