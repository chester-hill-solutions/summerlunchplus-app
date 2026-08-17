import convertHeic from 'heic-convert'

import { adminClient } from '@/lib/supabase/adminClient'

const PREVIEW_MIME_TYPE = 'image/jpeg'
const PREVIEW_CACHE_CONTROL = '31536000'

const HEIC_MIME_TYPES = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'])

export const isHeicPhoto = (fileName: string | null, mimeType: string | null) => {
  const normalizedMimeType = (mimeType ?? '').trim().toLowerCase().split(';', 1)[0]
  if (HEIC_MIME_TYPES.has(normalizedMimeType)) return true

  const normalizedFileName = (fileName ?? '').trim().toLowerCase()
  return normalizedFileName.endsWith('.heic') || normalizedFileName.endsWith('.heif')
}

export const photoPreviewStoragePath = (photoId: string) => `class-attendance-previews/${photoId}.jpg`

type PreviewInput = {
  photoId: string
  storageBucket: string
  storagePath: string
}

type PreviewResult = {
  signedUrl: string | null
  error: string | null
}

const createPreviewSignedUrl = async (storageBucket: string, storagePath: string) => {
  const { data, error } = await adminClient.storage.from(storageBucket).createSignedUrl(storagePath, 10 * 60)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

export const getOrCreateHeicPreview = async ({ photoId, storageBucket, storagePath }: PreviewInput): Promise<PreviewResult> => {
  const previewPath = photoPreviewStoragePath(photoId)
  const existingPreviewUrl = await createPreviewSignedUrl(storageBucket, previewPath)
  if (existingPreviewUrl) return { signedUrl: existingPreviewUrl, error: null }

  const { data: original, error: downloadError } = await adminClient.storage.from(storageBucket).download(storagePath)
  if (downloadError || !original) {
    return { signedUrl: null, error: downloadError?.message ?? 'Original photo could not be downloaded.' }
  }

  try {
    const output = await convertHeic({
      buffer: Buffer.from(await original.arrayBuffer()),
      format: 'JPEG',
      quality: 0.88,
    })

    const { error: uploadError } = await adminClient.storage.from(storageBucket).upload(previewPath, output, {
      cacheControl: PREVIEW_CACHE_CONTROL,
      contentType: PREVIEW_MIME_TYPE,
      upsert: false,
    })

    // Another request may have generated the same deterministic derivative first.
    if (uploadError) {
      const concurrentPreviewUrl = await createPreviewSignedUrl(storageBucket, previewPath)
      if (!concurrentPreviewUrl) return { signedUrl: null, error: uploadError.message }
      return { signedUrl: concurrentPreviewUrl, error: null }
    }

    const signedUrl = await createPreviewSignedUrl(storageBucket, previewPath)
    return signedUrl
      ? { signedUrl, error: null }
      : { signedUrl: null, error: 'Converted photo was uploaded but could not be signed.' }
  } catch (error) {
    return {
      signedUrl: null,
      error: error instanceof Error ? error.message : 'HEIC photo conversion failed.',
    }
  }
}
