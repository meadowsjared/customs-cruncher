import dotenv from 'dotenv'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CacheType,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
} from 'discord.js'

dotenv.config()

export const botChannelName = '🫠-customs-cruncher'

function parseAdminUserIds(): string[] {
  const envCandidates = [
    ...(process.env.ADMIN_USER_IDS ? process.env.ADMIN_USER_IDS.split(',').map(id => id.trim()) : []),
    process.env.ADMIN_USER_ID?.trim(),
  ]
  const validIds: string[] = []
  for (const id of envCandidates) {
    if (id && id.length > 0 && !validIds.includes(id)) {
      validIds.push(id)
    }
  }
  return validIds
}

export const adminUserIds: string[] = parseAdminUserIds()

// create an enum for the commands
export const enum CommandIds {
  NEW_GAME = 'new_game',
  SCAN_LOBBY = 'scan_lobby',
  SCREENSHOT = 'screenshot',
  SYNC = 'sync',
  MAKE_TEAMS = 'make_teams',
  SET_TEAMS = 'set_teams',
  SET_GAME_HOST = 'set_game_host',
  GAME_HOST_ID = 'game_host_id',
  DRAFT = 'draft',
  DRAFT_CAPTAIN = 'draft_captain',
  DRAFT_MODE = 'draft_mode',
  DRAFT_UNDO = 'draft_undo',
  DRAFT_TEAM_ASSIGN = 'draft_team_assign',
  SWAP_PLAYERS = 'swap_players',
  PUBLISH_TEAMS = 'publish_teams',
  TEAMS = 'teams',
  TEAMS_EPHEMERAL = 'teams_ephemeral',
  SHOW_TEAMS = 'show_teams',
  CHECK_TEAMS = 'check_teams',
  SET_CHANNEL_TEAM_ID = 'set_team_channel',
  SET_LOBBY_CHANNEL = 'set_lobby_channel',
  SET_BOT_CHANNEL = 'set_bot_channel',
  RENAME_BOT_CHANNEL = 'rename_bot_channel',
  MOVE_TO_LOBBY = 'move_all_to_lobby',
  MOVE_TO_TEAMS = 'move_teams',
  GUIDE = 'guide',
  HELP = 'help',
  JOIN = 'join',
  REJOIN = 'rejoin',
  JOIN_WITH_BATTLE_TAG = 'join-with-battle-tag',
  BATTLE_TAG = 'battle-tag',
  ADD_ACCOUNT = 'add-account',
  PRIMARY = 'primary',
  REAL_ID_NAME = 'real-id-name',
  DISCORD_ID = 'discord-id',
  DISCORD_DISPLAY_NAME = 'discord-display-name',
  DISCORD_NAME = 'discord-name',
  ROLE = 'role',
  ROLE_EDIT_ADD = 'role-edit-add',
  ROLE_EDIT_REMOVE = 'role-edit-remove',
  ROLE_EDIT_REPLACE = 'role-edit-replace',
  ROLE_ADMIN = 'role-admin',
  ACTIVE = 'active',
  REFRESH = 'refresh',
  INACTIVE = 'inactive',
  LEAVE = 'leave',
  CLEAR = 'clear',
  PLAYER = 'player',
  PLAYERS = 'players',
  PLAYERS_RAW = 'players-raw',
  PLAYERS_ALL = 'players-all',
  PLAYERS_ALL_PAGE = 'players-all-page',
  PLAYERS_ALL_PAGE_SORT = 'players-all-page-sort',
  TWITCH = 'twitch',
  REGISTER = 'register',
  LOOKUP = 'lookup',
  RECENT_MATCHES_LIMIT = 'num_recents',
  MIN_HERO_GAMES = 'min_hero_games',
  NUM_HEROES = 'num_heroes',
  PUBLISH = 'publish',
  DELETE_PLAYER = 'delete-player',
  DELETE_HOTS_ACCOUNT = 'delete-hots-account',
  ADMIN = 'admin',
  MOVE = 'move',
  DELETE_MESSAGE = 'delete-message',
  ROLE_TANK = 'T',
  ROLE_ASSASSIN = 'A',
  ROLE_BRUISER = 'B',
  ROLE_HEALER = 'H',
  ROLE_FLEX = 'F',
  ROLE_TANK_ACTIVE = 'T_active',
  ROLE_ASSASSIN_ACTIVE = 'A_active',
  ROLE_BRUISER_ACTIVE = 'B_active',
  ROLE_HEALER_ACTIVE = 'H_active',
  ROLE_FLEX_ACTIVE = 'F_active',
  RENAME_HOTS_ACCOUNT = 'rename-hots-account',
  IMPORT_REPLAYS = 'import-replays',
  START_DATE_OR_COUNT = 'start_date_or_count',
  END_DATE = 'end_date',
  CHANNEL_COMMAND = 'channel-command',
  CHANNEL = 'channel',
  BOT_CHANNEL_ID = 'bot_channel_id',
  COMMAND = 'command',
  MESSAGE_ID = 'message-id',
  FIELD1 = 'field1',
  DELETE_ACCOUNT = 'delete-account',
  MAP = 'map',
  MAP_VOTE = 'map-vote',
  END_MAP_VOTE = 'end-map-vote',
  CANCEL_MAP_VOTE = 'cancel-map-vote',
  VOTE_MAP_BTN = 'vote-map-btn',
  REMOVE_MAP_VOTE = 'remove-map-vote',
  PLAYER_ADJUST = 'player-adjust',
  ASSIGN_ACCOUNT = 'assign_account',
  ASSIGN_ACCOUNT_CLEAR = 'assign_account_clear',
  SUB = 'sub',
  ACCOUNT = 'account',
  TO = 'to',
  UNLINKED = 'unlinked',
  MIN_GAMES = 'min_games',
  SEARCH = 'search',
  SORT = 'sort',
  REASSIGN_REPLAY_PLAYER = 'reassign-replay-player',
  REPLAYS = 'replays',
  RECENT_REPLAYS = 'recent-replays',
  REPLAY = 'replay',
  COUNT = 'count',
}

export const roleMap: Record<string, string> = {
  T: '🛡️ Tank',
  A: '⚔️ Assassin',
  B: '💪 Bruiser',
  H: '💉 Healer',
  F: '🔄 Flex',
}

export const playersBtn = new ButtonBuilder()
  .setCustomId(CommandIds.PLAYERS)
  .setLabel('Show Players')
  .setStyle(ButtonStyle.Primary)
export const leaveBtn = new ButtonBuilder()
  .setCustomId(CommandIds.LEAVE)
  .setLabel('Leave')
  .setStyle(ButtonStyle.Primary)
export const rejoinBtn = new ButtonBuilder()
  .setCustomId(CommandIds.REJOIN)
  .setLabel('Rejoin')
  .setStyle(ButtonStyle.Primary)
export const joinBtn = new ButtonBuilder().setCustomId(CommandIds.JOIN).setLabel('Join').setStyle(ButtonStyle.Primary)
export const addAccountBtn = new ButtonBuilder()
  .setCustomId(CommandIds.ADD_ACCOUNT)
  .setLabel('Add Hots Account')
  .setStyle(ButtonStyle.Primary)
export const roleBtn = new ButtonBuilder()
  .setCustomId(CommandIds.ROLE)
  .setLabel('Change Role')
  .setStyle(ButtonStyle.Primary)
export const rolesRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
  ...Object.entries(roleMap).map(([key, label]) => {
    return new ButtonBuilder().setCustomId(key).setLabel(label).setStyle(ButtonStyle.Primary)
  })
)
export const imPlayingBtn = new ButtonBuilder()
  .setCustomId(CommandIds.REJOIN)
  .setLabel("I'm playing this game")
  .setStyle(ButtonStyle.Primary)

export type chatOrButtonOrModal =
  | ChatInputCommandInteraction<CacheType>
  | ButtonInteraction<CacheType>
  | ModalSubmitInteraction<CacheType>
