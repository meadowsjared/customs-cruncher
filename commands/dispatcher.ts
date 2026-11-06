import { ButtonInteraction, CacheType, ChatInputCommandInteraction, Interaction, MessageFlags } from 'discord.js'
import { CommandIds, roleMap } from '../constants'
import { safeReply } from '../utils/interaction'
import {
  handleAdminAddHotsAccountButton,
  handleAdminAddHotsAccountCommand,
  handleAdminPrimaryCommand,
  handleAdminRealIdNameCommand,
  handleAddHotsAccountCommand,
  handleAssignAccountAutocomplete,
  handleAssignAccountClearCommand,
  handleAssignAccountCommand,
  handleAssignAccountListCommand,
  handleEditRoleButtonCommand,
  handleEditRoleCommand,
} from './accounts'
import {
  handleAdminSetActiveCommand,
  handleAdminSetRoleCommand,
  handleAdminShowRoleButtons,
  handleAdminUnlinkedButton,
  handleAdminUnlinkedCommand,
  handlePlayerAdjustCommand,
  updateAdminActiveButtons,
} from './admin'
import { handleChannelSubCommand } from './channels'
import {
  handleDraftAutocomplete,
  handleDraftCaptainCommand,
  handleDraftChoiceButton,
  handleDraftCoinCallButton,
  handleDraftCommand,
  handleDraftModeCommand,
  handleDraftPickButton,
  handleDraftTeamAssignCommand,
  handleDraftToggleModeButton,
  handleDraftUndoCommand,
} from './draft'
import {
  handleClearCommand,
  handleJoinCommand,
  handleLeaveCommand,
  handleNewGameCommand,
  handleRefreshLobbyMessage,
  handleRejoinCommand,
} from './lobby'
import {
  handleDeleteHotsAccountCommand,
  handleDeletePlayerCommand,
  handleLookupAutocomplete,
  handleLookupCommand,
  handlePlayersAllCommand,
  handlePlayersCommand,
  handleRegisterCommand,
} from './lookup'
import {
  handleCancelMapVoteCommand,
  handleEndMapVoteCommand,
  handleMapVoteCommand,
  handleVoteMapButtonClick,
  handleVoteRemoveButtonClick,
} from './mapVote'
import {
  handleImportReplaysCommand,
  handleLookupReplaySelect,
  handleReassignReplayPlayerAutocomplete,
  handleReassignReplayPlayerCommand,
  handleRecentReplaysCommand,
} from './replays'
import { handleScanLobbyCommand } from './scanLobby'
import { handleChannelCommand, handleDeleteMessageCommand, handleGuideCommand, handleTwitchCommand } from './shared'
import {
  handleCheckTeamsCommand,
  handleFairSwapButton,
  handleMakeTeamsCommand,
  handleMoveCommand,
  handleMoveToLobbyCommand,
  handleMoveToTeamsCommand,
  handlePublishTeamsCommand,
  handleSetTeamsCommand,
  handleShowTeamsCommand,
  handleSwapTeamsCommand,
} from './teams'

type InteractionHandler = (
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) => Promise<unknown>

type SlashOnlyHandler = (interaction: ChatInputCommandInteraction<CacheType>) => Promise<unknown>

function wrapSlashOnly(handler: SlashOnlyHandler): InteractionHandler {
  return async interaction => {
    if (!interaction.isChatInputCommand()) {
      await safeReply(interaction, {
        content: 'This command can only be used as a slash command.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }
    await handler(interaction)
  }
}

/**
 * Registry of exact-match command and button custom ID handlers.
 */
const exactHandlers = new Map<string, InteractionHandler>([
  [CommandIds.GAME, wrapSlashOnly(handleGameSubCommand)],
  [CommandIds.LOBBY, wrapSlashOnly(handleGameSubCommand)],
  [CommandIds.TEAMS, wrapSlashOnly(handleGameSubCommand)],
  [CommandIds.DRAFT, wrapSlashOnly(handleDraftSubCommand)],
  [CommandIds.CHANNEL, wrapSlashOnly(handleChannelSubCommand)],
  [CommandIds.MOVE_TO_LOBBY, handleMoveToLobbyCommand],
  [CommandIds.MOVE_TO_TEAMS, handleMoveToTeamsCommand],
  [CommandIds.HELP, handleGuideCommand],
  [CommandIds.GUIDE, handleGuideCommand],
  [CommandIds.JOIN, handleJoinCommand],
  [CommandIds.REJOIN, handleRejoinCommand],
  [CommandIds.LEAVE, handleLeaveCommand],
  [
    CommandIds.PLAYERS,
    async i => {
      if (i.isChatInputCommand()) {
        const mode = i.options.getString('mode')
        if (mode === 'raw') {
          return handlePlayersCommand(i, true)
        }
        if (mode === 'all') {
          return handlePlayersAllCommand(i)
        }
      }
      return handlePlayersCommand(i)
    },
  ],
  [CommandIds.ADD_ACCOUNT, handleAddHotsAccountCommand],
  [CommandIds.ROLE, handleEditRoleCommand],
  [CommandIds.TWITCH, handleTwitchCommand],
  [CommandIds.REGISTER, handleRegisterCommand],
  [CommandIds.LOOKUP, handleLookupCommand],
  [CommandIds.MOVE, wrapSlashOnly(handleMoveSubCommand)],
  [CommandIds.PLAYER, wrapSlashOnly(handlePlayerSubCommand)],
  [CommandIds.DELETE_MESSAGE, handleDeleteMessageCommand],
  [CommandIds.REPLAYS, wrapSlashOnly(handleReplaysSubCommand)],
  [CommandIds.CHANNEL_COMMAND, wrapSlashOnly(handleChannelCommand)],
  [
    `${CommandIds.ADMIN}_${CommandIds.ACTIVE}_${CommandIds.REFRESH}`,
    async i => updateAdminActiveButtons(i, false, true),
  ],
  [CommandIds.MAP, wrapSlashOnly(handleMapSubCommand)],
  [CommandIds.SUB, wrapSlashOnly(handleSubSubCommand)],
])

/**
 * Handles subcommands for `/game <subcommand>` (also backwards-compatible with `/lobby` and `/teams`)
 */
async function handleGameSubCommand(interaction: ChatInputCommandInteraction<CacheType>) {
  const subcommand = interaction.options.getSubcommand(false)
  switch (subcommand) {
    case 'scan':
      await handleScanLobbyCommand(interaction)
      return
    case 'refresh':
      await handleRefreshLobbyMessage(interaction)
      return
    case 'clear':
      await handleClearCommand(interaction)
      return
    case 'teams':
    case 'make':
      await handleMakeTeamsCommand(interaction)
      return
    case 'set':
      await handleSetTeamsCommand(interaction)
      return
    case 'swap':
      await handleSwapTeamsCommand(interaction)
      return
    case 'publish':
      await handlePublishTeamsCommand(interaction)
      return
    case 'check':
      await handleCheckTeamsCommand(interaction)
      return
    case 'show':
      await handleShowTeamsCommand(interaction)
      return
    case 'new':
    default:
      await handleNewGameCommand(interaction)
      return
  }
}

/**
 * Handles subcommands for `/move <subcommand>`
 */
async function handleMoveSubCommand(interaction: ChatInputCommandInteraction<CacheType>) {
  const subcommand = interaction.options.getSubcommand(false)
  if (subcommand === 'lobby') {
    await handleMoveToLobbyCommand(interaction)
    return
  }
  if (subcommand === 'teams') {
    await handleMoveToTeamsCommand(interaction)
    return
  }
  await handleMoveCommand(interaction)
}

/**
 * Handles subcommands for `/player <subcommand>`
 */
async function handlePlayerSubCommand(interaction: ChatInputCommandInteraction<CacheType>) {
  const subcommand = interaction.options.getSubcommand(false)
  switch (subcommand) {
    case 'adjust':
      await handlePlayerAdjustCommand(interaction)
      return
    case 'active':
      await handleAdminSetActiveCommand(interaction)
      return
    case 'role':
      await handleAdminSetRoleCommand(interaction)
      return
    case 'add-account':
      await handleAdminAddHotsAccountCommand(interaction)
      return
    case 'primary':
      await handleAdminPrimaryCommand(interaction)
      return
    case 'real-id':
    case 'real-id-name':
      await handleAdminRealIdNameCommand(interaction)
      return
    case 'delete':
      await handleDeletePlayerCommand(interaction)
      return
    case 'delete-account':
      await handleDeleteHotsAccountCommand(interaction)
      return
    case 'unlinked':
      await handleAdminUnlinkedCommand(interaction)
      return
    case 'move':
    default:
      await handleMoveCommand(interaction)
      return
  }
}

/**
 * Handles subcommands for `/sub <subcommand>`
 */
async function handleSubSubCommand(interaction: ChatInputCommandInteraction<CacheType>) {
  const subcommand = interaction.options.getSubcommand(false)
  if (subcommand === 'clear') {
    await handleAssignAccountClearCommand(interaction)
    return
  }
  if (subcommand === 'list') {
    await handleAssignAccountListCommand(interaction)
    return
  }
  await handleAssignAccountCommand(interaction)
}


/**
 * Handles subcommands for `/replays <subcommand>`
 */
async function handleReplaysSubCommand(interaction: ChatInputCommandInteraction<CacheType>) {
  const subcommand = interaction.options.getSubcommand(false)
  switch (subcommand) {
    case 'import':
      await handleImportReplaysCommand(interaction)
      return
    case 'reassign':
      await handleReassignReplayPlayerCommand(interaction)
      return
    case 'recent':
    default:
      await handleRecentReplaysCommand(interaction)
      return
  }
}

/**
 * Handles subcommands for `/draft <subcommand>`
 */
async function handleDraftSubCommand(interaction: ChatInputCommandInteraction<CacheType>) {
  const subcommand = interaction.options.getSubcommand(false)
  switch (subcommand) {
    case 'captain':
      await handleDraftCaptainCommand(interaction)
      return
    case 'mode':
      await handleDraftModeCommand(interaction)
      return
    case 'undo':
      await handleDraftUndoCommand(interaction)
      return
    case 'assign':
      await handleDraftTeamAssignCommand(interaction)
      return
    case 'start':
    default:
      await handleDraftCommand(interaction)
      return
  }
}

/**
 * Handles subcommands for `/map <subcommand>`
 */
async function handleMapSubCommand(interaction: ChatInputCommandInteraction<CacheType>) {
  const subcommand = interaction.options.getSubcommand()
  if (subcommand === 'end') {
    await handleEndMapVoteCommand(interaction)
    return
  }
  if (subcommand === 'cancel') {
    await handleCancelMapVoteCommand(interaction)
    return
  }
  await handleMapVoteCommand(interaction)
}

function getCommandName(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
): string | null {
  if (interaction.isButton()) {
    return interaction.customId
  } else if (interaction.isChatInputCommand()) {
    return interaction.commandName
  }
  return null
}

function isAdminSetActiveCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  part0: string,
  part1: string,
  part2: string,
  part3: string
): boolean {
  return (
    interaction.isButton() &&
    part0 === CommandIds.ADMIN &&
    part1 === CommandIds.ACTIVE &&
    (/^\d{17,19}$/.test(part2) || part2.startsWith('hotsRowId:')) &&
    ['true', 'false'].includes(part3.toLowerCase())
  )
}

function isRoleCommandId(commandName: string): commandName is CommandIds {
  const commandAr = Object.values<string>([
    CommandIds.ROLE_EDIT_ADD,
    CommandIds.ROLE_EDIT_REPLACE,
    CommandIds.ROLE_EDIT_REMOVE,
  ])
  return commandAr.includes(commandName)
}

async function handleUnknownCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  commandName: string
) {
  await safeReply(interaction, {
    content: `Unknown command: ${commandName}. Please use a valid command.`,
    flags: MessageFlags.Ephemeral,
  })
  if (process.env.DEBUG === 'true') {
    console.log('invalid command:', commandName)
  }
}

/**
 * Handles dynamic/pattern-based button interactions.
 */
async function handlePatternCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  commandName: string
): Promise<void> {
  if (!commandName.includes('_') || interaction.isChatInputCommand()) {
    await safeReply(interaction, {
      content: 'Unknown command. Please use a valid command. ' + commandName,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const parts = commandName.split('_')

  if (parts[0] === CommandIds.VOTE_MAP_BTN && interaction.isButton()) {
    await handleVoteMapButtonClick(interaction, parts[1], parts[2])
    return
  }
  if (parts[0] === CommandIds.REMOVE_MAP_VOTE && interaction.isButton()) {
    await handleVoteRemoveButtonClick(interaction, parts[1])
    return
  }
  if (parts[0] === 'end-map-vote' && interaction.isButton()) {
    await handleEndMapVoteCommand(interaction, parts[1])
    return
  }

  if (parts.length === 2) {
    switch (parts[0]) {
      case CommandIds.JOIN:
        await handleAdminSetActiveCommand(interaction, parts[1], true)
        return
      case CommandIds.LEAVE:
        await handleAdminSetActiveCommand(interaction, parts[1], false)
        return
      case CommandIds.ROLE:
        await handleAdminShowRoleButtons(interaction, parts[1])
        return
      case CommandIds.ADD_ACCOUNT:
        await handleAdminAddHotsAccountButton(interaction, parts[1])
        return
      case CommandIds.JOIN_WITH_BATTLE_TAG:
        await handleJoinCommand(interaction, parts[1])
        return
    }
  }

  if (parts.length === 3 && parts[0] === CommandIds.ROLE_ADMIN) {
    await handleAdminSetRoleCommand(interaction, parts[1], parts[2])
    return
  }

  if (parts.length === 2 && isRoleCommandId(parts[0])) {
    await handleEditRoleButtonCommand(interaction, parts[1], parts[0])
    return
  }

  if (parts.length === 3 && isRoleCommandId(parts[0])) {
    if (parts[1] === CommandIds.ACTIVE) {
      await handleEditRoleButtonCommand(interaction, parts[2], parts[0], undefined, true)
    } else if (parts[2] in roleMap) {
      await handleEditRoleButtonCommand(interaction, parts[1], parts[0], parts[2])
    }
    return
  }

  if (parts.length === 4 && parts[0].startsWith(CommandIds.PLAYERS_ALL_PAGE)) {
    switch (parts[0]) {
      case CommandIds.PLAYERS_ALL_PAGE:
      case CommandIds.PLAYERS_ALL_PAGE_SORT:
        await handlePlayersAllCommand(
          interaction,
          true,
          parts[1] === 'mmr' ? 'mmr' : 'alphabetical',
          parts[2] === 'true',
          parts[3]
        )
        return
    }
  }

  if (parts.length === 4 && isAdminSetActiveCommand(interaction, parts[0], parts[1], parts[2], parts[3])) {
    await handleAdminSetActiveCommand(interaction, parts[2], parts[3] === 'true', true)
    return
  }

  if (parts.length === 5 && isRoleCommandId(parts[0])) {
    await handleEditRoleButtonCommand(
      interaction,
      parts[3],
      parts[0],
      parts[4],
      parts[1] === CommandIds.ACTIVE,
      parts[2]
    )
    return
  }

  if (parts.length === 6 && parts[0] === CommandIds.ADMIN && parts[1] === CommandIds.PRIMARY) {
    await handleAdminPrimaryCommand(interaction, parts[2], parts[3], parts[4], parts[5])
    return
  }

  if (interaction.isButton() && interaction.customId.startsWith('draft_pick:')) {
    const pickedPlayerId = interaction.customId.split(':')[1]
    await handleDraftPickButton(interaction, pickedPlayerId)
    return
  }

  if (interaction.isButton() && interaction.customId.startsWith('fair_swap:')) {
    const parts = interaction.customId.split(':')
    const rankA = parseInt(parts[1], 10)
    const rankB = parseInt(parts[2], 10)
    await handleFairSwapButton(interaction, rankA, rankB)
    return
  }

  if (interaction.isButton() && interaction.customId.startsWith('draft_coin:')) {
    const callStr = interaction.customId.split(':')[1]
    const call: 'heads' | 'tails' = callStr === 'heads' ? 'heads' : 'tails'
    await handleDraftCoinCallButton(interaction, call)
    return
  }

  if (interaction.isButton() && interaction.customId.startsWith('draft_choice:')) {
    const choiceStr = interaction.customId.split(':')[1]
    const isFirstPick = choiceStr === 'first'
    await handleDraftChoiceButton(interaction, isFirstPick)
    return
  }

  if (interaction.isButton() && interaction.customId === 'draft_undo') {
    await handleDraftUndoCommand(interaction)
    return
  }

  if (interaction.isButton() && interaction.customId === 'draft_toggle_mode') {
    await handleDraftToggleModeButton(interaction)
    return
  }

  await handleUnknownCommand(interaction, commandName)
}

/**
 * Top-level interaction dispatcher that routes incoming Discord interactions.
 */
export async function dispatchInteraction(interaction: Interaction<CacheType>): Promise<void> {
  if (interaction.isAutocomplete()) {
    if (interaction.commandName === CommandIds.DRAFT) {
      await handleDraftAutocomplete(interaction)
      return
    }
    if (
      interaction.commandName === CommandIds.LOOKUP ||
      interaction.commandName === CommandIds.ADD_ACCOUNT ||
      interaction.options.getFocused(true).name === CommandIds.BATTLE_TAG
    ) {
      await handleLookupAutocomplete(interaction)
      return
    }
    if (interaction.commandName === CommandIds.SUB) {
      await handleAssignAccountAutocomplete(interaction)
      return
    }
    if (interaction.commandName === CommandIds.REPLAYS) {
      await handleReassignReplayPlayerAutocomplete(interaction)
      return
    }
    return
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('lookup_replay_select:')) {
    await handleLookupReplaySelect(interaction)
    return
  }

  if (!interaction.isChatInputCommand() && !interaction.isButton()) return

  if (interaction.isButton() && interaction.customId.startsWith('admin_unlinked_')) {
    await handleAdminUnlinkedButton(interaction)
    return
  }

  if (interaction.isButton() && interaction.customId.startsWith('mapvote:')) {
    const parts = interaction.customId.split(':')
    const action = parts[1]
    const sessionId = parts[2]
    const mapId = parts[3]

    if (action === 'vote') {
      await handleVoteMapButtonClick(interaction, sessionId, mapId)
      return
    } else if (action === 'remove') {
      await handleVoteRemoveButtonClick(interaction, sessionId)
      return
    } else if (action === 'end') {
      await handleEndMapVoteCommand(interaction, sessionId)
      return
    } else if (action === 'cancel') {
      await handleCancelMapVoteCommand(interaction, sessionId)
      return
    }
  }

  const commandName = getCommandName(interaction)
  if (!commandName) return

  const handler = exactHandlers.get(commandName)
  if (handler) {
    await handler(interaction)
    return
  }

  await handlePatternCommand(interaction, commandName)
}
