import { describe, expect, it } from 'bun:test'
import {
  formatPlayerDisplay,
  getPlayerIdentifier,
  getPlayerMMR,
  getPlayerRolesFormatted,
} from './player'
import { Player, HotsAccount } from '../types/player'

function createTestPlayer(overrides: Partial<Player> = {}): Player {
  return {
    discordId: '123456789',
    usernames: {
      discordName: 'testuser',
      discordDisplayName: 'Test User',
      discordGlobalName: 'Test User',
      accounts: [],
    },
    active: true,
    lastActive: new Date(),
    team: null,
    lobbyRank: NaN,
    draftOrder: NaN,
    adjustment: null,
    mmr: 0,
    ...overrides,
  }
}

function createTestAccount(overrides: Partial<HotsAccount> = {}): HotsAccount {
  return {
    id: 1,
    hotsBattleTag: 'Player#1234',
    isPrimary: true,
    hpQmMMR: null,
    hpSlMMR: null,
    hpArMMR: null,
    hpQmGames: null,
    hpSlGames: null,
    hpArGames: null,
    ...overrides,
  }
}

describe('store.player.getPlayerMMR', () => {
  it('returns 0 if player has no accounts and no adjustment', () => {
    const player = createTestPlayer()
    expect(getPlayerMMR(player)).toBe(0)
  })

  it('picks the highest MMR among QM, SL, and ARAM for a single account', () => {
    const player = createTestPlayer({
      usernames: {
        discordName: 'user',
        discordDisplayName: 'User',
        discordGlobalName: 'User',
        accounts: [
          createTestAccount({
            hpQmMMR: 2400,
            hpSlMMR: 2850,
            hpArMMR: 2600,
          }),
        ],
      },
    })

    expect(getPlayerMMR(player)).toBe(2850)
  })

  it('picks the highest MMR across multiple accounts', () => {
    const player = createTestPlayer({
      usernames: {
        discordName: 'user',
        discordDisplayName: 'User',
        discordGlobalName: 'User',
        accounts: [
          createTestAccount({
            hotsBattleTag: 'Main#1111',
            hpSlMMR: 2500,
          }),
          createTestAccount({
            hotsBattleTag: 'Smurf#2222',
            hpSlMMR: 3100,
          }),
        ],
      },
    })

    expect(getPlayerMMR(player)).toBe(3100)
  })

  it('correctly adds positive and negative adjustments', () => {
    const playerPositive = createTestPlayer({
      adjustment: 150,
      usernames: {
        discordName: 'user',
        discordDisplayName: 'User',
        discordGlobalName: 'User',
        accounts: [createTestAccount({ hpSlMMR: 2800 })],
      },
    })
    expect(getPlayerMMR(playerPositive)).toBe(2950)

    const playerNegative = createTestPlayer({
      adjustment: -200,
      usernames: {
        discordName: 'user',
        discordDisplayName: 'User',
        discordGlobalName: 'User',
        accounts: [createTestAccount({ hpSlMMR: 2800 })],
      },
    })
    expect(getPlayerMMR(playerNegative)).toBe(2600)
  })

  it('handles null values safely', () => {
    const player = createTestPlayer({
      adjustment: null,
      usernames: {
        discordName: 'user',
        discordDisplayName: 'User',
        discordGlobalName: 'User',
        accounts: [
          createTestAccount({
            hpQmMMR: null,
            hpSlMMR: null,
            hpArMMR: 2150,
          }),
        ],
      },
    })
    expect(getPlayerMMR(player)).toBe(2150)
  })

  it('adjusts MMR dynamically based on custom game win rate and games played', () => {
    // 60% win rate across 45 games with base 2800 MMR
    // Confidence = 45 / (45 + 15) = 0.75
    // Delta = (60 - 50) = +10
    // Bonus = 10 * 0.75 * 15 = +113
    const playerHighWR = createTestPlayer({
      customGames: 45,
      customWinRate: 60,
      usernames: {
        discordName: 'winner',
        discordDisplayName: 'Winner',
        discordGlobalName: 'Winner',
        accounts: [createTestAccount({ hpSlMMR: 2800 })],
      },
    })
    expect(getPlayerMMR(playerHighWR)).toBe(2913)

    // 40% win rate across 45 games with base 2800 MMR
    // Delta = (40 - 50) = -10
    // Math.round(-10 * 0.75 * 15) = Math.round(-112.5) = -112
    // 2800 - 112 = 2688
    const playerLowWR = createTestPlayer({
      customGames: 45,
      customWinRate: 40,
      usernames: {
        discordName: 'struggler',
        discordDisplayName: 'Struggler',
        discordGlobalName: 'Struggler',
        accounts: [createTestAccount({ hpSlMMR: 2800 })],
      },
    })
    expect(getPlayerMMR(playerLowWR)).toBe(2688)

    // Always adds manual admin adjustment directly on top
    const playerWithAdminAdj = createTestPlayer({
      customGames: 45,
      customWinRate: 60,
      adjustment: 50,
      usernames: {
        discordName: 'winner_adj',
        discordDisplayName: 'Winner Adj',
        discordGlobalName: 'Winner Adj',
        accounts: [createTestAccount({ hpSlMMR: 2800 })],
      },
    })
    expect(getPlayerMMR(playerWithAdminAdj)).toBe(2963) // 2913 + 50
  })
})

describe('store.player.getPlayerRolesFormatted', () => {
  it('returns "role not set" for undefined/empty role', () => {
    expect(getPlayerRolesFormatted(undefined)).toBe('role not set')
    expect(getPlayerRolesFormatted('')).toBe('role not set')
  })

  it('formats single role correctly', () => {
    expect(getPlayerRolesFormatted('T')).toBe('🛡️ Tank')
    expect(getPlayerRolesFormatted('A')).toBe('⚔️ Assassin')
    expect(getPlayerRolesFormatted('B')).toBe('💪 Bruiser')
    expect(getPlayerRolesFormatted('H')).toBe('💉 Healer')
    expect(getPlayerRolesFormatted('F')).toBe('🔄 Flex')
  })

  it('formats multiple roles combined into comma-separated string', () => {
    expect(getPlayerRolesFormatted('TH')).toBe('🛡️ Tank, 💉 Healer')
    expect(getPlayerRolesFormatted('TAB')).toBe('🛡️ Tank, ⚔️ Assassin, 💪 Bruiser')
  })
})

describe('store.player.getPlayerIdentifier', () => {
  it('returns discordId when player has a discordId', () => {
    const player = createTestPlayer({ discordId: '987654321' })
    expect(getPlayerIdentifier(player)).toBe('987654321')
  })

  it('returns hotsRowId:<id> when player is a guest with account id', () => {
    const player = createTestPlayer({
      discordId: null,
      usernames: {
        discordName: 'Guest#1234',
        discordDisplayName: 'Guest#1234',
        discordGlobalName: 'Guest#1234',
        accounts: [createTestAccount({ id: 543, hotsBattleTag: 'Guest#1234' })],
      },
    })
    expect(getPlayerIdentifier(player)).toBe('hotsRowId:543')
  })

  it('returns tag:<tag> when player has no id but has hotsBattleTag', () => {
    const player = createTestPlayer({
      discordId: null,
      usernames: {
        discordName: 'Guest#1234',
        discordDisplayName: 'Guest#1234',
        discordGlobalName: 'Guest#1234',
        accounts: [{ ...createTestAccount(), id: 0, hotsBattleTag: 'Solo#1234' }],
      },
    })
    // If id is 0 (falsy), it falls back to tag:Solo#1234
    expect(getPlayerIdentifier(player)).toBe('tag:Solo#1234')
  })

  it('returns empty string when player has neither discordId nor accounts', () => {
    const player = createTestPlayer({
      discordId: null,
      usernames: {
        discordName: 'Empty',
        discordDisplayName: 'Empty',
        discordGlobalName: 'Empty',
        accounts: [],
      },
    })
    expect(getPlayerIdentifier(player)).toBe('')
  })
})

describe('store.player.formatPlayerDisplay', () => {
  it('formats player with rank and MMR', () => {
    const player = createTestPlayer({
      discordId: '111222333',
      lobbyRank: 0,
      mmr: 2500,
    })
    const output = formatPlayerDisplay(player, 'guild_1')
    expect(output).toBe('`1: 2500` <@111222333>')
  })

  it('formats player without rank when lobbyRank is NaN', () => {
    const player = createTestPlayer({
      discordId: '111222333',
      lobbyRank: NaN,
      mmr: 2500,
    })
    const output = formatPlayerDisplay(player, 'guild_1')
    expect(output).toBe('`2500` <@111222333>')
  })

  it('includes BattleTag when requested, stripping hash digits', () => {
    const player = createTestPlayer({
      discordId: '111222333',
      lobbyRank: 2,
      mmr: 2800,
      usernames: {
        discordName: 'user',
        discordDisplayName: 'User',
        discordGlobalName: 'User',
        accounts: [createTestAccount({ hotsBattleTag: 'Illidan#1234', isPrimary: true })],
      },
    })
    const output = formatPlayerDisplay(player, 'guild_1', { includeBattleTag: true })
    expect(output).toBe('`3: 2800` <@111222333> Illidan')
  })

  it('includes role when requested', () => {
    const player = createTestPlayer({
      discordId: '111222333',
      lobbyRank: 4,
      mmr: 2300,
      role: 'H',
    })
    const output = formatPlayerDisplay(player, 'guild_1', { includeRole: true })
    expect(output).toBe('`5: 2300` <@111222333> `💉 Healer`')
  })

  it('omits MMR when includeMMR is false for public broadcasts', () => {
    const player = createTestPlayer({
      discordId: '111222333',
      lobbyRank: 4,
      mmr: 2300,
      role: 'T',
    })
    const output = formatPlayerDisplay(player, 'guild_1', { includeRole: true, includeMMR: false })
    expect(output).toBe('`5` <@111222333> `🛡️ Tank`')
  })
})
