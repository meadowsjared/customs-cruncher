import { sql } from './db'

export interface PlayerSearchItem {
  rowId: number
  battleTag: string
  isPrimary: boolean
}

export interface PlayerProfileTopHero {
  hero: string
  games: number
  wins: number
  winRatePct: number
}

export interface PlayerProfileSummary {
  rowId: number
  battleTag: string
  name: string
  tag: string
  allTags: string[]
  totalMatches: number
  wins: number
  losses: number
  winRatePct: number
  overallKda: number
  avgHeroDamage: number
  avgSiegeDamage: number
  avgHealing: number
  avgDamageTaken: number
  avgXp: number
  topHeroes: PlayerProfileTopHero[]
  highestWinRateHeroes: PlayerProfileTopHero[]
}

export interface PlayerMatchTalents {
  Tier1Choice?: string
  Tier2Choice?: string
  Tier3Choice?: string
  Tier4Choice?: string
  Tier5Choice?: string
  Tier6Choice?: string
  Tier7Choice?: string
}

export interface PlayerProfileMatch {
  replay_id: number
  date: string
  map: string
  hero: string
  battle_tag?: string
  win: boolean
  kda: number
  solo_kills: number
  assists: number
  deaths: number
  hero_damage: number
  siege_damage: number
  healing: number
  self_healing: number
  damage_taken: number
  xp_contribution: number
  length: number
  talents: PlayerMatchTalents | null
}

export interface PlayerProfileResult {
  player: PlayerProfileSummary
  matches: PlayerProfileMatch[]
}

interface HotsAccountLookupRow {
  id: number
  discord_id: string | null
  hots_battle_tag: string
}

interface ReplayStatsMatchRow {
  replay_id: number
  date: Date
  map: string
  hero: string
  hots_battle_tag: string
  win: boolean
  kda: number
  solo_kills: number
  assists: number
  deaths: number
  hero_damage: number
  siege_damage: number
  healing: number
  self_healing: number
  damage_taken: number
  xp_contribution: number
  length: number
  talents: PlayerMatchTalents | null
}

export async function searchPlayers(query: string, limit = 12): Promise<PlayerSearchItem[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const searchPattern = `%${trimmed.toLowerCase()}%`
  return await sql<PlayerSearchItem[]>`
    SELECT id as "rowId", hots_battle_tag as "battleTag", is_primary as "isPrimary"
    FROM hots_accounts
    WHERE LOWER(hots_battle_tag) LIKE ${searchPattern}
    ORDER BY is_primary DESC, id ASC
    LIMIT ${limit}
  `
}

export async function getPlayerProfile(identifier: string): Promise<PlayerProfileResult | null> {
  const decoded = decodeURIComponent(identifier).trim()
  if (!decoded) return null

  const rowId = parseInt(decoded, 10)
  let primaryAccount: HotsAccountLookupRow | undefined

  if (!isNaN(rowId) && String(rowId) === decoded) {
    // Numeric rowId lookup (e.g. /player/332)
    const rows = await sql<HotsAccountLookupRow[]>`
      SELECT id, discord_id, hots_battle_tag
      FROM hots_accounts
      WHERE id = ${rowId}
      LIMIT 1
    `
    primaryAccount = rows[0]
  } else if (decoded.startsWith('1-Hero-') || decoded.startsWith('2-Hero-') || decoded.startsWith('98-Hero-')) {
    // ToonHandle lookup (e.g. 1-Hero-1-4851729)
    const statsRow = await sql<{ hots_battle_tag: string }[]>`
      SELECT hots_battle_tag
      FROM mv_replay_player_stats
      WHERE toon_handle = ${decoded}
      LIMIT 1
    `
    if (statsRow.length > 0) {
      const rows = await sql<HotsAccountLookupRow[]>`
        SELECT id, discord_id, hots_battle_tag
        FROM hots_accounts
        WHERE LOWER(hots_battle_tag) = LOWER(${statsRow[0].hots_battle_tag})
        LIMIT 1
      `
      primaryAccount = rows[0]
      if (!primaryAccount) {
        primaryAccount = { id: 0, discord_id: null, hots_battle_tag: statsRow[0].hots_battle_tag }
      }
    }
  } else {
    // BattleTag lookup (e.g. Bandayd-1631 or Bandayd#1631 or Bandayd)
    const normalized = decoded.replace(/-/g, '#')
    if (normalized.includes('#')) {
      const rows = await sql<HotsAccountLookupRow[]>`
        SELECT id, discord_id, hots_battle_tag
        FROM hots_accounts
        WHERE LOWER(hots_battle_tag) = LOWER(${normalized})
        LIMIT 1
      `
      primaryAccount = rows[0]
    } else {
      const rows = await sql<HotsAccountLookupRow[]>`
        SELECT id, discord_id, hots_battle_tag
        FROM hots_accounts
        WHERE LOWER(hots_battle_tag) LIKE LOWER(${normalized + '#%'})
        ORDER BY is_primary DESC, id ASC
        LIMIT 1
      `
      primaryAccount = rows[0]
    }
  }

  // Fallback: Check mv_replay_player_stats if not in hots_accounts
  if (!primaryAccount) {
    const fallback = decoded.replace(/-/g, '#')
    const statsRow = await sql<{ hots_battle_tag: string }[]>`
      SELECT hots_battle_tag
      FROM mv_replay_player_stats
      WHERE LOWER(hots_battle_tag) = LOWER(${fallback})
         OR LOWER(hots_battle_tag) LIKE LOWER(${fallback + '#%'})
      LIMIT 1
    `
    if (statsRow.length > 0) {
      primaryAccount = { id: 0, discord_id: null, hots_battle_tag: statsRow[0].hots_battle_tag }
    }
  }

  if (!primaryAccount) return null

  // Collect linked accounts for the player without exposing their discord_id
  let allTags = [primaryAccount.hots_battle_tag]
  if (primaryAccount.discord_id) {
    const linked = await sql<{ hots_battle_tag: string }[]>`
      SELECT hots_battle_tag
      FROM hots_accounts
      WHERE discord_id = ${primaryAccount.discord_id}
    `
    allTags = Array.from(new Set(linked.map(r => r.hots_battle_tag)))
  }

  const tagList = allTags.map(t => t.toLowerCase())

  // Query player's matches with talents extracted from replay JSON
  const matches = await sql<ReplayStatsMatchRow[]>`
    SELECT s.replay_id, s.date, s.map, s.hero, s.win,
           s.hots_battle_tag,
           s.kda, s.solo_kills, s.assists, s.deaths, s.hero_damage, s.siege_damage,
           s.healing, s.self_healing, s.damage_taken, s.xp_contribution,
           s.length,
           r.players->s.toon_handle->'talents' as talents
    FROM mv_replay_player_stats s
    JOIN replays r ON s.replay_id = r.id
    WHERE LOWER(s.hots_battle_tag) IN ${sql(tagList)}
    ORDER BY s.date DESC
    LIMIT 100
  `

  const totalMatches = matches.length
  const wins = matches.filter(m => m.win).length
  const losses = totalMatches - wins
  const winRatePct = totalMatches > 0 ? Number(((wins / totalMatches) * 100).toFixed(1)) : 0

  let sumKda = 0
  let sumHeroDmg = 0
  let sumSiegeDmg = 0
  let sumHealing = 0
  let sumDmgTaken = 0
  let sumXp = 0

  const heroStatsMap = new Map<string, { games: number; wins: number }>()

  const formattedMatches: PlayerProfileMatch[] = []

  for (const m of matches) {
    sumKda += Number(m.kda) || 0
    sumHeroDmg += Number(m.hero_damage) || 0
    sumSiegeDmg += Number(m.siege_damage) || 0
    sumHealing += (Number(m.healing) || 0) + (Number(m.self_healing) || 0)
    sumDmgTaken += Number(m.damage_taken) || 0
    sumXp += Number(m.xp_contribution) || 0

    const heroEntry = heroStatsMap.get(m.hero) || { games: 0, wins: 0 }
    heroEntry.games++
    if (m.win) heroEntry.wins++
    heroStatsMap.set(m.hero, heroEntry)

    formattedMatches.push({
      replay_id: m.replay_id,
      date: m.date instanceof Date ? m.date.toISOString() : String(m.date),
      map: m.map,
      hero: m.hero,
      battle_tag: m.hots_battle_tag,
      win: Boolean(m.win),
      kda: Number(m.kda) || 0,
      solo_kills: Number(m.solo_kills) || 0,
      assists: Number(m.assists) || 0,
      deaths: Number(m.deaths) || 0,
      hero_damage: Number(m.hero_damage) || 0,
      siege_damage: Number(m.siege_damage) || 0,
      healing: Number(m.healing) || 0,
      self_healing: Number(m.self_healing) || 0,
      damage_taken: Number(m.damage_taken) || 0,
      xp_contribution: Number(m.xp_contribution) || 0,
      length: Number(m.length) || 0,
      talents: m.talents,
    })
  }

  const allHeroStats: PlayerProfileTopHero[] = Array.from(heroStatsMap.entries())
    .map(([hero, entry]) => ({
      hero,
      games: entry.games,
      wins: entry.wins,
      winRatePct: entry.games > 0 ? Number(((entry.wins / entry.games) * 100).toFixed(1)) : 0,
    }))

  const topHeroes = [...allHeroStats]
    .sort((a, b) => b.games - a.games || b.winRatePct - a.winRatePct)
    .slice(0, 5)

  let eligibleForWinrate = allHeroStats.filter(h => h.games >= 3)
  if (eligibleForWinrate.length < 3) {
    eligibleForWinrate = allHeroStats.filter(h => h.games >= 2)
  }
  if (eligibleForWinrate.length < 3) {
    eligibleForWinrate = allHeroStats
  }

  const highestWinRateHeroes = [...eligibleForWinrate]
    .sort((a, b) => b.winRatePct - a.winRatePct || b.games - a.games)
    .slice(0, 5)

  const overallKda = totalMatches > 0 ? Number((sumKda / totalMatches).toFixed(2)) : 0
  const avgHeroDamage = totalMatches > 0 ? Math.round(sumHeroDmg / totalMatches) : 0
  const avgSiegeDamage = totalMatches > 0 ? Math.round(sumSiegeDmg / totalMatches) : 0
  const avgHealing = totalMatches > 0 ? Math.round(sumHealing / totalMatches) : 0
  const avgDamageTaken = totalMatches > 0 ? Math.round(sumDmgTaken / totalMatches) : 0
  const avgXp = totalMatches > 0 ? Math.round(sumXp / totalMatches) : 0

  const [name, tag] = primaryAccount.hots_battle_tag.split('#')

  return {
    player: {
      rowId: primaryAccount.id,
      battleTag: primaryAccount.hots_battle_tag,
      name: name || primaryAccount.hots_battle_tag,
      tag: tag || '',
      allTags,
      totalMatches,
      wins,
      losses,
      winRatePct,
      overallKda,
      avgHeroDamage,
      avgSiegeDamage,
      avgHealing,
      avgDamageTaken,
      avgXp,
      topHeroes,
      highestWinRateHeroes,
    },
    matches: formattedMatches,
  }
}

