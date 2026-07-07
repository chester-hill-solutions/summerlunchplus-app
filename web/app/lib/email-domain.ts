const ALLOWED_EMAIL_DOMAINS = ['gmail.com', 'summerlunchplus.com', 'chsolutions.ca']

export const ALLOWED_EMAIL_DOMAIN_TEXT = ALLOWED_EMAIL_DOMAINS.join(', ')

export const ALLOWED_EMAIL_PATTERN = `^[^\\s@]+@(${ALLOWED_EMAIL_DOMAINS
  .map(domain => domain.replace('.', '\\.'))
  .join('|')})$`

export const normalizeEmail = (value: string) => value.trim().toLowerCase()

export const getMaskedEmailHint = (email: string | null | undefined) => {
  if (!email) return null
  const normalized = normalizeEmail(email)
  const parts = normalized.split('@')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null

  const username = parts[0]
  const domain = parts[1]
  const usernamePrefix = username.slice(0, 3)
  const usernameSuffix = username.length > 3 ? username.slice(-2) : ''
  const maskedUsername = usernameSuffix ? `${usernamePrefix}***${usernameSuffix}` : `${usernamePrefix}***`

  return `${maskedUsername}@${domain}`
}

export const getEmailDomainHint = getMaskedEmailHint

export const isAllowedEmailDomain = (value: string) => {
  const normalized = normalizeEmail(value)
  const parts = normalized.split('@')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false
  return ALLOWED_EMAIL_DOMAINS.includes(parts[1])
}
