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
})
