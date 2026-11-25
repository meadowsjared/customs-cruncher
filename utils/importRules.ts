import type { ReplayData } from '../types/replay'
import { HOTS_MODE_ARAM, HOTS_MODE_BRAWL, HOTS_MODE_CUSTOM, HOTS_MODE_QUICK_MATCH } from './elo'

export const DEFAULT_CUSTOMS_DEST_DIR = process.env.REPLAY_DEST_DIR || '/mnt/Accounts/CustomsCruncher'

export interface ReplayImportRule {
  guildId: string
  ruleName: string
  replayDestDir: string
  allowedModes: number[]
  rosterBattleTags: string[]
  requirePartyForMatchmade: boolean
  minPartySize: number
}

export function getDefaultImportRule(guildId: string): ReplayImportRule {
  return {
    guildId,
    ruleName: 'Customs (Default)',
    replayDestDir: DEFAULT_CUSTOMS_DEST_DIR,
    allowedModes: [HOTS_MODE_CUSTOM],
    rosterBattleTags: [],
    requirePartyForMatchmade: false,
    minPartySize: 0,
  }
}

export function formatModeLabel(mode: number): string {
  switch (mode) {
    case HOTS_MODE_CUSTOM:
      return 'Custom (-1)'
    case HOTS_MODE_QUICK_MATCH:
      return 'Quick Match (50001)'
    case HOTS_MODE_ARAM:
      return 'ARAM (50101)'
    case HOTS_MODE_BRAWL:
      return 'Brawl/ARAM (50031)'
    default:
      return `Mode ${mode}`
  }
}

/**
 * Evaluates whether a parsed replay satisfies a guild's `ReplayImportRule`.
 *
 * - First checks `allowedModes`.
 * - If `rosterBattleTags` is empty, any replay in an allowed mode passes.
 * - For Custom matches (`mode === -1`), requires at least 1 roster player to be present when a roster is configured.
 * - For matchmade modes (QM / ARAM), if `requirePartyForMatchmade` is true and `minPartySize > 1`,
 *   requires a party of at least `minPartySize` total players that includes at least 1 roster player.
 */
export function shouldImportReplayForRule(replay: ReplayData, rule: ReplayImportRule): boolean {
  const allowsAram = rule.allowedModes.includes(HOTS_MODE_ARAM) || rule.allowedModes.includes(HOTS_MODE_BRAWL)
  const modeAllowed =
    rule.allowedModes.includes(replay.mode) ||
    (allowsAram && (replay.mode === HOTS_MODE_ARAM || replay.mode === HOTS_MODE_BRAWL))

  if (!modeAllowed) {
    return false
  }

  if (rule.rosterBattleTags.length === 0) {
    return true
  }

  const rosterSet = new Set(rule.rosterBattleTags.map(t => t.trim().toLowerCase()).filter(Boolean))
  if (rosterSet.size === 0) {
    return true
  }

  const players = Object.values(replay.replayObj?.players || {})
  const rosterPlayers = players.filter(p => {
    const fullTag = `${p.name}#${p.tag}`.toLowerCase()
    return rosterSet.has(fullTag)
  })

  if (rosterPlayers.length === 0) {
    return false
  }

  if (replay.mode === HOTS_MODE_CUSTOM) {
    return true
  }

  const requiredCount = Math.max(1, rule.minPartySize)
  if (!rule.requirePartyForMatchmade || requiredCount <= 1) {
    return true
  }

  const partyTotalCounts = new Map<string, number>()
  for (const p of players) {
    if (!p.partyId) continue
    partyTotalCounts.set(p.partyId, (partyTotalCounts.get(p.partyId) ?? 0) + 1)
  }

  for (const p of rosterPlayers) {
    if (p.partyId && (partyTotalCounts.get(p.partyId) ?? 0) >= requiredCount) {
      return true
    }
  }

  return false
}

export interface GlobalReplayImportTarget {
  guildId: string | null
  destDir: string | null
}

/**
 * Evaluates a replay globally across all configured server rules:
 * 1. Roster-scoped rules (e.g., Beer Hots) are checked first; if matched, the replay is
 *    assigned to that server's `guildId` and copied to its `replayDestDir`.
 * 2. Otherwise, any Custom match (`mode === -1`) is imported as unassigned (`guildId: null`)
 *    and copied to `/mnt/CustomsCruncher` so it can be assigned on the website.
 * 3. Unmatched non-custom matches are skipped (`null`).
 */
export function resolveGlobalReplayImportTarget(
  replay: ReplayData,
  rules: ReplayImportRule[],
  defaultCustomGuildId: string | null = null
): GlobalReplayImportTarget {
  if (defaultCustomGuildId !== null) {
    const callerRule = rules.find((rule) => rule.guildId === defaultCustomGuildId)
    if (callerRule && shouldImportReplayForRule(replay, callerRule)) {
      return {
        guildId: defaultCustomGuildId,
        destDir: callerRule.replayDestDir,
      }
    }
    if (replay.mode === HOTS_MODE_CUSTOM) {
      return {
        guildId: defaultCustomGuildId,
        destDir: callerRule?.replayDestDir ?? DEFAULT_CUSTOMS_DEST_DIR,
      }
    }
    return {
      guildId: null,
      destDir: null,
    }
  }

  for (const rule of rules) {
    if (rule.rosterBattleTags.length > 0 && shouldImportReplayForRule(replay, rule)) {
      return {
        guildId: rule.guildId,
        destDir: rule.replayDestDir,
      }
    }
  }

  if (replay.mode === HOTS_MODE_CUSTOM) {
    return {
      guildId: null,
      destDir: DEFAULT_CUSTOMS_DEST_DIR,
    }
  }

  return {
    guildId: null,
    destDir: null,
  }
}
