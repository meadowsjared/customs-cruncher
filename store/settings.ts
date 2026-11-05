import type { Guild } from 'discord.js'
import { DraftCoinState, SETTINGS_TABLE_SCHEMA_SQL, SettingRow } from '../types/settings'
import { sql } from './db'
import { CommandIds } from '../constants'

/**
 * Initializes the `settings` table in PostgreSQL.
 */
export async function initSettingsTable(): Promise<void> {
  await sql.unsafe(SETTINGS_TABLE_SCHEMA_SQL)
}

initSettingsTable().catch(error => {
  console.error('Error initializing settings table:', error)
})

/**
 * Retrieves a setting value by key and guild ID from the PostgreSQL `settings` table.
 * @param key The setting key
 * @param guildId The Discord guild ID (server ID)
 * @returns The string value or undefined if not found
 */
export async function getSetting(key: string, guildId: string): Promise<string | undefined> {
  if (!guildId) {
    console.log({ key, guildId }, 'guildId is required')
    return undefined
  }

  const rows = await sql<Pick<SettingRow, 'value'>[]>`
    SELECT value
    FROM settings
    WHERE guild_id = ${guildId} AND key = ${key}
    LIMIT 1
  `
  return rows[0]?.value
}

/**
 * Saves or updates a setting in the PostgreSQL `settings` table for a specific guild ID.
 * @param key The setting key
 * @param value The string value
 * @param guildId The Discord guild ID (server ID)
 */
export async function setSetting(key: string, value: string, guildId: string): Promise<boolean> {
  if (!guildId) {
    console.log({ key, guildId }, 'guildId is required')
    return false
  }

  await sql`
    INSERT INTO settings (guild_id, key, value, updated_at)
    VALUES (${guildId}, ${key}, ${value}, CURRENT_TIMESTAMP)
    ON CONFLICT (guild_id, key) DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = CURRENT_TIMESTAMP
  `
  return true
}

/**
 * Deletes a setting from the PostgreSQL `settings` table for a specific guild ID.
 * @param key The setting key
 * @param guildId The Discord guild ID (server ID)
 */
export async function deleteSetting(key: string, guildId: string | null): Promise<boolean> {
  if (!guildId) {
    console.log({ key, guildId }, 'guildId is required')
    return false
  }

  await sql`
    DELETE FROM settings
    WHERE guild_id = ${guildId} AND key = ${key}
  `
  return true
}

function isDraftCoinState(obj: unknown): obj is DraftCoinState {
  return typeof obj === 'object' && obj !== null && 'status' in obj && 'callerTeam' in obj
}

/**
 * Retrieves the draft coin toss state for a guild.
 */
export async function getDraftCoinState(guildId: string): Promise<DraftCoinState | null> {
  const raw = await getSetting('draft_coin_state', guildId)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (isDraftCoinState(parsed)) {
      return parsed
    }
  } catch (error) {
    console.error('Failed to parse draft_coin_state:', error)
  }
  return null
}

/**
 * Saves the draft coin toss state for a guild.
 */
export async function setDraftCoinState(guildId: string, state: DraftCoinState): Promise<boolean> {
  return await setSetting('draft_coin_state', JSON.stringify(state), guildId)
}

/**
 * Resets/deletes the draft coin toss state for a guild.
 */
export async function resetDraftCoinState(guildId: string): Promise<boolean> {
  return await deleteSetting('draft_coin_state', guildId)
}

/**
 * Retrieves the configured game host user ID for a guild.
 */
export async function getGameHostId(guildId: string): Promise<string | null> {
  const hostId = await getSetting(CommandIds.GAME_HOST_ID, guildId)
  return hostId ?? null
}

/**
 * Saves the configured game host user ID for a guild.
 */
export async function setGameHostId(guildId: string, hostId: string): Promise<boolean> {
  return await setSetting(CommandIds.GAME_HOST_ID, hostId, guildId)
}

/**
 * Clears the configured game host user ID for a guild.
 */
export async function clearGameHostId(guildId: string): Promise<boolean> {
  return await deleteSetting(CommandIds.GAME_HOST_ID, guildId)
}

/**
 * Resolves the game host user ID and display name for a guild,
 * falling back to the server owner if none is explicitly configured.
 */
export async function resolveGameHost(
  guildId: string,
  guild?: Guild | null
): Promise<{ id: string | null; displayName: string }> {
  const configuredId = await getGameHostId(guildId)
  const effectiveId = configuredId ?? guild?.ownerId ?? null
  if (effectiveId && guild) {
    const member = guild.members.cache.get(effectiveId)
    if (member) {
      return { id: effectiveId, displayName: member.displayName }
    }
  }
  return { id: effectiveId, displayName: 'Host' }
}

/**
 * Returns a Discord user mention string (<@userId>) for the server's game host,
 * or an empty string if neither host nor server owner can be resolved.
 */
export async function getGameHostPing(guildId: string, guild?: Guild | null): Promise<string> {
  const hostInfo = await resolveGameHost(guildId, guild)
  return hostInfo.id ? `<@${hostInfo.id}>` : ''
}
