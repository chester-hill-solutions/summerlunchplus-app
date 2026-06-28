import { normalizeZoomApiEndpoint } from '@/lib/zoom-jobs/endpoint.server'

type ZoomRegistrantRequest = {
  first_name: string
  last_name: string
  email: string
}

type ZoomCreateMeetingRequest = {
  topic: string
  start_time: string
  duration: number
  host_zoom_user_id?: string
  host_zoom_user_email?: string
}

type ZoomCreateMeetingResponse = {
  id: number
  uuid: string
  join_url: string
}

const getConfig = () => {
  const endpoint = (process.env.ZOOM_API_ENDPOINT ?? '').trim()
  const apiKey = (process.env.ZOOM_API_KEY ?? '').trim()
  if (!apiKey) throw new Error('Missing ZOOM_API_KEY')
  return { endpoint: normalizeZoomApiEndpoint(endpoint), apiKey }
}

const parsePayload = async (response: Response) => {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return response.json().catch(() => null)
  }
  return response.text().catch(() => null)
}

const requestJson = async <T>({ method, path, body }: { method: 'GET' | 'POST'; path: string; body?: unknown }): Promise<T> => {
  const { endpoint, apiKey } = getConfig()
  const response = await fetch(`${endpoint}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  const payload = await parsePayload(response)
  if (!response.ok) {
    throw new Error(`zoom-api ${path} failed (${response.status}): ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`)
  }
  return payload as T
}

export const zoomApiClient = {
  testConnect: () => requestJson<Record<string, unknown>>({ method: 'POST', path: '/zoom/connect' }),
  listHosts: () => requestJson<Record<string, unknown>>({ method: 'GET', path: '/hosts' }),
  createMeeting: (body: ZoomCreateMeetingRequest) =>
    requestJson<ZoomCreateMeetingResponse>({ method: 'POST', path: '/meetings', body }),
  registerParticipant: async (meetingId: string, registrant: ZoomRegistrantRequest) => {
    const results = await requestJson<Array<{ registrant_id?: string; join_url?: string }>>({
      method: 'POST',
      path: `/meetings/${meetingId}/registrants`,
      body: [registrant],
    })
    return results[0] ?? null
  },
  getParticipants: (meetingUuid: string) =>
    requestJson<{ participants?: Array<Record<string, unknown>> }>({
      method: 'GET',
      path: `/meetings/${encodeURIComponent(meetingUuid)}/participants`,
    }),
}
