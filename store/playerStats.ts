import {
  PLAYER_MMR_VIEW_SCHEMA_SQL,
  PLAYER_STATS_VIEW_SCHEMA_SQL,
  PlayerAggregatedStats,
  PlayerStatsFilter,
  ReplayPlayerStatRow,
} from '../types/player'
import { sql } from './db'
import { ensurePlayerEloPopulated, initPlayerEloTables, recalculateAllPlayerElo } from './elo'

/**
 * Initializes the `mv_replay_player_stats` materialized view, Elo tables, and `v_player_mmr` view in PostgreSQL.
 */
export async function initPlayerStatsView(): Promise<void> {
  const viewExists = await sql<Array<{ oid: number }>>`
    SELECT oid FROM pg_class WHERE relname = 'mv_replay_player_stats' AND relkind = 'm'
  `
  if (viewExists.length > 0) {
    const existingCols = await sql<Array<{ attname: string }>>`
      SELECT a.attname
      FROM pg_attribute a
      JOIN pg_class c ON a.attrelid = c.oid
      WHERE c.relname = 'mv_replay_player_stats'
        AND a.attname = 'hots_battle_tag'
        AND a.attnum > 0
        AND NOT a.attisdropped
    `
    if (existingCols.length === 0) {
      await sql`DROP MATERIALIZED VIEW IF EXISTS mv_replay_player_stats`
    }
  }
  await sql.unsafe(PLAYER_STATS_VIEW_SCHEMA_SQL)
  await initPlayerEloTables()
  await sql.unsafe(PLAYER_MMR_VIEW_SCHEMA_SQL)
  await ensurePlayerEloPopulated()
}

/**
 * Refreshes the `mv_replay_player_stats` materialized view concurrently and recalculates Seeded 5v5 Team Elo.
 */
export async function refreshPlayerStatsView(): Promise<void> {
  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_replay_player_stats`
  await recalculateAllPlayerElo()
}

/**
 * Quickly aggregates stats per player from the indexed `mv_replay_player_stats` materialized view,
 * using a CTE + Window Function (`ROW_NUMBER() OVER (...)`) to include both all-time stats
 * and recent 10-game rolling form in a single query.
 */
export async function getPlayerAggregatedStats(filter: PlayerStatsFilter = {}): Promise<PlayerAggregatedStats[]> {
  const toonHandle = filter.toonHandle ?? null
  const playerName = filter.playerName ?? null
  const hero = filter.hero ?? null
  const map = filter.map ?? null
  const recentGames = Math.max(1, Math.min(filter.recentGames ?? 10, 50))

  return await sql<PlayerAggregatedStats[]>`
    WITH player_mappings AS (
      SELECT
        m.*,
        COALESCE(
          'discord_' || MAX(ha.discord_id) OVER (PARTITION BY m.toon_handle),
          'discord_' || ha.discord_id,
          'toon_' || m.toon_handle
        ) AS player_identity,
        COALESCE(
          MAX(ha.discord_id) OVER (PARTITION BY m.toon_handle),
          ha.discord_id
        ) AS resolved_discord_id,
        ha.id AS account_id,
        ha.is_primary,
        ha.hots_battle_tag AS mapped_battle_tag
      FROM mv_replay_player_stats m
      LEFT JOIN hots_accounts ha ON LOWER(ha.hots_battle_tag) = LOWER(m.hots_battle_tag)
      WHERE (${toonHandle}::text IS NULL OR m.toon_handle = ${toonHandle})
        AND (${playerName}::text IS NULL OR m.player_name ILIKE ${playerName})
        AND (${hero}::text IS NULL OR m.hero = ${hero})
        AND (${map}::text IS NULL OR m.map = ${map})
    ),
    ranked_games AS (
      SELECT
        *,
        ROW_NUMBER() OVER (
          PARTITION BY player_identity
          ORDER BY date DESC
        ) AS recency_rank,
        FIRST_VALUE(player_name) OVER (
          PARTITION BY player_identity
          ORDER BY date DESC
        ) AS latest_player_name,
        FIRST_VALUE(toon_handle) OVER (
          PARTITION BY player_identity
          ORDER BY date DESC
        ) AS latest_toon_handle
      FROM player_mappings
    ),
    aggregated AS (
      SELECT
        player_identity,
        MAX(resolved_discord_id) AS discord_id,
        MAX(latest_toon_handle) AS toon_handle,
        COALESCE(
          MAX(CASE WHEN is_primary THEN split_part(mapped_battle_tag, '#', 1) END),
          MAX(split_part(mapped_battle_tag, '#', 1)),
          MAX(latest_player_name)
        ) AS player_name,
        COALESCE(
          MAX(CASE WHEN is_primary THEN account_id END),
          MIN(account_id)
        ) AS row_id,
        COALESCE(
          MAX(CASE WHEN is_primary THEN mapped_battle_tag END),
          MAX(mapped_battle_tag),
          MAX(hots_battle_tag)
        ) AS hots_battle_tag,
        COALESCE(
          ARRAY_AGG(DISTINCT mapped_battle_tag) FILTER (WHERE mapped_battle_tag IS NOT NULL),
          ARRAY_AGG(DISTINCT hots_battle_tag) FILTER (WHERE hots_battle_tag IS NOT NULL),
          '{}'::text[]
        ) AS all_battle_tags,
        COALESCE(
          ARRAY_AGG(DISTINCT account_id) FILTER (WHERE account_id IS NOT NULL),
          '{}'::int[]
        ) AS all_row_ids,
        COUNT(*)::int AS games_played,
        COUNT(*) FILTER (WHERE win)::int AS wins,
        COUNT(*) FILTER (WHERE NOT win)::int AS losses,
        ROUND(100.0 * AVG(CASE WHEN win THEN 1.0 ELSE 0.0 END)::numeric, 2)::double precision AS win_rate_pct,
        SUM(takedowns)::int AS total_takedowns,
        SUM(solo_kills)::int AS total_solo_kills,
        SUM(assists)::int AS total_assists,
        SUM(deaths)::int AS total_deaths,
        ROUND((SUM(takedowns)::numeric / GREATEST(SUM(deaths), 1)), 2)::double precision AS overall_kda,
        ROUND(AVG(takedowns)::numeric, 2)::double precision AS avg_takedowns,
        ROUND(AVG(deaths)::numeric, 2)::double precision AS avg_deaths,
        ROUND(AVG(assists)::numeric, 2)::double precision AS avg_assists,
        ROUND(AVG(hero_damage)::numeric, 1)::double precision AS avg_hero_damage,
        ROUND(AVG(siege_damage)::numeric, 1)::double precision AS avg_siege_damage,
        ROUND(AVG(healing)::numeric, 1)::double precision AS avg_healing,
        ROUND(AVG(damage_taken)::numeric, 1)::double precision AS avg_damage_taken,
        ROUND(AVG(damage_soaked)::numeric, 1)::double precision AS avg_damage_soaked,
        ROUND(AVG(xp_contribution)::numeric, 1)::double precision AS avg_xp_contribution,
        ROUND(AVG(dpm)::numeric, 1)::double precision AS avg_dpm,
        ROUND(AVG(hpm)::numeric, 1)::double precision AS avg_hpm,
        ROUND(AVG(xpm)::numeric, 1)::double precision AS avg_xpm,
        ROUND(100.0 * AVG(kill_participation)::numeric, 1)::double precision AS avg_kill_participation_pct,
        ROUND(AVG(time_spent_dead)::numeric, 1)::double precision AS avg_time_spent_dead,
        SUM(votes)::int AS total_votes,
        SUM(bsteps_count)::int AS total_bsteps,
        SUM(sprays_count)::int AS total_sprays,
        SUM(taunts_count)::int AS total_taunts,
        SUM(dances_count)::int AS total_dances,
        SUM(voice_lines_count)::int AS total_voice_lines,
        CASE
          WHEN COUNT(*) >= ${recentGames} THEN
            ROUND(
              100.0 * (AVG(CASE WHEN win THEN 1.0 ELSE 0.0 END) FILTER (WHERE recency_rank <= ${recentGames}))::numeric,
              2
            )::double precision
          ELSE NULL
        END AS recent_10_win_rate_pct,
        CASE
          WHEN COUNT(*) >= ${recentGames} THEN
            ROUND(
              (AVG(dpm) FILTER (WHERE recency_rank <= ${recentGames}))::numeric,
              1
            )::double precision
          ELSE NULL
        END AS recent_10_avg_dpm
      FROM ranked_games
      GROUP BY player_identity
    )
    SELECT
      a.*,
      mmr_info.mmr,
      mmr_info.base_mmr,
      COALESCE(mmr_info.adjustment, 0) AS adjustment,
      mmr_info.role
    FROM aggregated a
    LEFT JOIN LATERAL (
      SELECT v.mmr, v.base_mmr, v.adjustment, v.role
      FROM v_player_mmr v
      WHERE (a.discord_id IS NOT NULL AND v.discord_id = a.discord_id)
         OR (a.discord_id IS NULL AND (
              (a.row_id IS NOT NULL AND v.hots_account_id = a.row_id)
              OR LOWER(v.player) = LOWER(a.hots_battle_tag)
            ))
      ORDER BY 
        CASE WHEN a.discord_id IS NOT NULL AND v.discord_id = a.discord_id THEN 0 ELSE 1 END,
        CASE WHEN LOWER(v.player) = LOWER(a.hots_battle_tag) THEN 0 ELSE 1 END,
        v.mmr DESC
      LIMIT 1
    ) mmr_info ON TRUE
    ORDER BY a.games_played DESC, a.win_rate_pct DESC
  `
}

/**
 * Retrieves individual per-match player stat rows from `mv_replay_player_stats`.
 */
export async function getPlayerMatchHistory(toonHandle: string, limit = 50): Promise<ReplayPlayerStatRow[]> {
  return await sql<ReplayPlayerStatRow[]>`
    SELECT *
    FROM mv_replay_player_stats
    WHERE toon_handle = ${toonHandle}
    ORDER BY date DESC
    LIMIT ${limit}
  `
}

