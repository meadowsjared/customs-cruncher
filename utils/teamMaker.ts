import { Player } from '../types/player'

export enum MakeTeamsMode {
  OPTIMAL = 'optimal',
  STANDARD = 'standard',
  MIXED_A = 'mixed_a',
  MIXED_B = 'mixed_b',
  DOUBLE_TROUBLE = 'double_trouble',
  FUNZ = 'funz',
}

export interface TeamDraftResult {
  team1: Player[]
  team2: Player[]
  spectators: Player[]
  roleSwapsApplied?: boolean
}

export interface MakeTeamsChoice {
  name: string
  value: MakeTeamsMode
}

export const makeTeamsModeChoices: MakeTeamsChoice[] = [
  { name: 'Optimal (MMR & Role Balanced) (Default)', value: MakeTeamsMode.OPTIMAL },
  { name: 'Standard (Prefab Ranks)', value: MakeTeamsMode.STANDARD },
  { name: 'Mixed A (Balanced)', value: MakeTeamsMode.MIXED_A },
  { name: 'Mixed B (Balanced)', value: MakeTeamsMode.MIXED_B },
  {
    name: 'Double Trouble (1 & 2 Together)',
    value: MakeTeamsMode.DOUBLE_TROUBLE,
  },
  { name: 'Funz (Unbalanced)', value: MakeTeamsMode.FUNZ },
]

/**
 * Prefab player rank assignments (1-indexed lobby MMR rank).
 * Works seamlessly for 6, 8, 10, or 10+ player lobbies.
 */
export const TEAM_PREFABS: Partial<Record<MakeTeamsMode, { team1: number[]; team2: number[] }>> = {
  [MakeTeamsMode.STANDARD]: {
    team1: [1, 4, 5, 8, 9], // 27
    team2: [2, 3, 6, 7, 10], // 28
  },
  [MakeTeamsMode.MIXED_A]: {
    team1: [1, 3, 5, 8, 10], // 27
    team2: [2, 4, 6, 7, 9], // 28
  },
  [MakeTeamsMode.MIXED_B]: {
    team1: [1, 4, 6, 7, 9], // 27
    team2: [2, 3, 5, 8, 10], // 28
  },
  [MakeTeamsMode.DOUBLE_TROUBLE]: {
    team1: [1, 2, 6, 8, 10], // 27
    team2: [3, 4, 5, 7, 9], // 28
  },
  [MakeTeamsMode.FUNZ]: {
    team1: [1, 7, 8, 9, 10], // 35
    team2: [2, 3, 4, 5, 6], // 20
  },
}

/**
 * Type guard to check if a value is a valid MakeTeamsMode without type assertion.
 */
export function isMakeTeamsMode(value: unknown): value is MakeTeamsMode {
  return Object.values(MakeTeamsMode).some(mode => mode === value)
}

/**
 * Checks if a player's primary role is Tank.
 */
export function isTank(player: Player): boolean {
  if (!player.role) return false
  return player.role.trim().toUpperCase().startsWith('T')
}

/**
 * Checks if a player can play Tank (primary or secondary).
 */
export function canPlayTank(player: Player): boolean {
  if (!player.role) return false
  return player.role.toUpperCase().includes('T')
}

/**
 * Checks if a player's primary role is Healer.
 */
export function isHealer(player: Player): boolean {
  if (!player.role) return false
  return player.role.trim().toUpperCase().startsWith('H')
}

/**
 * Checks if a player can play Healer (primary or secondary).
 */
export function canPlayHealer(player: Player): boolean {
  if (!player.role) return false
  return player.role.toUpperCase().includes('H')
}

/**
 * Checks if a player has the Flex role ('F').
 */
export function isFlex(player: Player): boolean {
  if (!player.role) return false
  return player.role.toUpperCase().includes('F')
}

function countTeamRoles(team: Player[]) {
  let primaryTanks = 0
  let anyTanks = 0
  let primaryHealers = 0
  let anyHealers = 0
  let flex = 0

  for (const p of team) {
    if (isTank(p)) primaryTanks++
    if (canPlayTank(p)) anyTanks++
    if (isHealer(p)) primaryHealers++
    if (canPlayHealer(p)) anyHealers++
    if (isFlex(p)) flex++
  }

  return { primaryTanks, anyTanks, primaryHealers, anyHealers, flex }
}

/**
 * Measures the role imbalance between two teams.
 * 0 means both teams have their required tanks and healers based on lobby composition.
 * If there are no dedicated tanks or healers, flex players ('F') can act as a fallback filler.
 */
export function calculateRoleImbalance(team1: Player[], team2: Player[]): number {
  const r1 = countTeamRoles(team1)
  const r2 = countTeamRoles(team2)
  const totalPrimaryTanks = r1.primaryTanks + r2.primaryTanks
  const totalAnyTanks = r1.anyTanks + r2.anyTanks
  const totalPrimaryHealers = r1.primaryHealers + r2.primaryHealers
  const totalAnyHealers = r1.anyHealers + r2.anyHealers
  const totalFlex = r1.flex + r2.flex

  let tankPenalty = 0
  if (totalPrimaryTanks >= 2) {
    if (r1.primaryTanks === 0 || r2.primaryTanks === 0) {
      tankPenalty = Math.abs(r1.primaryTanks - r2.primaryTanks) * 10
    }
  } else if (totalAnyTanks >= 2) {
    if (r1.anyTanks === 0 || r2.anyTanks === 0) {
      tankPenalty = Math.abs(r1.anyTanks - r2.anyTanks) * 10
    }
  } else if (totalAnyTanks === 1 && totalFlex >= 1) {
    // Only 1 tank player exists in the lobby! The other team should get a Flex player as a fallback
    const t1HasTankOrFlex = r1.anyTanks > 0 || r1.flex > 0
    const t2HasTankOrFlex = r2.anyTanks > 0 || r2.flex > 0
    if (!t1HasTankOrFlex || !t2HasTankOrFlex) {
      tankPenalty = 8
    }
  } else if (totalAnyTanks === 0 && totalFlex >= 2) {
    // Zero tank players in the lobby, but 2+ Flex players: split flex players so both teams get a filler
    if (r1.flex === 0 || r2.flex === 0) {
      tankPenalty = Math.abs(r1.flex - r2.flex) * 6
    }
  }

  let healerPenalty = 0
  if (totalPrimaryHealers >= 2) {
    if (r1.primaryHealers === 0 || r2.primaryHealers === 0) {
      healerPenalty = Math.abs(r1.primaryHealers - r2.primaryHealers) * 10
    }
  } else if (totalAnyHealers >= 2) {
    if (r1.anyHealers === 0 || r2.anyHealers === 0) {
      healerPenalty = Math.abs(r1.anyHealers - r2.anyHealers) * 10
    }
  } else if (totalAnyHealers === 1 && totalFlex >= 1) {
    // Only 1 healer player exists in the lobby! The other team should get a Flex player as a fallback
    const t1HasHealerOrFlex = r1.anyHealers > 0 || r1.flex > 0
    const t2HasHealerOrFlex = r2.anyHealers > 0 || r2.flex > 0
    if (!t1HasHealerOrFlex || !t2HasHealerOrFlex) {
      healerPenalty = 8
    }
  } else if (totalAnyHealers === 0 && totalFlex >= 2) {
    // Zero healer players in the lobby, but 2+ Flex players: split flex players
    if (r1.flex === 0 || r2.flex === 0) {
      healerPenalty = Math.abs(r1.flex - r2.flex) * 6
    }
  }

  return tankPenalty + healerPenalty
}

function getTeamMmrDiff(team1: Player[], team2: Player[]): number {
  const sum1 = team1.reduce((sum, p) => sum + p.mmr, 0)
  const sum2 = team2.reduce((sum, p) => sum + p.mmr, 0)
  return Math.abs(sum1 - sum2)
}

/**
 * Adjusts teams after prefab assignment to ensure tanks and healers are evenly split
 * across both teams, while minimizing the impact on the total MMR balance.
 */
export function balanceTeamsByRole(
  team1: Player[],
  team2: Player[],
  mode: MakeTeamsMode
): { roleSwapsApplied: boolean } {
  // Funz mode is intentionally unbalanced
  if (mode === MakeTeamsMode.FUNZ) {
    return { roleSwapsApplied: false }
  }

  let roleSwapsApplied = false
  let currentImbalance = calculateRoleImbalance(team1, team2)

  // Run up to 2 swap iterations (to solve both tank and healer imbalances if separate)
  for (let iter = 0; iter < 2; iter++) {
    if (currentImbalance === 0) break

    let bestSwap: {
      idx1: number
      idx2: number
      newImbalance: number
      newMmrDiff: number
    } | null = null

    for (let i = 0; i < team1.length; i++) {
      const p1 = team1[i]
      // In Double Trouble, protect ranks 1 and 2 from being separated
      if (mode === MakeTeamsMode.DOUBLE_TROUBLE && (p1.draftOrder === 1 || p1.draftOrder === 2)) {
        continue
      }

      for (let j = 0; j < team2.length; j++) {
        const p2 = team2[j]

        // Candidate teams
        const cand1 = team1.map((p, idx) => (idx === i ? p2 : p))
        const cand2 = team2.map((p, idx) => (idx === j ? p1 : p))

        const newImbalance = calculateRoleImbalance(cand1, cand2)
        // Must strictly improve role imbalance
        if (newImbalance < currentImbalance) {
          const newMmrDiff = getTeamMmrDiff(cand1, cand2)
          if (
            !bestSwap ||
            newImbalance < bestSwap.newImbalance ||
            (newImbalance === bestSwap.newImbalance && newMmrDiff < bestSwap.newMmrDiff)
          ) {
            bestSwap = { idx1: i, idx2: j, newImbalance, newMmrDiff }
          }
        }
      }
    }

    if (!bestSwap) break

    // Perform swap
    const p1 = team1[bestSwap.idx1]
    const p2 = team2[bestSwap.idx2]

    p1.team = 2
    p2.team = 1

    team1[bestSwap.idx1] = p2
    team2[bestSwap.idx2] = p1

    currentImbalance = bestSwap.newImbalance
    roleSwapsApplied = true
  }

  return { roleSwapsApplied }
}

/**
 * Generates all unique combinations of choosing k elements from an array.
 */
export function getCombinations<T>(array: T[], k: number): T[][] {
  if (k === 0) return [[]]
  if (array.length < k) return []
  const [first, ...rest] = array
  const withFirst = getCombinations(rest, k - 1).map(comb => [first, ...comb])
  const withoutFirst = getCombinations(rest, k)
  return [...withFirst, ...withoutFirst]
}

/**
 * Creates globally optimal teams by evaluating all possible 5v5 combinations.
 * First filters/penalizes by role coverage (Tanks, Healers, Flex),
 * then minimizes the total team MMR difference.
 */
export function createOptimalTeams(
  sortedPlayers: Player[],
  maxPlayersPerTeam: number = 5
): TeamDraftResult {
  const totalSlots = maxPlayersPerTeam * 2
  const activePool = sortedPlayers.slice(0, totalSlots)
  const spectators = sortedPlayers.slice(totalSlots)

  spectators.forEach(p => {
    p.draftOrder = NaN
    p.lobbyRank = NaN
    p.team = 0
  })

  // If pool cannot be evenly split or is trivial
  if (activePool.length < 2) {
    return { team1: activePool, team2: [], spectators }
  }

  const teamSize = Math.floor(activePool.length / 2)
  // Pin first player to Team 1 to avoid evaluating symmetric duplicates (Team 1 vs 2 == Team 2 vs 1)
  const firstPlayer = activePool[0]
  const remainingPlayers = activePool.slice(1)
  const candidateCombs = getCombinations(remainingPlayers, teamSize - 1)

  let bestSplit: { team1: Player[]; team2: Player[]; roleImbalance: number; mmrDiff: number } | null = null

  for (const comb of candidateCombs) {
    const t1 = [firstPlayer, ...comb]
    const t1Set = new Set(t1)
    const t2 = activePool.filter(p => !t1Set.has(p))

    const roleImbalance = calculateRoleImbalance(t1, t2)
    const mmrDiff = getTeamMmrDiff(t1, t2)

    if (
      !bestSplit ||
      roleImbalance < bestSplit.roleImbalance ||
      (roleImbalance === bestSplit.roleImbalance && mmrDiff < bestSplit.mmrDiff)
    ) {
      bestSplit = { team1: t1, team2: t2, roleImbalance, mmrDiff }
    }
  }

  const team1 = bestSplit?.team1 ?? activePool.slice(0, teamSize)
  const team2 = bestSplit?.team2 ?? activePool.slice(teamSize)

  team1.forEach(p => {
    p.team = 1
  })
  team2.forEach(p => {
    p.team = 2
  })

  return { team1, team2, spectators }
}

/**
 * Creates teams using the prefab rank arrays or dynamic combinatorial optimization.
 */
export function createTeams(
  sortedPlayers: Player[],
  mode: MakeTeamsMode = MakeTeamsMode.OPTIMAL,
  maxPlayersPerTeam: number = 5
): TeamDraftResult {
  if (mode === MakeTeamsMode.OPTIMAL) {
    return createOptimalTeams(sortedPlayers, maxPlayersPerTeam)
  }

  const prefab = TEAM_PREFABS[mode] ?? TEAM_PREFABS[MakeTeamsMode.STANDARD]
  if (!prefab) {
    return createOptimalTeams(sortedPlayers, maxPlayersPerTeam)
  }
  const team1Set = new Set(prefab.team1)
  const team2Set = new Set(prefab.team2)

  const team1: Player[] = []
  const team2: Player[] = []
  const spectators: Player[] = []

  sortedPlayers.forEach((p, index) => {
    const rank = index + 1
    if (team1Set.has(rank) && team1.length < maxPlayersPerTeam) {
      p.team = 1
      team1.push(p)
    } else if (team2Set.has(rank) && team2.length < maxPlayersPerTeam) {
      p.team = 2
      team2.push(p)
    } else {
      p.team = 0
      spectators.push(p)
    }
  })

  // Balance roles (e.g. ensure each team has a tank main and healer main if available)
  const { roleSwapsApplied } = balanceTeamsByRole(team1, team2, mode)

  return { team1, team2, spectators, roleSwapsApplied }
}

export interface MatchupPrediction {
  team1AvgMMR: number
  team2AvgMMR: number
  mmrDiff: number
  team1WinPct: number
  team2WinPct: number
  probabilityBar: string
  outlookText: string
  roleStatusText: string
}

/**
 * Calculates win prediction probabilities and competitive outlook for the match.
 * Uses an Elo logistic curve based on the average MMR difference between the teams.
 */
export function calculateMatchupPrediction(team1: Player[], team2: Player[]): MatchupPrediction {
  const t1Scores = team1.map(p => p.mmr)
  const t2Scores = team2.map(p => p.mmr)

  const t1Total = t1Scores.reduce((sum, s) => sum + s, 0)
  const t2Total = t2Scores.reduce((sum, s) => sum + s, 0)

  const team1AvgMMR = Math.round(t1Total / Math.max(team1.length, 1))
  const team2AvgMMR = Math.round(t2Total / Math.max(team2.length, 1))
  const mmrDiff = team1AvgMMR - team2AvgMMR

  // Standard Elo logistic win probability based on average team MMR difference
  // Scale factor of 400: a 100-MMR lead ~ 64% win chance, 200-MMR lead ~ 76% win chance
  const exponent = -mmrDiff / 400
  const t1Prob = 1 / (1 + Math.pow(10, exponent))
  const team1WinPct = Math.max(1, Math.min(99, Math.round(t1Prob * 100)))
  const team2WinPct = 100 - team1WinPct

  // 20-character visual bar
  const t1Blocks = Math.round((team1WinPct / 100) * 20)
  const t2Blocks = Math.max(0, 20 - t1Blocks)
  const probabilityBar = '█'.repeat(t1Blocks) + '░'.repeat(t2Blocks)

  // Categorized outlook
  const absDiff = Math.abs(mmrDiff)
  let outlookText = ''
  if (absDiff <= 30) {
    outlookText = `⚖️ **Outlook**: Even Matchup (Δ ${absDiff} avg MMR)`
  } else if (absDiff <= 80) {
    const favored = mmrDiff > 0 ? 'Team 1' : 'Team 2'
    outlookText = `📈 **Outlook**: Slight Advantage: **${favored}** (Δ ${absDiff} avg MMR)`
  } else if (absDiff <= 150) {
    const favored = mmrDiff > 0 ? 'Team 1' : 'Team 2'
    outlookText = `🔥 **Outlook**: Clear Advantage: **${favored}** (Δ ${absDiff} avg MMR)`
  } else {
    const favored = mmrDiff > 0 ? 'Team 1' : 'Team 2'
    outlookText = `⚠️ **Outlook**: Heavy Mismatch: **${favored}** heavily favored (Δ ${absDiff} avg MMR)`
  }

  // Role status breakdown
  const t1HasRealTank = team1.some(canPlayTank)
  const t2HasRealTank = team2.some(canPlayTank)
  const t1HasRealHealer = team1.some(canPlayHealer)
  const t2HasRealHealer = team2.some(canPlayHealer)
  const t1HasFlex = team1.some(isFlex)
  const t2HasFlex = team2.some(isFlex)

  const t1TankOk = t1HasRealTank || t1HasFlex
  const t2TankOk = t2HasRealTank || t2HasFlex
  const t1HealOk = t1HasRealHealer || t1HasFlex
  const t2HealOk = t2HasRealHealer || t2HasFlex

  let roleStatusText = ''
  if (t1HasRealTank && t2HasRealTank && t1HasRealHealer && t2HasRealHealer) {
    roleStatusText = '🛡️ **Roles**: Both teams have a dedicated Tank & Healer'
  } else if (t1TankOk && t2TankOk && t1HealOk && t2HealOk) {
    roleStatusText = '🛡️ **Roles**: Core roles covered (using Flex filler)'
  } else {
    const issues: string[] = []
    if (!t1TankOk) issues.push('T1 lacks Tank')
    if (!t2TankOk) issues.push('T2 lacks Tank')
    if (!t1HealOk) issues.push('T1 lacks Healer')
    if (!t2HealOk) issues.push('T2 lacks Healer')
    roleStatusText = `⚠️ **Roles**: Missing coverage: ${issues.join(', ')}`
  }

  return {
    team1AvgMMR,
    team2AvgMMR,
    mmrDiff,
    team1WinPct,
    team2WinPct,
    probabilityBar,
    outlookText,
    roleStatusText,
  }
}

export interface SuggestedFairSwap {
  player1: Player
  player2: Player
  newTeam1WinPct: number
  newTeam2WinPct: number
  newMmrDiff: number
  newImbalance: number
  reason: string
  score: number
}

/**
 * Evaluates all possible 1-for-1 swaps between Team 1 and Team 2,
 * returning the top recommended swaps that fix role deficits or improve MMR balance.
 */
export function findSuggestedFairSwaps(
  team1: Player[],
  team2: Player[],
  maxSuggestions = 3
): SuggestedFairSwap[] {
  if (team1.length === 0 || team2.length === 0) return []

  const currentPrediction = calculateMatchupPrediction(team1, team2)
  const currentImbalance = calculateRoleImbalance(team1, team2)
  const currentDiff = Math.abs(currentPrediction.team1AvgMMR - currentPrediction.team2AvgMMR)
  const currentWinDeviation = Math.abs(currentPrediction.team1WinPct - 50)

  const candidates: SuggestedFairSwap[] = []

  for (let i = 0; i < team1.length; i++) {
    const p1 = team1[i]
    for (let j = 0; j < team2.length; j++) {
      const p2 = team2[j]

      // Candidate teams after 1-for-1 swap
      const cand1 = team1.map((p, idx) => (idx === i ? p2 : p))
      const cand2 = team2.map((p, idx) => (idx === j ? p1 : p))

      const newImbalance = calculateRoleImbalance(cand1, cand2)
      // Never suggest swaps that degrade role balance
      if (newImbalance > currentImbalance) {
        continue
      }

      const newPrediction = calculateMatchupPrediction(cand1, cand2)
      const newDiff = Math.abs(newPrediction.team1AvgMMR - newPrediction.team2AvgMMR)
      const newWinDeviation = Math.abs(newPrediction.team1WinPct - 50)

      const fixesRole = currentImbalance > 0 && newImbalance < currentImbalance
      const improvesMmr = newDiff < currentDiff && newWinDeviation <= currentWinDeviation
      const maintainsFairness = newImbalance === 0 && newWinDeviation <= 4

      // Must be an improvement in roles, MMR, or bring an already close matchup to near 50/50
      if (!fixesRole && !improvesMmr && !maintainsFairness) {
        continue
      }

      // Only accept swaps that improve win deviation or keep it within a fair range (<= 15% from 50)
      if (newWinDeviation >= currentWinDeviation && newWinDeviation > 15 && !fixesRole) {
        continue
      }

      let reason = ''
      if (fixesRole) {
        const t1NeedsTank = !team1.some(canPlayTank) && !team1.some(isFlex)
        const t2NeedsTank = !team2.some(canPlayTank) && !team2.some(isFlex)
        const t1NeedsHealer = !team1.some(canPlayHealer) && !team1.some(isFlex)
        const t2NeedsHealer = !team2.some(canPlayHealer) && !team2.some(isFlex)

        if (t1NeedsTank && canPlayTank(p2)) {
          reason = `Fixes T1 Tank (${newPrediction.team1WinPct}% vs ${newPrediction.team2WinPct}%, Δ ${newDiff})`
        } else if (t2NeedsTank && canPlayTank(p1)) {
          reason = `Fixes T2 Tank (${newPrediction.team1WinPct}% vs ${newPrediction.team2WinPct}%, Δ ${newDiff})`
        } else if (t1NeedsHealer && canPlayHealer(p2)) {
          reason = `Fixes T1 Healer (${newPrediction.team1WinPct}% vs ${newPrediction.team2WinPct}%, Δ ${newDiff})`
        } else if (t2NeedsHealer && canPlayHealer(p1)) {
          reason = `Fixes T2 Healer (${newPrediction.team1WinPct}% vs ${newPrediction.team2WinPct}%, Δ ${newDiff})`
        } else {
          reason = `Balances roles (${newPrediction.team1WinPct}% vs ${newPrediction.team2WinPct}%, Δ ${newDiff})`
        }
      } else {
        reason = `Brings matchup to ${newPrediction.team1WinPct}% vs ${newPrediction.team2WinPct}% (Δ ${newDiff} avg MMR)`
      }

      const roleBonus = (currentImbalance - newImbalance) * 1000
      const mmrBonus = Math.max(0, 200 - newDiff)
      const winBonus = Math.max(0, 50 - newWinDeviation) * 10
      const score = roleBonus + mmrBonus + winBonus

      candidates.push({
        player1: p1,
        player2: p2,
        newTeam1WinPct: newPrediction.team1WinPct,
        newTeam2WinPct: newPrediction.team2WinPct,
        newMmrDiff: newDiff,
        newImbalance,
        reason,
        score,
      })
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  return candidates.slice(0, maxSuggestions)
}
