import { isIP } from 'node:net'

import { adminClient } from '@/lib/supabase/adminClient'

import type { Json } from '@/lib/database.types'

type IpGeoCacheRow = {
  ip: string
  country_code: string | null
  region: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  timezone: string | null
  source: string
  confidence: string | null
  raw: Json
  looked_up_at: string
  expires_at: string
}

export type IpGeoLocation = {
  ip: string
  countryCode: string | null
  region: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  timezone: string | null
  source: string
  confidence: string | null
  raw: Json
}

type ProviderLocation = Omit<IpGeoLocation, 'ip'>

const parseIntEnv = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const GEOIP_CACHE_TTL_DAYS = parseIntEnv(process.env.GEOIP_CACHE_TTL_DAYS, 14)
const GEOIP_TIMEOUT_MS = parseIntEnv(process.env.GEOIP_TIMEOUT_MS, 5000)

const normalizeIp = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 64) return null
  return isIP(trimmed) ? trimmed : null
}

const firstForwardedToken = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return null
  return (
    value
      .split(',')
      .map(part => part.trim())
      .find(Boolean) ?? null
  )
}

const ipCandidateFromRow = (row: { ip_selected?: unknown; ip_address?: unknown; forwarded_for?: unknown }) => {
  if (typeof row.ip_selected === 'string' && row.ip_selected.trim()) {
    return row.ip_selected.trim()
  }
  if (typeof row.ip_address === 'string' && row.ip_address.trim()) {
    return row.ip_address.trim()
  }
  return firstForwardedToken(row.forwarded_for)
}

const chunkArray = <T,>(items: T[], size: number) => {
  if (size <= 0 || !items.length) return [] as T[][]
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

export type GeoipBackfillPreview = {
  provider: string
  providerEnabled: boolean
  scannedRows: {
    formSubmission: number
    loginEvent: number
  }
  uniqueIpCount: number
  cachedIpCount: number
  missingIpCount: number
  missingIpsSample: string[]
}

type BackfillCandidateOptions = {
  recentLimitPerSource?: number
  sampleSize?: number
}

const collectGeoipBackfillCandidates = async (
  options: BackfillCandidateOptions = {}
): Promise<GeoipBackfillPreview & { missingIps: string[] }> => {
  const recentLimitPerSource =
    Number.isFinite(options.recentLimitPerSource) && (options.recentLimitPerSource ?? 0) > 0
      ? Math.floor(options.recentLimitPerSource as number)
      : 4000
  const sampleSize =
    Number.isFinite(options.sampleSize) && (options.sampleSize ?? 0) > 0
      ? Math.floor(options.sampleSize as number)
      : 25

  const provider = parseText(process.env.GEOIP_PROVIDER)?.toLowerCase() ?? 'none'
  const providerEnabled = provider === 'ipapi' || provider === 'ipinfo'

  const [formSubmissionResult, loginEventResult] = await Promise.all([
    (adminClient.from('form_submission' as any) as any)
      .select('ip_selected, ip_address, forwarded_for')
      .order('submitted_at', { ascending: false })
      .limit(recentLimitPerSource),
    (adminClient.from('login_event' as any) as any)
      .select('ip_selected, ip_address, forwarded_for')
      .order('event_at', { ascending: false })
      .limit(recentLimitPerSource),
  ])

  const scannedRows = {
    formSubmission: (formSubmissionResult.data ?? []).length,
    loginEvent: (loginEventResult.data ?? []).length,
  }

  const uniqueIps = new Set<string>()
  for (const row of (formSubmissionResult.data ?? []) as Array<Record<string, unknown>>) {
    const candidate = ipCandidateFromRow({
      ip_selected: row.ip_selected,
      ip_address: row.ip_address,
      forwarded_for: row.forwarded_for,
    })
    const normalized = candidate ? normalizeIp(candidate) : null
    if (normalized) uniqueIps.add(normalized)
  }
  for (const row of (loginEventResult.data ?? []) as Array<Record<string, unknown>>) {
    const candidate = ipCandidateFromRow({
      ip_selected: row.ip_selected,
      ip_address: row.ip_address,
      forwarded_for: row.forwarded_for,
    })
    const normalized = candidate ? normalizeIp(candidate) : null
    if (normalized) uniqueIps.add(normalized)
  }

  const uniqueIpList = Array.from(uniqueIps)
  const cachedIps = new Set<string>()

  for (const chunk of chunkArray(uniqueIpList, 150)) {
    const { data: cachedRows } = await (adminClient.from('ip_geolocation_cache' as any) as any)
      .select('ip')
      .in('ip', chunk)
    for (const row of cachedRows ?? []) {
      if (typeof row.ip === 'string' && row.ip) cachedIps.add(row.ip)
    }
  }

  const missingIps = uniqueIpList.filter(ip => !cachedIps.has(ip))

  return {
    provider,
    providerEnabled,
    scannedRows,
    uniqueIpCount: uniqueIpList.length,
    cachedIpCount: cachedIps.size,
    missingIpCount: missingIps.length,
    missingIpsSample: missingIps.slice(0, sampleSize),
    missingIps,
  }
}

export const previewGeoipBackfill = async (options: BackfillCandidateOptions = {}) => {
  const { missingIps, ...preview } = await collectGeoipBackfillCandidates(options)
  void missingIps
  return preview
}

export type GeoipBackfillRunResult = GeoipBackfillPreview & {
  attempted: number
  resolved: number
  unresolved: number
  attemptedIpsSample: string[]
  unresolvedIpsSample: Array<{ ip: string; reason: string }>
  failureReasonCounts: Record<string, number>
}

type BackfillFailureReason =
  | 'invalid_ip'
  | 'private_or_reserved_ip'
  | 'provider_disabled'
  | 'network_error'
  | 'provider_non_200'
  | 'provider_error_payload'
  | 'provider_empty_result'
  | 'cache_upsert_failed'

type BackfillLookupResult =
  | { ok: true }
  | {
      ok: false
      reason: BackfillFailureReason
    }

const isPrivateOrReservedIp = (ip: string) => {
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

const lookupFromProviderDetailed = async (
  ip: string
): Promise<{ location: ProviderLocation | null; reason: BackfillFailureReason | null }> => {
  const provider = parseText(process.env.GEOIP_PROVIDER)?.toLowerCase() ?? 'none'
  if (provider === 'none') {
    return { location: null, reason: 'provider_disabled' }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GEOIP_TIMEOUT_MS)

  const requestUrl =
    provider === 'ipapi'
      ? `https://ipapi.co/${encodeURIComponent(ip)}/json/`
      : (() => {
          const token = parseText(process.env.IPINFO_TOKEN)
          return token
            ? `https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${encodeURIComponent(token)}`
            : `https://ipinfo.io/${encodeURIComponent(ip)}/json`
        })()

  try {
    const response = await fetch(requestUrl, { signal: controller.signal })
    if (!response.ok) {
      return { location: null, reason: 'provider_non_200' }
    }

    const payload = (await response.json()) as Record<string, unknown>
    if (parseText(payload.error) || parseText(payload.reason) || parseText(payload.status) === 'error') {
      return { location: null, reason: 'provider_error_payload' }
    }

    if (provider === 'ipapi') {
      const location: ProviderLocation = {
        countryCode: parseText(payload.country_code),
        region: parseText(payload.region_code) ?? parseText(payload.region),
        city: parseText(payload.city),
        latitude: parseNumber(payload.latitude),
        longitude: parseNumber(payload.longitude),
        timezone: parseText(payload.timezone),
        source: 'ipapi',
        confidence: 'medium',
        raw: payload as Json,
      }
      if (!location.countryCode && !location.region && !location.city && !location.timezone) {
        return { location: null, reason: 'provider_empty_result' }
      }
      return { location, reason: null }
    }

    const loc = parseText(payload.loc)
    const [latitudeRaw, longitudeRaw] = loc ? loc.split(',') : []
    const location: ProviderLocation = {
      countryCode: parseText(payload.country),
      region: parseText(payload.region),
      city: parseText(payload.city),
      latitude: parseNumber(latitudeRaw),
      longitude: parseNumber(longitudeRaw),
      timezone: parseText(payload.timezone),
      source: 'ipinfo',
      confidence: 'medium',
      raw: payload as Json,
    }
    if (!location.countryCode && !location.region && !location.city && !location.timezone) {
      return { location: null, reason: 'provider_empty_result' }
    }
    return { location, reason: null }
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      console.error('[geoip] provider lookup failed', {
        provider,
        ip,
        error,
      })
    }
    return { location: null, reason: 'network_error' }
  } finally {
    clearTimeout(timeout)
  }
}

const resolveIpGeolocationForBackfill = async (ip: string): Promise<BackfillLookupResult> => {
  const normalizedIp = normalizeIp(ip)
  if (!normalizedIp) {
    return { ok: false, reason: 'invalid_ip' }
  }

  if (isPrivateOrReservedIp(normalizedIp)) {
    return { ok: false, reason: 'private_or_reserved_ip' }
  }

  const detailed = await lookupFromProviderDetailed(normalizedIp)
  if (!detailed.location) {
    return { ok: false, reason: detailed.reason ?? 'provider_empty_result' }
  }

  const nextCacheRow = providerLocationToCache(normalizedIp, detailed.location)
  const { error } = await (adminClient.from('ip_geolocation_cache' as any) as any).upsert(nextCacheRow)
  if (error) {
    console.error('[geoip] backfill cache upsert failed', {
      ip: normalizedIp,
      message: error.message,
    })
    return { ok: false, reason: 'cache_upsert_failed' }
  }

  return { ok: true }
}

export const runGeoipBackfill = async (options: {
  recentLimitPerSource?: number
  maxLookups?: number
} = {}): Promise<GeoipBackfillRunResult> => {
  const maxLookups =
    Number.isFinite(options.maxLookups) && (options.maxLookups ?? 0) > 0
      ? Math.min(1000, Math.floor(options.maxLookups as number))
      : 200

  const preview = await collectGeoipBackfillCandidates({
    recentLimitPerSource: options.recentLimitPerSource,
    sampleSize: 50,
  })

  const attemptIps = preview.missingIps.slice(0, maxLookups)
  if (!attemptIps.length || !preview.providerEnabled) {
    return {
      provider: preview.provider,
      providerEnabled: preview.providerEnabled,
      scannedRows: preview.scannedRows,
      uniqueIpCount: preview.uniqueIpCount,
      cachedIpCount: preview.cachedIpCount,
      missingIpCount: preview.missingIpCount,
      missingIpsSample: preview.missingIpsSample,
      attempted: 0,
      resolved: 0,
      unresolved: 0,
      attemptedIpsSample: [],
      unresolvedIpsSample: [],
      failureReasonCounts: {},
    }
  }

  let resolved = 0
  let unresolved = 0
  const failureReasonCounts: Record<string, number> = {}
  const unresolvedIpsSample: Array<{ ip: string; reason: string }> = []
  for (const chunk of chunkArray(attemptIps, 8)) {
    const results = await Promise.all(chunk.map(ip => resolveIpGeolocationForBackfill(ip)))
    for (const [index, result] of results.entries()) {
      const attemptedIp = chunk[index]
      if (result.ok) {
        resolved += 1
      } else {
        unresolved += 1
        failureReasonCounts[result.reason] = (failureReasonCounts[result.reason] ?? 0) + 1
        if (unresolvedIpsSample.length < 25) {
          unresolvedIpsSample.push({ ip: attemptedIp, reason: result.reason })
        }
      }
    }
  }

  const refreshedPreview = await collectGeoipBackfillCandidates({
    recentLimitPerSource: options.recentLimitPerSource,
    sampleSize: 50,
  })

  return {
    provider: refreshedPreview.provider,
    providerEnabled: refreshedPreview.providerEnabled,
    scannedRows: refreshedPreview.scannedRows,
    uniqueIpCount: refreshedPreview.uniqueIpCount,
    cachedIpCount: refreshedPreview.cachedIpCount,
    missingIpCount: refreshedPreview.missingIpCount,
    missingIpsSample: refreshedPreview.missingIpsSample,
    attempted: attemptIps.length,
    resolved,
    unresolved,
    attemptedIpsSample: attemptIps.slice(0, 25),
    unresolvedIpsSample,
    failureReasonCounts,
  }
}

const parseNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

const parseText = (value: unknown) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

const cacheToLocation = (row: IpGeoCacheRow): IpGeoLocation => ({
  ip: row.ip,
  countryCode: row.country_code,
  region: row.region,
  city: row.city,
  latitude: row.latitude,
  longitude: row.longitude,
  timezone: row.timezone,
  source: row.source,
  confidence: row.confidence,
  raw: row.raw,
})

const providerLocationToCache = (ip: string, location: ProviderLocation) => {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + GEOIP_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000)

  return {
    ip,
    country_code: location.countryCode,
    region: location.region,
    city: location.city,
    latitude: location.latitude,
    longitude: location.longitude,
    timezone: location.timezone,
    source: location.source,
    confidence: location.confidence,
    raw: location.raw,
    looked_up_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  }
}

const lookupViaIpapi = async (ip: string): Promise<ProviderLocation | null> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GEOIP_TIMEOUT_MS)

  try {
    const response = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: controller.signal,
    })
    if (!response.ok) return null

    const payload = (await response.json()) as Record<string, unknown>
    if (parseText(payload.error) || parseText(payload.reason)) {
      return null
    }

    return {
      countryCode: parseText(payload.country_code),
      region: parseText(payload.region_code) ?? parseText(payload.region),
      city: parseText(payload.city),
      latitude: parseNumber(payload.latitude),
      longitude: parseNumber(payload.longitude),
      timezone: parseText(payload.timezone),
      source: 'ipapi',
      confidence: 'medium',
      raw: payload as Json,
    }
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      console.error('[geoip] ipapi lookup failed', error)
    }
    return null
  } finally {
    clearTimeout(timeout)
  }
}

const lookupViaIpinfo = async (ip: string): Promise<ProviderLocation | null> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GEOIP_TIMEOUT_MS)
  const token = parseText(process.env.IPINFO_TOKEN)
  const url = token
    ? `https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${encodeURIComponent(token)}`
    : `https://ipinfo.io/${encodeURIComponent(ip)}/json`

  try {
    const response = await fetch(url, {
      signal: controller.signal,
    })
    if (!response.ok) return null

    const payload = (await response.json()) as Record<string, unknown>
    const loc = parseText(payload.loc)
    const [latitudeRaw, longitudeRaw] = loc ? loc.split(',') : []

    return {
      countryCode: parseText(payload.country),
      region: parseText(payload.region),
      city: parseText(payload.city),
      latitude: parseNumber(latitudeRaw),
      longitude: parseNumber(longitudeRaw),
      timezone: parseText(payload.timezone),
      source: 'ipinfo',
      confidence: 'medium',
      raw: payload as Json,
    }
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      console.error('[geoip] ipinfo lookup failed', error)
    }
    return null
  } finally {
    clearTimeout(timeout)
  }
}

const lookupFromProvider = async (ip: string) => {
  const provider = parseText(process.env.GEOIP_PROVIDER)?.toLowerCase() ?? 'none'
  if (provider === 'ipapi') return lookupViaIpapi(ip)
  if (provider === 'ipinfo') return lookupViaIpinfo(ip)
  return null
}

export const resolveIpGeolocation = async (ip: string): Promise<IpGeoLocation | null> => {
  const normalizedIp = normalizeIp(ip)
  if (!normalizedIp) return null

  const nowIso = new Date().toISOString()
  const { data: cachedRow } = await (adminClient.from('ip_geolocation_cache' as any) as any)
    .select('ip, country_code, region, city, latitude, longitude, timezone, source, confidence, raw, looked_up_at, expires_at')
    .eq('ip', normalizedIp)
    .maybeSingle()

  if (cachedRow && typeof cachedRow.expires_at === 'string' && cachedRow.expires_at > nowIso) {
    return cacheToLocation(cachedRow as IpGeoCacheRow)
  }

  const providerLocation = await lookupFromProvider(normalizedIp)
  if (!providerLocation) {
    return cachedRow ? cacheToLocation(cachedRow as IpGeoCacheRow) : null
  }

  const nextCacheRow = providerLocationToCache(normalizedIp, providerLocation)
  const { error } = await (adminClient.from('ip_geolocation_cache' as any) as any).upsert(nextCacheRow)
  if (error) {
    console.error('[geoip] cache upsert failed', {
      ip: normalizedIp,
      message: error.message,
    })
  }

  return {
    ip: normalizedIp,
    ...providerLocation,
  }
}
