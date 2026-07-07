const ALLOWED_EMAIL_DOMAINS = ['gmail.com', 'summerlunchplus.com', 'chsolutions.ca']

export const ALLOWED_EMAIL_DOMAIN_TEXT = ALLOWED_EMAIL_DOMAINS.join(', ')

export const ALLOWED_EMAIL_PATTERN = `^[^\\s@]+@(${ALLOWED_EMAIL_DOMAINS
  .map(domain => domain.replace('.', '\\.'))
  .join('|')})$`

export const normalizeEmail = (value: string) => value.trim().toLowerCase()

export const getEmailDomainHint = (email: string | null | undefined) => {
  if (!email) return null
  const normalized = normalizeEmail(email)
  const parts = normalized.split('@')
  if (parts.length !== 2 || !parts[1]) return null

  const domain = parts[1]
  if (domain.length <= 5) return domain
  return `${domain.slice(0, 3)}${domain.slice(-2)}`
}

export const isAllowedEmailDomain = (value: string) => {
  const normalized = normalizeEmail(value)
  const parts = normalized.split('@')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false
  return ALLOWED_EMAIL_DOMAINS.includes(parts[1])
}
