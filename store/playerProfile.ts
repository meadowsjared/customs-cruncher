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
  mmr?: number | null
  aramMmr?: number | null
  aramBaseMmr?: number | null
  aramGames?: number | null
  aramWinRate?: number | null
  baseMmr?: number | null
  adjustment?: number | null
  role?: string | null
  totalMatches: number
  wins: number
  losses: number
  winRatePct: number
  overallKda: number
  totalKills: number
  totalAssists: number
  totalDeaths: number
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
  account_owner_name?: string | null
  account_owner_tag?: string | null
  account_owner_row_id?: number | null
  guild_id?: string | null
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
  mmr_delta?: number | null
  is_rated?: boolean | null
}

export interface PlayerHeroSpecificStats {
  hero: string
  total: number
  wins: number
  losses: number
  winRatePct: number
  kda: number
  totalKills: number
  totalAssists: number
  totalDeaths: number
  avgHeroDamage: number
  avgSiegeDamage: number
  avgHealing: number
  avgDamageTaken: number
}

export interface PlayerPaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface PlayerProfileOptions {
  page?: number
  limit?: number
  outcome?: 'all' | 'win' | 'loss'
  heroSearch?: string
  scopeLimit?: number
  accounts?: string[]
}

export interface PlayerMmrHistoryPoint {
  replayId: number
  date: string
  mmr: number
  preMmr: number
  delta: number
  isRated: boolean
  hero?: string
  win?: boolean
  map?: string
}

export interface PlayerAccountOption {
  tag: string
  games: number
}

export interface PlayerProfileResult {
  player: PlayerProfileSummary
  matches: PlayerProfileMatch[]
  pagination: PlayerPaginationInfo
  heroStats?: PlayerHeroSpecificStats | null
  availableAccounts?: PlayerAccountOption[]
  mmrHistory?: PlayerMmrHistoryPoint[]
  aramMmrHistory?: PlayerMmrHistoryPoint[]
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
  account_owner_name: string | null
  account_owner_tag: string | null
  account_owner_row_id: number | null
  guild_id: string | null
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
  mmr_delta: number | null
  is_rated: boolean | null
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

export async function getPlayerProfile(
  identifier: string,
  heroFilter?: string,
  options?: PlayerProfileOptions
): Promise<PlayerProfileResult | null> {
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
          AND owner_discord_id IS NULL
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
          AND owner_discord_id IS NULL
        LIMIT 1
      `
      primaryAccount = rows[0]
    } else {
      const rows = await sql<HotsAccountLookupRow[]>`
        SELECT id, discord_id, hots_battle_tag
        FROM hots_accounts
        WHERE LOWER(hots_battle_tag) LIKE LOWER(${normalized + '#%'})
          AND owner_discord_id IS NULL
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

  // Collect owned accounts for the player without exposing their discord_id
  let allTags = [primaryAccount.hots_battle_tag]
  if (primaryAccount.discord_id) {
    const linked = await sql<{ hots_battle_tag: string }[]>`
      SELECT hots_battle_tag
      FROM hots_accounts
      WHERE discord_id = ${primaryAccount.discord_id}
        AND owner_discord_id IS NULL
    `
    if (linked.length > 0) {
      allTags = Array.from(new Set(linked.map(r => r.hots_battle_tag)))
    }
  }

  const ownedTagList = allTags.map(t => t.toLowerCase())
  const requestedAccounts = Array.from(
    new Set((options?.accounts ?? []).map(a => a.trim().toLowerCase()).filter(Boolean))
  )
  const discordId = primaryAccount.discord_id

  const buildOwnershipCondition = (includeAccountFilter: boolean) => sql`
    (
      ${discordId ? sql`sub.substitute_discord_id = ${discordId} OR ` : sql``}
      (
        LOWER(s.hots_battle_tag) IN ${sql(ownedTagList)}
        AND sub.substitute_discord_id IS NULL
      )
    )
    ${includeAccountFilter && requestedAccounts.length > 0 ? sql`AND LOWER(s.hots_battle_tag) IN ${sql(requestedAccounts)}` : sql``}
  `

  const page = Math.max(1, options?.page ?? 1)
  const limit = Math.max(1, Math.min(100, options?.limit ?? 15))
  const offset = (page - 1) * limit
  const scopeLimit = options?.scopeLimit && options.scopeLimit > 0 ? options.scopeLimit : null
  const outcome = options?.outcome === 'win' || options?.outcome === 'loss' ? options.outcome : null
  const normHero = (heroFilter || '').trim() ? (heroFilter || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '') : null
  const heroSearchClean = (options?.heroSearch || '').trim() ? (options?.heroSearch || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '') : null

  // 1. Unified aggregate stats scoped to the requested match sample & filters
  const summaryAggRow = await sql<Array<{
    total_matches: string
    wins: string | null
    total_kills: string | null
    total_assists: string | null
    total_deaths: string | null
    avg_kda: number | null
    avg_hero_damage: number | null
    avg_siege_damage: number | null
    avg_healing: number | null
    avg_damage_taken: number | null
    avg_xp: number | null
  }>>`
    WITH scoped_matches AS (
      SELECT s.*
      FROM mv_replay_player_stats s
      JOIN replays r ON r.id = s.replay_id
      LEFT JOIN LATERAL (
        SELECT a.substitute_discord_id
        FROM account_substitutions a
        WHERE a.replay_id = s.replay_id
          AND LOWER(a.hots_battle_tag) = LOWER(s.hots_battle_tag)
        ORDER BY a.id DESC
        LIMIT 1
      ) sub ON TRUE
      WHERE (s.mode = -1 OR r.guild_id IS NOT NULL)
        AND ${buildOwnershipCondition(true)}
      ORDER BY s.date DESC
      LIMIT ${scopeLimit}
    ),
    filtered_matches AS (
      SELECT *
      FROM scoped_matches
      WHERE 1=1
        ${normHero ? sql`AND REGEXP_REPLACE(LOWER(hero), '[^a-z0-9]', '', 'g') = ${normHero}` : sql``}
        ${heroSearchClean ? sql`AND REGEXP_REPLACE(LOWER(hero), '[^a-z0-9]', '', 'g') LIKE ${'%' + heroSearchClean + '%'}` : sql``}
        ${outcome === 'win' ? sql`AND win = true` : outcome === 'loss' ? sql`AND win = false` : sql``}
    )
    SELECT
      COUNT(*) as total_matches,
      SUM(CASE WHEN win THEN 1 ELSE 0 END) as wins,
      SUM(solo_kills) as total_kills,
      SUM(assists) as total_assists,
      SUM(deaths) as total_deaths,
      AVG(kda) as avg_kda,
      AVG(hero_damage) as avg_hero_damage,
      AVG(siege_damage) as avg_siege_damage,
      AVG(COALESCE(healing, 0) + COALESCE(self_healing, 0)) as avg_healing,
      AVG(damage_taken) as avg_damage_taken,
      AVG(xp_contribution) as avg_xp
    FROM filtered_matches
  `

  const totalMatches = Number(summaryAggRow[0]?.total_matches) || 0
  const wins = Number(summaryAggRow[0]?.wins) || 0
  const totalKills = Number(summaryAggRow[0]?.total_kills) || 0
  const totalAssists = Number(summaryAggRow[0]?.total_assists) || 0
  const totalDeaths = Number(summaryAggRow[0]?.total_deaths) || 0
  const losses = totalMatches - wins
  const winRatePct = totalMatches > 0 ? Number(((wins / totalMatches) * 100).toFixed(1)) : 0
  const overallKda = totalMatches > 0 ? Number((Number(summaryAggRow[0]?.avg_kda) || 0).toFixed(2)) : 0
  const avgHeroDamage = totalMatches > 0 ? Math.round(Number(summaryAggRow[0]?.avg_hero_damage) || 0) : 0
  const avgSiegeDamage = totalMatches > 0 ? Math.round(Number(summaryAggRow[0]?.avg_siege_damage) || 0) : 0
  const avgHealing = totalMatches > 0 ? Math.round(Number(summaryAggRow[0]?.avg_healing) || 0) : 0
  const avgDamageTaken = totalMatches > 0 ? Math.round(Number(summaryAggRow[0]?.avg_damage_taken) || 0) : 0
  const avgXp = totalMatches > 0 ? Math.round(Number(summaryAggRow[0]?.avg_xp) || 0) : 0

  // 2. Hero breakdown within active filters & scope
  const allHeroStatsRows = await sql<Array<{
    hero: string
    games: string
    wins: string
  }>>`
    WITH scoped_matches AS (
      SELECT s.*
      FROM mv_replay_player_stats s
      JOIN replays r ON r.id = s.replay_id
      LEFT JOIN LATERAL (
        SELECT a.substitute_discord_id
        FROM account_substitutions a
        WHERE a.replay_id = s.replay_id
          AND LOWER(a.hots_battle_tag) = LOWER(s.hots_battle_tag)
        ORDER BY a.id DESC
        LIMIT 1
      ) sub ON TRUE
      WHERE (s.mode = -1 OR r.guild_id IS NOT NULL)
        AND ${buildOwnershipCondition(true)}
      ORDER BY s.date DESC
      LIMIT ${scopeLimit}
    ),
    filtered_matches AS (
      SELECT *
      FROM scoped_matches
      WHERE 1=1
        ${normHero ? sql`AND REGEXP_REPLACE(LOWER(hero), '[^a-z0-9]', '', 'g') = ${normHero}` : sql``}
        ${heroSearchClean ? sql`AND REGEXP_REPLACE(LOWER(hero), '[^a-z0-9]', '', 'g') LIKE ${'%' + heroSearchClean + '%'}` : sql``}
        ${outcome === 'win' ? sql`AND win = true` : outcome === 'loss' ? sql`AND win = false` : sql``}
    )
    SELECT
      hero,
      COUNT(*) as games,
      SUM(CASE WHEN win THEN 1 ELSE 0 END) as wins
    FROM filtered_matches
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

  const availableAccounts = await sql<PlayerAccountOption[]>`
    WITH scoped_matches AS (
      SELECT s.*
      FROM mv_replay_player_stats s
      JOIN replays r ON r.id = s.replay_id
      LEFT JOIN LATERAL (
        SELECT a.substitute_discord_id
        FROM account_substitutions a
        WHERE a.replay_id = s.replay_id
          AND LOWER(a.hots_battle_tag) = LOWER(s.hots_battle_tag)
        ORDER BY a.id DESC
        LIMIT 1
      ) sub ON TRUE
      WHERE (s.mode = -1 OR r.guild_id IS NOT NULL)
        AND ${buildOwnershipCondition(false)}
      ORDER BY s.date DESC
      LIMIT ${scopeLimit}
    )
    SELECT
      hots_battle_tag AS tag,
      COUNT(*)::int AS games
    FROM scoped_matches
    WHERE 1=1
      ${normHero ? sql`AND REGEXP_REPLACE(LOWER(hero), '[^a-z0-9]', '', 'g') = ${normHero}` : sql``}
    GROUP BY hots_battle_tag
    ORDER BY COUNT(*) DESC, hots_battle_tag ASC
  `

  // 3. Paginated match list (talents fetched only for requested page rows)
  const matches = await sql<ReplayStatsMatchRow[]>`
    WITH scoped_matches AS (
      SELECT s.*, sub.substitute_discord_id, sub.original_discord_id
      FROM mv_replay_player_stats s
      JOIN replays r ON r.id = s.replay_id
      LEFT JOIN LATERAL (
        SELECT a.substitute_discord_id, a.original_discord_id
        FROM account_substitutions a
        WHERE a.replay_id = s.replay_id
          AND LOWER(a.hots_battle_tag) = LOWER(s.hots_battle_tag)
        ORDER BY a.id DESC
        LIMIT 1
      ) sub ON TRUE
      WHERE (s.mode = -1 OR r.guild_id IS NOT NULL)
        AND ${buildOwnershipCondition(true)}
      ORDER BY s.date DESC
      LIMIT ${scopeLimit}
    ),
    filtered_matches AS (
      SELECT *
      FROM scoped_matches
      WHERE 1=1
        ${normHero ? sql`AND REGEXP_REPLACE(LOWER(hero), '[^a-z0-9]', '', 'g') = ${normHero}` : sql``}
        ${heroSearchClean ? sql`AND REGEXP_REPLACE(LOWER(hero), '[^a-z0-9]', '', 'g') LIKE ${'%' + heroSearchClean + '%'}` : sql``}
        ${outcome === 'win' ? sql`AND win = true` : outcome === 'loss' ? sql`AND win = false` : sql``}
    )
    SELECT
      f.replay_id, f.date, f.map, f.hero, f.win,
      f.hots_battle_tag,
      CASE
        WHEN f.substitute_discord_id IS NOT NULL
          AND f.original_discord_id IS NOT NULL
          AND f.original_discord_id <> f.substitute_discord_id
        THEN split_part(owner_ha.hots_battle_tag, '#', 1)
        ELSE NULL
      END AS account_owner_name,
      CASE
        WHEN f.substitute_discord_id IS NOT NULL
          AND f.original_discord_id IS NOT NULL
          AND f.original_discord_id <> f.substitute_discord_id
        THEN owner_ha.hots_battle_tag
        ELSE NULL
      END AS account_owner_tag,
      CASE
        WHEN f.substitute_discord_id IS NOT NULL
          AND f.original_discord_id IS NOT NULL
          AND f.original_discord_id <> f.substitute_discord_id
        THEN owner_ha.id
        ELSE NULL
      END AS account_owner_row_id,
      r.guild_id,
      f.kda, f.solo_kills, f.assists, f.deaths, f.hero_damage, f.siege_damage,
      f.healing, f.self_healing, f.damage_taken, f.xp_contribution,
      f.length,
      r.players->f.toon_handle->'talents' as talents,
      rpe.mmr_delta,
      rpe.is_rated
    FROM filtered_matches f
    JOIN replays r ON f.replay_id = r.id
    LEFT JOIN LATERAL (
      SELECT ha.id, ha.hots_battle_tag
      FROM hots_accounts ha
      WHERE ha.discord_id = f.original_discord_id
        AND ha.owner_discord_id IS NULL
      ORDER BY ha.is_primary DESC, ha.id ASC
      LIMIT 1
    ) owner_ha ON f.substitute_discord_id IS NOT NULL AND f.original_discord_id <> f.substitute_discord_id
    LEFT JOIN replay_player_elo rpe ON rpe.replay_id = f.replay_id AND rpe.battle_tag_lower = LOWER(f.hots_battle_tag)
    ORDER BY f.date DESC
    LIMIT ${limit} OFFSET ${offset}
  `

  let heroStats: PlayerHeroSpecificStats | null = null
  if (normHero) {
    heroStats = {
      hero: matches[0]?.hero || heroFilter || '',
      total: totalMatches,
      wins,
      losses,
      winRatePct,
      kda: overallKda,
      totalKills,
      totalAssists,
      totalDeaths,
      avgHeroDamage,
      avgSiegeDamage,
      avgHealing,
      avgDamageTaken,
    }
  }

  const pagination: PlayerPaginationInfo = {
    page,
    limit,
    total: totalMatches,
    totalPages: Math.max(1, Math.ceil(totalMatches / limit)),
  }

  const formattedMatches: PlayerProfileMatch[] = []

  for (const m of matches) {
    formattedMatches.push({
      replay_id: m.replay_id,
      date: m.date instanceof Date ? m.date.toISOString() : String(m.date),
      map: m.map,
      hero: m.hero,
      battle_tag: m.hots_battle_tag,
      account_owner_name: m.account_owner_name ?? null,
      account_owner_tag: m.account_owner_tag ?? null,
      account_owner_row_id: m.account_owner_row_id != null ? Number(m.account_owner_row_id) : null,
      guild_id: m.guild_id ?? null,
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
      mmr_delta: m.mmr_delta != null ? Number(m.mmr_delta) : null,
      is_rated: m.is_rated != null ? Boolean(m.is_rated) : null,
    })
  }

  type PlayerMmrLookupRow = {
    mmr: number | null
    aram_mmr: number | null
    aram_games: number | null
    aram_win_rate: number | null
    base_mmr: number | null
    adjustment: number | null
    role: string | null
  }

  interface MmrHistoryRow {
    replay_id: number
    date: Date | string
    base_mmr: number
    pre_mmr: number
    post_mmr: number
    mmr_delta: number
    is_rated: boolean
    hero: string | null
    win: boolean | null
    map: string | null
    mode: number | null
  }

  const mmrHistoryQuery = sql<MmrHistoryRow[]>`
    WITH player_matches AS (
      SELECT
        rpe.replay_id,
        r.date,
        rpe.base_mmr,
        rpe.pre_mmr,
        rpe.post_mmr,
        rpe.mmr_delta,
        rpe.is_rated,
        s.hero,
        s.win,
        COALESCE(s.map, r.map) AS map,
        r.mode,
        ROW_NUMBER() OVER (PARTITION BY rpe.replay_id ORDER BY rpe.is_rated DESC) as rn
      FROM replay_player_elo rpe
      JOIN replays r ON r.id = rpe.replay_id
      LEFT JOIN mv_replay_player_stats s ON s.replay_id = rpe.replay_id AND LOWER(s.hots_battle_tag) = rpe.battle_tag_lower
      WHERE rpe.battle_tag_lower = ANY(${ownedTagList})
        ${discordId ? sql`OR EXISTS (
          SELECT 1 FROM account_substitutions a
          WHERE a.replay_id = rpe.replay_id
            AND LOWER(a.hots_battle_tag) = rpe.battle_tag_lower
            AND a.substitute_discord_id = ${discordId}
        )` : sql``}
    )
    SELECT
      replay_id,
      date,
      base_mmr,
      pre_mmr,
      post_mmr,
      mmr_delta,
      is_rated,
      hero,
      win,
      map,
      mode
    FROM player_matches
    WHERE rn = 1
    ORDER BY date ASC, replay_id ASC;
  `

  let mmrInfo: PlayerMmrLookupRow | undefined
  let mmrHistoryRows: MmrHistoryRow[] = []

  if (primaryAccount.discord_id) {
    const [mmrRows, historyRows] = await Promise.all([
      sql<PlayerMmrLookupRow[]>`
        SELECT mmr, aram_mmr, aram_games, aram_win_rate, base_mmr, adjustment, role
        FROM v_player_mmr
        WHERE discord_id = ${primaryAccount.discord_id}
        LIMIT 1
      `,
      mmrHistoryQuery,
    ])
    mmrInfo = mmrRows[0]
    mmrHistoryRows = historyRows
  } else if (primaryAccount.id) {
    const [mmrRows, historyRows] = await Promise.all([
      sql<PlayerMmrLookupRow[]>`
        SELECT mmr, aram_mmr, aram_games, aram_win_rate, base_mmr, adjustment, role
        FROM v_player_mmr
        WHERE hots_account_id = ${primaryAccount.id} OR LOWER(player) = LOWER(${primaryAccount.hots_battle_tag})
        LIMIT 1
      `,
      mmrHistoryQuery,
    ])
    mmrInfo = mmrRows[0]
    mmrHistoryRows = historyRows
  } else {
    const [mmrRows, historyRows] = await Promise.all([
      sql<PlayerMmrLookupRow[]>`
        SELECT mmr, aram_mmr, aram_games, aram_win_rate, base_mmr, adjustment, role
        FROM v_player_mmr
        WHERE LOWER(player) = LOWER(${primaryAccount.hots_battle_tag})
        LIMIT 1
      `,
      mmrHistoryQuery,
    ])
    mmrInfo = mmrRows[0]
    mmrHistoryRows = historyRows
  }

  const ARAM_MAPS = ['Silver City', 'Lost Cavern', 'Braxis Outpost', 'Industrial District']
  const isAramHistoryRow = (r: MmrHistoryRow) =>
    r.mode === 50031 || r.mode === 50101 || (r.map != null && ARAM_MAPS.includes(r.map))

  const mmrAdjustment = mmrInfo?.adjustment != null ? Number(mmrInfo.adjustment) : 0
  const standardRows = mmrHistoryRows.filter(r => !isAramHistoryRow(r))
  const aramRows = mmrHistoryRows.filter(isAramHistoryRow)

  const mmrHistory: PlayerMmrHistoryPoint[] = standardRows.map(r => ({
    replayId: Number(r.replay_id),
    date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
    mmr: Number(r.post_mmr) + mmrAdjustment,
    preMmr: Number(r.pre_mmr) + mmrAdjustment,
    delta: Number(r.mmr_delta),
    isRated: Boolean(r.is_rated),
    hero: r.hero || undefined,
    win: r.win != null ? Boolean(r.win) : undefined,
    map: r.map || undefined,
  }))

  const aramMmrHistory: PlayerMmrHistoryPoint[] = aramRows.map(r => ({
    replayId: Number(r.replay_id),
    date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
    mmr: Number(r.post_mmr),
    preMmr: Number(r.pre_mmr),
    delta: Number(r.mmr_delta),
    isRated: Boolean(r.is_rated),
    hero: r.hero || undefined,
    win: r.win != null ? Boolean(r.win) : undefined,
    map: r.map || undefined,
  }))

  const aramBaseMmr = aramRows.length > 0 && aramRows[0]?.base_mmr ? Number(aramRows[0].base_mmr) : null

  const [name, tag] = primaryAccount.hots_battle_tag.split('#')

  return {
    player: {
      rowId: primaryAccount.id,
      battleTag: primaryAccount.hots_battle_tag,
      name: name || primaryAccount.hots_battle_tag,
      tag: tag || '',
      allTags,
      mmr: mmrInfo?.mmr != null ? Number(mmrInfo.mmr) : null,
      aramMmr: mmrInfo?.aram_mmr != null ? Number(mmrInfo.aram_mmr) : null,
      aramBaseMmr,
      aramGames: mmrInfo?.aram_games != null ? Number(mmrInfo.aram_games) : null,
      aramWinRate: mmrInfo?.aram_win_rate != null ? Number(mmrInfo.aram_win_rate) : null,
      baseMmr: mmrInfo?.base_mmr != null ? Number(mmrInfo.base_mmr) : null,
      adjustment: mmrInfo?.adjustment != null ? Number(mmrInfo.adjustment) : null,
      role: mmrInfo?.role || null,
      totalMatches,
      wins,
      losses,
      winRatePct,
      overallKda,
      totalKills,
      totalAssists,
      totalDeaths,
      avgHeroDamage,
      avgSiegeDamage,
      avgHealing,
      avgDamageTaken,
      avgXp,
      topHeroes,
      highestWinRateHeroes,
    },
    matches: formattedMatches,
    pagination,
    heroStats,
    availableAccounts,
    mmrHistory,
    aramMmrHistory,
  }
}

