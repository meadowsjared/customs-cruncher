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

export interface PlayerHeroSpecificStats {
  hero: string
  total: number
  wins: number
  losses: number
  winRatePct: number
  kda: number
  avgHeroDamage: number
  avgSiegeDamage: number
  avgHealing: number
  avgDamageTaken: number
}

export interface PlayerProfileResult {
  player: PlayerProfileSummary
  matches: PlayerProfileMatch[]
  heroStats?: PlayerHeroSpecificStats | null
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

export async function getPlayerProfile(identifier: string, heroFilter?: string): Promise<PlayerProfileResult | null> {
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

  // 1. Overall all-time player stats across all customs
  const playerAggRow = await sql<Array<{
    total_matches: string
    wins: string
    avg_kda: number | null
    avg_hero_damage: number | null
    avg_siege_damage: number | null
    avg_healing: number | null
    avg_damage_taken: number | null
    avg_xp: number | null
  }>>`
    SELECT
      COUNT(*) as total_matches,
      SUM(CASE WHEN win THEN 1 ELSE 0 END) as wins,
      AVG(kda) as avg_kda,
      AVG(hero_damage) as avg_hero_damage,
      AVG(siege_damage) as avg_siege_damage,
      AVG(COALESCE(healing, 0) + COALESCE(self_healing, 0)) as avg_healing,
      AVG(damage_taken) as avg_damage_taken,
      AVG(xp_contribution) as avg_xp
    FROM mv_replay_player_stats
    WHERE LOWER(hots_battle_tag) IN ${sql(tagList)}
  `

  const totalMatches = Number(playerAggRow[0]?.total_matches) || 0
  const wins = Number(playerAggRow[0]?.wins) || 0
  const losses = totalMatches - wins
  const winRatePct = totalMatches > 0 ? Number(((wins / totalMatches) * 100).toFixed(1)) : 0
  const overallKda = totalMatches > 0 ? Number((Number(playerAggRow[0]?.avg_kda) || 0).toFixed(2)) : 0
  const avgHeroDamage = totalMatches > 0 ? Math.round(Number(playerAggRow[0]?.avg_hero_damage) || 0) : 0
  const avgSiegeDamage = totalMatches > 0 ? Math.round(Number(playerAggRow[0]?.avg_siege_damage) || 0) : 0
  const avgHealing = totalMatches > 0 ? Math.round(Number(playerAggRow[0]?.avg_healing) || 0) : 0
  const avgDamageTaken = totalMatches > 0 ? Math.round(Number(playerAggRow[0]?.avg_damage_taken) || 0) : 0
  const avgXp = totalMatches > 0 ? Math.round(Number(playerAggRow[0]?.avg_xp) || 0) : 0

  // 2. All-time hero breakdown
  const allHeroStatsRows = await sql<Array<{
    hero: string
    games: string
    wins: string
  }>>`
    SELECT
      hero,
      COUNT(*) as games,
      SUM(CASE WHEN win THEN 1 ELSE 0 END) as wins
    FROM mv_replay_player_stats
    WHERE LOWER(hots_battle_tag) IN ${sql(tagList)}
    GROUP BY hero
    ORDER BY COUNT(*) DESC
  `

  const allHeroStats: PlayerProfileTopHero[] = allHeroStatsRows.map(r => {
    const g = Number(r.games) || 0
    const w = Number(r.wins) || 0
    return {
      hero: r.hero,
      games: g,
      wins: w,
      winRatePct: g > 0 ? Number(((w / g) * 100).toFixed(1)) : 0,
    }
  })

  const topHeroes = allHeroStats.slice(0, 5)

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

  // 3. Query match history (filtered by hero if requested)
  let matches: ReplayStatsMatchRow[] = []
  let heroStats: PlayerHeroSpecificStats | null = null

  const trimmedHero = (heroFilter || '').trim()
  if (trimmedHero) {
    const normHero = trimmedHero.toLowerCase().replace(/[^a-z0-9]/g, '')
    matches = await sql<ReplayStatsMatchRow[]>`
      SELECT s.replay_id, s.date, s.map, s.hero, s.win,
             s.hots_battle_tag,
             s.kda, s.solo_kills, s.assists, s.deaths, s.hero_damage, s.siege_damage,
             s.healing, s.self_healing, s.damage_taken, s.xp_contribution,
             s.length,
             r.players->s.toon_handle->'talents' as talents
      FROM mv_replay_player_stats s
      JOIN replays r ON s.replay_id = r.id
      WHERE LOWER(s.hots_battle_tag) IN ${sql(tagList)}
        AND REGEXP_REPLACE(LOWER(s.hero), '[^a-z0-9]', '', 'g') = ${normHero}
      ORDER BY s.date DESC
    `

    const heroAggRow = await sql<Array<{
      games: string
      wins: string
      avg_kda: number | null
      avg_hero_damage: number | null
      avg_siege_damage: number | null
      avg_healing: number | null
      avg_damage_taken: number | null
    }>>`
      SELECT
        COUNT(*) as games,
        SUM(CASE WHEN win THEN 1 ELSE 0 END) as wins,
        AVG(kda) as avg_kda,
        AVG(hero_damage) as avg_hero_damage,
        AVG(siege_damage) as avg_siege_damage,
        AVG(COALESCE(healing, 0) + COALESCE(self_healing, 0)) as avg_healing,
        AVG(damage_taken) as avg_damage_taken
      FROM mv_replay_player_stats
      WHERE LOWER(hots_battle_tag) IN ${sql(tagList)}
        AND REGEXP_REPLACE(LOWER(hero), '[^a-z0-9]', '', 'g') = ${normHero}
    `

    if (heroAggRow.length > 0) {
      const g = Number(heroAggRow[0].games) || 0
      const w = Number(heroAggRow[0].wins) || 0
      const l = g - w
      const wr = g > 0 ? Number(((w / g) * 100).toFixed(1)) : 0
      heroStats = {
        hero: matches[0]?.hero || trimmedHero,
        total: g,
        wins: w,
        losses: l,
        winRatePct: wr,
        kda: Number((Number(heroAggRow[0].avg_kda) || 0).toFixed(2)),
        avgHeroDamage: Math.round(Number(heroAggRow[0].avg_hero_damage) || 0),
        avgSiegeDamage: Math.round(Number(heroAggRow[0].avg_siege_damage) || 0),
        avgHealing: Math.round(Number(heroAggRow[0].avg_healing) || 0),
        avgDamageTaken: Math.round(Number(heroAggRow[0].avg_damage_taken) || 0),
      }
    }
  } else {
    matches = await sql<ReplayStatsMatchRow[]>`
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
    `
  }

  const formattedMatches: PlayerProfileMatch[] = []

  for (const m of matches) {
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
    heroStats,
  }
}

