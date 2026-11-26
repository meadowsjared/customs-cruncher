import { sql } from './db'
import { PlayerMatchTalents } from './playerProfile'

export interface HeroProfileTopPlayer {
  rowId: number | null
  battleTag: string
  name: string
  tag: string
  games: number
  wins: number
  winRatePct: number
  kda: number
}

export interface HeroProfileSummary {
  hero: string
  canonicalName: string
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
  topPlayers: HeroProfileTopPlayer[]
}

export interface HeroProfileMatch {
  replay_id: number
  date: string
  map: string
  hero: string
  player_row_id: number | null
  player_name: string
  player_tag: string
  player_battle_tag: string
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
  is_sub?: boolean
  sub_row_id?: number | null
  sub_battle_tag?: string | null
  account_owner_name?: string | null
  account_owner_tag?: string | null
  account_owner_row_id?: number | null
}

export interface HeroProfileResult {
  hero: HeroProfileSummary
  matches: HeroProfileMatch[]
}

interface RawHeroMatchRow {
  replay_id: number
  date: Date | string
  map: string
  hero: string
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
  hots_battle_tag: string
  player_row_id: number | null
  talents: PlayerMatchTalents | null
  is_sub: boolean
  sub_row_id: number | null
  sub_battle_tag: string | null
  account_owner_name: string | null
  account_owner_tag: string | null
  account_owner_row_id: number | null
}

export async function getHeroProfile(heroQuery: string): Promise<HeroProfileResult | null> {
  const trimmed = heroQuery.trim()
  if (!trimmed) return null

  const normalized = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!normalized) return null

  const matches = await sql<RawHeroMatchRow[]>`
    SELECT s.replay_id, s.date, s.map, s.hero, s.win,
           s.kda, s.solo_kills, s.assists, s.deaths, s.hero_damage, s.siege_damage,
           s.healing, s.self_healing, s.damage_taken, s.xp_contribution,
           s.length, s.hots_battle_tag,
           ha.id as player_row_id,
           r.players->s.toon_handle->'talents' as talents,
           (sub.substitute_discord_id IS NOT NULL) as is_sub,
           sub_ha.id as sub_row_id,
           sub_ha.hots_battle_tag as sub_battle_tag,
           CASE
             WHEN sub.substitute_discord_id IS NOT NULL
               AND sub.original_discord_id IS NOT NULL
               AND sub.original_discord_id <> sub.substitute_discord_id
             THEN split_part(owner_ha.hots_battle_tag, '#', 1)
             ELSE NULL
           END as account_owner_name,
           CASE
             WHEN sub.substitute_discord_id IS NOT NULL
               AND sub.original_discord_id IS NOT NULL
               AND sub.original_discord_id <> sub.substitute_discord_id
             THEN owner_ha.hots_battle_tag
             ELSE NULL
           END as account_owner_tag,
           CASE
             WHEN sub.substitute_discord_id IS NOT NULL
               AND sub.original_discord_id IS NOT NULL
               AND sub.original_discord_id <> sub.substitute_discord_id
             THEN owner_ha.id
             ELSE NULL
           END as account_owner_row_id
    FROM mv_replay_player_stats s
    JOIN replays r ON s.replay_id = r.id
    LEFT JOIN hots_accounts ha ON LOWER(ha.hots_battle_tag) = LOWER(s.hots_battle_tag)
    LEFT JOIN LATERAL (
      SELECT a.substitute_discord_id, a.original_discord_id
      FROM account_substitutions a
      WHERE a.replay_id = s.replay_id
        AND LOWER(a.hots_battle_tag) = LOWER(s.hots_battle_tag)
      ORDER BY a.id DESC
      LIMIT 1
    ) sub ON TRUE
    LEFT JOIN LATERAL (
      SELECT ha_sub.id, ha_sub.hots_battle_tag
      FROM hots_accounts ha_sub
      WHERE ha_sub.discord_id = sub.substitute_discord_id
        AND ha_sub.owner_discord_id IS NULL
      ORDER BY ha_sub.is_primary DESC, ha_sub.id ASC
      LIMIT 1
    ) sub_ha ON sub.substitute_discord_id IS NOT NULL
    LEFT JOIN LATERAL (
      SELECT ha_own.id, ha_own.hots_battle_tag
      FROM hots_accounts ha_own
      WHERE ha_own.discord_id = sub.original_discord_id
        AND ha_own.owner_discord_id IS NULL
      ORDER BY ha_own.is_primary DESC, ha_own.id ASC
      LIMIT 1
    ) owner_ha ON sub.substitute_discord_id IS NOT NULL
      AND sub.original_discord_id IS NOT NULL
      AND sub.original_discord_id <> sub.substitute_discord_id
    WHERE REGEXP_REPLACE(LOWER(s.hero), '[^a-z0-9]', '', 'g') = ${normalized}
      AND (s.mode = -1 OR r.guild_id IS NOT NULL)
    ORDER BY s.date DESC
    LIMIT 200
  `

  if (!matches || matches.length === 0) {
    return null
  }

  const canonicalName = matches[0].hero
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

  const playerStatsMap = new Map<
    string,
    {
      rowId: number | null
      battleTag: string
      name: string
      tag: string
      games: number
      wins: number
      kdaSum: number
    }
  >()

  const formattedMatches: HeroProfileMatch[] = []

  for (const m of matches) {
    sumKda += Number(m.kda) || 0
    sumHeroDmg += Number(m.hero_damage) || 0
    sumSiegeDmg += Number(m.siege_damage) || 0
    sumHealing += (Number(m.healing) || 0) + (Number(m.self_healing) || 0)
    sumDmgTaken += Number(m.damage_taken) || 0
    sumXp += Number(m.xp_contribution) || 0

    const btag = m.hots_battle_tag || 'Unknown'
    const [pName, pTag] = btag.split('#')
    const playerEntry = playerStatsMap.get(btag) || {
      rowId: m.player_row_id,
      battleTag: btag,
      name: pName || btag,
      tag: pTag || '',
      games: 0,
      wins: 0,
      kdaSum: 0,
    }
    playerEntry.games++
    if (m.win) playerEntry.wins++
    playerEntry.kdaSum += Number(m.kda) || 0
    if (!playerEntry.rowId && m.player_row_id) {
      playerEntry.rowId = m.player_row_id
    }
    playerStatsMap.set(btag, playerEntry)

    formattedMatches.push({
      replay_id: m.replay_id,
      date: m.date instanceof Date ? m.date.toISOString() : String(m.date),
      map: m.map,
      hero: m.hero,
      player_row_id: m.player_row_id,
      player_name: pName || btag,
      player_tag: pTag || '',
      player_battle_tag: btag,
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
      is_sub: Boolean(m.is_sub),
      sub_row_id: m.sub_row_id != null ? Number(m.sub_row_id) : null,
      sub_battle_tag: m.sub_battle_tag ?? null,
      account_owner_name: m.account_owner_name ?? null,
      account_owner_tag: m.account_owner_tag ?? null,
      account_owner_row_id: m.account_owner_row_id != null ? Number(m.account_owner_row_id) : null,
    })
  }

  const topPlayers: HeroProfileTopPlayer[] = Array.from(playerStatsMap.values())
    .map(p => ({
      rowId: p.rowId,
      battleTag: p.battleTag,
      name: p.name,
      tag: p.tag,
      games: p.games,
      wins: p.wins,
      winRatePct: p.games > 0 ? Number(((p.wins / p.games) * 100).toFixed(1)) : 0,
      kda: p.games > 0 ? Number((p.kdaSum / p.games).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.games - a.games || b.winRatePct - a.winRatePct)
    .slice(0, 8)

  const overallKda = totalMatches > 0 ? Number((sumKda / totalMatches).toFixed(2)) : 0
  const avgHeroDamage = totalMatches > 0 ? Math.round(sumHeroDmg / totalMatches) : 0
  const avgSiegeDamage = totalMatches > 0 ? Math.round(sumSiegeDmg / totalMatches) : 0
  const avgHealing = totalMatches > 0 ? Math.round(sumHealing / totalMatches) : 0
  const avgDamageTaken = totalMatches > 0 ? Math.round(sumDmgTaken / totalMatches) : 0
  const avgXp = totalMatches > 0 ? Math.round(sumXp / totalMatches) : 0

  return {
    hero: {
      hero: canonicalName,
      canonicalName,
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
      topPlayers,
    },
    matches: formattedMatches,
  }
}

