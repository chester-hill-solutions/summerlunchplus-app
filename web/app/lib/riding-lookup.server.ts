export type RidingLookupResult =
  | {
      status: 'matched'
      districtName: string
      districtCode: string | null
      source: 'opennorth'
    }
  | {
      status: 'not_found'
      source: 'opennorth'
    }
  | {
      status: 'error'
      source: 'opennorth'
      reason: 'rate_limited' | 'timeout' | 'upstream' | 'invalid_response' | 'network'
      statusCode?: number
    }

export interface RidingLookupProvider {
  lookupByPostcode(postcode: string): Promise<RidingLookupResult>
}

const LOOKUP_TIMEOUT_MS = 3000

const normalizePostcode = (value: string) => value.replace(/\s+/g, '').toUpperCase()

const buildOpenNorthUrl = (postcode: string) =>
  `https://represent.opennorth.ca/postcodes/${postcode}/?sets=federal-electoral-districts-2023-representation-order`

const opennorthProvider: RidingLookupProvider = {
  async lookupByPostcode(postcode: string): Promise<RidingLookupResult> {
    const normalized = normalizePostcode(postcode)
    if (!normalized) {
      return { status: 'not_found', source: 'opennorth' }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS)

    try {
      const response = await fetch(buildOpenNorthUrl(normalized), {
        method: 'GET',
        signal: controller.signal,
      })

      if (response.status === 404) {
        return { status: 'not_found', source: 'opennorth' }
      }
      if (response.status === 429) {
        return { status: 'error', source: 'opennorth', reason: 'rate_limited', statusCode: response.status }
      }
      if (!response.ok) {
        return { status: 'error', source: 'opennorth', reason: 'upstream', statusCode: response.status }
      }

      const payload = (await response.json()) as {
        boundaries_centroid?: Array<{ name?: unknown; external_id?: unknown }>
      }
      const district = Array.isArray(payload.boundaries_centroid) ? payload.boundaries_centroid[0] : null

      const districtName = typeof district?.name === 'string' ? district.name.trim() : ''
      const districtCode = typeof district?.external_id === 'string' ? district.external_id.trim() : null

      if (!districtName) {
        return { status: 'error', source: 'opennorth', reason: 'invalid_response' }
      }

      return {
        status: 'matched',
        districtName,
        districtCode,
        source: 'opennorth',
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { status: 'error', source: 'opennorth', reason: 'timeout' }
      }
      return { status: 'error', source: 'opennorth', reason: 'network' }
    } finally {
      clearTimeout(timeout)
    }
  },
}

export const ridingLookupProvider: RidingLookupProvider = opennorthProvider
