const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

const hasScheme = (value: string) => /^https?:\/\//i.test(value)

const shouldDefaultToHttp = (value: string) => {
  const lower = value.toLowerCase()
  return lower.includes('.internal') || lower.startsWith('localhost') || lower.startsWith('127.0.0.1')
}

export const normalizeZoomApiEndpoint = (rawEndpoint: string) => {
  const endpoint = rawEndpoint.trim()
  if (!endpoint) {
    throw new Error('Missing ZOOM_API_ENDPOINT')
  }

  if (hasScheme(endpoint)) {
    return trimTrailingSlash(endpoint)
  }

  const scheme = shouldDefaultToHttp(endpoint) ? 'http://' : 'https://'
  return trimTrailingSlash(`${scheme}${endpoint}`)
}
