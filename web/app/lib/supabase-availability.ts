const NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
])

const getNestedCauseCode = (error: unknown): string | null => {
  if (!error || typeof error !== 'object') return null
  const cause = (error as { cause?: unknown }).cause
  if (!cause || typeof cause !== 'object') return null
  const code = (cause as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

export const isSupabaseUnavailableError = (error: unknown) => {
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()
  if (message.includes('fetch failed') || message.includes('connection refused')) {
    return true
  }

  const code = getNestedCauseCode(error)
  if (code && NETWORK_ERROR_CODES.has(code)) {
    return true
  }

  return false
}

export const formatSupabaseUnavailableMessage = (where: string) =>
  `We cannot reach the database right now while ${where}. The site is online, but data services are temporarily unavailable. Please contact the system admin.`
