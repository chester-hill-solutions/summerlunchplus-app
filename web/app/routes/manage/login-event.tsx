import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'
import { resolveIpGeolocation } from '@/lib/geoip.server'
import type { Route } from './+types/login-event'

const baseLoader = createTableLoader('login-event')

const flagEmojiForCountryCode = (countryCode: string | null) => {
  if (!countryCode) return ''
  const normalized = countryCode.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(normalized)) return ''
  return String.fromCodePoint(...Array.from(normalized).map(char => 127397 + char.charCodeAt(0)))
}

export async function loader(args: Route.LoaderArgs) {
  const base = await baseLoader(args)
  const rows = (base.rows ?? []) as Array<Record<string, unknown>>
  const uniqueIps = Array.from(
    new Set(rows.map(row => (typeof row.ip_address === 'string' ? row.ip_address.trim() : '')).filter(Boolean))
  )
  const geoByIp = new Map<string, Awaited<ReturnType<typeof resolveIpGeolocation>>>()

  await Promise.all(
    uniqueIps.map(async ip => {
      const geo = await resolveIpGeolocation(ip)
      geoByIp.set(ip, geo)
    })
  )

  const enrichedRows = rows.map(row => {
    const ipAddress = typeof row.ip_address === 'string' ? row.ip_address.trim() : ''
    const geo = ipAddress ? geoByIp.get(ipAddress) ?? null : null
    const countryCode = geo?.countryCode ?? null
    const flag = flagEmojiForCountryCode(countryCode)
    const geoParts = [geo?.city, geo?.region, countryCode].filter(Boolean)
    const geoSummary = geoParts.length
      ? `${flag ? `${flag} ` : ''}${geoParts.join(', ')}`
      : countryCode
        ? `${flag ? `${flag} ` : ''}${countryCode}`
        : 'Unknown location'

    const latitude = typeof geo?.latitude === 'number' ? geo.latitude : null
    const longitude = typeof geo?.longitude === 'number' ? geo.longitude : null

    return {
      ...row,
      ip_geo_summary: geoSummary,
      ip_geo_country: countryCode ?? '-',
      ip_geo_org: geo?.org ?? '-',
      ip_geo_timezone: geo?.timezone ?? '-',
      ip_geo_source: geo?.source ?? '-',
      ip_geo_coordinates:
        latitude !== null && longitude !== null
          ? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
          : '-',
    }
  })

  const baseColumnMeta = (base.columnMeta ?? {}) as Record<string, unknown>

  return {
    ...base,
    rows: enrichedRows,
    columnMeta: {
      ...baseColumnMeta,
      ip_address: {
        ...(baseColumnMeta.ip_address as Record<string, unknown> ?? {}),
        hoverCard: {
          titleField: 'ip_geo_summary',
          titleFallback: 'Unknown location',
          fields: [
            { label: 'Country', field: 'ip_geo_country', fallback: '-' },
            { label: 'Org', field: 'ip_geo_org', fallback: '-' },
            { label: 'Timezone', field: 'ip_geo_timezone', fallback: '-' },
            { label: 'Coordinates', field: 'ip_geo_coordinates', fallback: '-' },
            { label: 'Provider', field: 'ip_geo_source', fallback: '-' },
          ],
        },
      },
    },
  }
}

export default function LoginEventTablePage() {
  return <TableDisplay />
}
