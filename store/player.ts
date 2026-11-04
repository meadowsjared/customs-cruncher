import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CacheType,
  ChatInputCommandInteraction,
  InteractionReplyOptions,
  MessageFlags,
  ModalSubmitInteraction,
} from 'discord.js'
import { updateLobbyMessage } from '../commands/lobby'
import { CommandIds, roleMap } from '../constants'
import {
  DiscordUserNames,
  FlatPlayer,
  FormatPlayerDisplayOptions,
  HotsAccount,
  HotSAccountMatch,
  HotsAccountRow,
  Player,
  PlayerIdPrefix,
  PLAYER_MMR_FUNCTION_SQL,
  PLAYER_MMR_VIEW_SCHEMA_SQL,
  PLAYERS_TABLES_SCHEMA_SQL,
  RegisteredPlayerAccount,
  ResolvedHotsAccount,
} from '../types/player'
import { validateBattleTag } from '../utils/heroesOfTheStorm'
import { requireGuildId, safeDeferUpdate, safeReply } from '../utils/interaction'
import { sql } from './db'
import { getHeroesProfileData } from './heroesProfile'
import {
  addFetchingMmrTag,
  cachePlayerDisplayName,
  clearActivePlayersCache,
  getStoredInteraction,
  interactionStore,
  isFetchingMmr,
  removeFetchingMmrTag,
  removeInteraction,
  storeInteraction,
} from './playerCache'
import {
  getPlayerAggregatedStats,
  getPlayerMatchHistory,
  initPlayerStatsView,
  refreshPlayerStatsView,
} from './playerStats'
import {
  clearAccountSubstitutions,
  clearResolvedAccountCache,
  filterActiveSubstitutedAccounts,
  getAccountLoanStatusTag,
  getAccountWithSubstitution,
  getActiveSubstitutions,
  getAssignAccountChoices,
  getAssignAccountClearChoices,
  getOrCreateSubstituteAccount,
  getSubstitutedAccountOwnerTag,
  getSubstitutionForAccount,
  relinkAccountSubstitutions,
  setAccountSubstitution,
} from './substitutions'
import {
  assignPlayerToTeam,
  changeTeams,
  clearLastLobbyScan,
  clearTeams,
  getDraftPickedCount,
  getLastLobbyScan,
  getNextDraftOrder,
  getSortedActivePlayers,
  getTeams,
  markAllPlayersInactive,
  resetActivePlayerTeams,
  saveLastLobbyScan,
  setPlayerActive,
  setTeamsFromPlayers,
  type StoredLobbyScan,
} from './lobby'

export {
  assignPlayerToTeam,
  changeTeams,
  clearAccountSubstitutions,
  clearActivePlayersCache,
  clearLastLobbyScan,
  clearResolvedAccountCache,
  clearTeams,
  filterActiveSubstitutedAccounts,
  getAccountLoanStatusTag,
  getAccountWithSubstitution,
  getActiveSubstitutions,
  getAssignAccountChoices,
  getAssignAccountClearChoices,
  getDraftPickedCount,
  getLastLobbyScan,
  getNextDraftOrder,
  getOrCreateSubstituteAccount,
  getPlayerAggregatedStats,
  getPlayerMatchHistory,
  getSortedActivePlayers,
  getStoredInteraction,
  getSubstitutedAccountOwnerTag,
  getSubstitutionForAccount,
  getTeams,
  initPlayerStatsView,
  interactionStore,
  isFetchingMmr,
  markAllPlayersInactive,
  PlayerIdPrefix,
  refreshPlayerStatsView,
  relinkAccountSubstitutions,
  removeInteraction,
  resetActivePlayerTeams,
  saveLastLobbyScan,
  setAccountSubstitution,
  setPlayerActive,
  setTeamsFromPlayers,
  storeInteraction,
  type FormatPlayerDisplayOptions,
  type HotSAccountMatch,
  type RegisteredPlayerAccount,
  type ResolvedHotsAccount,
  type StoredLobbyScan,
}

/**
 * Initializes the MMR calculation function and `v_player_mmr` view in PostgreSQL.
 */
export async function initPlayerMmrView(): Promise<void> {
  await sql.unsafe(PLAYER_MMR_FUNCTION_SQL)

  const mvExists = await sql<Array<{ oid: number }>>`
    SELECT oid FROM pg_class WHERE relname = 'mv_replay_player_stats' AND relkind = 'm'
  `
  if (mvExists.length > 0) {
    await sql.unsafe(PLAYER_MMR_VIEW_SCHEMA_SQL)
  }
}

/**
 * Initializes the Discord player, HotS account, lobby, and account substitution tables in PostgreSQL.
 */
export async function initPlayersTables(): Promise<void> {
  await sql.unsafe(PLAYERS_TABLES_SCHEMA_SQL)
  await initPlayerMmrView()
}

initPlayersTables().catch(err => {
  console.error('Error initializing players tables in PostgreSQL:', err)
})

/**
 * Saves a player to PostgreSQL.
 * If the player already exists, updates their information.
 */
export async function savePlayer(
  interaction:
    | ChatInputCommandInteraction<CacheType>
    | ButtonInteraction<CacheType>
    | ModalSubmitInteraction<CacheType>
    | undefined,
  discordId: string,
  player: Player,
  hotsBattleTag?: string
): Promise<void> {
  cachePlayerDisplayName(
    discordId,
    player.usernames.discordDisplayName,
    player.usernames.discordGlobalName,
    player.usernames.discordName
  )
  await sql`
    INSERT INTO players (discord_id, discord_name, discord_global_name, discord_display_name, role)
    VALUES (
      ${discordId},
      ${player.usernames.discordName},
      ${player.usernames.discordGlobalName},
      ${player.usernames.discordDisplayName},
      ${player.role ?? null}
    )
    ON CONFLICT (discord_id) DO UPDATE SET
      discord_name = EXCLUDED.discord_name,
      discord_global_name = EXCLUDED.discord_global_name,
      discord_display_name = EXCLUDED.discord_display_name,
      role = EXCLUDED.role,
      last_active = NOW()
  `
  if (!hotsBattleTag) {
    return
  }
  await handleAddHotsAccount(interaction, discordId, hotsBattleTag)
}

export function getPlayerFromRow(
  flatPlayer: FlatPlayer,
  hotsAccountsRow: HotsAccountRow[]
): Player {
  cachePlayerDisplayName(
    flatPlayer.discord_id,
    flatPlayer.discord_display_name,
    flatPlayer.discord_global_name,
    flatPlayer.discord_name
  )

  const accountsNew = hotsAccountsRow
    .filter(account => {
      if (flatPlayer.discord_id) {
        return account.discord_id === flatPlayer.discord_id
      }
      if (flatPlayer.hots_battle_tag) {
        return account.hots_battle_tag.toLowerCase() === flatPlayer.hots_battle_tag.toLowerCase()
      }
      return false
    })
    .map(account => getAccountFromAccountRow(account))

  const isActive = typeof flatPlayer.active === 'boolean' ? flatPlayer.active : flatPlayer.active === 1

  return {
    discordId: flatPlayer.discord_id,
    usernames: {
      accounts: accountsNew,
      discordName: flatPlayer.discord_name,
      discordGlobalName: flatPlayer.discord_global_name,
      discordDisplayName: flatPlayer.discord_display_name,
    },
    role: flatPlayer.role,
    active: isActive,
    team: flatPlayer.team ?? null,
    lobbyRank: flatPlayer.lobby_rank ?? NaN,
    draftOrder: flatPlayer.draft_order ?? NaN,
    adjustment: flatPlayer.adjustment,
    mmr: flatPlayer.mmr,
    customGames: flatPlayer.custom_games ?? undefined,
    customWinRate: flatPlayer.custom_win_rate ?? undefined,
    lastActive: flatPlayer.last_active instanceof Date ? flatPlayer.last_active : new Date(flatPlayer.last_active),
  }
}

function getAccountFromAccountRow(account: HotsAccountRow): HotsAccount {
  return {
    id: account.id,
    hotsBattleTag: account.hots_battle_tag,
    isPrimary: Boolean(account.is_primary),
    realIdName: account.real_id_name ?? null,
    ownerDiscordId: account.owner_discord_id ?? null,
    hpQmMMR: account.hp_qm_mmr,
    hpSlMMR: account.hp_sl_mmr,
    hpArMMR: account.hp_ar_mmr,
    hpQmGames: account.hp_qm_games,
    hpSlGames: account.hp_sl_games,
    hpArGames: account.hp_ar_games,
  }
}

/**
 * Retrieves all active players from the database, with their HotS accounts.
 */
export async function getActivePlayers(guildId: string): Promise<Player[]> {
  const rows = await sql<FlatPlayer[]>`
    SELECT
      lp.discord_id,
      COALESCE(ha.hots_battle_tag, '') AS hots_battle_tag,
      COALESCE(p.discord_name, ha.hots_battle_tag, 'Guest') AS discord_name,
      COALESCE(p.discord_global_name, ha.hots_battle_tag, 'Guest') AS discord_global_name,
      COALESCE(p.discord_display_name, ha.hots_battle_tag, 'Guest') AS discord_display_name,
      COALESCE(lp.role, p.role) AS role,
      lp.active,
      lp.team,
      p.adjustment,
      lp.lobby_rank,
      lp.draft_order,
      COALESCE(p.last_active, NOW()) AS last_active,
      COALESCE(v.mmr, 0) AS mmr,
      v.custom_games,
      v.custom_win_rate
    FROM lobby_players lp
    LEFT JOIN players p ON lp.discord_id = p.discord_id
    LEFT JOIN v_player_mmr v ON (v.discord_id = lp.discord_id) OR (lp.discord_id IS NULL AND v.hots_account_id = lp.hots_account_id)
    LEFT JOIN hots_accounts ha ON ha.id = COALESCE(
      lp.hots_account_id,
      (SELECT id FROM hots_accounts WHERE discord_id = lp.discord_id ORDER BY is_primary DESC, id ASC LIMIT 1)
    )
    WHERE lp.guild_id = ${guildId} AND lp.active = TRUE
    ORDER BY lp.lobby_rank, lp.active, lp.team
  `

  if (rows.length === 0) {
    return []
  }

  const activeDiscordIds = rows.map(r => r.discord_id).filter((id): id is string => Boolean(id))
  const activeTags = rows.map(r => r.hots_battle_tag).filter(Boolean)

  const allAccounts = await sql<
    Array<
      HotsAccountRow & {
        owner_display_name?: string | null
        owner_global_name?: string | null
        owner_name?: string | null
      }
    >
  >`
    SELECT
      ha.id,
      ha.discord_id,
      ha.hots_battle_tag,
      ha.is_primary,
      ha.hp_qm_mmr,
      ha.hp_sl_mmr,
      ha.hp_ar_mmr,
      ha.hp_qm_games,
      ha.hp_sl_games,
      ha.hp_ar_games,
      ha.real_id_name,
      ha.owner_discord_id,
      op.discord_display_name AS owner_display_name,
      op.discord_global_name AS owner_global_name,
      op.discord_name AS owner_name
    FROM hots_accounts ha
    LEFT JOIN players op ON ha.owner_discord_id = op.discord_id
    WHERE (
      ${activeDiscordIds.length > 0 ? sql`ha.discord_id IN ${sql(activeDiscordIds)}` : sql`FALSE`}
      OR ${activeTags.length > 0 ? sql`LOWER(ha.hots_battle_tag) IN ${sql(activeTags.map(t => t.toLowerCase()))}` : sql`FALSE`}
    )
  `

  for (const acc of allAccounts) {
    if (acc.owner_discord_id) {
      cachePlayerDisplayName(acc.owner_discord_id, acc.owner_display_name, acc.owner_global_name, acc.owner_name)
    }
  }

  const validAccounts = await filterActiveSubstitutedAccounts(allAccounts, guildId)

  const seenPlayerKeys = new Set<string>()
  const uniquePlayers: Player[] = []
  for (const row of rows) {
    const key =
      row.discord_id ??
      (row.hots_battle_tag ? `tag:${row.hots_battle_tag.toLowerCase()}` : `guest:${uniquePlayers.length}`)
    if (seenPlayerKeys.has(key)) {
      continue
    }
    seenPlayerKeys.add(key)
    uniquePlayers.push(getPlayerFromRow(row, validAccounts))
  }
  return uniquePlayers
}

export async function getAllRegisteredHotSAccounts(guildId: string): Promise<RegisteredPlayerAccount[]> {
  type QueryRow = {
    id: number
    discord_id: string | null
    hots_battle_tag: string
    discord_display_name: string | null
    discord_name: string | null
    discord_global_name: string | null
    real_id_name: string | null
    owner_discord_id: string | null
    owner_display_name: string | null
    owner_name: string | null
    owner_global_name: string | null
  }

  const rows = await sql<QueryRow[]>`
    SELECT
      ha.id,
      ha.discord_id,
      ha.hots_battle_tag,
      ha.real_id_name,
      ha.owner_discord_id,
      COALESCE(p.discord_display_name, ha.hots_battle_tag) AS discord_display_name,
      COALESCE(p.discord_name, ha.hots_battle_tag) AS discord_name,
      COALESCE(p.discord_global_name, ha.hots_battle_tag) AS discord_global_name,
      op.discord_display_name AS owner_display_name,
      op.discord_name AS owner_name,
      op.discord_global_name AS owner_global_name
    FROM hots_accounts ha
    LEFT JOIN players p ON ha.discord_id = p.discord_id
    LEFT JOIN players op ON ha.owner_discord_id = op.discord_id
  `

  for (const r of rows) {
    cachePlayerDisplayName(r.discord_id, r.discord_display_name, r.discord_global_name, r.discord_name)
    if (r.owner_discord_id) {
      cachePlayerDisplayName(r.owner_discord_id, r.owner_display_name, r.owner_global_name, r.owner_name)
    }
  }

  const activeSubs = guildId ? await getActiveSubstitutions(guildId) : []
  const subMap = new Map<string, string>()
  for (const s of activeSubs) {
    subMap.set(s.hotsBattleTag.toLowerCase(), s.substituteDiscordId)
    const prefix = s.hotsBattleTag.split('#')[0].toLowerCase()
    subMap.set(prefix, s.substituteDiscordId)
  }

  const result: RegisteredPlayerAccount[] = []
  for (const r of rows) {
    const lowerTag = r.hots_battle_tag.toLowerCase()
    const prefix = lowerTag.split('#')[0]
    const subDiscordId = subMap.get(lowerTag) || subMap.get(prefix)

    const shouldInclude = subDiscordId ? r.discord_id === subDiscordId : !r.owner_discord_id
    if (shouldInclude) {
      result.push({
        id: r.id,
        discordId: r.discord_id,
        hotsBattleTag: r.hots_battle_tag,
        discordDisplayName: r.discord_display_name ?? r.hots_battle_tag,
        discordName: r.discord_name ?? r.hots_battle_tag,
        discordGlobalName: r.discord_global_name ?? r.hots_battle_tag,
        realIdName: r.real_id_name ?? null,
        ownerDiscordId: r.owner_discord_id ?? null,
        ownerDisplayName: r.owner_display_name ?? null,
      })
    }
  }

  return result
}

export async function findPlayersByHotSAccount(query: string, guildId: string): Promise<HotSAccountMatch[]> {
  const trimmed = query.trim()
  if (!trimmed) {
    return []
  }

  let accounts: HotsAccountRow[] = []
  const prefixPattern = `${trimmed}%`
  const hashPrefixPattern = `${trimmed}#%`
  const substringPattern = `%${trimmed}%`

  if (trimmed.includes('#')) {
    accounts = await sql<HotsAccountRow[]>`
      SELECT *
      FROM hots_accounts
      WHERE LOWER(hots_battle_tag) = LOWER(${trimmed})
    `

    if (accounts.length === 0) {
      accounts = await sql<HotsAccountRow[]>`
        SELECT *
        FROM hots_accounts
        WHERE hots_battle_tag ILIKE ${prefixPattern}
      `
    }
  } else {
    accounts = await sql<HotsAccountRow[]>`
      SELECT *
      FROM hots_accounts
      WHERE hots_battle_tag ILIKE ${hashPrefixPattern}
         OR LOWER(hots_battle_tag) = LOWER(${trimmed})
         OR LOWER(real_id_name) = LOWER(${trimmed})
    `

    if (accounts.length === 0) {
      accounts = await sql<HotsAccountRow[]>`
        SELECT *
        FROM hots_accounts
        WHERE hots_battle_tag ILIKE ${prefixPattern}
           OR real_id_name ILIKE ${prefixPattern}
      `
    }

    if (accounts.length === 0) {
      accounts = await sql<HotsAccountRow[]>`
        SELECT *
        FROM hots_accounts
        WHERE hots_battle_tag ILIKE ${substringPattern}
           OR real_id_name ILIKE ${substringPattern}
      `
    }
  }

  accounts = await filterActiveSubstitutedAccounts(accounts, guildId)

  const results: HotSAccountMatch[] = []
  const seenDiscordIds = new Set<string>()
  const seenAccountIds = new Set<number>()
  const qLower = trimmed.toLowerCase()

  for (const accRow of accounts) {
    if (accRow.discord_id) {
      if (seenDiscordIds.has(accRow.discord_id)) continue
      seenDiscordIds.add(accRow.discord_id)

      const player = await getPlayerByDiscordId(accRow.discord_id, guildId)
      if (!player) continue

      const matchedAccounts = (player.usernames.accounts || []).filter(acc => {
        const tagLower = acc.hotsBattleTag.toLowerCase()
        const realLower = acc.realIdName?.toLowerCase()
        if (trimmed.includes('#')) {
          return tagLower === qLower || tagLower.startsWith(qLower)
        }
        const tagPrefix = tagLower.split('#')[0]
        return (
          tagPrefix === qLower ||
          tagLower === qLower ||
          realLower === qLower ||
          tagLower.includes(qLower) ||
          (realLower !== undefined && realLower !== null && realLower.includes(qLower))
        )
      })

      if (matchedAccounts.length === 0) continue

      results.push({
        player,
        matchedAccounts,
      })
    } else {
      if (seenAccountIds.has(accRow.id)) continue
      seenAccountIds.add(accRow.id)

      const hotsAcc = getAccountFromAccountRow(accRow)
      const guestPlayer = await buildGuestPlayer(accRow, guildId)
      if (guestPlayer) {
        results.push({
          player: guestPlayer,
          matchedAccounts: [hotsAcc],
        })
      }
    }
  }

  return results
}

export async function getAllPlayers(
  page: number,
  sort: 'mmr' | 'alphabetical',
  ascending: boolean
): Promise<Player[]> {
  const offset = (page ?? 0) * 20
  const rows = await sql<FlatPlayer[]>`
    SELECT
      p.*,
      '' AS hots_battle_tag,
      FALSE AS active,
      NULL::int AS team,
      NULL::int AS lobby_rank,
      NULL::int AS draft_order,
      COALESCE(v.mmr, 0) AS mmr,
      v.custom_games,
      v.custom_win_rate
    FROM players p
    LEFT JOIN v_player_mmr v ON p.discord_id = v.discord_id
    ORDER BY
      CASE WHEN ${sort} = 'mmr' AND ${ascending} THEN v.mmr END DESC NULLS LAST,
      CASE WHEN ${sort} = 'mmr' AND NOT ${ascending} THEN v.mmr END ASC NULLS LAST,
      CASE WHEN ${sort} = 'alphabetical' AND NOT ${ascending} THEN p.discord_display_name END DESC,
      p.discord_display_name ASC
    LIMIT 20 OFFSET ${offset}
  `

  if (rows.length === 0) {
    return []
  }

  const discordIds = rows.map(r => r.discord_id).filter((id): id is string => Boolean(id))
  const accounts = discordIds.length > 0
    ? await sql<HotsAccountRow[]>`
        SELECT
          id,
          discord_id,
          hots_battle_tag,
          is_primary,
          hp_qm_mmr,
          hp_sl_mmr,
          hp_ar_mmr,
          hp_qm_games,
          hp_sl_games,
          hp_ar_games,
          real_id_name,
          owner_discord_id
        FROM hots_accounts
        WHERE discord_id IN ${sql(discordIds)}
      `
    : []

  return rows.map<Player>(row => getPlayerFromRow(row, accounts))
}

export interface NearbyPlayersResult {
  players: Player[]
  targetRank: number
  totalCount: number
}

/**
 * Retrieves players sorted by MMR centered on a target player (up to 5 above, target player, up to 5 below).
 */
export async function getNearbyPlayersByMmr(
  targetDiscordId: string,
  aboveCount = 5,
  belowCount = 5
): Promise<NearbyPlayersResult | null> {
  const rows = await sql<FlatPlayer[]>`
    SELECT
      p.*,
      '' AS hots_battle_tag,
      FALSE AS active,
      NULL::int AS team,
      NULL::int AS lobby_rank,
      NULL::int AS draft_order,
      COALESCE(v.mmr, 0) AS mmr,
      v.custom_games,
      v.custom_win_rate
    FROM players p
    LEFT JOIN v_player_mmr v ON p.discord_id = v.discord_id
    ORDER BY COALESCE(v.mmr, 0) DESC, p.discord_display_name ASC
  `

  if (rows.length === 0) {
    return null
  }

  const targetIndex = rows.findIndex(r => r.discord_id === targetDiscordId)
  if (targetIndex === -1) {
    return null
  }

  const startIndex = Math.max(0, targetIndex - aboveCount)
  const endIndex = Math.min(rows.length, targetIndex + 1 + belowCount)
  const windowRows = rows.slice(startIndex, endIndex)

  const discordIds = windowRows.map(r => r.discord_id).filter((id): id is string => Boolean(id))
  const accounts =
    discordIds.length > 0
      ? await sql<HotsAccountRow[]>`
          SELECT *
          FROM hots_accounts
          WHERE discord_id IN ${sql(discordIds)}
        `
      : []

  const players = windowRows.map<Player>((row, idx) => {
    const p = getPlayerFromRow(row, accounts)
    p.lobbyRank = startIndex + idx + 1
    return p
  })

  return {
    players,
    targetRank: targetIndex + 1,
    totalCount: rows.length,
  }
}

/**
 * Triggers a background MMR fetch from Heroes Profile for an account (guest or registered).
 * Updates the database and refreshes the lobby message when finished.
 */
export async function triggerAccountMmrFetch(battleTag: string, guildId?: string): Promise<void> {
  if (isFetchingMmr(battleTag)) return
  addFetchingMmrTag(battleTag)

  try {
    const profileData = await getHeroesProfileData(battleTag)
    if (profileData) {
      const qmMmr = profileData.qmMmr
      const slMmr = profileData.slMmr
      const arMmr = profileData.arMmr
      const qmGames = profileData.qmGames
      const slGames = profileData.slGames
      const arGames = profileData.arGames
      await sql`
        UPDATE hots_accounts SET
          hp_region = ${profileData.region},
          hp_blizz_id = ${String(profileData.blizz_id)},
          hp_qm_mmr = ${qmMmr},
          hp_sl_mmr = ${slMmr},
          hp_ar_mmr = ${arMmr},
          hp_qm_games = ${qmGames},
          hp_sl_games = ${slGames},
          hp_ar_games = ${arGames},
          updated_at = NOW()
        WHERE LOWER(hots_battle_tag) = LOWER(${battleTag})
      `
    } else {
      await sql`
        UPDATE hots_accounts SET
          updated_at = NOW()
        WHERE LOWER(hots_battle_tag) = LOWER(${battleTag})
      `
    }
  } catch (err) {
    console.error(`Error fetching HP MMR for ${battleTag}:`, err)
    await sql`
      UPDATE hots_accounts SET
        updated_at = NOW()
      WHERE LOWER(hots_battle_tag) = LOWER(${battleTag})
    `.catch(e => console.error(`Error updating updated_at for ${battleTag}:`, e))
  } finally {
    removeFetchingMmrTag(battleTag)
    if (guildId) {
      try {
        clearActivePlayersCache(guildId)
        clearResolvedAccountCache()
        await updateLobbyMessage(guildId)
      } catch (e) {
        console.error('Error updating lobby message after MMR fetch:', e)
      }
    }
  }
}

export async function handleAddHotsAccount(
  interaction:
    | ChatInputCommandInteraction<CacheType>
    | ButtonInteraction<CacheType>
    | ModalSubmitInteraction<CacheType>
    | undefined,
  discordId: string,
  hotsBattleTag: string
): Promise<false | Player> {
  let hotsAccountAlreadyExists = false
  let userIsSelf = false
  const validationResult = validateBattleTag(hotsBattleTag)
  if (!validationResult.isValid) {
    await safeReply(interaction, {
      content: `You must provide a valid Heroes of the Storm battle tag in the format \`Name#1234\`.\nYou provided: \`${hotsBattleTag}\`
${validationResult.errors.join('\n')}
${validationResult.rules}
      `,
      flags: MessageFlags.Ephemeral,
    })
    return false
  }

  const existingAccounts = await sql<Array<{ discord_id: string; hots_battle_tag: string }>>`
    SELECT discord_id, hots_battle_tag
    FROM hots_accounts
    WHERE LOWER(hots_battle_tag) = LOWER(${hotsBattleTag})
      AND discord_id IS NOT NULL
      AND discord_id != ${discordId}
    LIMIT 1
  `
  const existingAccount = existingAccounts[0]
  if (existingAccount) {
    await safeReply(interaction, {
      content: `This HotS account is already in use by another player: <@${existingAccount.discord_id
        }>\nare you sure this is ${discordId === interaction?.user.id ? 'your' : '<@' + discordId + ">'s"} account...`,
      files: [
        {
          attachment: 'https://i.giphy.com/media/hPkJ9Q7dh6itMoMIMC/giphy.gif',
          name: 'is it.gif',
        },
      ],
      flags: MessageFlags.Ephemeral,
    })
    return false
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return false

  const player = await getPlayerByDiscordId(discordId, guildId)
  if (!player) {
    await safeReply(interaction, {
      content: 'Player not found in database',
      flags: MessageFlags.Ephemeral,
    })
    return false
  }

  try {
    await interaction?.deferReply({
      flags: MessageFlags.Ephemeral,
      withResponse: true,
    })
  } catch (error) {
    if (!error) {
      console.error('Error deferring reply:', error)
    }
  }

  addFetchingMmrTag(hotsBattleTag)
  let profileData
  try {
    profileData = await getHeroesProfileData(hotsBattleTag)
  } finally {
    removeFetchingMmrTag(hotsBattleTag)
  }

  if (profileData && profileData.qmGames === -1 && profileData.slGames === -1 && profileData.arGames === -1) {
    await handleAccountNotFound(interaction, discordId, hotsBattleTag)
    return false
  }

  userIsSelf = discordId === interaction?.user.id

  type ExistingAccountRow = {
    id: number
    discord_id: string | null
    is_primary: boolean
  }

  const currentAccounts = await sql<ExistingAccountRow[]>`
    SELECT id, discord_id, is_primary
    FROM hots_accounts
    WHERE LOWER(hots_battle_tag) = LOWER(${hotsBattleTag}) AND owner_discord_id IS NULL
    LIMIT 1
  `
  const currentAccount = currentAccounts[0]

  if (currentAccount && currentAccount.discord_id === discordId) {
    hotsAccountAlreadyExists = true
  }

  try {
    const isPrimary =
      currentAccount && currentAccount.discord_id === discordId
        ? Boolean(currentAccount.is_primary)
        : !player.usernames.accounts || player.usernames.accounts.length <= 1

    const qmMmr = profileData?.qmMmr ?? 0
    const slMmr = profileData?.slMmr ?? 0
    const arMmr = profileData?.arMmr ?? 0
    const hpRegion = profileData?.region ?? null
    const hpBlizzId = profileData?.blizz_id != null ? String(profileData.blizz_id) : null
    const hpQmGames = profileData?.qmGames ?? 0
    const hpSlGames = profileData?.slGames ?? 0
    const hpArGames = profileData?.arGames ?? 0

    await sql.begin(async tx => {
      let accountId: number

      if (currentAccount) {
        await tx`
          UPDATE hots_accounts SET
            discord_id = ${discordId},
            hots_battle_tag = ${hotsBattleTag},
            is_primary = ${isPrimary},
            hp_region = ${hpRegion},
            hp_blizz_id = ${hpBlizzId},
            hp_qm_mmr = ${qmMmr},
            hp_sl_mmr = ${slMmr},
            hp_ar_mmr = ${arMmr},
            hp_qm_games = ${hpQmGames},
            hp_sl_games = ${hpSlGames},
            hp_ar_games = ${hpArGames},
            updated_at = NOW()
          WHERE id = ${currentAccount.id}
        `
        accountId = currentAccount.id
      } else {
        const inserted = await tx<Array<{ id: number }>>`
          INSERT INTO hots_accounts (
            discord_id, hots_battle_tag, is_primary, hp_region, hp_blizz_id,
            hp_qm_mmr, hp_sl_mmr, hp_ar_mmr, hp_qm_games, hp_sl_games, hp_ar_games
          ) VALUES (
            ${discordId}, ${hotsBattleTag}, ${isPrimary}, ${hpRegion}, ${hpBlizzId},
            ${qmMmr}, ${slMmr}, ${arMmr}, ${hpQmGames}, ${hpSlGames}, ${hpArGames}
          )
          RETURNING id
        `
        accountId = inserted[0].id
      }

      await tx`
        UPDATE lobby_players
        SET hots_account_id = ${accountId}
        WHERE discord_id = ${discordId} AND (hots_account_id IS NULL OR hots_account_id = ${accountId})
      `

      await tx`
        DELETE FROM lobby_players
        WHERE hots_account_id = ${accountId} AND discord_id IS NULL
          AND guild_id IN (SELECT guild_id FROM lobby_players WHERE discord_id = ${discordId})
      `

      await tx`
        UPDATE lobby_players
        SET discord_id = ${discordId}
        WHERE hots_account_id = ${accountId} AND discord_id IS NULL
      `
    })

    if (profileData?.detectedRoles && !player.role) {
      await setPlayerRole(discordId, guildId, profileData.detectedRoles)
      player.role = profileData.detectedRoles
    }
    clearActivePlayersCache(guildId)
    clearResolvedAccountCache()
    if (interaction) {
      await updateLobbyMessage(guildId, interaction)
    }
    const noticeText = !profileData
      ? '\n*(Note: Heroes Profile could not be reached to fetch MMR, but the account has been registered!)*'
      : ''
    if (hotsAccountAlreadyExists) {
      const reasonText = profileData?.detectedRolesReason ? `\n(${profileData.detectedRolesReason})` : ''
      const roleText =
        profileData?.detectedRoles && player.role === profileData.detectedRoles
          ? `\nAuto-populated role: ${getPlayerRolesFormatted(player.role)}${reasonText}`
          : ''
      const content = `${userIsSelf ? 'You' : '<@' + discordId + '>'} already ${userIsSelf ? 'have' : 'has'
        } this HotS account linked: \`${hotsBattleTag}\`\n\nHowever, ${userIsSelf ? 'your' : '<@' + discordId + '>' + "'s"
        } Heroes profile data and BattleTag formatting have been updated.${roleText}${noticeText}`
      try {
        await interaction?.editReply({
          content,
        })
      } catch {
        await safeReply(interaction, {
          content,
          flags: MessageFlags.Ephemeral,
        })
      }
    } else {
      const reasonText = profileData?.detectedRolesReason ? `\n(${profileData.detectedRolesReason})` : ''
      const roleText =
        profileData?.detectedRoles && player.role === profileData.detectedRoles
          ? `\nAuto-populated role: ${getPlayerRolesFormatted(player.role)}${reasonText}`
          : ''
      await safeReply(interaction, {
        content: `${discordId === interaction?.user.id ? 'Your' : '<@' + discordId + ">'s"
          } HotS account has been added: \`${hotsBattleTag}\`${roleText}${noticeText}`,
        flags: MessageFlags.Ephemeral,
      })
    }
  } catch (error) {
    console.error('Error adding HotS account:', error)
    await safeReply(interaction, {
      content: `Failed to add HotS account \`${hotsBattleTag}\`.\nPlease try again later.`,
      flags: MessageFlags.Ephemeral,
    })
    await safeReply(interaction, {
      content: `<@${discordId}> Failed to add HotS account \`${hotsBattleTag}\``,
    })
    return false
  }
  return player
}

export async function handleDeleteHotsAccount(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  discordId: string,
  hotsBattleTag: string | null
): Promise<void> {
  if (!hotsBattleTag) {
    await deletePlayerHotsAccounts(discordId)
    await safeReply(interaction, {
      content: `ALL Heroes of the Storm accounts associated with <@${discordId}> have been deleted.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  const deleted = await deleteHotsAccount(hotsBattleTag)
  if (deleted > 0) {
    await safeReply(interaction, {
      content: `Heroes of the Storm account \`${hotsBattleTag}\` has been deleted.`,
      flags: MessageFlags.Ephemeral,
    })
  } else {
    await safeReply(interaction, {
      content: `Failed to delete Heroes of the Storm account \`${hotsBattleTag}\`. It may not exist.`,
      flags: MessageFlags.Ephemeral,
    })
  }
}

async function handleAccountNotFound(
  interaction:
    | ChatInputCommandInteraction<CacheType>
    | ButtonInteraction<CacheType>
    | ModalSubmitInteraction<CacheType>
    | undefined,
  discordId: string,
  hotsBattleTag: string
): Promise<void> {
  const guildId = interaction ? await requireGuildId(interaction) : null
  if (!guildId) return
  await deletePlayerHotsAccounts(discordId)
  if (interaction) {
    await updateLobbyMessage(guildId, interaction)
  }
  const joinBtn = new ButtonBuilder()
    .setCustomId(`${CommandIds.JOIN_WITH_BATTLE_TAG}_${hotsBattleTag}`)
    .setLabel('Try Again')
    .setStyle(ButtonStyle.Primary)
  await safeReply(interaction, {
    content: `heroesprofile could not find data for \`${hotsBattleTag}\`\nare you sure this is the right battle tag for ${discordId === interaction?.user.id ? 'your' : '<@' + discordId + ">'s"
      } account?`,
    flags: MessageFlags.Ephemeral,
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn)],
  })
}

export async function deletePlayer(
  discordId: string
): Promise<{ playersDeleted: number; hotsAccountsDeleted: number }> {
  let deletedPlayer = 0
  let deletedAccounts = 0

  await sql.begin(async tx => {
    const accResult = await tx`DELETE FROM hots_accounts WHERE discord_id = ${discordId}`
    deletedAccounts = accResult.count
    const playerResult = await tx`DELETE FROM players WHERE discord_id = ${discordId}`
    deletedPlayer = playerResult.count
  })

  clearActivePlayersCache()
  clearResolvedAccountCache()

  return {
    playersDeleted: deletedPlayer,
    hotsAccountsDeleted: deletedAccounts,
  }
}

export async function deletePlayerHotsAccounts(discordId: string): Promise<number> {
  const result = await sql`DELETE FROM hots_accounts WHERE discord_id = ${discordId}`
  clearActivePlayersCache()
  clearResolvedAccountCache()
  return result.count
}

export async function deleteHotsAccount(hotsBattleTag: string): Promise<number> {
  const result = await sql`DELETE FROM hots_accounts WHERE LOWER(hots_battle_tag) = LOWER(${hotsBattleTag})`
  clearActivePlayersCache()
  clearResolvedAccountCache()
  return result.count
}

export async function setHotsAccountRealIdName(hotsBattleTag: string, realIdName: string | null): Promise<boolean> {
  const result = await sql`
    UPDATE hots_accounts
    SET real_id_name = ${realIdName}
    WHERE LOWER(hots_battle_tag) = LOWER(${hotsBattleTag})
  `
  return result.count > 0
}

export async function getHotsAccountByBattleTag(
  hotsBattleTag: string
): Promise<(HotsAccountRow & { discord_display_name?: string }) | undefined> {
  const rows = await sql<Array<HotsAccountRow & { discord_display_name?: string }>>`
    SELECT ha.*, p.discord_display_name
    FROM hots_accounts ha
    LEFT JOIN players p ON ha.discord_id = p.discord_id
    WHERE LOWER(ha.hots_battle_tag) = LOWER(${hotsBattleTag})
    LIMIT 1
  `
  return rows[0]
}

export async function setPrimaryAccount(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  guildId: string,
  discordId: string,
  hotsBattleTag: string,
  messageId: string,
  channelId: string
): Promise<boolean> {
  const { success, message, player } = await updatePrimaryAccountInDb(guildId, discordId, hotsBattleTag)
  if (!success || !player?.usernames.accounts) {
    await safeReply(interaction, {
      content: message,
      flags: MessageFlags.Ephemeral,
    })
    return false
  }

  if (!interaction.isButton()) {
    await safeReply(interaction, {
      content: `${discordId === interaction?.user.id ? 'Your' : '<@' + discordId + ">'s"
        } primary HotS account has been set to \`${hotsBattleTag}\`.`,
      flags: MessageFlags.Ephemeral,
    })
    return true
  }
  const buttonUpdateSuccess = await updateButtonInterface(interaction, player, discordId, messageId, channelId)
  if (!buttonUpdateSuccess.success) {
    await safeReply(interaction, {
      ...buttonUpdateSuccess.messageOptions,
      flags: MessageFlags.Ephemeral,
    })
    return false
  }

  return true
}

async function updateButtonInterface(
  interaction: ButtonInteraction<CacheType>,
  player: Player,
  discordId: string,
  messageId: string,
  channelId: string
): Promise<{ success: boolean; messageOptions: InteractionReplyOptions }> {
  const accounts = player.usernames.accounts
  if (!accounts?.length) {
    return {
      success: false,
      messageOptions: { content: 'No accounts to update' },
    }
  }
  try {
    const prevInteraction = getStoredInteraction(messageId, channelId)
    if (!prevInteraction) {
      throw new Error('Previous interaction not found')
    }
    await prevInteraction.editReply({
      components: getAccountButtons(accounts, discordId, messageId, channelId),
    })
    await safeDeferUpdate(interaction)
    return { success: true, messageOptions: { content: '' } }
  } catch (error: unknown) {
    removeInteraction(messageId, channelId)
    console.error('Error updating button interface:', error)
    try {
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        const message = await interaction.deferReply({
          flags: MessageFlags.Ephemeral,
        })
        storeInteraction(message.id, interaction.channelId, interaction)
      }
      await safeReply(interaction, {
        content:
          'Previous interaction not found to update buttons\nPlease select the account to set as primary using the buttons below.',
        components: getAccountButtons(accounts, discordId, messageId, channelId),
      })
    } catch (fallbackError) {
      console.error('Failed fallback deferReply/safeReply:', fallbackError)
    }
    return { success: true, messageOptions: { content: '' } }
  }
}

export function getAccountButtons(
  accounts: HotsAccount[],
  discordId: string,
  messageId: string,
  channelId: string
): ActionRowBuilder<ButtonBuilder>[] {
  const buttons = accounts.map(account => {
    return new ButtonBuilder()
      .setCustomId(
        `${CommandIds.ADMIN}_${CommandIds.PRIMARY}_${discordId}_${account.hotsBattleTag}_${messageId}_${channelId}`
      )
      .setLabel(account.hotsBattleTag)
      .setStyle(account.isPrimary ? ButtonStyle.Primary : ButtonStyle.Secondary)
  })
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)]
}

async function updatePrimaryAccountInDb(
  guildId: string,
  discordId: string,
  hotsBattleTag: string
): Promise<{ success: boolean; message?: string; player?: Player }> {
  const result = await sql`
    UPDATE hots_accounts
    SET is_primary = CASE WHEN LOWER(hots_battle_tag) = LOWER(${hotsBattleTag}) THEN TRUE ELSE FALSE END
    WHERE discord_id = ${discordId}
  `
  if (result.count === 0) {
    return {
      success: false,
      message: `The specified Heroes of the Storm account \`${hotsBattleTag}\` was not found for this player.`,
    }
  }
  const player = await getPlayerByDiscordId(discordId, guildId)
  if (!player) {
    return {
      success: false,
      message: 'Player not found in database',
    }
  }
  if (!player.usernames.accounts || player.usernames.accounts.length === 0) {
    return {
      success: false,
      message: 'This player has no Heroes of the Storm accounts linked.',
    }
  }
  return { success: true, player }
}

/**
 * Gets a player by their Discord ID, optionally joining lobby state for a guild.
 */
export async function getPlayerByDiscordId(
  discordId: string | null | undefined,
  guildId: string
): Promise<Player | undefined> {
  if (!discordId) return undefined
  const rows = await sql<FlatPlayer[]>`
    SELECT
      p.*,
      '' AS hots_battle_tag,
      COALESCE(lp.active, FALSE) AS active,
      lp.team,
      lp.lobby_rank,
      lp.draft_order,
      COALESCE(v.mmr, 0) AS mmr,
      v.custom_games,
      v.custom_win_rate
    FROM players p
    LEFT JOIN v_player_mmr v ON p.discord_id = v.discord_id
    LEFT JOIN lobby_players lp ON p.discord_id = lp.discord_id AND lp.guild_id = ${guildId}
    WHERE p.discord_id = ${discordId}
    LIMIT 1
  `

  const row = rows[0]
  if (!row) {
    return undefined
  }
  const accounts = await sql<
    Array<
      HotsAccountRow & {
        owner_display_name?: string | null
        owner_global_name?: string | null
        owner_name?: string | null
      }
    >
  >`
    SELECT
      ha.*,
      op.discord_display_name AS owner_display_name,
      op.discord_global_name AS owner_global_name,
      op.discord_name AS owner_name
    FROM hots_accounts ha
    LEFT JOIN players op ON ha.owner_discord_id = op.discord_id
    WHERE ha.discord_id = ${discordId}
  `

  for (const acc of accounts) {
    if (acc.owner_discord_id) {
      cachePlayerDisplayName(acc.owner_discord_id, acc.owner_display_name, acc.owner_global_name, acc.owner_name)
    }
  }

  const validAccounts = await filterActiveSubstitutedAccounts(accounts, guildId)
  return getPlayerFromRow(row, validAccounts)
}

/**
 * Extracts numeric account ID from an identifier if it's 'hotsRowId:<id>' or 'tag:<tag>'.
 */
export async function getAccountRowIdFromIdentifier(identifier: string): Promise<number | null> {
  if (identifier.startsWith(PlayerIdPrefix.HOTS_ROW_ID)) {
    const id = parseInt(identifier.slice(PlayerIdPrefix.HOTS_ROW_ID.length), 10)
    return isNaN(id) ? null : id
  }
  if (identifier.startsWith(PlayerIdPrefix.TAG)) {
    const cleanTag = identifier.slice(PlayerIdPrefix.TAG.length)
    const rows = await sql<Array<{ id: number }>>`
      SELECT id
      FROM hots_accounts
      WHERE LOWER(hots_battle_tag) = LOWER(${cleanTag}) AND owner_discord_id IS NULL
      LIMIT 1
    `
    return rows[0]?.id ?? null
  }
  return null
}

/**
 * Returns a unique string identifier for a Player (discordId, 'hotsRowId:<id>', or 'tag:<tag>').
 */
export function getPlayerIdentifier(player: Player): string {
  if (player.discordId) return player.discordId
  const accId = player.usernames?.accounts?.[0]?.id
  if (accId) return `${PlayerIdPrefix.HOTS_ROW_ID}${accId}`
  const tag = player.usernames?.accounts?.[0]?.hotsBattleTag
  return tag ? `${PlayerIdPrefix.TAG}${tag}` : ''
}

async function buildGuestPlayer(account: HotsAccountRow, guildId: string): Promise<Player> {
  const rows = await sql<FlatPlayer[]>`
    SELECT
      NULL AS discord_id,
      ha.hots_battle_tag,
      ha.hots_battle_tag AS discord_name,
      ha.hots_battle_tag AS discord_global_name,
      ha.hots_battle_tag AS discord_display_name,
      COALESCE(lp.role, '') AS role,
      COALESCE(lp.active, FALSE) AS active,
      lp.team,
      0 AS adjustment,
      lp.lobby_rank,
      lp.draft_order,
      NOW() AS last_active,
      COALESCE(v.mmr, 0) AS mmr,
      v.custom_games,
      v.custom_win_rate
    FROM hots_accounts ha
    LEFT JOIN lobby_players lp ON lp.guild_id = ${guildId} AND lp.hots_account_id = ha.id
    LEFT JOIN v_player_mmr v ON v.hots_account_id = ha.id
    WHERE ha.id = ${account.id}
    LIMIT 1
  `
  const row = rows[0]
  if (!row) {
    const peakMmr = Math.max(account.hp_qm_mmr, account.hp_sl_mmr, account.hp_ar_mmr)
    return getPlayerFromRow(
      {
        discord_id: null,
        hots_battle_tag: account.hots_battle_tag,
        discord_name: account.hots_battle_tag,
        discord_global_name: account.hots_battle_tag,
        discord_display_name: account.hots_battle_tag,
        role: '',
        mmr: peakMmr,
        active: false,
        team: null,
        adjustment: null,
        lobby_rank: NaN,
        draft_order: NaN,
        last_active: new Date(),
      },
      [account]
    )
  }

  return getPlayerFromRow(row, [account])
}

/**
 * Gets a player by either hotsRowId ('hotsRowId:<id>'), BattleTag ('tag:<tag>'), or Discord ID.
 */
export async function getPlayerByIdentifier(identifier: string, guildId: string): Promise<Player | undefined> {
  if (!identifier) return undefined

  if (identifier.startsWith(PlayerIdPrefix.HOTS_ROW_ID)) {
    const rowId = parseInt(identifier.slice(PlayerIdPrefix.HOTS_ROW_ID.length), 10)
    if (isNaN(rowId)) return undefined

    const accounts = await sql<HotsAccountRow[]>`
      SELECT *
      FROM hots_accounts
      WHERE id = ${rowId}
      LIMIT 1
    `
    const account = accounts[0]
    if (!account) return undefined
    return account.discord_id
      ? await getPlayerByDiscordId(account.discord_id, guildId)
      : await buildGuestPlayer(account, guildId)
  }

  if (identifier.startsWith(PlayerIdPrefix.TAG)) {
    return await getPlayerByBattleTag(identifier.slice(PlayerIdPrefix.TAG.length), guildId)
  }

  return await getPlayerByDiscordId(identifier, guildId)
}

async function getPlayerByBattleTag(battleTag: string, guildId: string): Promise<Player | undefined> {
  const accounts = await sql<HotsAccountRow[]>`
    SELECT *
    FROM hots_accounts
    WHERE LOWER(hots_battle_tag) = LOWER(${battleTag}) AND owner_discord_id IS NULL
    LIMIT 1
  `
  const account = accounts[0]
  if (!account) return undefined
  return account.discord_id
    ? await getPlayerByDiscordId(account.discord_id, guildId)
    : await buildGuestPlayer(account, guildId)
}

/**
 * Sets the player role in the database.
 */
export async function setPlayerRole(
  identifier: string,
  guildId: string,
  role: string | null | undefined
): Promise<false | Player> {
  const roleToSet = role && role.trim() !== '' ? role : null
  const accId = await getAccountRowIdFromIdentifier(identifier)
  if (accId !== null) {
    await sql`
      UPDATE lobby_players
      SET role = ${roleToSet}
      WHERE guild_id = ${guildId} AND hots_account_id = ${accId}
    `
    const player = await getPlayerByIdentifier(`${PlayerIdPrefix.HOTS_ROW_ID}${accId}`, guildId)
    if (player) {
      player.role = roleToSet ?? undefined
      return player
    }
    return false
  }

  const player = await getPlayerByDiscordId(identifier, guildId)
  if (!player) {
    return false
  }
  await sql`UPDATE players SET role = ${roleToSet} WHERE discord_id = ${identifier}`
  await sql`
    UPDATE lobby_players
    SET role = ${roleToSet}
    WHERE guild_id = ${guildId} AND discord_id = ${identifier}
  `
  player.role = roleToSet ?? undefined
  return player
}

/**
 * Changes the player's HotS name in the database.
 */
export async function setPlayerName(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType> | ModalSubmitInteraction<CacheType>,
  guildId: string,
  discordId: string,
  hotsBattleTag: string
): Promise<false | Player> {
  if (!hotsBattleTag) {
    return false
  }
  const player = await getPlayerByDiscordId(discordId, guildId)
  if (!player) {
    return false
  }
  await savePlayer(interaction, discordId, player, hotsBattleTag)
  return player
}

/**
 * Sets the Discord user names for a player in the database.
 */
export async function setPlayerDiscordNames(
  discordId: string,
  guildId: string,
  discordData: DiscordUserNames
): Promise<boolean> {
  const { discordName, discordGlobalName, discordDisplayName } = discordData
  const player = await getPlayerByDiscordId(discordId, guildId)
  if (!player) {
    return false
  }
  cachePlayerDisplayName(discordId, discordDisplayName, discordGlobalName, discordName)
  await sql`
    UPDATE players
    SET discord_name = ${discordName},
        discord_global_name = ${discordGlobalName},
        discord_display_name = ${discordDisplayName}
    WHERE discord_id = ${discordId}
  `
  return true
}

/**
 * Sets the MMR adjustment for a player in the database.
 */
export async function setPlayerAdjustment(
  discordId: string,
  guildId: string,
  adjustment: number
): Promise<false | { previousAdjustment: number | null; updatedPlayer: Player }> {
  const existingPlayer = await getPlayerByDiscordId(discordId, guildId)
  if (!existingPlayer) {
    return false
  }
  const previousAdjustment = existingPlayer.adjustment
  const valueToStore = adjustment === 0 ? null : adjustment
  await sql`UPDATE players SET adjustment = ${valueToStore} WHERE discord_id = ${discordId}`
  clearActivePlayersCache(guildId)
  const updatedPlayer = await getPlayerByDiscordId(discordId, guildId)
  if (!updatedPlayer) {
    return false
  }
  return { previousAdjustment, updatedPlayer }
}

/**
 * Gets the roles of the player as a pretty string.
 */
export function getPlayerRolesFormatted(role?: string): string {
  if (!role) {
    return 'role not set'
  }
  return role
    .split('')
    .map(r => roleMap[r])
    .join(', ')
}

/**
 * Formats a player's display representation (e.g. `1: 3167` <@123456789> Battletag `Assassin, Flex`).
 */
export function formatPlayerDisplay(
  player: Player,
  guildId: string,
  options: FormatPlayerDisplayOptions = {}
): string {
  const includeMMR = options.includeMMR ?? true
  const mmr = player.mmr
  const hasRank = player.lobbyRank !== undefined && !Number.isNaN(player.lobbyRank)

  let rankStr = ''
  if (hasRank && includeMMR) {
    rankStr = `${player.lobbyRank}: ${mmr}`
  } else if (hasRank) {
    rankStr = `${player.lobbyRank}`
  } else if (includeMMR) {
    rankStr = `${mmr}`
  }

  const playerMention = player.discordId ? `<@${player.discordId}>` : `@${player.usernames.discordDisplayName}`
  let result = rankStr ? `\`${rankStr}\` ${playerMention}` : playerMention

  if (options.includeBattleTag) {
    const subAccount = player.usernames.accounts?.find(account => account.ownerDiscordId)
    const primaryAccount = subAccount ?? player.usernames.accounts?.find(account => account.isPrimary)
    if (primaryAccount) {
      result += ` ${primaryAccount.hotsBattleTag.replace(/#.*$/, '')}`
      if (primaryAccount.ownerDiscordId) {
        result += getSubstitutedAccountOwnerTag(primaryAccount.ownerDiscordId, guildId)
      }
    }
  }

  if (options.includeRole) {
    result += ` \`${getPlayerRolesFormatted(player.role)}\``
  }

  return result
}
