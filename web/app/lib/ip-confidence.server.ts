import { isIP } from 'node:net'

export type IpParseConfidence = 'high' | 'medium' | 'low' | 'unknown'

export type IpClassification =
  | 'client_confirmed'
  | 'likely_client'
  | 'ambiguous'
  | 'likely_proxy'
  | 'proxy_confirmed'
  | 'unknown'

export type IpConfidenceLevel = 'high' | 'medium' | 'low' | 'unknown'

export type IpReasonCode =
  | 'no_valid_candidate'
  | 'cf_connecting_ip_selected'
  | 'cf_xff_first_match'
  | 'cf_xff_conflict'
  | 'xff_first_selected'
  | 'non_primary_forwarded_token'
  | 'selected_private_or_reserved'
  | 'selected_in_proxy_range'
  | 'selected_from_fallback_header'

export type IpCandidate = {
  ip: string
  source: string
}

export type ProxyRangeMatch = {
  provider: string
  cidr: string
}

type ClassifyArgs = {
  selected: IpCandidate | null
  candidates: IpCandidate[]
  proxyMatchesByIp?: Record<string, ProxyRangeMatch>
}

export type IpClassificationResult = {
  classification: IpClassification
  confidenceLevel: IpConfidenceLevel
  parseConfidence: IpParseConfidence
  reasonCodes: IpReasonCode[]
  reasonText: string
  proxyProviderMatch: string | null
  proxyMatchCidr: string | null
  parseNotes: Record<string, string | number | boolean | null>
}

export const IP_CLASSIFIER_VERSION = 1

export const isPrivateOrReservedIp = (ip: string) => {
  if (ip.includes(':')) {
    const normalized = ip.toLowerCase()
    if (normalized === '::1') return true
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
    if (
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    ) {
      return true
    }
    return false
  }

  const octets = ip.split('.').map(part => Number.parseInt(part, 10))
  if (octets.length !== 4 || octets.some(value => !Number.isFinite(value))) return true
  const [a, b] = octets
  if (a === 10) return true
  if (a === 127) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 169 && b === 254) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 0) return true
  return false
}

const sourceIsXff = (source: string) => source.startsWith('x-forwarded-for[')
const sourceIsXffPrimary = (source: string) => source === 'x-forwarded-for[0]'
const sourceIsFallback = (source: string) =>
  source === 'x-real-ip' || source === 'fly-client-ip' || source.startsWith('x-vercel-forwarded-for[')

const classifyReasonText = (classification: IpClassification, codes: IpReasonCode[]) => {
  switch (classification) {
    case 'client_confirmed':
      return 'Client IP is highly reliable from Cloudflare headers.'
    case 'likely_client':
      if (codes.includes('cf_xff_conflict')) {
        return 'Cloudflare client IP is present, but forwarded headers conflict.'
      }
      return 'Evidence points to a client IP but is not fully confirmed.'
    case 'proxy_confirmed':
      return 'Selected IP matches known proxy infrastructure, not an end-user device.'
    case 'likely_proxy':
      return 'Selected IP appears to be intermediary/proxy infrastructure.'
    case 'ambiguous':
      return 'IP evidence is mixed across headers and cannot be confirmed.'
    default:
      return 'No reliable IP evidence is available.'
  }
}

export const classifyIpEvidence = ({ selected, candidates, proxyMatchesByIp = {} }: ClassifyArgs): IpClassificationResult => {
  const reasonCodes: IpReasonCode[] = []

  if (!selected || isIP(selected.ip) === 0) {
    reasonCodes.push('no_valid_candidate')
    return {
      classification: 'unknown',
      confidenceLevel: 'unknown',
      parseConfidence: 'unknown',
      reasonCodes,
      reasonText: classifyReasonText('unknown', reasonCodes),
      proxyProviderMatch: null,
      proxyMatchCidr: null,
      parseNotes: {
        candidate_count: candidates.length,
        selected_source: null,
        selected_private_or_reserved: null,
      },
    }
  }

  const proxyMatch = proxyMatchesByIp[selected.ip]
  const selectedPrivate = isPrivateOrReservedIp(selected.ip)
  if (selectedPrivate) {
    reasonCodes.push('selected_private_or_reserved')
  }

  if (proxyMatch) {
    reasonCodes.push('selected_in_proxy_range')
    return {
      classification: 'proxy_confirmed',
      confidenceLevel: 'high',
      parseConfidence: 'high',
      reasonCodes,
      reasonText: classifyReasonText('proxy_confirmed', reasonCodes),
      proxyProviderMatch: proxyMatch.provider,
      proxyMatchCidr: proxyMatch.cidr,
      parseNotes: {
        candidate_count: candidates.length,
        selected_source: selected.source,
        selected_private_or_reserved: selectedPrivate,
      },
    }
  }

  const cfCandidate = candidates.find(candidate => candidate.source === 'cf-connecting-ip')
  const xffPrimary = candidates.find(candidate => candidate.source === 'x-forwarded-for[0]')

  if (selected.source === 'cf-connecting-ip') {
    reasonCodes.push('cf_connecting_ip_selected')
    if (xffPrimary?.ip === selected.ip) {
      reasonCodes.push('cf_xff_first_match')
      return {
        classification: 'client_confirmed',
        confidenceLevel: 'high',
        parseConfidence: 'high',
        reasonCodes,
        reasonText: classifyReasonText('client_confirmed', reasonCodes),
        proxyProviderMatch: null,
        proxyMatchCidr: null,
        parseNotes: {
          candidate_count: candidates.length,
          selected_source: selected.source,
          selected_private_or_reserved: selectedPrivate,
        },
      }
    }

    if (xffPrimary && xffPrimary.ip !== selected.ip) {
      reasonCodes.push('cf_xff_conflict')
      return {
        classification: 'likely_client',
        confidenceLevel: 'medium',
        parseConfidence: 'medium',
        reasonCodes,
        reasonText: classifyReasonText('likely_client', reasonCodes),
        proxyProviderMatch: null,
        proxyMatchCidr: null,
        parseNotes: {
          candidate_count: candidates.length,
          selected_source: selected.source,
          selected_private_or_reserved: selectedPrivate,
        },
      }
    }

    return {
      classification: selectedPrivate ? 'ambiguous' : 'likely_client',
      confidenceLevel: selectedPrivate ? 'low' : 'high',
      parseConfidence: selectedPrivate ? 'low' : 'high',
      reasonCodes,
      reasonText: classifyReasonText(selectedPrivate ? 'ambiguous' : 'likely_client', reasonCodes),
      proxyProviderMatch: null,
      proxyMatchCidr: null,
      parseNotes: {
        candidate_count: candidates.length,
        selected_source: selected.source,
        selected_private_or_reserved: selectedPrivate,
      },
    }
  }

  if (sourceIsXffPrimary(selected.source)) {
    reasonCodes.push('xff_first_selected')
    return {
      classification: selectedPrivate ? 'ambiguous' : 'likely_client',
      confidenceLevel: selectedPrivate ? 'low' : 'medium',
      parseConfidence: selectedPrivate ? 'low' : 'medium',
      reasonCodes,
      reasonText: classifyReasonText(selectedPrivate ? 'ambiguous' : 'likely_client', reasonCodes),
      proxyProviderMatch: null,
      proxyMatchCidr: null,
      parseNotes: {
        candidate_count: candidates.length,
        selected_source: selected.source,
        selected_private_or_reserved: selectedPrivate,
      },
    }
  }

  if (sourceIsXff(selected.source)) {
    reasonCodes.push('non_primary_forwarded_token')
    return {
      classification: selectedPrivate ? 'proxy_confirmed' : 'likely_proxy',
      confidenceLevel: selectedPrivate ? 'high' : 'medium',
      parseConfidence: selectedPrivate ? 'high' : 'medium',
      reasonCodes,
      reasonText: classifyReasonText(selectedPrivate ? 'proxy_confirmed' : 'likely_proxy', reasonCodes),
      proxyProviderMatch: null,
      proxyMatchCidr: null,
      parseNotes: {
        candidate_count: candidates.length,
        selected_source: selected.source,
        selected_private_or_reserved: selectedPrivate,
      },
    }
  }

  if (sourceIsFallback(selected.source)) {
    reasonCodes.push('selected_from_fallback_header')
  }

  return {
    classification: cfCandidate ? 'ambiguous' : selectedPrivate ? 'likely_proxy' : 'ambiguous',
    confidenceLevel: selectedPrivate ? 'low' : 'medium',
    parseConfidence: selectedPrivate ? 'low' : 'medium',
    reasonCodes,
    reasonText: classifyReasonText(cfCandidate ? 'ambiguous' : selectedPrivate ? 'likely_proxy' : 'ambiguous', reasonCodes),
    proxyProviderMatch: null,
    proxyMatchCidr: null,
    parseNotes: {
      candidate_count: candidates.length,
      selected_source: selected.source,
      selected_private_or_reserved: selectedPrivate,
    },
  }
}
