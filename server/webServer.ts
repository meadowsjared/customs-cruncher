import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { sql } from '../store/db'
import { getPlayerAggregatedStats, getPlayerMatchHistory } from '../store/playerStats'
import { searchPlayers, getPlayerProfile } from '../store/playerProfile'
import { getHeroProfile } from '../store/heroProfile'

export const WEB_PORT = Number(process.env.WEB_PORT || 3002)

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

let serverInstance: http.Server | null = null

function sendJson(res: http.ServerResponse, statusCode: number, data: unknown): void {
  const json = JSON.stringify(data)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-cache',
  })
  res.end(json)
}

function sendFile(res: http.ServerResponse, filePath: string, isHead: boolean = false): void {
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not Found')
      return
    }

    const ext = path.extname(filePath).toLowerCase()
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'
    const isImmutable = filePath.includes('/assets/')

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': isImmutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    })

    if (isHead) {
      res.end()
      return
    }

    const stream = fs.createReadStream(filePath)
    stream.pipe(res)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  }
}

export function createServer(): http.Server {
  const distDir = path.resolve(process.cwd(), 'web/dist')
  const assetsMapsDir = path.resolve(process.cwd(), 'assets/maps')
  const assetsBrandingDir = path.resolve(process.cwd(), 'assets/branding')
  const assetsHeroesDir = path.resolve(process.cwd(), 'web/src/assets/heroes')
  const assetsTalentsDir = path.resolve(process.cwd(), 'web/src/assets/talents')

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        })
        res.end()
        return
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { 'Content-Type': 'text/plain' })
        res.end('Method Not Allowed')
        return
      }

      const isHead = req.method === 'HEAD'
      const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
      const pathname = urlObj.pathname

      // Map images shortcut: /api/maps/:filename or /maps/:filename
      if (pathname.startsWith('/api/maps/') || pathname.startsWith('/maps/')) {
        const filename = path.basename(pathname)
        const filePath = path.join(assetsMapsDir, filename)
        if (fs.existsSync(filePath)) {
          sendFile(res, filePath, isHead)
          return
        }
      }

      // Branding images shortcut: /api/branding/:filename or /branding/:filename
      if (pathname.startsWith('/api/branding/') || pathname.startsWith('/branding/')) {
        const filename = path.basename(pathname)
        const filePath = path.join(assetsBrandingDir, filename)
        if (fs.existsSync(filePath)) {
          sendFile(res, filePath, isHead)
          return
        }
      }

      // Hero images shortcut: /api/heroes/:filename or /heroes/:filename
      if (pathname.startsWith('/api/heroes/') || pathname.startsWith('/heroes/')) {
        const filename = path.basename(pathname)
        const filePath = path.join(assetsHeroesDir, filename)
        if (fs.existsSync(filePath)) {
          sendFile(res, filePath, isHead)
          return
        }
      }

      // Talent images shortcut: /api/talents/:filename or /talents/:filename
      if (pathname.startsWith('/api/talents/') || pathname.startsWith('/talents/')) {
        const filename = path.basename(pathname)
        const filePath = path.join(assetsTalentsDir, filename)
        if (fs.existsSync(filePath)) {
          sendFile(res, filePath, isHead)
          return
        }
      }

      // API Routes
      if (pathname === '/api/health') {
        sendJson(res, 200, {
          status: 'ok',
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
        })
        return
      }

      // GET /api/replays
      if (pathname === '/api/replays') {
        const page = Math.max(1, parseInt(urlObj.searchParams.get('page') || '1', 10) || 1)
        const limit = Math.min(100, Math.max(1, parseInt(urlObj.searchParams.get('limit') || '20', 10) || 20))
        const offset = (page - 1) * limit
        const mapFilter = urlObj.searchParams.get('map') || null
        const search = urlObj.searchParams.get('search')?.trim() || null

        // Query list of replays with summary fields
        const rows = await sql<Array<{
          id: number
          date: string
          map: string
          length: number
          winner: number
          team0_takedowns: number
          team1_takedowns: number
          team0_players: string
          team1_players: string
          heroes: string[]
          player_ids: string[]
          total_count: number
        }>>`
          SELECT
            id,
            date,
            map,
            length,
            winner,
            team0_takedowns,
            team1_takedowns,
            team0_players,
            team1_players,
            heroes,
            player_ids,
            COUNT(*) OVER()::int AS total_count
          FROM replays
          WHERE
            (${mapFilter}::text IS NULL OR map ILIKE ${'%' + (mapFilter || '') + '%'})
            AND (
              ${search}::text IS NULL
              OR team0_players ILIKE ${'%' + (search || '') + '%'}
              OR team1_players ILIKE ${'%' + (search || '') + '%'}
              OR map ILIKE ${'%' + (search || '') + '%'}
              OR ${search} = ANY(heroes)
            )
          ORDER BY date DESC
          LIMIT ${limit} OFFSET ${offset}
        `

        const total = rows.length > 0 ? rows[0].total_count : 0
        const totalPages = Math.ceil(total / limit)

        sendJson(res, 200, {
          replays: rows.map(r => ({
            id: r.id,
            date: r.date,
            map: r.map,
            length: r.length,
            winner: r.winner,
            team0_takedowns: r.team0_takedowns,
            team1_takedowns: r.team1_takedowns,
            team0_players: r.team0_players.split(',').map(s => s.trim()).filter(Boolean),
            team1_players: r.team1_players.split(',').map(s => s.trim()).filter(Boolean),
            heroes: r.heroes,
          })),
          pagination: {
            page,
            limit,
            total,
            totalPages,
          },
        })
        return
      }

      // GET /api/replays/:id
      const replayMatch = pathname.match(/^\/api\/replays\/(\d+)$/)
      if (replayMatch) {
        const replayId = parseInt(replayMatch[1], 10)
        const rows = await sql<Array<{
          id: number
          date: string
          map: string
          length: number
          winner: number
          team0_takedowns: number
          team1_takedowns: number
          team0_players: string
          team1_players: string
          first_pick_win: boolean
          first_objective: number | null
          first_objective_win: boolean
          first_fort: number | null
          first_keep: number | null
          first_fort_win: boolean
          first_keep_win: boolean
          version: unknown
          bans: unknown
          picks: unknown
          xp_breakdown: unknown
          takedowns: unknown
          mercs: unknown
          structures: unknown
          objective: unknown
          teams: unknown
          level_times: unknown
          level_adv_timeline: unknown
          players: Record<string, Record<string, unknown>>
        }>>`
          SELECT
            id,
            date,
            map,
            length,
            winner,
            team0_takedowns,
            team1_takedowns,
            team0_players,
            team1_players,
            first_pick_win,
            first_objective,
            first_objective_win,
            first_fort,
            first_keep,
            first_fort_win,
            first_keep_win,
            version,
            bans,
            picks,
            xp_breakdown,
            takedowns,
            mercs,
            structures,
            objective,
            teams,
            level_times,
            level_adv_timeline,
            players
          FROM replays
          WHERE id = ${replayId}
          LIMIT 1
        `

        if (rows.length === 0) {
          sendJson(res, 404, { error: 'Replay not found' })
          return
        }

        const replay = rows[0]
        if (replay && replay.players && typeof replay.players === 'object') {
          const playerEntries = Object.entries(replay.players)
          const tags: string[] = []
          for (const [, p] of playerEntries) {
            if (p && typeof p === 'object' && 'name' in p && 'tag' in p) {
              tags.push(`${String(p.name)}#${String(p.tag)}`.toLowerCase())
            }
          }
          if (tags.length > 0) {
            const accounts = await sql<{ id: number; hots_battle_tag: string }[]>`
              SELECT id, hots_battle_tag FROM hots_accounts WHERE LOWER(hots_battle_tag) IN ${sql(tags)}
            `
            const tagMap = new Map<string, number>()
            for (const a of accounts) {
              tagMap.set(a.hots_battle_tag.toLowerCase(), a.id)
            }
            for (const [, p] of playerEntries) {
              if (p && typeof p === 'object' && 'name' in p && 'tag' in p) {
                const fullTag = `${String(p.name)}#${String(p.tag)}`.toLowerCase()
                p.rowId = tagMap.get(fullTag) ?? null
              }
            }
          }
        }

        sendJson(res, 200, replay)
        return
      }

      // GET /api/leaderboard
      if (pathname === '/api/leaderboard') {
        const recentGames = parseInt(urlObj.searchParams.get('recent') || '10', 10) || 10
        const stats = await getPlayerAggregatedStats({ recentGames })
        const accounts = await sql<{ id: number; hots_battle_tag: string }[]>`
          SELECT id, hots_battle_tag FROM hots_accounts
        `
        const tagMap = new Map<string, number>()
        for (const a of accounts) {
          tagMap.set(a.hots_battle_tag.toLowerCase(), a.id)
        }
        for (const s of stats) {
          if (!s.row_id && s.hots_battle_tag) {
            s.row_id = tagMap.get(s.hots_battle_tag.toLowerCase()) ?? null
          }
        }
        sendJson(res, 200, {
          players: stats,
          total: stats.length,
        })
        return
      }

      // GET /api/players/search?q=...
      if (pathname === '/api/players/search') {
        const query = (urlObj.searchParams.get('q') || '').trim()
        const results = await searchPlayers(query)
        sendJson(res, 200, { results })
        return
      }

      // GET /api/player/:identifier or /api/players/:identifier
      const playerMatch = pathname.match(/^\/api\/players?\/([^/]+)$/)
      if (playerMatch) {
        const identifier = decodeURIComponent(playerMatch[1])
        const heroParam = urlObj.searchParams.get('hero') || undefined
        const profile = await getPlayerProfile(identifier, heroParam)

        if (!profile) {
          sendJson(res, 404, { error: 'Player not found' })
          return
        }

        sendJson(res, 200, profile)
        return
      }

      // GET /api/hero/:heroName or /api/heroes/:heroName
      const heroMatch = pathname.match(/^\/api\/(?:hero|heroes)\/([^/]+)$/)
      if (heroMatch) {
        const heroName = decodeURIComponent(heroMatch[1])
        const heroProfile = await getHeroProfile(heroName)

        if (!heroProfile) {
          sendJson(res, 404, { error: 'Hero not found' })
          return
        }

        sendJson(res, 200, heroProfile)
        return
      }

      // Serve static frontend from web/dist
      const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '')
      const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '')
      const targetFile = path.join(distDir, safePath)

      if (fs.existsSync(targetFile) && fs.statSync(targetFile).isFile()) {
        sendFile(res, targetFile)
        return
      }

      // SPA fallback to index.html
      const indexPath = path.join(distDir, 'index.html')
      if (fs.existsSync(indexPath)) {
        sendFile(res, indexPath)
        return
      }

      // Friendly fallback if web/dist hasn't been built yet
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Customs Cruncher Web Server</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0b0f19; color: #e2e8f0; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #161e2e; border: 1px solid #2d3748; padding: 2rem; border-radius: 12px; text-align: center; max-width: 500px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    h1 { color: #60a5fa; margin-top: 0; }
    code { background: #0f172a; padding: 0.2rem 0.5rem; border-radius: 4px; color: #38bdf8; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Customs Cruncher Web</h1>
    <p>API Server is running on port <strong>${WEB_PORT}</strong>.</p>
    <p>The Vue frontend is currently building or pending build.</p>
    <p>Run <code>bun run build:web</code> to build the frontend.</p>
  </div>
</body>
</html>`)
    } catch (err) {
      console.error('[WebServer] Error handling request:', err)
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'Internal Server Error' })
      }
    }
  })

  return server
}

export async function startWebServer(port = WEB_PORT): Promise<http.Server> {
  if (serverInstance) {
    return serverInstance
  }

  const server = createServer()
  return new Promise((resolve, reject) => {
    server.on('error', err => {
      console.error(`[WebServer] Failed to start on port ${port}:`, err)
      reject(err)
    })

    server.listen(port, '0.0.0.0', () => {
      console.log(`[WebServer] Customs Cruncher web server listening on http://0.0.0.0:${port}`)
      serverInstance = server
      resolve(server)
    })
  })
}

export async function stopWebServer(): Promise<void> {
  if (!serverInstance) return
  return new Promise((resolve, reject) => {
    serverInstance?.close(err => {
      if (err) reject(err)
      else {
        console.log('[WebServer] Web server stopped.')
        serverInstance = null
        resolve()
      }
    })
  })
}

