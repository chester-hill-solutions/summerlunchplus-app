import { isIP } from 'node:net'

import { resolveIpGeolocation } from '@/lib/geoip.server'
import { classifyIpEvidence, IP_CLASSIFIER_VERSION, type IpCandidate } from '@/lib/ip-confidence.server'
import { refreshSuspiciousSignalsForProfile } from '@/lib/suspicious-signals.server'
import { adminClient } from '@/lib/supabase/adminClient'

type RecomputeSource = 'form_submission' | 'login_event'

type RecomputePreview = {
  scannedRows: {
    formSubmission: number
    loginEvent: number
  }
  rowsWithAnyIpEvidence: number
  rowsWithUnknownClassification: number
}

type RecomputeResult = RecomputePreview & {
  updatedRows: {
    formSubmission: number
    loginEvent: number
  }
  refreshedSignalProfiles: number
}

type RecomputeOptions = {
  maxRowsPerSource?: number
  refreshSignals?: boolean
}

type EventRow = {
  id: string
  profile_id?: string | null
  ip_address: unknown
  ip_selected: unknown
  ip_selected_source: unknown
  ip_chain: unknown
  request_headers: unknown
  forwarded_for: unknown
  ip_classification: unknown
}

type OrgPolicyClass = 'infra_proxy' | 'consumer_isp' | 'vpn_hosting_datacenter' | 'trusted_enterprise' | 'unknown'

type OrgPolicyRow = {
  org_pattern: string
  match_mode: 'exact' | 'contains' | 'regex'
  policy_class: OrgPolicyClass
}

const MAX_SOURCE_ROWS = 2000

const normalizeMaxRows = (value: number | undefined, fallback = 400) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback
  return Math.min(MAX_SOURCE_ROWS, Math.floor(value))
}

const parseIpChain = (value: unknown) => {
  if (!Array.isArray(value)) return [] as string[]
  return value
    .map(entry => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(entry => Boolean(entry) && isIP(entry) !== 0)
}

const parseForwardedFor = (value: unknown) => {
  if (typeof value !== 'string') return [] as string[]
  return value
    .split(',')
    .map(part => part.trim())
    .filter(part => Boolean(part) && isIP(part) !== 0)
}

const asHeaderRecord = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {} as Record<string, string>
  const record: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== 'string') continue
    const normalizedKey = key.trim().toLowerCase()
    const normalizedValue = raw.trim()
    if (!normalizedKey || !normalizedValue) continue
    record[normalizedKey] = normalizedValue
  }
  return record
}

const addCandidate = (candidates: IpCandidate[], seen: Set<string>, ip: string, source: string) => {
  if (!ip || isIP(ip) === 0) return
  const key = `${ip}|${source}`
  if (seen.has(key)) return
  seen.add(key)
  candidates.push({ ip, source })
}

const collectCandidates = (row: EventRow) => {
  const candidates: IpCandidate[] = []
  const seen = new Set<string>()
  const headers = asHeaderRecord(row.request_headers)

  const headerSingle = (name: string) => {
    const value = headers[name]
    if (!value) return [] as string[]
    return [value.trim()].filter(ip => Boolean(ip) && isIP(ip) !== 0)
  }
  const headerList = (name: string) => {
    const value = headers[name]
    if (!value) return [] as string[]
    return value
      .split(',')
      .map(part => part.trim())
      .filter(ip => Boolean(ip) && isIP(ip) !== 0)
  }

  for (const ip of headerSingle('cf-connecting-ip')) addCandidate(candidates, seen, ip, 'cf-connecting-ip')
  headerList('x-forwarded-for').forEach((ip, index) =>
    addCandidate(candidates, seen, ip, `x-forwarded-for[${index}]`)
  )
  for (const ip of headerSingle('x-real-ip')) addCandidate(candidates, seen, ip, 'x-real-ip')
  for (const ip of headerSingle('fly-client-ip')) addCandidate(candidates, seen, ip, 'fly-client-ip')
  headerList('x-vercel-forwarded-for').forEach((ip, index) =>
    addCandidate(candidates, seen, ip, `x-vercel-forwarded-for[${index}]`)
  )

  parseIpChain(row.ip_chain).forEach((ip, index) => addCandidate(candidates, seen, ip, `ip-chain[${index}]`))
  parseForwardedFor(row.forwarded_for).forEach((ip, index) =>
    addCandidate(candidates, seen, ip, `forwarded-for[${index}]`)
  )

  if (typeof row.ip_selected === 'string' && row.ip_selected.trim()) {
    addCandidate(
      candidates,
      seen,
      row.ip_selected.trim(),
      typeof row.ip_selected_source === 'string' && row.ip_selected_source.trim()
        ? row.ip_selected_source.trim()
        : 'ip_selected'
    )
  }
  if (typeof row.ip_address === 'string' && row.ip_address.trim()) {
    addCandidate(candidates, seen, row.ip_address.trim(), 'ip_address')
  }

  return candidates
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

const matchOrgPolicy = (org: string | null, policies: OrgPolicyRow[]) => {
  if (!org) return null
  const normalized = org.trim().toLowerCase()
  if (!normalized) return null
  for (const policy of policies) {
    const pattern = policy.org_pattern.trim().toLowerCase()
    if (!pattern) continue
    if (policy.match_mode === 'exact' && normalized === pattern) return policy
    if (policy.match_mode === 'contains' && normalized.includes(pattern)) return policy
    if (policy.match_mode === 'regex') {
      try {
        if (new RegExp(pattern, 'i').test(org)) return policy
      } catch {
        continue
      }
    }
  }
  return null
}

const orgRank = (policyClass: OrgPolicyClass | null) => {
  switch (policyClass) {
    case 'consumer_isp':
      return 45
    case 'trusted_enterprise':
      return 35
    case 'unknown':
      return 25
    case 'vpn_hosting_datacenter':
      return 10
    case 'infra_proxy':
      return 5
    default:
      return 20
  }
}

const sourceRank = (source: string) => {
  if (source === 'cf-connecting-ip') return 40
  if (source === 'x-forwarded-for[0]') return 30
  if (source.startsWith('x-forwarded-for[')) return 20
  if (source === 'ip_selected') return 15
  if (source.startsWith('ip-chain[')) return 12
  if (source === 'x-real-ip' || source === 'fly-client-ip') return 10
  return 8
}

const loadOrgPolicies = async () => {
  const { data } = await (adminClient.from('ip_org_policy' as any) as any)
    .select('org_pattern, match_mode, policy_class')
    .eq('enabled', true)
    .order('priority', { ascending: true })

  return ((data ?? []) as Array<Record<string, unknown>>)
    .map(row => {
      const matchMode: OrgPolicyRow['match_mode'] =
        row.match_mode === 'exact' || row.match_mode === 'contains' || row.match_mode === 'regex'
          ? row.match_mode
          : 'contains'
      const policyClass: OrgPolicyRow['policy_class'] =
        row.policy_class === 'infra_proxy' ||
        row.policy_class === 'consumer_isp' ||
        row.policy_class === 'vpn_hosting_datacenter' ||
        row.policy_class === 'trusted_enterprise' ||
        row.policy_class === 'unknown'
          ? row.policy_class
          : 'unknown'

      return {
        org_pattern: typeof row.org_pattern === 'string' ? row.org_pattern : '',
        match_mode: matchMode,
        policy_class: policyClass,
      }
    })
    .filter(row => Boolean(row.org_pattern))
}

const scoreCandidate = async (
  candidate: IpCandidate,
  policies: OrgPolicyRow[],
  geoCache: Map<string, Awaited<ReturnType<typeof resolveIpGeolocation>>>
) => {
  const location = geoCache.has(candidate.ip)
    ? geoCache.get(candidate.ip) ?? null
    : await resolveIpGeolocation(candidate.ip)
  geoCache.set(candidate.ip, location)

  const org = location?.org ?? null
  const policy = matchOrgPolicy(org, policies)
  const privatePenalty = isPrivateOrReservedIp(candidate.ip) ? -50 : 0
  const score = sourceRank(candidate.source) + orgRank(policy?.policy_class ?? null) + privatePenalty

  return {
    score,
    org,
    policyClass: policy?.policy_class ?? null,
  }
}

const selectRows = async (source: RecomputeSource, maxRowsPerSource: number) => {
  if (source === 'form_submission') {
    const { data } = await (adminClient.from('form_submission' as any) as any)
      .select(
        'id, profile_id, ip_address, ip_selected, ip_selected_source, ip_chain, request_headers, forwarded_for, ip_classification'
      )
      .order('submitted_at', { ascending: false })
      .limit(maxRowsPerSource)
    return (data ?? []) as EventRow[]
  }

  const { data } = await (adminClient.from('login_event' as any) as any)
    .select('id, ip_address, ip_selected, ip_selected_source, ip_chain, request_headers, forwarded_for, ip_classification')
    .order('event_at', { ascending: false })
    .limit(maxRowsPerSource)
  return (data ?? []) as EventRow[]
}

const updateEventRow = async (source: RecomputeSource, rowId: string, payload: Record<string, unknown>) => {
  const table = source === 'form_submission' ? 'form_submission' : 'login_event'
  return (adminClient.from(table as any) as any).update(payload).eq('id', rowId)
}

export const previewIpEvidenceRecompute = async (options: RecomputeOptions = {}): Promise<RecomputePreview> => {
  const maxRowsPerSource = normalizeMaxRows(options.maxRowsPerSource)
  const [formRows, loginRows] = await Promise.all([
    selectRows('form_submission', maxRowsPerSource),
    selectRows('login_event', maxRowsPerSource),
  ])

  const allRows = [...formRows, ...loginRows]
  const rowsWithAnyIpEvidence = allRows.filter(row => collectCandidates(row).length > 0).length
  const rowsWithUnknownClassification = allRows.filter(
    row => typeof row.ip_classification !== 'string' || row.ip_classification === 'unknown'
  ).length

  return {
    scannedRows: {
      formSubmission: formRows.length,
      loginEvent: loginRows.length,
    },
    rowsWithAnyIpEvidence,
    rowsWithUnknownClassification,
  }
}

export const runIpEvidenceRecompute = async (options: RecomputeOptions = {}): Promise<RecomputeResult> => {
  const maxRowsPerSource = normalizeMaxRows(options.maxRowsPerSource)
  const refreshSignals = Boolean(options.refreshSignals)

  const [preview, orgPolicies, formRows, loginRows] = await Promise.all([
    previewIpEvidenceRecompute({ maxRowsPerSource }),
    loadOrgPolicies(),
    selectRows('form_submission', maxRowsPerSource),
    selectRows('login_event', maxRowsPerSource),
  ])

  const geoCache = new Map<string, Awaited<ReturnType<typeof resolveIpGeolocation>>>()
  const touchedProfileIds = new Set<string>()

  const processRows = async (source: RecomputeSource, rows: EventRow[]) => {
    let updated = 0
    for (const row of rows) {
      const candidates = collectCandidates(row)
      if (!candidates.length) continue

      let selected = candidates[0]
      let selectedOrg: string | null = null
      let selectedPolicyClass: OrgPolicyClass | null = null
      let bestScore = Number.NEGATIVE_INFINITY

      for (const candidate of candidates) {
        const scored = await scoreCandidate(candidate, orgPolicies, geoCache)
        if (scored.score > bestScore) {
          bestScore = scored.score
          selected = candidate
          selectedOrg = scored.org
          selectedPolicyClass = scored.policyClass
        }
      }

      const classification = classifyIpEvidence({ selected, candidates })
      const notes = {
        ...classification.parseNotes,
        recompute: true,
        recompute_source: source,
        selected_org: selectedOrg,
        selected_org_policy_class: selectedPolicyClass,
        candidate_count: candidates.length,
      }

      const payload = {
        ip_address: selected.ip,
        ip_selected: selected.ip,
        ip_selected_source: selected.source,
        ip_chain: candidates.map(candidate => candidate.ip),
        ip_parse_version: 2,
        ip_parse_confidence: classification.parseConfidence,
        ip_parse_notes: notes,
        ip_classification: classification.classification,
        ip_confidence_level: classification.confidenceLevel,
        ip_reason_codes: classification.reasonCodes,
        ip_reason_text: classification.reasonText,
        ip_classifier_version: IP_CLASSIFIER_VERSION,
        proxy_provider_match: classification.proxyProviderMatch,
        proxy_match_cidr: classification.proxyMatchCidr,
      }

      const { error } = await updateEventRow(source, row.id, payload)
      if (error) {
        console.error('[ip-evidence-recompute] update failed', {
          source,
          rowId: row.id,
          message: error.message,
        })
        continue
      }
      updated += 1
      if (source === 'form_submission' && typeof row.profile_id === 'string' && row.profile_id) {
        touchedProfileIds.add(row.profile_id)
      }
    }
    return updated
  }

  const updatedForm = await processRows('form_submission', formRows)
  const updatedLogin = await processRows('login_event', loginRows)

  let refreshedSignalProfiles = 0
  if (refreshSignals && touchedProfileIds.size) {
    for (const profileId of touchedProfileIds) {
      try {
        await refreshSuspiciousSignalsForProfile(profileId)
        refreshedSignalProfiles += 1
      } catch (error) {
        console.error('[ip-evidence-recompute] suspicious signal refresh failed', {
          profileId,
          error,
        })
      }
    }
  }

  return {
    ...preview,
    updatedRows: {
      formSubmission: updatedForm,
      loginEvent: updatedLogin,
    },
    refreshedSignalProfiles,
  }
}
