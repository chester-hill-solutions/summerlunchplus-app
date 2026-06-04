import { collectPlaceholders } from '@/lib/email/drafts/renderer.server'
import type {
  EmailDraftChannel,
  EmailDraftSchema,
  ValidateDraftResult,
} from '@/lib/email/drafts/types'

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const normalizeSchema = (value: unknown): EmailDraftSchema => {
  if (!isObject(value)) return {}

  const required = Array.isArray(value.required)
    ? value.required.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : undefined

  const properties = isObject(value.properties)
    ? Object.fromEntries(
        Object.entries(value.properties).map(([key, entry]) => [
          key,
          isObject(entry)
            ? {
                description:
                  typeof entry.description === 'string' ? entry.description : undefined,
                example: typeof entry.example === 'string' ? entry.example : undefined,
              }
            : {},
        ])
      )
    : undefined

  return {
    ...(required ? { required } : {}),
    ...(properties ? { properties } : {}),
  }
}

export const parseSchemaInput = (schemaText: string) => {
  const trimmed = schemaText.trim()
  if (!trimmed) return { schema: {}, error: null as string | null }

  try {
    const parsed = JSON.parse(trimmed)
    if (!isObject(parsed)) {
      return { schema: {}, error: 'Variables schema must be a JSON object.' }
    }
    return { schema: normalizeSchema(parsed), error: null as string | null }
  } catch (error) {
    return {
      schema: {},
      error: error instanceof Error ? error.message : 'Variables schema must be valid JSON.',
    }
  }
}

export const validateDraftForPublish = ({
  channel,
  triggerSummary,
  subjectMarkdown,
  bodyMarkdown,
  variablesSchema,
}: {
  channel: EmailDraftChannel
  triggerSummary: string
  subjectMarkdown: string
  bodyMarkdown: string
  variablesSchema: EmailDraftSchema
}): ValidateDraftResult => {
  const errors: string[] = []

  if (!subjectMarkdown.trim()) {
    errors.push('Subject markdown is required.')
  }

  if (!bodyMarkdown.trim()) {
    errors.push('Body markdown is required.')
  }

  if (channel === 'transactional') {
    const normalized = triggerSummary.trim()
    if (!normalized) {
      errors.push('A short trigger summary is required for transactional drafts.')
    } else if (normalized.length > 200) {
      errors.push('Trigger summary must be 200 characters or fewer.')
    }
  }

  const required = Array.isArray(variablesSchema.required)
    ? variablesSchema.required.filter(key => key.trim().length > 0)
    : []

  const placeholders = new Set([
    ...collectPlaceholders(subjectMarkdown),
    ...collectPlaceholders(bodyMarkdown),
  ])

  for (const key of required) {
    if (!placeholders.has(key)) {
      errors.push(`Required variable {{${key}}} is missing from subject/body markdown.`)
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  }
}
