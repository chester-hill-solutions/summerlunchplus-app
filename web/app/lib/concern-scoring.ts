type SignalSeverity = 'low' | 'medium' | 'high'

type SupportedSignalType =
  | 'ip_org_greylist'
  | 'non_whitelisted_riding'
  | 'ip_profile_location_mismatch'
  | 'cross_family_exact_address'
  | 'network_distance_anomaly'
  | 'address_mismatch'

type SignalInput = {
  signal_type: string
  severity: string
}

export type ConcernBand = 'none' | 'low' | 'medium' | 'high'

const SIGNAL_BASE_POINTS: Record<SupportedSignalType, number> = {
  ip_org_greylist: 60,
  non_whitelisted_riding: 52,
  ip_profile_location_mismatch: 45,
  cross_family_exact_address: 35,
  network_distance_anomaly: 26,
  address_mismatch: 20,
}

const SEVERITY_MULTIPLIER: Record<SignalSeverity, number> = {
  high: 1,
  medium: 0.7,
  low: 0.45,
}

const MAX_SIGNALS_PER_TYPE = 2

const toSeverity = (value: string): SignalSeverity => {
  if (value === 'high' || value === 'medium' || value === 'low') return value
  return 'low'
}

const toBasePoints = (signalType: string) => {
  if (signalType in SIGNAL_BASE_POINTS) {
    return SIGNAL_BASE_POINTS[signalType as SupportedSignalType]
  }
  return 10
}

export const scoreConcernSignals = (signals: SignalInput[]) => {
  const countedByType = new Map<string, number>()
  let score = 0

  for (const signal of signals) {
    const seen = countedByType.get(signal.signal_type) ?? 0
    if (seen >= MAX_SIGNALS_PER_TYPE) continue
    countedByType.set(signal.signal_type, seen + 1)

    const base = toBasePoints(signal.signal_type)
    const multiplier = SEVERITY_MULTIPLIER[toSeverity(signal.severity)]
    score += Math.round(base * multiplier)
  }

  return score
}

export const concernBandForScore = (score: number): ConcernBand => {
  if (score >= 55) return 'high'
  if (score >= 30) return 'medium'
  if (score >= 15) return 'low'
  return 'none'
}

export const concernBandForSignals = (signals: SignalInput[], score: number): ConcernBand => {
  const hasHigh = signals.some(signal => signal.severity === 'high')
  if (hasHigh) return 'high'

  const hasMedium = signals.some(signal => signal.severity === 'medium')
  if (hasMedium) {
    const base = concernBandForScore(score)
    return base === 'high' ? 'high' : 'medium'
  }

  return concernBandForScore(score)
}

export const concernRowClass = (band: ConcernBand) => {
  if (band === 'high') return 'bg-red-50'
  if (band === 'medium') return 'bg-amber-50'
  if (band === 'low') return 'bg-yellow-50'
  return null
}
