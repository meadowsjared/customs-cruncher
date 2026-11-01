import { describe, expect, it, mock } from 'bun:test'
import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { Player } from '../types/player'

function makeMockPlayer(rank: number, mmr: number, discordId = `user_${rank}`): Player {
  return {
    discordId,
    usernames: {
      discordName: `player_${rank}`,
      discordDisplayName: `Player ${rank}`,
      discordGlobalName: `Player ${rank}`,
    },
    active: true,
    mmr,
    lobbyRank: rank,
    draftOrder: rank,
    team: null,
    lastActive: new Date(),
    adjustment: null,
  }
}

let mockActivePlayers: Player[] = []
let capturedSetTeams: {
  guildId: string
  team1: Player[]
  team2: Player[]
  spectators: Player[]
} | null = null

let repliedContent = ''
let repliedFlags: MessageFlags | undefined

const actualPlayer = await import('../store/player')

mock.module('../store/player', () => ({
  ...actualPlayer,
  getSortedActivePlayers: async () => mockActivePlayers,
  setTeamsFromPlayers: async (
    guildId: string,
    team1: Player[],
    team2: Player[],
    spectators: Player[]
  ) => {
    capturedSetTeams = { guildId, team1, team2, spectators }
  },
}))

mock.module('../utils/interaction', () => ({
  requireGuildId: async () => 'test_guild',
  safeReply: async (
    _interaction: unknown,
    options: string | { content?: string; flags?: MessageFlags }
  ) => {
    if (typeof options === 'string') {
      repliedContent = options
    } else {
      repliedContent = options.content ?? ''
      repliedFlags = options.flags
    }
  },
  safeDeferUpdate: async () => {},
  safeUpdate: async () => {},
}))

mock.module('../store/channels', () => ({
  getLobbyMessages: async () => [],
  deleteLobbyMessages: async () => {},
  saveLobbyMessage: async () => {},
  getChannels: async () => [],
}))

// Import after mocking modules
const { handleSetTeamsCommand } = await import('./teams')

function createMockInteraction(teamsData: string, isButton = false): ChatInputCommandInteraction {
  repliedContent = ''
  repliedFlags = undefined
  capturedSetTeams = null

  const raw = {
    guildId: 'test_guild',
    channelId: 'test_channel',
    isButton: () => isButton,
    options: {
      getString: (name: string) => (name === 'teams_data' ? teamsData : null),
    },
    isRepliable: () => true,
    replied: false,
    deferred: false,
    deferReply: async () => ({
      delete: async () => {},
    }),
  }
  const interaction: ChatInputCommandInteraction = Object.assign(
    Object.create(ChatInputCommandInteraction.prototype),
    raw
  )
  return interaction
}

describe('commands.teams.handleSetTeamsCommand', () => {
  it('correctly sets teams when given single-team 1-based ranks (e.g. "1 4 5 6 10")', async () => {
    mockActivePlayers = Array.from({ length: 10 }, (_, i) =>
      makeMockPlayer(i + 1, 3200 - i * 100)
    )

    const interaction = createMockInteraction('1 4 5 6 10')
    await handleSetTeamsCommand(interaction)

    expect(capturedSetTeams).not.toBeNull()
    if (!capturedSetTeams) throw new Error('Expected capturedSetTeams to be set')

    const team1Ranks = capturedSetTeams.team1.map(p => p.lobbyRank)
    const team2Ranks = capturedSetTeams.team2.map(p => p.lobbyRank)
    const spectatorRanks = capturedSetTeams.spectators.map(p => p.lobbyRank)

    expect(team1Ranks).toEqual([1, 4, 5, 6, 10])
    expect(team2Ranks).toEqual([2, 3, 7, 8, 9])
    expect(spectatorRanks).toEqual([])
  })

  it('correctly sets teams when both teams are provided with comma (e.g. "1 3 5 7 9, 2 4 6 8 10")', async () => {
    mockActivePlayers = Array.from({ length: 10 }, (_, i) =>
      makeMockPlayer(i + 1, 3200 - i * 100)
    )

    const interaction = createMockInteraction('1 3 5 7 9, 2 4 6 8 10')
    await handleSetTeamsCommand(interaction)

    expect(capturedSetTeams).not.toBeNull()
    if (!capturedSetTeams) throw new Error('Expected capturedSetTeams to be set')

    const team1Ranks = capturedSetTeams.team1.map(p => p.lobbyRank)
    const team2Ranks = capturedSetTeams.team2.map(p => p.lobbyRank)
    const spectatorRanks = capturedSetTeams.spectators.map(p => p.lobbyRank)

    expect(team1Ranks).toEqual([1, 3, 5, 7, 9])
    expect(team2Ranks).toEqual([2, 4, 6, 8, 10])
    expect(spectatorRanks).toEqual([])
  })

  it('puts excess players beyond 10 into spectators', async () => {
    mockActivePlayers = Array.from({ length: 12 }, (_, i) =>
      makeMockPlayer(i + 1, 3200 - i * 100)
    )

    const interaction = createMockInteraction('1 4 5 6 10')
    await handleSetTeamsCommand(interaction)

    expect(capturedSetTeams).not.toBeNull()
    if (!capturedSetTeams) throw new Error('Expected capturedSetTeams to be set')

    expect(capturedSetTeams.team1.map(p => p.lobbyRank)).toEqual([1, 4, 5, 6, 10])
    expect(capturedSetTeams.team2.map(p => p.lobbyRank)).toEqual([2, 3, 7, 8, 9])
    expect(capturedSetTeams.spectators.map(p => p.lobbyRank)).toEqual([11, 12])
  })

  it('returns an ephemeral error message if duplicate player numbers are provided', async () => {
    mockActivePlayers = Array.from({ length: 10 }, (_, i) =>
      makeMockPlayer(i + 1, 3200 - i * 100)
    )

    const interaction = createMockInteraction('1 4 4 6 10')
    await handleSetTeamsCommand(interaction)

    expect(capturedSetTeams).toBeNull()
    expect(repliedContent).toContain('Duplicate player numbers provided: `4`')
    expect(repliedFlags).toBe(MessageFlags.Ephemeral)
  })

  it('returns an ephemeral error message if too many players are specified', async () => {
    mockActivePlayers = Array.from({ length: 3 }, (_, i) =>
      makeMockPlayer(i + 1, 3200 - i * 100)
    )

    const interaction = createMockInteraction('1 2 3 4 5')
    await handleSetTeamsCommand(interaction)

    expect(capturedSetTeams).toBeNull()
    expect(repliedContent).toContain('Too many players provided')
    expect(repliedFlags).toBe(MessageFlags.Ephemeral)
  })

  it('ignores button interactions safely', async () => {
    mockActivePlayers = Array.from({ length: 10 }, (_, i) =>
      makeMockPlayer(i + 1, 3200 - i * 100)
    )

    const interaction = createMockInteraction('1 4 5 6 10', true)
    await handleSetTeamsCommand(interaction)

    expect(capturedSetTeams).toBeNull()
    expect(repliedContent).toBe('')
  })
})
