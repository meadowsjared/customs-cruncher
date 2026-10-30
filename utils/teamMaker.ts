import { Player } from '../types/player'

export enum MakeTeamsMode {
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
  { name: 'Standard (Default)', value: MakeTeamsMode.STANDARD },
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
export const TEAM_PREFABS: Record<MakeTeamsMode, { team1: number[]; team2: number[] }> = {
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

/**
 * Retrieves effective MMR score for player ranking and balance deltas.
 */
export function getPlayerScore(player: Player): number {
  if (player.mmr !== null && player.mmr !== undefined && !Number.isNaN(player.mmr)) {
    return player.mmr
  }
  const accounts = player.usernames.accounts
  const baseMmr =
    accounts?.reduce((best, acc) => Math.max(best, acc.hpQmMMR ?? 0, acc.hpSlMMR ?? 0, acc.hpArMMR ?? 0), 0) ?? 0
  return baseMmr + (player.adjustment ?? 0)
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
  const sum1 = team1.reduce((sum, p) => sum + getPlayerScore(p), 0)
  const sum2 = team2.reduce((sum, p) => sum + getPlayerScore(p), 0)
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
 * Creates teams using the prefab rank arrays, with automatic role balancing.
 */
export function createTeams(
  sortedPlayers: Player[],
  mode: MakeTeamsMode = MakeTeamsMode.STANDARD,
  maxPlayersPerTeam: number = 5
): TeamDraftResult {
  const prefab = TEAM_PREFABS[mode] ?? TEAM_PREFABS[MakeTeamsMode.STANDARD]
  const team1Set = new Set(prefab.team1)
  const team2Set = new Set(prefab.team2)

  const team1: Player[] = []
  const team2: Player[] = []
  const spectators: Player[] = []

  sortedPlayers.forEach((p, index) => {
    const rank = index + 1
    if (team1Set.has(rank) && team1.length < maxPlayersPerTeam) {
      p.draftOrder = rank
      p.lobbyRank = index
      p.team = 1
      team1.push(p)
    } else if (team2Set.has(rank) && team2.length < maxPlayersPerTeam) {
      p.draftOrder = rank
      p.lobbyRank = index
      p.team = 2
      team2.push(p)
    } else {
      p.draftOrder = NaN
      p.lobbyRank = NaN
      p.team = 0
      spectators.push(p)
    }
  })

  // Balance roles (e.g. ensure each team has a tank main and healer main if available)
  const { roleSwapsApplied } = balanceTeamsByRole(team1, team2, mode)

  return { team1, team2, spectators, roleSwapsApplied }
}
