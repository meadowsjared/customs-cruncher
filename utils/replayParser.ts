import { createRequire } from 'module'
import { isMainThread, parentPort } from 'node:worker_threads'
import type { HotSReplayObject, ReplayData } from '../types/replay'

const require = createRequire(import.meta.url)

// Polyfill Buffer.concat to allow `new Buffer.concat(...)` as called by legacy empeeku MPQ extractor
const origConcat = Buffer.concat
Buffer.concat = function (list: readonly Uint8Array[], totalLength?: number): Buffer<ArrayBuffer> {
  return Buffer.from(origConcat(list, totalLength))
}

// Suppress unverified build warnings from hots-parser unless explicitly overridden
if (!process.env.LOGLEVEL) {
  process.env.LOGLEVEL = 'error'
}

type HeroProtocolDetailsPlayer = {
  m_name?: string | Buffer
  m_hero?: string | Buffer
}

type HeroProtocolDetails = {
  m_playerList?: HeroProtocolDetailsPlayer[]
}

/**
 * Extracts per-player 8-byte party IDs from the `replay.server.battlelobby` binary buffer.
 * In HotS's bit-packed battlelobby format, each BattleTag (`[tagByteLen][tagBytes]`) is preceded by:
 * - Solo queue: `[0x20][tagByteLen][tagBytes]`
 * - Partied:    `[0x10][8-byte partyId][tagByteLen][tagBytes]`
 */
export function extractPartyIdsFromBattleLobby(
  lobbyBuf: Buffer,
  battleTags: string[]
): Map<string, string | null> {
  const result = new Map<string, string | null>()
  let searchFrom = 0
  for (const tag of battleTags) {
    const tagBuf = Buffer.from(tag, 'utf8')
    let idx = lobbyBuf.indexOf(tagBuf, searchFrom)
    if (idx === -1) {
      idx = lobbyBuf.indexOf(tagBuf)
    }
    if (idx >= 2 && lobbyBuf[idx - 1] === tagBuf.length) {
      searchFrom = idx + tagBuf.length
      if (idx >= 10 && (lobbyBuf[idx - 10] & 0xf0) === 0x10 && lobbyBuf[idx - 2] !== 0x20) {
        const partyHex = lobbyBuf.subarray(idx - 9, idx - 1).toString('hex')
        result.set(tag.toLowerCase(), /^0+$/.test(partyHex) ? null : partyHex)
      } else {
        result.set(tag.toLowerCase(), null)
      }
    }
  }
  return result
}

/**
 * Parses a Heroes of the Storm replay file using hots-parser and extracts relevant information.
 * Isolated from Discord and DB layers so it can safely run in background worker threads.
 *
 * @param file The path to the replay file
 */
export function parseReplaySync(file: string): ReplayData | null {
  try {
    const Parser: {
      processReplay: (filePath: string, options: { overrideVerifiedBuild: boolean }) => HotSReplayObject | null
    } = require('@meadowsjared/hots-parser')
    const replay = Parser.processReplay(file, {
      overrideVerifiedBuild: true,
    })
    if (!replay || !replay.match) {
      if (process.env.QUIET_REPLAY_PARSER !== '1') {
        console.error(`Invalid or incomplete replay data for file: ${file}`)
      }
      return null
    }

    if (!replay.match.filename) {
      replay.match.filename = file
    }

    let mapName = replay.match.map
    if (mapName === 'Garden of Terror') {
      const fileNameLower = file.toLowerCase()
      if (fileNameLower.includes('classic')) {
        mapName = 'Garden of Terror Classic'
        replay.match.map = mapName
      }
    }

    const players = Object.values(replay.players)

    // Always sync authoritative hero names from DETAILS (Blizzard replay header)
    // because @meadowsjared/hots-parser TrackerEvent 4002 often overwrites heroes with draft/ARAM pre-selection slots
    try {
      const heroprotocol: {
        DETAILS: string
        INITDATA: string
        get: (part: string, filePath: string) => unknown
      } = require('heroprotocol')
      const rawDetails = heroprotocol.get(heroprotocol.DETAILS, file)
      const details: HeroProtocolDetails | null =
        rawDetails && typeof rawDetails === 'object' ? rawDetails : null
      if (details && Array.isArray(details.m_playerList)) {
        for (const player of players) {
          const match = details.m_playerList.find(p => {
            const nameStr = p.m_name ? (typeof p.m_name === 'string' ? p.m_name : p.m_name.toString('utf8')) : ''
            return nameStr === player.name
          })
          if (match && match.m_hero) {
            let heroName = typeof match.m_hero === 'string' ? match.m_hero : match.m_hero.toString('utf8')
            if (heroName === 'Lúcio') heroName = 'Lucio'
            player.hero = heroName
          }
        }
        if (replay.match && Array.isArray(replay.match.heroes)) {
          replay.match.heroes = players.map(p => p.hero).filter((h): h is string => Boolean(h))
        }
        if (replay.match && Array.isArray(replay.match.takedowns)) {
          for (const td of replay.match.takedowns) {
            const killerRef = td.victim?.killedBy || td.killer
            if (killerRef?.player) {
              const matchedKiller = players.find(p => p.ToonHandle === killerRef.player)
              if (matchedKiller?.hero) {
                killerRef.hero = matchedKiller.hero
              }
            }
            if (td.victim?.killedBy && !td.killer) {
              td.killer = td.victim.killedBy
            }
          }
        }
      }

      // Extract party membership from replay.server.battlelobby (8-byte party ID preceding each BattleTag)
      const rawLobby = heroprotocol.get('replay.server.battlelobby', file)
      if (Buffer.isBuffer(rawLobby)) {
        const playerTags = players.map(p => `${p.name}#${p.tag}`)
        const partyByTag = extractPartyIdsFromBattleLobby(rawLobby, playerTags)
        for (const player of players) {
          const key = `${player.name}#${player.tag}`.toLowerCase()
          player.partyId = partyByTag.get(key) ?? null
        }
      }
    } catch {
      // Ignore if details/battlelobby cannot be parsed
    }

    const formatPlayerEntry = (p: { name: string; tag: number; hero?: string }) => {
      const heroStr = p.hero ? ` (${p.hero})` : ''
      return `${p.name}#${p.tag}${heroStr}`
    }

    const team0Players = players
      .filter(p => p.team === 0)
      .map(formatPlayerEntry)
      .join(', ')
    const team1Players = players
      .filter(p => p.team === 1)
      .map(formatPlayerEntry)
      .join(', ')

    return {
      replayObj: replay,
      map: mapName,
      date: replay.match.date,
      type: replay.match.type,
      mode: replay.match.mode,
      length: replay.match.length,
      winner: replay.match.winner,
      team0Takedowns: replay.match.team0Takedowns,
      team1Takedowns: replay.match.team1Takedowns,
      team0Players,
      team1Players,
      file,
    }
  } catch (error) {
    console.error(`Error parsing replay file ${file}:`, error)
    return null
  }
}

/**
 * Async wrapper for backward compatibility with existing callers.
 */
export async function parseReplay(file: string): Promise<ReplayData | null> {
  return parseReplaySync(file)
}

interface WorkerMessage {
  id: number
  file: string
}

if (!isMainThread && parentPort) {
  parentPort.on('message', (msg: WorkerMessage) => {
    try {
      const data = parseReplaySync(msg.file)
      parentPort?.postMessage({ id: msg.id, file: msg.file, data })
    } catch (err) {
      parentPort?.postMessage({ id: msg.id, file: msg.file, data: null, error: String(err) })
    }
  })
}
