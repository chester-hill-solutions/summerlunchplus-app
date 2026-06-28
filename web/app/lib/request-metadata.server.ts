import { isIP } from 'node:net'

import {
  classifyIpEvidence,
  IP_CLASSIFIER_VERSION,
  type IpClassification,
  type IpConfidenceLevel,
  type IpParseConfidence,
  type IpReasonCode,
} from '@/lib/ip-confidence.server'

type RequestMetadata = {
  ipAddress: string | null
  ipSelected: string | null
  ipSelectedSource: string | null
  ipChain: string[]
  ipParseVersion: number
  ipParseConfidence: IpParseConfidence
  ipParseNotes: Record<string, string | number | boolean | null>
  ipClassification: IpClassification
  ipConfidenceLevel: IpConfidenceLevel
  ipReasonCodes: IpReasonCode[]
  ipReasonText: string | null
  ipClassifierVersion: number
  proxyProviderMatch: string | null
  proxyMatchCidr: string | null
  requestHeaders: Record<string, string>
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

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'proxy-authorization',
])

const toSafeHeaders = (request: Request) => {
  const entries: Record<string, string> = {}
  for (const [keyRaw, valueRaw] of request.headers.entries()) {
    const key = keyRaw.toLowerCase()
    if (SENSITIVE_HEADERS.has(key)) {
      entries[key] = '[redacted]'
      continue
    }
    const value = trimOrNull(valueRaw, 8192)
    if (value) entries[key] = value
  }
  return entries
}

const pushCandidates = (
  candidates: Array<{ ip: string; source: string }>,
  rawValue: string | null,
  sourceName: string,
  isList = false
) => {
  if (!rawValue) return
  const parts = isList
    ? rawValue
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
    : [rawValue.trim()].filter(Boolean)

  for (let index = 0; index < parts.length; index += 1) {
    const token = parts[index]
    if (!token || token.length > 64) continue
    if (isIP(token) === 0) continue
    const source = isList ? `${sourceName}[${index}]` : sourceName
    candidates.push({ ip: token, source })
  }
}

const dedupeCandidates = (candidates: Array<{ ip: string; source: string }>) => {
  const seen = new Set<string>()
  const unique: Array<{ ip: string; source: string }> = []
  for (const candidate of candidates) {
    const key = `${candidate.ip}|${candidate.source}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(candidate)
  }
  return unique
}

const parseNetworkMetadata = (request: Request) => {
  const cfConnectingIp = trimOrNull(request.headers.get('cf-connecting-ip'))
  const xForwardedFor = trimOrNull(request.headers.get('x-forwarded-for'))
  const xRealIp = trimOrNull(request.headers.get('x-real-ip'))
  const flyClientIp = trimOrNull(request.headers.get('fly-client-ip'))
  const vercelForwardedFor = trimOrNull(request.headers.get('x-vercel-forwarded-for'))

  const candidates: Array<{ ip: string; source: string }> = []
  pushCandidates(candidates, cfConnectingIp, 'cf-connecting-ip')
  pushCandidates(candidates, xForwardedFor, 'x-forwarded-for', true)
  pushCandidates(candidates, xRealIp, 'x-real-ip')
  pushCandidates(candidates, flyClientIp, 'fly-client-ip')
  pushCandidates(candidates, vercelForwardedFor, 'x-vercel-forwarded-for', true)

  const uniqueCandidates = dedupeCandidates(candidates)
  const selected =
    uniqueCandidates.find(candidate => candidate.source === 'cf-connecting-ip') ??
    uniqueCandidates.find(candidate => candidate.source === 'x-forwarded-for[0]') ??
    uniqueCandidates[0] ??
    null

  return {
    selected,
    chain: uniqueCandidates.map(candidate => candidate.ip),
    candidates: uniqueCandidates,
  }
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
  const requestHeaders = toSafeHeaders(request)
  const parsed = parseNetworkMetadata(request)
  const ipAddress = parsed.selected?.ip ?? getPrimaryIp(forwardedFor)
  const classification = classifyIpEvidence({
    selected: parsed.selected,
    candidates: parsed.candidates,
  })

  return {
    ipAddress,
    ipSelected: ipAddress,
    ipSelectedSource: parsed.selected?.source ?? null,
    ipChain: parsed.chain,
    ipParseVersion: 2,
    ipParseConfidence: classification.parseConfidence,
    ipParseNotes: classification.parseNotes,
    ipClassification: classification.classification,
    ipConfidenceLevel: classification.confidenceLevel,
    ipReasonCodes: classification.reasonCodes,
    ipReasonText: classification.reasonText,
    ipClassifierVersion: IP_CLASSIFIER_VERSION,
    proxyProviderMatch: classification.proxyProviderMatch,
    proxyMatchCidr: classification.proxyMatchCidr,
    requestHeaders,
    forwardedFor,
    userAgent: trimOrNull(request.headers.get('user-agent')),
    acceptLanguage: trimOrNull(request.headers.get('accept-language')),
    referer: trimOrNull(request.headers.get('referer')),
    origin: trimOrNull(request.headers.get('origin')),
  }
}
