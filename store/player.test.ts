import { describe, expect, it } from 'bun:test'
import {
  formatPlayerDisplay,
  getPlayerFromRow,
  getPlayerIdentifier,
  getPlayerRolesFormatted,
} from './player'
import { FlatPlayer, HotsAccount, HotsAccountRow, Player } from '../types/player'

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
    hpQmMMR: 0,
    hpSlMMR: 0,
    hpArMMR: 0,
    hpQmGames: 0,
    hpSlGames: 0,
    hpArGames: 0,
    ...overrides,
  }
}

describe('player.mmr', () => {
  it('stores and sorts players by their mmr property directly', () => {
    const p1 = createTestPlayer({ mmr: 3100 })
    const p2 = createTestPlayer({ mmr: 2850 })
    const players = [p2, p1].sort((a, b) => b.mmr - a.mmr)
    expect(players[0].mmr).toBe(3100)
    expect(players[1].mmr).toBe(2850)
  })

  it('uses postgres view computed mmr on player and computes each account.mmr', () => {
    const flatPlayer: FlatPlayer = {
      discord_id: 'user_1',
      hots_battle_tag: '',
      discord_name: 'testuser',
      discord_global_name: 'Test User',
      discord_display_name: 'Test User',
      role: 'Tank',
      active: true,
      team: null,
      adjustment: null,
      lobby_rank: 0,
      draft_order: 0,
      last_active: new Date(),
      mmr: 3150,
    }

    const accounts: HotsAccountRow[] = [
      {
        id: 1,
        discord_id: 'user_1',
        hots_battle_tag: 'Main#1234',
        is_primary: true,
        real_id_name: null,
        hp_qm_mmr: 2600,
        hp_sl_mmr: 2900,
        hp_ar_mmr: 2400,
        hp_qm_games: 100,
        hp_sl_games: 150,
        hp_ar_games: 50,
      },
      {
        id: 2,
        discord_id: 'user_1',
        hots_battle_tag: 'Smurf#5678',
        is_primary: false,
        real_id_name: null,
        hp_qm_mmr: 2750,
        hp_sl_mmr: 3150,
        hp_ar_mmr: 2500,
        hp_qm_games: 80,
        hp_sl_games: 120,
        hp_ar_games: 40,
      },
    ]

    const player = getPlayerFromRow(flatPlayer, accounts)
    expect(player.usernames.accounts?.[0]?.hpSlMMR).toBe(2900)
    expect(player.usernames.accounts?.[1]?.hpSlMMR).toBe(3150)
    expect(player.mmr).toBe(3150)
  })

  it('uses postgres calculated mmr when provided in flatPlayer', () => {
    const flatPlayer: FlatPlayer = {
      discord_id: 'user_2',
      hots_battle_tag: '',
      discord_name: 'veteran',
      discord_global_name: 'Veteran Player',
      discord_display_name: 'Veteran Player',
      role: 'Healer',
      active: true,
      team: null,
      adjustment: 50,
      lobby_rank: 1,
      draft_order: 1,
      last_active: new Date(),
      mmr: 3120,
    }

    const accounts: HotsAccountRow[] = [
      {
        id: 3,
        discord_id: 'user_2',
        hots_battle_tag: 'Vet#9999',
        is_primary: true,
        real_id_name: null,
        hp_qm_mmr: 3000,
        hp_sl_mmr: 2800,
        hp_ar_mmr: 2500,
        hp_qm_games: 50,
        hp_sl_games: 200,
        hp_ar_games: 10,
      },
    ]

    const player = getPlayerFromRow(flatPlayer, accounts)
    expect(player.mmr).toBe(3120)
  })

  it('defaults MMR and game counts to 0 when not defined or missing', () => {
    const flatPlayer: FlatPlayer = {
      discord_id: 'user_3',
      hots_battle_tag: '',
      discord_name: 'newbie',
      discord_global_name: 'New Player',
      discord_display_name: 'New Player',
      role: 'Ranged Assassin',
      active: true,
      team: null,
      adjustment: null,
      lobby_rank: 0,
      draft_order: 0,
      last_active: new Date(),
      mmr: 0,
    }

    const accounts: HotsAccountRow[] = [
      {
        id: 4,
        discord_id: 'user_3',
        hots_battle_tag: 'New#0001',
        is_primary: true,
        real_id_name: null,
        hp_qm_mmr: 0,
        hp_sl_mmr: 0,
        hp_ar_mmr: 0,
        hp_qm_games: 0,
        hp_sl_games: 0,
        hp_ar_games: 0,
      },
    ]

    const player = getPlayerFromRow(flatPlayer, accounts)
    expect(player.mmr).toBe(0)
    expect(player.usernames.accounts?.[0]?.hpQmGames).toBe(0)
    expect(player.usernames.accounts?.[0]?.hpSlGames).toBe(0)
    expect(player.usernames.accounts?.[0]?.hpArGames).toBe(0)
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
      lobbyRank: 1,
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
      lobbyRank: 3,
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
      lobbyRank: 5,
      mmr: 2300,
      role: 'H',
    })
    const output = formatPlayerDisplay(player, 'guild_1', { includeRole: true })
    expect(output).toBe('`5: 2300` <@111222333> `💉 Healer`')
  })

  it('omits MMR when includeMMR is false for public broadcasts', () => {
    const player = createTestPlayer({
      discordId: '111222333',
      lobbyRank: 5,
      mmr: 2300,
      role: 'T',
    })
    const output = formatPlayerDisplay(player, 'guild_1', { includeRole: true, includeMMR: false })
    expect(output).toBe('`5` <@111222333> `🛡️ Tank`')
  })

  it('formats guest player without discordId using discordDisplayName', () => {
    const player = createTestPlayer({
      discordId: null,
      lobbyRank: 2,
      mmr: 2700,
      usernames: {
        discordName: 'Guest#1234',
        discordDisplayName: 'Guest#1234',
        discordGlobalName: 'Guest#1234',
      },
    })
    const output = formatPlayerDisplay(player, 'guild_1')
    expect(output).toBe('`2: 2700` @Guest#1234')
  })
})
