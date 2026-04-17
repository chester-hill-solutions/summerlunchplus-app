import { isIP } from 'node:net'

type RequestMetadata = {
  ipAddress: string | null
  forwardedFor: string | null
  userAgent: string | null
  acceptLanguage: string | null
  referer: string | null
  origin: string | null
}

const trimOrNull = (value: string | null, maxLength = 2048) => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLength)
}

const getForwardedChain = (request: Request) => {
  const chain =
    request.headers.get('x-forwarded-for') ??
    request.headers.get('x-real-ip') ??
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('fly-client-ip') ??
    request.headers.get('x-vercel-forwarded-for')

  return trimOrNull(chain)
}

const getPrimaryIp = (forwardedFor: string | null) => {
  if (!forwardedFor) return null

  const first = forwardedFor
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)[0]

  if (!first) return null
  if (first.length > 64) return null
  if (isIP(first) === 0) return null
  return first
}

export const extractRequestMetadata = (request: Request): RequestMetadata => {
  const forwardedFor = getForwardedChain(request)

  return {
    ipAddress: getPrimaryIp(forwardedFor),
    forwardedFor,
    userAgent: trimOrNull(request.headers.get('user-agent')),
    acceptLanguage: trimOrNull(request.headers.get('accept-language')),
    referer: trimOrNull(request.headers.get('referer')),
    origin: trimOrNull(request.headers.get('origin')),
  }
}
