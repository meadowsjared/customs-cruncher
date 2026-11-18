import { describe, expect, it, afterAll, beforeAll } from 'bun:test'
import http from 'node:http'
import { createServer } from './webServer'

interface HealthResponse {
  status: string
}

interface ReplaysListResponse {
  replays: Array<{ id: number; map: string }>
  pagination: { total: number }
}

interface ReplayDetailResponse {
  id: number
  map: string
  players: Record<string, unknown>
}

interface LeaderboardResponse {
  players: Array<{ player_name: string; games_played: number }>
}

async function getJson<T>(url: string): Promise<{ status: number; body: T }> {
  const res = await fetch(url)
  const text = await res.text()
  const body: T = JSON.parse(text)
  return { status: res.status, body }
}

describe('webServer API', () => {
  let server: http.Server
  const testPort = 3099

  beforeAll(async () => {
    server = createServer()
    await new Promise<void>(resolve => server.listen(testPort, '127.0.0.1', () => resolve()))
  })

  afterAll(async () => {
    if ('closeAllConnections' in server && typeof server.closeAllConnections === 'function') {
      server.closeAllConnections()
    }
    await new Promise<void>(resolve => server.close(() => resolve()))
  })

  it('responds with 200 on /api/health', async () => {
    const { status, body } = await getJson<HealthResponse>(`http://127.0.0.1:${testPort}/api/health`)
    expect(status).toBe(200)
    expect(body.status).toBe('ok')
  })

  it('returns replays list on /api/replays', async () => {
    const { status, body } = await getJson<ReplaysListResponse>(`http://127.0.0.1:${testPort}/api/replays?limit=5`)
    expect(status).toBe(200)
    expect(Array.isArray(body.replays)).toBe(true)
    expect(body.replays.length).toBeGreaterThan(0)
    expect(body.replays[0].id).toBeGreaterThan(0)
  })

  it('returns single replay on /api/replays/:id', async () => {
    const { body: listData } = await getJson<ReplaysListResponse>(`http://127.0.0.1:${testPort}/api/replays?limit=1`)
    const sampleId = listData.replays[0].id

    const { status, body: replay } = await getJson<ReplayDetailResponse>(`http://127.0.0.1:${testPort}/api/replays/${sampleId}`)
    expect(status).toBe(200)
    expect(replay.id).toBe(sampleId)
    expect(replay.players).toBeDefined()
  })

  it('returns leaderboard on /api/leaderboard', async () => {
    const { status, body } = await getJson<LeaderboardResponse>(`http://127.0.0.1:${testPort}/api/leaderboard`)
    expect(status).toBe(200)
    expect(Array.isArray(body.players)).toBe(true)
  })

  it('serves branding assets on /branding/:filename', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/branding/Banner_01.jpg`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/jpeg')
  })

  it('lists known servers on /api/servers', async () => {
    interface ServersResponse {
      servers: Array<{ id: string; name: string }>
    }
    const { status, body } = await getJson<ServersResponse>(`http://127.0.0.1:${testPort}/api/servers`)
    expect(status).toBe(200)
    expect(Array.isArray(body.servers)).toBe(true)
    expect(body.servers.length).toBeGreaterThan(0)
    expect(body.servers.some(s => s.id === '706998529582956654')).toBe(true)
  })

  it('authenticates admin login and verifies session token', async () => {
    const password = process.env.ADMIN_WEB_PASSWORD || ''
    interface LoginResponse {
      success?: boolean
      token?: string
      error?: string
    }

    // Wrong password
    const wrongRes = await fetch(`http://127.0.0.1:${testPort}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'definitely-wrong-password' }),
    })
    expect(wrongRes.status).toBe(401)

    // Test gate validation
    const currentSlug = process.env.ADMIN_GATE_SLUG || ''
    const invalidGateRes = await fetch(`http://127.0.0.1:${testPort}/api/admin/gate/invalid-slug`)
    expect(invalidGateRes.status).toBe(404)

    const validGateRes = await fetch(`http://127.0.0.1:${testPort}/api/admin/gate/${currentSlug}`)
    expect(validGateRes.status).toBe(200)

    // Correct password
    const loginRes = await fetch(`http://127.0.0.1:${testPort}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: currentSlug, password }),
    })
    expect(loginRes.status).toBe(200)
    const loginData: LoginResponse = JSON.parse(await loginRes.text())
    expect(loginData.success).toBe(true)
    expect(typeof loginData.token).toBe('string')

    const token = loginData.token || ''

    // Verify token
    const verifyRes = await fetch(`http://127.0.0.1:${testPort}/api/admin/verify`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(verifyRes.status).toBe(200)

    // Test assign match endpoint
    const assignRes = await fetch(`http://127.0.0.1:${testPort}/api/admin/replays/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        replayIds: [1],
        guildId: '706998529582956654',
      }),
    })
    expect(assignRes.status).toBe(200)
  })
})
