import { Collection, Guild } from 'discord.js'
import {
  DEFAULT_CUSTOMS_DEST_DIR,
  getDefaultImportRule,
  ReplayImportRule,
} from '../utils/importRules'
import { sql } from './db'

interface ImportRuleRow {
  guild_id: string
  rule_name: string
  replay_dest_dir: string
  allowed_modes: number[]
  roster_battle_tags: string[]
  require_party_for_matchmade: boolean
  min_party_size: number
}

const IMPORT_RULES_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS replay_import_rules (
    guild_id TEXT PRIMARY KEY,
    rule_name TEXT NOT NULL DEFAULT 'Custom Rule',
    replay_dest_dir TEXT NOT NULL DEFAULT '/mnt/Accounts/CustomsCruncher',
    allowed_modes INTEGER[] NOT NULL DEFAULT ARRAY[-1],
    roster_battle_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    require_party_for_matchmade BOOLEAN NOT NULL DEFAULT FALSE,
    min_party_size INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`

function mapRow(row: ImportRuleRow): ReplayImportRule {
  return {
    guildId: row.guild_id,
    ruleName: row.rule_name,
    replayDestDir: row.replay_dest_dir,
    allowedModes: (row.allowed_modes || [-1]).map(Number),
    rosterBattleTags: row.roster_battle_tags || [],
    requirePartyForMatchmade: Boolean(row.require_party_for_matchmade),
    minPartySize: Number(row.min_party_size) || 0,
  }
}

export async function initImportRulesTable(): Promise<void> {
  await sql.unsafe(IMPORT_RULES_SCHEMA_SQL)
  await sql`
    UPDATE replay_import_rules
    SET allowed_modes = array_append(allowed_modes, 50101)
    WHERE 50031 = ANY(allowed_modes) AND NOT (50101 = ANY(allowed_modes))
  `.catch(() => {})
}

initImportRulesTable().catch(err => {
  console.error('Error initializing replay_import_rules table:', err)
})

/**
 * Ensures the `replay_import_rules` table exists and migrates legacy `/mnt/*` paths if present.
 */
export async function seedImportRulesForGuilds(_guilds: Collection<string, Guild>): Promise<void> {
  await initImportRulesTable()

  await sql`
    UPDATE replay_import_rules
    SET replay_dest_dir = '/mnt/Accounts/BeerHots'
    WHERE replay_dest_dir = '/mnt/BeerHots'
  `
  await sql`
    UPDATE replay_import_rules
    SET replay_dest_dir = ${DEFAULT_CUSTOMS_DEST_DIR}
    WHERE replay_dest_dir = '/mnt/CustomsCruncher'
  `
}

export async function getImportRuleForGuild(guildId: string): Promise<ReplayImportRule> {
  const rows = await sql<ImportRuleRow[]>`
    SELECT *
    FROM replay_import_rules
    WHERE guild_id = ${guildId}
    LIMIT 1
  `
  return rows[0] ? mapRow(rows[0]) : getDefaultImportRule(guildId)
}

export async function getAllImportRules(): Promise<ReplayImportRule[]> {
  const rows = await sql<ImportRuleRow[]>`
    SELECT *
    FROM replay_import_rules
    ORDER BY rule_name ASC
  `
  return rows.map(mapRow)
}

export async function upsertImportRule(rule: ReplayImportRule): Promise<ReplayImportRule> {
  const rows = await sql<ImportRuleRow[]>`
    INSERT INTO replay_import_rules (
      guild_id,
      rule_name,
      replay_dest_dir,
      allowed_modes,
      roster_battle_tags,
      require_party_for_matchmade,
      min_party_size
    ) VALUES (
      ${rule.guildId},
      ${rule.ruleName},
      ${rule.replayDestDir},
      ${rule.allowedModes},
      ${rule.rosterBattleTags},
      ${rule.requirePartyForMatchmade},
      ${rule.minPartySize}
    )
    ON CONFLICT (guild_id) DO UPDATE SET
      rule_name = EXCLUDED.rule_name,
      replay_dest_dir = EXCLUDED.replay_dest_dir,
      allowed_modes = EXCLUDED.allowed_modes,
      roster_battle_tags = EXCLUDED.roster_battle_tags,
      require_party_for_matchmade = EXCLUDED.require_party_for_matchmade,
      min_party_size = EXCLUDED.min_party_size,
      updated_at = NOW()
    RETURNING *
  `
  return mapRow(rows[0])
}
