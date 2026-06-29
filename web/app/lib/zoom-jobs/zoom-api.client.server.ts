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

type ZoomUpdateMeetingRequest = {
  topic: string
  start_time: string
  duration: number
}

export class ZoomApiError extends Error {
  status: number
  path: string
  payload: unknown

  constructor({ status, path, payload }: { status: number; path: string; payload: unknown }) {
    super(`zoom-api ${path} failed (${status})`)
    this.name = 'ZoomApiError'
    this.status = status
    this.path = path
    this.payload = payload
  }
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

const requestJson = async <T>({ method, path, body }: { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; path: string; body?: unknown }): Promise<T> => {
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
    throw new ZoomApiError({ status: response.status, path, payload })
  }
  return payload as T
}

export const zoomApiClient = {
  testConnect: () => requestJson<Record<string, unknown>>({ method: 'POST', path: '/zoom/connect' }),
  listHosts: () => requestJson<Record<string, unknown>>({ method: 'GET', path: '/hosts' }),
  createMeeting: (body: ZoomCreateMeetingRequest) =>
    requestJson<ZoomCreateMeetingResponse>({ method: 'POST', path: '/meetings', body }),
  updateMeeting: (meetingId: string, body: ZoomUpdateMeetingRequest) =>
    requestJson<{ ok: boolean }>({ method: 'PATCH', path: `/meetings/${meetingId}`, body }),
  registerParticipant: async (meetingId: string, registrant: ZoomRegistrantRequest) => {
    const results = await requestJson<Array<{ registrant_id?: string; join_url?: string }>>({
      method: 'POST',
      path: `/meetings/${meetingId}/registrants`,
      body: [registrant],
    })
    return results[0] ?? null
  },
  removeRegistrant: (meetingId: string, registrantId: string) =>
    requestJson<{ ok: boolean }>({
      method: 'DELETE',
      path: `/meetings/${meetingId}/registrants/${encodeURIComponent(registrantId)}`,
    }),
  getParticipants: (meetingUuid: string) =>
    requestJson<{ participants?: Array<Record<string, unknown>> }>({
      method: 'GET',
      path: `/meetings/${encodeURIComponent(meetingUuid)}/participants`,
    }),
}
