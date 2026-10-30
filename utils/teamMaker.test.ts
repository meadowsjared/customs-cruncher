import { describe, expect, it } from 'bun:test'
import { calculateMatchupPrediction, createTeams, isMakeTeamsMode, MakeTeamsMode } from './teamMaker'
import { Player } from '../types/player'

function makeMockPlayer(index: number, mmr: number, role?: string): Player {
  return {
    discordId: `user_${index}`,
    usernames: {
      discordName: `player_${index}`,
      discordDisplayName: `Player ${index}`,
      discordGlobalName: `Player ${index}`,
    },
    active: true,
    mmr,
    role,
    lastActive: new Date(),
    team: null,
    lobbyRank: NaN,
    draftOrder: NaN,
    adjustment: null,
  }
}

describe('teamMaker.createTeams', () => {
  it('creates two balanced 5-player teams in Standard mode', () => {
    // 10 players sorted descending by MMR
    const players = Array.from({ length: 10 }, (_, i) => makeMockPlayer(i + 1, 3000 - i * 100))

    const start = performance.now()
    const { team1, team2, spectators } = createTeams(players, MakeTeamsMode.STANDARD, 5)
    const durationMs = performance.now() - start

    expect(team1.length).toBe(5)
    expect(team2.length).toBe(5)
    expect(spectators.length).toBe(0)

    // Standard mode: Team 1 has ranks 1, 4, 5, 8, 9 (indices 0, 3, 4, 7, 8)
    expect(team1.map(p => p.discordId)).toEqual(['user_1', 'user_4', 'user_5', 'user_8', 'user_9'])
    // Team 2 has ranks 2, 3, 6, 7, 10 (indices 1, 2, 5, 6, 9)
    expect(team2.map(p => p.discordId)).toEqual(['user_2', 'user_3', 'user_6', 'user_7', 'user_10'])

    // Performance assertion: pure algorithmic team creation should take under 1ms
    expect(durationMs).toBeLessThan(5)
  })

  it('puts excess players beyond 10 into spectators', () => {
    const players = Array.from({ length: 13 }, (_, i) => makeMockPlayer(i + 1, 3000 - i * 50))
    const { team1, team2, spectators } = createTeams(players, MakeTeamsMode.STANDARD, 5)

    expect(team1.length).toBe(5)
    expect(team2.length).toBe(5)
    expect(spectators.length).toBe(3)
    expect(spectators.map(p => p.discordId)).toEqual(['user_11', 'user_12', 'user_13'])
  })

  it('handles Double Trouble mode (ranks 1 and 2 on Team 1)', () => {
    const players = Array.from({ length: 10 }, (_, i) => makeMockPlayer(i + 1, 3000 - i * 100))
    const { team1, team2 } = createTeams(players, MakeTeamsMode.DOUBLE_TROUBLE, 5)

    // Team 1: 1, 2, 6, 8, 10
    expect(team1.map(p => p.discordId)).toEqual(['user_1', 'user_2', 'user_6', 'user_8', 'user_10'])
    // Team 2: 3, 4, 5, 7, 9
    expect(team2.map(p => p.discordId)).toEqual(['user_3', 'user_4', 'user_5', 'user_7', 'user_9'])
  })

  it('handles Mixed A mode (ranks 1, 3, 5, 8, 10 on Team 1)', () => {
    const players = Array.from({ length: 10 }, (_, i) => makeMockPlayer(i + 1, 3000 - i * 100))
    const { team1, team2 } = createTeams(players, MakeTeamsMode.MIXED_A, 5)

    expect(team1.map(p => p.discordId)).toEqual(['user_1', 'user_3', 'user_5', 'user_8', 'user_10'])
    expect(team2.map(p => p.discordId)).toEqual(['user_2', 'user_4', 'user_6', 'user_7', 'user_9'])
  })

  it('handles Mixed B mode (ranks 1, 4, 6, 7, 9 on Team 1)', () => {
    const players = Array.from({ length: 10 }, (_, i) => makeMockPlayer(i + 1, 3000 - i * 100))
    const { team1, team2 } = createTeams(players, MakeTeamsMode.MIXED_B, 5)

    expect(team1.map(p => p.discordId)).toEqual(['user_1', 'user_4', 'user_6', 'user_7', 'user_9'])
    expect(team2.map(p => p.discordId)).toEqual(['user_2', 'user_3', 'user_5', 'user_8', 'user_10'])
  })

  it('handles Funz mode (ranks 1, 7, 8, 9, 10 on Team 1 vs 2, 3, 4, 5, 6 on Team 2)', () => {
    const players = Array.from({ length: 10 }, (_, i) => makeMockPlayer(i + 1, 3000 - i * 100))
    const { team1, team2 } = createTeams(players, MakeTeamsMode.FUNZ, 5)

    expect(team1.map(p => p.discordId)).toEqual(['user_1', 'user_7', 'user_8', 'user_9', 'user_10'])
    expect(team2.map(p => p.discordId)).toEqual(['user_2', 'user_3', 'user_4', 'user_5', 'user_6'])
  })

  it('benchmarks performance with 1,000 team assignments under 50ms', () => {
    const players = Array.from({ length: 10 }, (_, i) => makeMockPlayer(i + 1, 2500))

    const start = performance.now()
    for (let i = 0; i < 1000; i++) {
      createTeams(players, MakeTeamsMode.STANDARD, 5)
    }
    const durationMs = performance.now() - start

    expect(durationMs).toBeLessThan(50)
  })

  it('splits two tank mains between Team 1 and Team 2 when prefab puts both on Team 1', () => {
    // Standard prefab puts ranks 1, 4, 5, 8, 9 on Team 1 and 2, 3, 6, 7, 10 on Team 2
    // If ranks 1 and 4 are both Tanks, Team 1 would get 2 tanks and Team 2 gets 0
    const players = [
      makeMockPlayer(1, 3000, 'T'),
      makeMockPlayer(2, 2900, 'A'),
      makeMockPlayer(3, 2800, 'A'),
      makeMockPlayer(4, 2700, 'T'),
      makeMockPlayer(5, 2600, 'A'),
      makeMockPlayer(6, 2500, 'A'),
      makeMockPlayer(7, 2400, 'H'),
      makeMockPlayer(8, 2300, 'H'),
      makeMockPlayer(9, 2200, 'A'),
      makeMockPlayer(10, 2100, 'A'),
    ]

    const { team1, team2, roleSwapsApplied } = createTeams(players, MakeTeamsMode.STANDARD, 5)

    expect(roleSwapsApplied).toBe(true)

    const team1Tanks = team1.filter(p => p.role?.startsWith('T'))
    const team2Tanks = team2.filter(p => p.role?.startsWith('T'))
    const team1Healers = team1.filter(p => p.role?.startsWith('H'))
    const team2Healers = team2.filter(p => p.role?.startsWith('H'))

    expect(team1Tanks.length).toBe(1)
    expect(team2Tanks.length).toBe(1)
    expect(team1Healers.length).toBe(1)
    expect(team2Healers.length).toBe(1)
  })

  it('splits two healer mains between Team 1 and Team 2 when prefab puts both on Team 2', () => {
    // Ranks 2 and 3 are on Team 2 in Standard mode
    const players = [
      makeMockPlayer(1, 3000, 'T'),
      makeMockPlayer(2, 2900, 'H'),
      makeMockPlayer(3, 2800, 'H'),
      makeMockPlayer(4, 2700, 'T'),
      makeMockPlayer(5, 2600, 'A'),
      makeMockPlayer(6, 2500, 'A'),
      makeMockPlayer(7, 2400, 'A'),
      makeMockPlayer(8, 2300, 'A'),
      makeMockPlayer(9, 2200, 'A'),
      makeMockPlayer(10, 2100, 'A'),
    ]

    const { team1, team2, roleSwapsApplied } = createTeams(players, MakeTeamsMode.STANDARD, 5)

    expect(roleSwapsApplied).toBe(true)

    const team1Healers = team1.filter(p => p.role?.startsWith('H'))
    const team2Healers = team2.filter(p => p.role?.startsWith('H'))

    expect(team1Healers.length).toBe(1)
    expect(team2Healers.length).toBe(1)
  })

  it('balances both tanks and healers when both are clumped on separate teams', () => {
    // Team 1 would get ranks 1 & 4 (both Tanks)
    // Team 2 would get ranks 2 & 3 (both Healers)
    const players = [
      makeMockPlayer(1, 3000, 'T'),
      makeMockPlayer(2, 2900, 'H'),
      makeMockPlayer(3, 2800, 'H'),
      makeMockPlayer(4, 2700, 'T'),
      makeMockPlayer(5, 2600, 'A'),
      makeMockPlayer(6, 2500, 'A'),
      makeMockPlayer(7, 2400, 'A'),
      makeMockPlayer(8, 2300, 'A'),
      makeMockPlayer(9, 2200, 'A'),
      makeMockPlayer(10, 2100, 'A'),
    ]

    const { team1, team2, roleSwapsApplied } = createTeams(players, MakeTeamsMode.STANDARD, 5)

    expect(roleSwapsApplied).toBe(true)

    const team1Tanks = team1.filter(p => p.role?.startsWith('T'))
    const team2Tanks = team2.filter(p => p.role?.startsWith('T'))
    const team1Healers = team1.filter(p => p.role?.startsWith('H'))
    const team2Healers = team2.filter(p => p.role?.startsWith('H'))

    expect(team1Tanks.length).toBe(1)
    expect(team2Tanks.length).toBe(1)
    expect(team1Healers.length).toBe(1)
    expect(team2Healers.length).toBe(1)
  })

  it('does not separate ranks 1 and 2 in Double Trouble mode during role balancing', () => {
    // In Double Trouble, Team 1 gets ranks 1, 2, 6, 8, 10
    // Ranks 1 and 2 are together on Team 1
    // Suppose rank 6 (Tank) and rank 8 (Tank) are both on Team 1, and Team 2 has 0 tanks (rank 4 is A)
    const players = [
      makeMockPlayer(1, 3000, 'A'),
      makeMockPlayer(2, 2900, 'A'),
      makeMockPlayer(3, 2800, 'A'),
      makeMockPlayer(4, 2700, 'A'),
      makeMockPlayer(5, 2600, 'A'),
      makeMockPlayer(6, 2500, 'T'),
      makeMockPlayer(7, 2400, 'A'),
      makeMockPlayer(8, 2300, 'T'),
      makeMockPlayer(9, 2200, 'A'),
      makeMockPlayer(10, 2100, 'A'),
    ]

    const { team1, team2 } = createTeams(players, MakeTeamsMode.DOUBLE_TROUBLE, 5)

    // Ranks 1 and 2 must stay on Team 1
    expect(team1.some(p => p.discordId === 'user_1')).toBe(true)
    expect(team1.some(p => p.discordId === 'user_2')).toBe(true)

    // And tanks should be split 1 on each team
    expect(team1.filter(p => p.role?.startsWith('T')).length).toBe(1)
    expect(team2.filter(p => p.role?.startsWith('T')).length).toBe(1)
  })

  it('splits Flex player to opposite team when lobby has only 1 Tank player', () => {
    // Ranks 1 (Tank) and 4 (Flex) are both on Team 1 initially in Standard
    // Team 2 has 0 tanks and 0 flex
    const players = [
      makeMockPlayer(1, 3000, 'T'),
      makeMockPlayer(2, 2900, 'A'),
      makeMockPlayer(3, 2800, 'A'),
      makeMockPlayer(4, 2700, 'F'),
      makeMockPlayer(5, 2600, 'A'),
      makeMockPlayer(6, 2500, 'A'),
      makeMockPlayer(7, 2400, 'H'),
      makeMockPlayer(8, 2300, 'H'),
      makeMockPlayer(9, 2200, 'A'),
      makeMockPlayer(10, 2100, 'A'),
    ]

    const { team1, team2, roleSwapsApplied } = createTeams(players, MakeTeamsMode.STANDARD, 5)

    expect(roleSwapsApplied).toBe(true)

    // One team has the Tank, the other team has the Flex
    const t1TankOrFlex = team1.some(p => p.role?.includes('T') || p.role?.includes('F'))
    const t2TankOrFlex = team2.some(p => p.role?.includes('T') || p.role?.includes('F'))

    expect(t1TankOrFlex).toBe(true)
    expect(t2TankOrFlex).toBe(true)
  })

  it('splits 2 Flex players when lobby has 0 Tank players', () => {
    // 0 tanks, but ranks 1 and 4 are both Flex ('F')
    const players = [
      makeMockPlayer(1, 3000, 'F'),
      makeMockPlayer(2, 2900, 'A'),
      makeMockPlayer(3, 2800, 'A'),
      makeMockPlayer(4, 2700, 'F'),
      makeMockPlayer(5, 2600, 'A'),
      makeMockPlayer(6, 2500, 'A'),
      makeMockPlayer(7, 2400, 'H'),
      makeMockPlayer(8, 2300, 'H'),
      makeMockPlayer(9, 2200, 'A'),
      makeMockPlayer(10, 2100, 'A'),
    ]

    const { team1, team2, roleSwapsApplied } = createTeams(players, MakeTeamsMode.STANDARD, 5)

    expect(roleSwapsApplied).toBe(true)
    expect(team1.filter(p => p.role?.includes('F')).length).toBe(1)
    expect(team2.filter(p => p.role?.includes('F')).length).toBe(1)
  })

  it('creates globally optimal teams that beat standard prefab MMR difference', () => {
    // Rank 1 is an outlier GM (+550 MMR over Rank 2)
    const players = [
      makeMockPlayer(1, 3300, 'T'),
      makeMockPlayer(2, 2750, 'A'),
      makeMockPlayer(3, 2700, 'T'),
      makeMockPlayer(4, 2650, 'A'),
      makeMockPlayer(5, 2600, 'H'),
      makeMockPlayer(6, 2550, 'A'),
      makeMockPlayer(7, 2500, 'H'),
      makeMockPlayer(8, 2450, 'A'),
      makeMockPlayer(9, 2400, 'A'),
      makeMockPlayer(10, 2350, 'A'),
    ]

    const optimal = createTeams(players, MakeTeamsMode.OPTIMAL, 5)
    const standard = createTeams(players, MakeTeamsMode.STANDARD, 5)

    const optT1Sum = optimal.team1.reduce((sum, p) => sum + (p.mmr ?? 0), 0)
    const optT2Sum = optimal.team2.reduce((sum, p) => sum + (p.mmr ?? 0), 0)
    const optDiff = Math.abs(optT1Sum - optT2Sum)

    const stdT1Sum = standard.team1.reduce((sum, p) => sum + (p.mmr ?? 0), 0)
    const stdT2Sum = standard.team2.reduce((sum, p) => sum + (p.mmr ?? 0), 0)
    const stdDiff = Math.abs(stdT1Sum - stdT2Sum)

    // Optimal should achieve much closer MMR parity than standard
    expect(optDiff).toBeLessThan(stdDiff)
    // Optimal delta should be <= 50 MMR
    expect(optDiff).toBeLessThanOrEqual(50)

    // And both teams in optimal should have a Tank and a Healer
    expect(optimal.team1.some(p => p.role === 'T')).toBe(true)
    expect(optimal.team2.some(p => p.role === 'T')).toBe(true)
    expect(optimal.team1.some(p => p.role === 'H')).toBe(true)
    expect(optimal.team2.some(p => p.role === 'H')).toBe(true)
  })

  it('benchmarks optimal team creation under 5ms for 10 players', () => {
    const players = [
      makeMockPlayer(1, 3300, 'T'),
      makeMockPlayer(2, 2750, 'A'),
      makeMockPlayer(3, 2700, 'T'),
      makeMockPlayer(4, 2650, 'A'),
      makeMockPlayer(5, 2600, 'H'),
      makeMockPlayer(6, 2550, 'A'),
      makeMockPlayer(7, 2500, 'H'),
      makeMockPlayer(8, 2450, 'A'),
      makeMockPlayer(9, 2400, 'A'),
      makeMockPlayer(10, 2350, 'A'),
    ]

    const start = performance.now()
    for (let i = 0; i < 50; i++) {
      createTeams(players, MakeTeamsMode.OPTIMAL, 5)
    }
    const avgMs = (performance.now() - start) / 50

    expect(avgMs).toBeLessThan(5)
  })
})

describe('teamMaker.calculateMatchupPrediction', () => {
  it('predicts 50/50 win probabilities for teams with equal average MMR', () => {
    const team1 = Array.from({ length: 5 }, (_, i) => makeMockPlayer(i + 1, 2800, i === 0 ? 'T' : i === 1 ? 'H' : 'A'))
    const team2 = Array.from({ length: 5 }, (_, i) => makeMockPlayer(i + 6, 2800, i === 0 ? 'T' : i === 1 ? 'H' : 'A'))

    const pred = calculateMatchupPrediction(team1, team2)

    expect(pred.team1AvgMMR).toBe(2800)
    expect(pred.team2AvgMMR).toBe(2800)
    expect(pred.mmrDiff).toBe(0)
    expect(pred.team1WinPct).toBe(50)
    expect(pred.team2WinPct).toBe(50)
    expect(pred.outlookText).toContain('Even Matchup')
    expect(pred.roleStatusText).toContain('Both teams have a dedicated Tank & Healer')
  })

  it('calculates proper Elo win percentage advantage for higher MMR team', () => {
    // 100 MMR lead should yield ~64% win probability
    const team1 = Array.from({ length: 5 }, (_, i) => makeMockPlayer(i + 1, 2850, i === 0 ? 'T' : i === 1 ? 'H' : 'A'))
    const team2 = Array.from({ length: 5 }, (_, i) => makeMockPlayer(i + 6, 2750, i === 0 ? 'T' : i === 1 ? 'H' : 'A'))

    const pred = calculateMatchupPrediction(team1, team2)

    expect(pred.team1AvgMMR).toBe(2850)
    expect(pred.team2AvgMMR).toBe(2750)
    expect(pred.mmrDiff).toBe(100)
    expect(pred.team1WinPct).toBe(64)
    expect(pred.team2WinPct).toBe(36)
    expect(pred.outlookText).toContain('Team 1')
  })

  it('detects when core roles are missing', () => {
    const team1 = Array.from({ length: 5 }, (_, i) => makeMockPlayer(i + 1, 2800, 'A'))
    const team2 = Array.from({ length: 5 }, (_, i) => makeMockPlayer(i + 6, 2800, i === 0 ? 'T' : i === 1 ? 'H' : 'A'))

    const pred = calculateMatchupPrediction(team1, team2)

    expect(pred.roleStatusText).toContain('Missing coverage')
    expect(pred.roleStatusText).toContain('T1 lacks Tank')
    expect(pred.roleStatusText).toContain('T1 lacks Healer')
  })
})

describe('teamMaker.isMakeTeamsMode', () => {
  it('returns true for valid MakeTeamsMode values', () => {
    expect(isMakeTeamsMode('optimal')).toBe(true)
    expect(isMakeTeamsMode('standard')).toBe(true)
    expect(isMakeTeamsMode('mixed_a')).toBe(true)
    expect(isMakeTeamsMode('mixed_b')).toBe(true)
    expect(isMakeTeamsMode('double_trouble')).toBe(true)
    expect(isMakeTeamsMode('funz')).toBe(true)
  })

  it('returns false for invalid values', () => {
    expect(isMakeTeamsMode('invalid_mode')).toBe(false)
    expect(isMakeTeamsMode('')).toBe(false)
    expect(isMakeTeamsMode(123)).toBe(false)
    expect(isMakeTeamsMode(null)).toBe(false)
    expect(isMakeTeamsMode(undefined)).toBe(false)
  })
})

