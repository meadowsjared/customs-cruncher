import {
  PLAYER_ELO_TABLES_SCHEMA_SQL,
} from '../types/player'
import {
  calculateSeededTeamElo,
  EloAccountInput,
  EloMatchInput,
  EloSubstitutionInput,
} from '../utils/elo'
import { sql } from './db'

interface AccountQueryRow {
  id: number
  discord_id: string | null
  hots_battle_tag: string
  owner_discord_id: string | null
  account_mmr: number
}

interface SubstitutionQueryRow {
  replay_id: number
  hots_battle_tag: string
  substitute_discord_id: string
}

interface ReplayStatQueryRow {
  replay_id: number
  date: Date | string
  toon_handle: string
  hots_battle_tag: string
  team: number
  win: boolean
}

let activeRecalcPromise: Promise<void> | null = null
let pendingRecalc = false

/**
 * Ensures the `player_elo` and `replay_player_elo` tables and their indexes exist in PostgreSQL.
 */
export async function initPlayerEloTables(): Promise<void> {
  await sql.unsafe(PLAYER_ELO_TABLES_SCHEMA_SQL)
}

async function runRecalculateAllPlayerElo(): Promise<void> {
  const mvExists = await sql<Array<{ oid: number }>>`
    SELECT oid FROM pg_class WHERE relname = 'mv_replay_player_stats' AND relkind = 'm'
  `
  if (mvExists.length === 0) {
    return
  }

  await initPlayerEloTables()

  const [accountRows, substitutionRows, replayStatRows] = await Promise.all([
    sql<AccountQueryRow[]>`
      SELECT
        id,
        discord_id,
        hots_battle_tag,
        owner_discord_id,
        GREATEST(hp_qm_mmr, hp_sl_mmr, hp_ar_mmr, 0)::int AS account_mmr
      FROM hots_accounts
    `,
    sql<SubstitutionQueryRow[]>`
      SELECT
        replay_id,
        hots_battle_tag,
        substitute_discord_id
      FROM account_substitutions
      WHERE replay_id IS NOT NULL
    `,
    sql<ReplayStatQueryRow[]>`
      SELECT
        replay_id,
        date,
        toon_handle,
        hots_battle_tag,
        team,
        win
      FROM mv_replay_player_stats
      ORDER BY date ASC, replay_id ASC
    `,
  ])

  const accounts: EloAccountInput[] = accountRows.map(r => ({
    hotsAccountId: r.id,
    discordId: r.discord_id,
    battleTagLower: r.hots_battle_tag.toLowerCase(),
    ownerDiscordId: r.owner_discord_id,
    baseMmr: Number(r.account_mmr) || 0,
  }))

  const substitutions: EloSubstitutionInput[] = substitutionRows.map(r => ({
    replayId: Number(r.replay_id),
    battleTagLower: r.hots_battle_tag.toLowerCase(),
    substituteDiscordId: r.substitute_discord_id,
  }))

  const matches: EloMatchInput[] = []
  let currentReplayId: number | null = null
  let currentMatch: EloMatchInput | null = null

  for (const row of replayStatRows) {
    const replayId = Number(row.replay_id)
    if (replayId !== currentReplayId || !currentMatch) {
      currentReplayId = replayId
      currentMatch = {
        replayId,
        date: row.date,
        players: [],
      }
      matches.push(currentMatch)
    }
    currentMatch.players.push({
      battleTagLower: row.hots_battle_tag.toLowerCase(),
      toonHandle: row.toon_handle,
      team: Number(row.team),
      win: Boolean(row.win),
    })
  }

  const result = calculateSeededTeamElo({
    accounts,
    substitutions,
    matches,
  })

  const playerRowsToInsert = result.playerRatings.map(r => ({
    player_key: r.playerKey,
    discord_id: r.discordId,
    hots_account_id: r.hotsAccountId,
    base_mmr: r.baseMmr,
    elo_mmr: r.eloMmr,
    elo_games: r.eloGames,
    custom_games: r.customGames,
    custom_win_rate: r.customWinRate,
  }))

  // Deduplicate replay_player_elo rows defensively in case a replay ever has duplicate tags
  const replayRowsMap = new Map<
    string,
    {
      replay_id: number
      battle_tag_lower: string
      base_mmr: number
      pre_mmr: number
      post_mmr: number
      mmr_delta: number
      is_rated: boolean
    }
  >()
  for (const m of result.matchRatings) {
    replayRowsMap.set(`${m.replayId}|${m.battleTagLower}`, {
      replay_id: m.replayId,
      battle_tag_lower: m.battleTagLower,
      base_mmr: m.baseMmr,
      pre_mmr: m.preMmr,
      post_mmr: m.postMmr,
      mmr_delta: m.mmrDelta,
      is_rated: m.isRated,
    })
  }
  const replayRowsToInsert = Array.from(replayRowsMap.values())

  const CHUNK_SIZE = 1000

  await sql.begin(async tx => {
    await tx`DELETE FROM player_elo`
    await tx`DELETE FROM replay_player_elo`

    for (let i = 0; i < playerRowsToInsert.length; i += CHUNK_SIZE) {
      const chunk = playerRowsToInsert.slice(i, i + CHUNK_SIZE)
      if (chunk.length > 0) {
        await tx`INSERT INTO player_elo ${tx(chunk)}`
      }
    }

    for (let i = 0; i < replayRowsToInsert.length; i += CHUNK_SIZE) {
      const chunk = replayRowsToInsert.slice(i, i + CHUNK_SIZE)
      if (chunk.length > 0) {
        await tx`INSERT INTO replay_player_elo ${tx(chunk)}`
      }
    }
  })
}

/**
 * Recomputes all Seeded 5v5 Team Elo ratings and per-match Elo snapshots into PostgreSQL.
 * Coalesces concurrent calls so simultaneous replay/account updates never race.
 */
export async function recalculateAllPlayerElo(): Promise<void> {
  if (activeRecalcPromise) {
    pendingRecalc = true
    await activeRecalcPromise
    return
  }

  activeRecalcPromise = (async () => {
    try {
      await runRecalculateAllPlayerElo()
      while (pendingRecalc) {
        pendingRecalc = false
        await runRecalculateAllPlayerElo()
      }
    } finally {
      activeRecalcPromise = null
    }
  })()

  await activeRecalcPromise
}

/**
 * Ensures `player_elo` is populated if replays exist in `mv_replay_player_stats`
 * (e.g., on first boot after upgrading to the Seeded 5v5 Team Elo system).
 */
export async function ensurePlayerEloPopulated(): Promise<void> {
  await initPlayerEloTables()

  const mvExists = await sql<Array<{ oid: number }>>`
    SELECT oid FROM pg_class WHERE relname = 'mv_replay_player_stats' AND relkind = 'm'
  `
  if (mvExists.length === 0) {
    return
  }

  const [eloCountRows, replayCountRows] = await Promise.all([
    sql<Array<{ count: number }>>`SELECT COUNT(*)::int AS count FROM replay_player_elo`,
    sql<Array<{ count: number }>>`SELECT COUNT(*)::int AS count FROM mv_replay_player_stats`,
  ])

  const eloCount = eloCountRows[0]?.count ?? 0
  const replayCount = replayCountRows[0]?.count ?? 0

  if (replayCount > 0 && eloCount === 0) {
    await recalculateAllPlayerElo()
  }
}
