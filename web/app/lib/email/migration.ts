export type TemplateMigrationMode = 'legacy' | 'shadow' | 'draft'

const normalizeFlagValue = (value: string | undefined) =>
  (value ?? '').trim().toLowerCase()

export const migrationModeEnvKey = (templateKey: string) =>
  `EMAIL_DRAFT_MODE_${templateKey.toUpperCase().replaceAll(/[^A-Z0-9]/g, '_')}`

export const legacyMigrationFlagEnvKey = (templateKey: string) =>
  `EMAIL_DRAFT_USE_${templateKey.toUpperCase().replaceAll(/[^A-Z0-9]/g, '_')}`

export const parseTemplateMigrationMode = ({
  templateKey,
  env,
}: {
  templateKey: string
  env: Record<string, string | undefined>
}): TemplateMigrationMode => {
  const nextModeRaw = normalizeFlagValue(env[migrationModeEnvKey(templateKey)])
  if (nextModeRaw === 'legacy' || nextModeRaw === 'shadow' || nextModeRaw === 'draft') {
    return nextModeRaw
  }

  // Backward compatibility while switching from boolean flags to mode flags.
  const legacyFlag = normalizeFlagValue(env[legacyMigrationFlagEnvKey(templateKey)])
  if (legacyFlag === '1' || legacyFlag === 'true' || legacyFlag === 'yes' || legacyFlag === 'on') {
    return 'draft'
  }

  return 'legacy'
}

const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim()

const normalizeHtml = (value: string) =>
  value
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim()

export const compareRenderedEmail = ({
  legacy,
  draft,
}: {
  legacy: { subject: string; text: string; html: string }
  draft: { subject: string; text: string; html: string }
}) => {
  const subjectMatch = normalizeText(legacy.subject) === normalizeText(draft.subject)
  const textMatch = normalizeText(legacy.text) === normalizeText(draft.text)
  const htmlMatch = normalizeHtml(legacy.html) === normalizeHtml(draft.html)

  return {
    matched: subjectMatch && textMatch && htmlMatch,
    subjectMatch,
    textMatch,
    htmlMatch,
  }
}
