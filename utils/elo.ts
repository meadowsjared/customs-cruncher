/**
 * Seeded 5v5 Team Elo rating engine.
 *
 * Uses Heroes Profile peak MMR (`base_mmr`) as each player's starting seed,
 * then processes chronological 5v5 replays using a calibrated 5v5 team-average
 * Elo logistic curve (`scale = 180 ≈ 400 / √5`).
 *
 * Key properties:
 * - No time decay: inactive players keep their earned rating indefinitely.
 * - No artificial ceiling/floor: players who keep beating expectations keep climbing.
 * - No inertia trap: a 1,000-game veteran moves at the same responsive pace as a 50-game regular.
 * - Known-lobby filter: skips historical matches where fewer than `minKnownPlayers` (default 8/10)
 *   have a known rating, avoiding corruption from unlinked/unrated legacy replays.
 */

/** Empirically calibrated 5v5 team-average Elo logistic scale (≈ 400 / √5). */
export const ELO_TEAM_SCALE = 180

/** Steady-state Elo K-factor (±10 MMR on a dead-even 50/50 match). */
export const ELO_DEFAULT_K = 20

/** Minimum number of players in a 5v5 match with a known rating for the match to be Elo-rated. Defaults to 0 (all full 5v5 matches are rated). */
export const ELO_MIN_KNOWN_PLAYERS = 0

/** Fallback seed MMR if no rated accounts exist in the database yet. */
export const ELO_FALLBACK_SEED_MMR = 2500

export interface EloAccountInput {
  hotsAccountId: number
  discordId: string | null
  battleTagLower: string
  ownerDiscordId: string | null
  baseMmr: number
}

export interface EloSubstitutionInput {
  replayId: number
  battleTagLower: string
  substituteDiscordId: string
}

export interface EloMatchPlayerInput {
  battleTagLower: string
  toonHandle?: string
  team: number
  win: boolean
}

export interface EloMatchInput {
  replayId: number
  date: Date | string
  players: EloMatchPlayerInput[]
}

export interface EloCalculationConfig {
  kFactor?: number
  scale?: number
  minKnownPlayers?: number
  fallbackSeedMmr?: number
}

export interface EloCalculationInput {
  accounts: EloAccountInput[]
  substitutions: EloSubstitutionInput[]
  matches: EloMatchInput[]
  config?: EloCalculationConfig
}

export interface ComputedPlayerElo {
  playerKey: string
  discordId: string | null
  hotsAccountId: number | null
  baseMmr: number
  eloMmr: number
  eloGames: number
  customGames: number
  customWins: number
  customWinRate: number
}

export interface ComputedReplayPlayerElo {
  replayId: number
  battleTagLower: string
  baseMmr: number
  preMmr: number
  postMmr: number
  mmrDelta: number
  isRated: boolean
}

export interface EloCalculationResult {
  playerRatings: ComputedPlayerElo[]
  matchRatings: ComputedReplayPlayerElo[]
  ratedMatchCount: number
  skippedMatchCount: number
  defaultSeedMmr: number
}

/**
 * Calculates the expected win probability (0..1) for Team 1 against Team 2
 * using the 5v5 team-average Elo logistic curve.
 */
export function calculateExpectedWinProbability(
  team1AvgMmr: number,
  team2AvgMmr: number,
  scale: number = ELO_TEAM_SCALE
): number {
  const exponent = (team2AvgMmr - team1AvgMmr) / scale
  return 1 / (1 + Math.pow(10, exponent))
}

interface PlayerState {
  playerKey: string
  discordId: string | null
  hotsAccountId: number | null
  baseMmr: number
  hasKnownSeed: boolean
  rating: number
  eloGames: number
  customGames: number
  customWins: number
}

function getMedian(values: number[], fallback: number): number {
  if (values.length === 0) return fallback
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2)
  }
  return Math.round(sorted[mid])
}

/**
 * Runs chronological Seeded 5v5 Team Elo across all provided replays.
 * Assumes `matches` are sorted chronologically (or sorts them by date ASC, replayId ASC).
 */
export function calculateSeededTeamElo(input: EloCalculationInput): EloCalculationResult {
  const kFactor = input.config?.kFactor ?? ELO_DEFAULT_K
  const scale = input.config?.scale ?? ELO_TEAM_SCALE
  const minKnownPlayers = input.config?.minKnownPlayers ?? ELO_MIN_KNOWN_PLAYERS
  const fallbackSeedMmr = input.config?.fallbackSeedMmr ?? ELO_FALLBACK_SEED_MMR

  // 1. Build player identities & seed base MMRs from hots_accounts.
  //    Prefer non-loaned accounts (`ownerDiscordId === null`) when mapping a BattleTag to its default owner.
  const tagToAccount = new Map<string, EloAccountInput>()
  const playerBaseMmr = new Map<string, number>()
  const playerMeta = new Map<string, { discordId: string | null; hotsAccountId: number | null }>()

  for (const acc of input.accounts) {
    const tag = acc.battleTagLower.toLowerCase()
    const existing = tagToAccount.get(tag)
    if (!existing || (existing.ownerDiscordId !== null && acc.ownerDiscordId === null)) {
      tagToAccount.set(tag, acc)
    }

    const playerKey = acc.discordId ? `discord:${acc.discordId}` : `account:${acc.hotsAccountId}`
    if (!playerMeta.has(playerKey)) {
      playerMeta.set(playerKey, {
        discordId: acc.discordId,
        hotsAccountId: acc.discordId ? null : acc.hotsAccountId,
      })
    }

    const prevBase = playerBaseMmr.get(playerKey) ?? 0
    if (acc.baseMmr > prevBase) {
      playerBaseMmr.set(playerKey, acc.baseMmr)
    } else if (!playerBaseMmr.has(playerKey)) {
      playerBaseMmr.set(playerKey, Math.max(0, acc.baseMmr))
    }
  }

  const knownBaseMmrs: number[] = []
  for (const mmr of playerBaseMmr.values()) {
    if (mmr > 0) knownBaseMmrs.push(mmr)
  }
  const defaultSeedMmr = getMedian(knownBaseMmrs, fallbackSeedMmr)

  // 2. Build replay-specific substitution lookup: `${replayId}|${battleTagLower}` -> substituteDiscordId
  const subLookup = new Map<string, string>()
  for (const sub of input.substitutions) {
    subLookup.set(`${sub.replayId}|${sub.battleTagLower.toLowerCase()}`, sub.substituteDiscordId)
  }

  // 2b. Map toon_handle -> registered account (so BattleTag renames on the same Blizzard account pool together)
  const toonToAccount = new Map<string, EloAccountInput>()
  for (const match of input.matches) {
    for (const p of match.players) {
      if (!p.toonHandle) continue
      const acc = tagToAccount.get(p.battleTagLower.toLowerCase())
      if (!acc) continue
      const existing = toonToAccount.get(p.toonHandle)
      if (
        !existing ||
        (!existing.discordId && acc.discordId) ||
        (existing.ownerDiscordId !== null && acc.ownerDiscordId === null)
      ) {
        toonToAccount.set(p.toonHandle, acc)
      }
    }
  }

  // 3. Initialize mutable state for every known player identity
  const states = new Map<string, PlayerState>()

  function getOrCreateState(playerKey: string, discordId: string | null, hotsAccountId: number | null): PlayerState {
    const existing = states.get(playerKey)
    if (existing) return existing

    const baseMmr = playerBaseMmr.get(playerKey) ?? 0
    const hasKnownSeed = baseMmr > 0
    const state: PlayerState = {
      playerKey,
      discordId,
      hotsAccountId,
      baseMmr,
      hasKnownSeed,
      rating: hasKnownSeed ? baseMmr : defaultSeedMmr,
      eloGames: 0,
      customGames: 0,
      customWins: 0,
    }
    states.set(playerKey, state)
    return state
  }

  for (const [playerKey, meta] of playerMeta.entries()) {
    getOrCreateState(playerKey, meta.discordId, meta.hotsAccountId)
  }

  function resolvePlayerForMatch(replayId: number, battleTagLower: string, toonHandle?: string): PlayerState {
    const tag = battleTagLower.toLowerCase()
    const subDiscordId = subLookup.get(`${replayId}|${tag}`)
    if (subDiscordId) {
      return getOrCreateState(`discord:${subDiscordId}`, subDiscordId, null)
    }

    const acc = tagToAccount.get(tag) ?? (toonHandle ? toonToAccount.get(toonHandle) : undefined)
    if (acc) {
      if (acc.discordId) {
        return getOrCreateState(`discord:${acc.discordId}`, acc.discordId, null)
      }
      return getOrCreateState(`account:${acc.hotsAccountId}`, null, acc.hotsAccountId)
    }

    if (toonHandle) {
      return getOrCreateState(`toon:${toonHandle}`, null, null)
    }

    return getOrCreateState(`unreg:${tag}`, null, null)
  }

  // 4. Sort matches chronologically (date ASC, replayId ASC)
  const sortedMatches = [...input.matches].sort((a, b) => {
    const ta = a.date instanceof Date ? a.date.getTime() : new Date(a.date).getTime()
    const tb = b.date instanceof Date ? b.date.getTime() : new Date(b.date).getTime()
    if (ta !== tb) return ta - tb
    return a.replayId - b.replayId
  })

  const matchRatings: ComputedReplayPlayerElo[] = []
  let ratedMatchCount = 0
  let skippedMatchCount = 0

  // 5. Process each match chronologically
  for (const match of sortedMatches) {
    const team0: Array<{ battleTagLower: string; state: PlayerState; win: boolean }> = []
    const team1: Array<{ battleTagLower: string; state: PlayerState; win: boolean }> = []
    let winner: 0 | 1 | null = null

    for (const p of match.players) {
      const tag = p.battleTagLower.toLowerCase()
      const state = resolvePlayerForMatch(match.replayId, tag, p.toonHandle)

      // Always track overall custom games & wins (pooled across all linked accounts + substitutions)
      state.customGames += 1
      if (p.win) {
        state.customWins += 1
      }

      if (p.team === 0) {
        team0.push({ battleTagLower: tag, state, win: p.win })
        if (p.win) winner = 0
      } else if (p.team === 1) {
        team1.push({ battleTagLower: tag, state, win: p.win })
        if (p.win) winner = 1
      }
    }

    const isFull5v5 = team0.length === 5 && team1.length === 5 && winner !== null
    const allParticipants = [...team0, ...team1]
    const knownCount = allParticipants.filter(p => p.state.hasKnownSeed || p.state.eloGames > 0).length
    const isQualifying = isFull5v5 && knownCount >= minKnownPlayers

    if (!isQualifying) {
      skippedMatchCount += 1
      for (const participant of allParticipants) {
        const displayPre =
          participant.state.hasKnownSeed || participant.state.eloGames > 0
            ? Math.round(participant.state.rating)
            : 0
        matchRatings.push({
          replayId: match.replayId,
          battleTagLower: participant.battleTagLower,
          baseMmr: participant.state.baseMmr,
          preMmr: displayPre,
          postMmr: displayPre,
          mmrDelta: 0,
          isRated: false,
        })
      }
      continue
    }

    ratedMatchCount += 1

    const avg0 = team0.reduce((sum, p) => sum + p.state.rating, 0) / team0.length
    const avg1 = team1.reduce((sum, p) => sum + p.state.rating, 0) / team1.length
    const expected0 = calculateExpectedWinProbability(avg0, avg1, scale)
    const actual0 = winner === 0 ? 1 : 0
    const delta0 = kFactor * (actual0 - expected0)
    const delta1 = -delta0

    // Snapshot pre-match ratings before mutating (handles edge case if same player appears once per team)
    const teamUpdates: Array<{ participant: { battleTagLower: string; state: PlayerState }; delta: number }> = [
      ...team0.map(participant => ({ participant, delta: delta0 })),
      ...team1.map(participant => ({ participant, delta: delta1 })),
    ]

    for (const { participant, delta } of teamUpdates) {
      const preRating = participant.state.rating
      const postRating = Math.max(0, preRating + delta)
      const preRounded = Math.round(preRating)
      const postRounded = Math.round(postRating)

      participant.state.rating = postRating
      participant.state.eloGames += 1

      matchRatings.push({
        replayId: match.replayId,
        battleTagLower: participant.battleTagLower,
        baseMmr: participant.state.baseMmr,
        preMmr: preRounded,
        postMmr: postRounded,
        mmrDelta: postRounded - preRounded,
        isRated: true,
      })
    }
  }

  // 6. Emit final computed player ratings
  const playerRatings: ComputedPlayerElo[] = []
  for (const state of states.values()) {
    const eloMmr = state.hasKnownSeed || state.eloGames > 0 ? Math.round(state.rating) : 0
    const customWinRate =
      state.customGames > 0 ? Math.round((state.customWins / state.customGames) * 1000) / 10 : 50.0

    playerRatings.push({
      playerKey: state.playerKey,
      discordId: state.discordId,
      hotsAccountId: state.hotsAccountId,
      baseMmr: state.baseMmr,
      eloMmr,
      eloGames: state.eloGames,
      customGames: state.customGames,
      customWins: state.customWins,
      customWinRate,
    })
  }

  return {
    playerRatings,
    matchRatings,
    ratedMatchCount,
    skippedMatchCount,
    defaultSeedMmr,
  }
}
