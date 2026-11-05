import {
  ApplicationCommandDataResolvable,
  ApplicationCommandOptionType,
  ChannelType,
  PermissionsBitField,
} from 'discord.js'
import { CommandIds, roleMap } from '../constants'
import { makeTeamsModeChoices } from '../utils/teamMaker'

const minimumAdminPermissions: bigint = PermissionsBitField.Flags.MoveMembers
/**
 * define the commands for the bot
 * these will be registered as slash commands
 */
export const slashCommands: ApplicationCommandDataResolvable[] = [
  {
    name: CommandIds.JOIN,
    description: 'Join with your hots battle tag and role',
    options: [
      {
        name: CommandIds.BATTLE_TAG,
        type: ApplicationCommandOptionType.String,
        description: 'Your hots battle tag (e.g. Name#1234)',
        autocomplete: true,
        required: true,
      },
      {
        name: CommandIds.ROLE,
        type: ApplicationCommandOptionType.String,
        description: 'Your role in the game',
        required: true,
        choices: Object.entries(roleMap).map(([key, label]) => ({
          name: label,
          value: key,
        })),
      },
    ],
  },
  {
    name: CommandIds.LEAVE,
    description: 'Leave the lobby',
  },
  {
    name: CommandIds.ADD_ACCOUNT,
    description: 'Add a Heroes of the Storm account to your profile',
    options: [
      {
        name: CommandIds.BATTLE_TAG,
        type: ApplicationCommandOptionType.String,
        description: 'The Heroes of the Storm battle tag to add',
        autocomplete: true,
        required: true,
      },
    ],
  },
  {
    name: CommandIds.ROLE,
    description: 'Set your role',
  },
  {
    name: CommandIds.DELETE_MESSAGE,
    description: 'Delete a message by ID',
    defaultMemberPermissions: minimumAdminPermissions,
    options: [
      {
        name: CommandIds.MESSAGE_ID,
        type: ApplicationCommandOptionType.String,
        description: 'The ID of the message to delete',
        required: true,
      },
    ],
  },
  {
    name: CommandIds.LOBBY,
    description: 'Custom game lobby management commands',
    defaultMemberPermissions: minimumAdminPermissions,
    options: [
      {
        name: 'new',
        description: 'Start a new game lobby session and clear current active players',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: CommandIds.SCREENSHOT,
            type: ApplicationCommandOptionType.Attachment,
            description: 'Optional HotS lobby screenshot to automatically add players',
            required: false,
          },
          {
            name: CommandIds.SYNC,
            type: ApplicationCommandOptionType.Boolean,
            description: 'Synchronize lobby exactly to screenshot (defaults to False; removes absent players when True)',
            required: false,
          },
        ],
      },
      {
        name: 'scan',
        description: 'Scan a HotS custom game lobby screenshot to add players and check who is missing',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: CommandIds.SCREENSHOT,
            type: ApplicationCommandOptionType.Attachment,
            description: 'HotS lobby screenshot',
            required: true,
          },
          {
            name: CommandIds.SYNC,
            type: ApplicationCommandOptionType.Boolean,
            description: 'Synchronize lobby exactly to screenshot (defaults to False; removes absent players when True)',
            required: false,
          },
        ],
      },
      {
        name: 'refresh',
        description: 'Refresh the lobby announcement message',
        type: ApplicationCommandOptionType.Subcommand,
      },
      {
        name: 'clear',
        description: 'Clear the lobby and remove all players',
        type: ApplicationCommandOptionType.Subcommand,
      },
    ],
  },
  {
    name: CommandIds.TEAMS,
    description: 'Team management and balancing commands',
    defaultMemberPermissions: minimumAdminPermissions,
    options: [
      {
        name: 'show',
        description: 'Show current teams (ephemeral by default, with option to publish)',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: CommandIds.PUBLISH,
            type: ApplicationCommandOptionType.Boolean,
            description: 'Whether to instantly publish the teams publicly (defaults to False)',
            required: false,
          },
        ],
      },
      {
        name: 'make',
        description: 'Create proposed teams using MMR balancing',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'mode',
            type: ApplicationCommandOptionType.String,
            description: 'Team generation mode (defaults to Standard)',
            required: false,
            choices: makeTeamsModeChoices,
          },
          {
            name: 'publish',
            type: ApplicationCommandOptionType.Boolean,
            description: 'Whether to instantly publish the teams',
            required: false,
          },
        ],
      },
      {
        name: 'set',
        description: 'Load or set teams by player indices',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'teams_data',
            type: ApplicationCommandOptionType.String,
            description: 'The team data (e.g. "1 4 5 6 10" or "1 3 5 7 9, 2 4 6 8 10")',
            required: true,
          },
        ],
      },
      {
        name: 'swap',
        description: 'Swap two players between teams',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'player-a',
            type: ApplicationCommandOptionType.Integer,
            description: 'The first player to swap (1-10)',
            required: true,
          },
          {
            name: 'player-b',
            type: ApplicationCommandOptionType.Integer,
            description: 'The second player to swap (1-10)',
            required: true,
          },
        ],
      },
      {
        name: 'publish',
        description: 'Post the teams to the channel',
        type: ApplicationCommandOptionType.Subcommand,
      },
      {
        name: 'check',
        description: 'Check that current teams match a lobby screenshot and suggest swaps',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: CommandIds.SCREENSHOT,
            type: ApplicationCommandOptionType.Attachment,
            description: 'HotS lobby screenshot to verify teams',
            required: true,
          },
          {
            name: CommandIds.PUBLISH,
            type: ApplicationCommandOptionType.Boolean,
            description: 'Publish the result publicly (defaults to false)',
            required: false,
          },
        ],
      },
    ],
  },
  {
    name: CommandIds.DRAFT,
    description: 'Interactive captain draft commands',
    defaultMemberPermissions: minimumAdminPermissions,
    options: [
      {
        name: 'start',
        description: 'Start an interactive captain draft to pick teams',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'team1_captain',
            type: ApplicationCommandOptionType.String,
            description: 'Team 1 Captain (active lobby players)',
            required: false,
            autocomplete: true,
          },
          {
            name: 'team2_captain',
            type: ApplicationCommandOptionType.String,
            description: 'Team 2 Captain (active lobby players)',
            required: false,
            autocomplete: true,
          },
          {
            name: 'mode',
            type: ApplicationCommandOptionType.String,
            description: 'Draft mode style',
            required: false,
            choices: [
              { name: 'Captains Mode (1-2-2 Rotation)', value: 'captains' },
              { name: 'Free Pick Mode', value: 'free' },
            ],
          },
        ],
      },
      {
        name: 'captain',
        description: 'Set or change team captains mid-draft',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'team1_captain',
            type: ApplicationCommandOptionType.String,
            description: 'Team 1 Captain (active lobby players)',
            required: false,
            autocomplete: true,
          },
          {
            name: 'team2_captain',
            type: ApplicationCommandOptionType.String,
            description: 'Team 2 Captain (active lobby players)',
            required: false,
            autocomplete: true,
          },
        ],
      },
      {
        name: 'mode',
        description: 'Change the draft mode style mid-draft',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'mode',
            type: ApplicationCommandOptionType.String,
            description: 'The draft mode to switch to',
            required: true,
            choices: [
              { name: 'Captains Mode (1-2-2 Rotation)', value: 'captains' },
              { name: 'Free Pick ➡️ Team 1 (🔵)', value: 'free_team1' },
              { name: 'Free Pick ➡️ Team 2 (🔴)', value: 'free_team2' },
            ],
          },
        ],
      },
      {
        name: 'undo',
        description: 'Undo draft pick(s) or reset teams back to captains',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'count',
            type: ApplicationCommandOptionType.Integer,
            description: 'Number of draft picks to undo (default: 1)',
            required: false,
          },
          {
            name: 'all',
            type: ApplicationCommandOptionType.Boolean,
            description: 'Undo all draft picks, resetting teams back to captains',
            required: false,
          },
        ],
      },
      {
        name: 'assign',
        description: 'Assign or move a player to Team 1, Team 2, or Spectators mid-draft',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'team',
            type: ApplicationCommandOptionType.String,
            description: 'The team or spectator assignment',
            required: true,
            choices: [
              { name: 'Team 1', value: '1' },
              { name: 'Team 2', value: '2' },
              { name: 'Bench', value: 'spectator' },
            ],
          },
          {
            name: 'player',
            type: ApplicationCommandOptionType.String,
            description: 'The player to assign to a team',
            required: true,
            autocomplete: true,
          },
        ],
      },
    ],
  },
  {
    name: CommandIds.CHANNEL,
    description: 'Channel and server configuration commands',
    defaultMemberPermissions: minimumAdminPermissions,
    options: [
      {
        name: 'show',
        description: 'View currently configured voice channels, bot channel, and game host',
        type: ApplicationCommandOptionType.Subcommand,
      },
      {
        name: 'lobby',
        description: 'Set or view the custom game lobby voice channel',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'channel',
            type: ApplicationCommandOptionType.Channel,
            description: 'The voice channel to set as the lobby (leave blank to view current)',
            required: false,
            channelTypes: [ChannelType.GuildVoice],
          },
        ],
      },
      {
        name: 'team',
        description: 'Set or view a team voice channel',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'team',
            type: ApplicationCommandOptionType.String,
            description: 'The team number to set the channel for',
            required: false,
            choices: [
              { name: 'Team 1', value: 'team1' },
              { name: 'Filthy Team 2', value: 'team2' },
            ],
          },
          {
            name: 'channel',
            type: ApplicationCommandOptionType.Channel,
            description: 'The voice channel to set for the team (leave blank to view current)',
            required: false,
            channelTypes: [ChannelType.GuildVoice],
          },
        ],
      },
      {
        name: 'bot',
        description: 'Set the bot interaction and announcement text channel',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'channel',
            type: ApplicationCommandOptionType.Channel,
            description: 'The text channel to set for the bot',
            required: true,
            channelTypes: [ChannelType.GuildText],
          },
        ],
      },
      {
        name: 'rename-bot',
        description: 'Rename the bot interaction and announcement text channel',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'name',
            type: ApplicationCommandOptionType.String,
            description: 'The new name for the bot channel',
            required: true,
          },
        ],
      },
      {
        name: 'host',
        description: 'Set or view the game host / lobby administrator for this server',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'user',
            type: ApplicationCommandOptionType.User,
            description: 'The Discord user who hosts custom games (leave blank to view current)',
            required: false,
          },
        ],
      },
    ],
  },
  {
    name: CommandIds.GUIDE,
    description: 'Show the guide for how to play',
  },
  {
    name: CommandIds.HELP,
    description: 'Show the help for how to play',
  },
  {
    name: CommandIds.REJOIN,
    description: 'Rejoin the lobby with your previous battle tag and role',
  },
  {
    name: CommandIds.PLAYERS,
    description: 'List players in the lobby or all registered players in the database',
    options: [
      {
        name: 'mode',
        description: 'View mode: raw lobby mentions, or all registered players (defaults to active lobby)',
        type: ApplicationCommandOptionType.String,
        required: false,
        choices: [
          { name: 'raw', value: 'raw' },
          { name: 'all', value: 'all' },
        ],
      },
    ],
  },
  {
    name: CommandIds.TWITCH,
    description: "Show Norator's Twitch channel",
  },
  {
    name: CommandIds.REGISTER,
    description: 'Register a player and their HotS BattleTag into the bot database',
    options: [
      {
        name: CommandIds.BATTLE_TAG,
        type: ApplicationCommandOptionType.String,
        description: 'Heroes of the Storm BattleTag (e.g. Name#1234)',
        required: true,
      },
      {
        name: CommandIds.DISCORD_ID,
        type: ApplicationCommandOptionType.User,
        description: 'The Discord member to register (defaults to yourself)',
        required: false,
      },
      {
        name: CommandIds.ROLE,
        type: ApplicationCommandOptionType.String,
        description: 'Preferred player role',
        required: false,
        choices: Object.entries(roleMap).map(([key, label]) => ({
          name: label,
          value: key,
        })),
      },
    ],
  },
  {
    name: CommandIds.LOOKUP,
    description: "Look up a player's Discord information, HotS accounts, and stats",
    options: [
      {
        name: CommandIds.DISCORD_ID,
        type: ApplicationCommandOptionType.User,
        description: 'The Discord user of the player to lookup',
        required: false,
      },
      {
        name: CommandIds.BATTLE_TAG,
        type: ApplicationCommandOptionType.String,
        description: 'HotS BattleTag or account name (e.g. Name#1234 or Name)',
        required: false,
        autocomplete: true,
      },
      {
        name: CommandIds.RECENT_MATCHES_LIMIT,
        type: ApplicationCommandOptionType.Integer,
        description: 'Number of recent matches to include (default: 13)',
        required: false,
        minValue: 1,
        maxValue: 100,
      },
      {
        name: CommandIds.MIN_HERO_GAMES,
        type: ApplicationCommandOptionType.Integer,
        description: 'Minimum games required for Best Heroes (default: 5)',
        required: false,
        minValue: 0,
      },
      {
        name: CommandIds.NUM_HEROES,
        type: ApplicationCommandOptionType.Integer,
        description: 'Number of heroes to show for Top Played and Best Heroes (default: 3)',
        required: false,
        minValue: 1,
        maxValue: 100,
      },
      {
        name: CommandIds.PUBLISH,
        type: ApplicationCommandOptionType.String,
        description: 'Post the lookup results publicly instead of ephemeral',
        required: false,
        choices: [
          {
            name: 'true',
            value: 'true',
          },
        ],
      },
    ],
  },
  {
    name: CommandIds.ADMIN,
    description: 'Admin commands to manage players.',
    defaultMemberPermissions: minimumAdminPermissions,
    options: [
      {
        name: CommandIds.ROLE,
        description: "Change a player's role.",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: CommandIds.DISCORD_ID,
            description: 'The user to modify.',
            type: ApplicationCommandOptionType.User,
            required: true,
          },
          {
            name: CommandIds.ROLE,
            description: "The player's new role.",
            type: ApplicationCommandOptionType.String,
            required: false,
            choices: Object.entries(roleMap).map(([key, label]) => ({
              name: label,
              value: key,
            })),
          },
        ],
      },
      {
        name: CommandIds.ADD_ACCOUNT,
        description: "Add a Heroes of the Storm account to a player's profile.",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: CommandIds.BATTLE_TAG,
            description: 'The Heroes of the Storm battle tag to add (including the # and number)',
            type: ApplicationCommandOptionType.String,
            autocomplete: true,
            required: true,
          },
          {
            name: CommandIds.DISCORD_ID,
            description: 'The user to modify.',
            type: ApplicationCommandOptionType.User,
            required: true,
          },
        ],
      },
      {
        name: CommandIds.DELETE_ACCOUNT,
        description: "Delete a player's Heroes of the Storm account.",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: CommandIds.DISCORD_ID,
            description: 'The user to modify.',
            type: ApplicationCommandOptionType.User,
            required: true,
          },
          {
            name: CommandIds.BATTLE_TAG,
            description: 'The Heroes of the Storm battle tag to delete (including the # and number)',
            type: ApplicationCommandOptionType.String,
            autocomplete: true,
            required: false,
          },
        ],
      },
      {
        name: CommandIds.PRIMARY,
        description: "Set a player's primary Heroes of the Storm account.",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: CommandIds.DISCORD_ID,
            description: 'The user to modify.',
            type: ApplicationCommandOptionType.User,
            required: true,
          },
          {
            name: CommandIds.BATTLE_TAG,
            description: "The player's Heroes of the Storm battle tag to set as primary (including the # and number).",
            type: ApplicationCommandOptionType.String,
            autocomplete: true,
            required: false,
          },
        ],
      },
      {
        name: CommandIds.REAL_ID_NAME,
        description: "Set, view, or clear a player's Battle.net Real ID name.",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: CommandIds.BATTLE_TAG,
            description: 'The Heroes of the Storm battle tag (e.g. Name#1234).',
            type: ApplicationCommandOptionType.String,
            required: false,
            autocomplete: true,
          },
          {
            name: CommandIds.DISCORD_ID,
            description: 'The Discord user (defaults to primary account if battle-tag omitted).',
            type: ApplicationCommandOptionType.User,
            required: false,
          },
          {
            name: 'name',
            description: 'The Real ID name to set (leave blank to view or clear).',
            type: ApplicationCommandOptionType.String,
            required: false,
          },
          {
            name: 'clear',
            description: 'Set to true to clear the Real ID name.',
            type: ApplicationCommandOptionType.Boolean,
            required: false,
          },
        ],
      },
      {
        name: CommandIds.UNLINKED,
        description: 'List unlinked HotS accounts found in custom match replays.',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: CommandIds.MIN_GAMES,
            description: 'Minimum number of games played (default: 1).',
            type: ApplicationCommandOptionType.Integer,
            required: false,
          },
          {
            name: CommandIds.SEARCH,
            description: 'Filter by player name or BattleTag.',
            type: ApplicationCommandOptionType.String,
            required: false,
          },
          {
            name: CommandIds.SORT,
            description: 'Sort by most recent game or total games played (default: recent).',
            type: ApplicationCommandOptionType.String,
            required: false,
            choices: [
              { name: 'Most Recent', value: 'recent' },
              { name: 'Most Games', value: 'games' },
            ],
          },
        ],
      },
    ],
  },
  {
    name: CommandIds.MOVE,
    description: 'Voice channel move commands',
    defaultMemberPermissions: minimumAdminPermissions,
    options: [
      {
        name: 'teams',
        description: 'Move players to their assigned team voice channels',
        type: ApplicationCommandOptionType.Subcommand,
      },
      {
        name: 'lobby',
        description: 'Gather players back to the lobby voice channel',
        type: ApplicationCommandOptionType.Subcommand,
      },
    ],
  },
  {
    name: CommandIds.CHANNEL_COMMAND,
    description: 'Execute a command',
    defaultMemberPermissions: minimumAdminPermissions,
    options: [
      {
        name: CommandIds.COMMAND,
        description: 'The command to execute',
        type: ApplicationCommandOptionType.String,
        required: true,
      },

      {
        name: CommandIds.MESSAGE_ID,
        description: 'The ID of the message to execute the command on (if applicable)',
        type: ApplicationCommandOptionType.String,
        required: false,
      },
      {
        name: CommandIds.CHANNEL,
        description: 'The channel to execute the command in',
        type: ApplicationCommandOptionType.Channel,
        required: false,
        channelTypes: [ChannelType.GuildText],
      },
      {
        name: CommandIds.FIELD1,
        description: 'Additional field 1 for the command (if applicable)',
        type: ApplicationCommandOptionType.String,
        required: false,
      },
    ],
  },
  {
    name: CommandIds.MAP,
    description: 'Map voting commands',
    options: [
      {
        name: 'vote',
        description: 'Start a vote for the next map',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'title',
            description: 'Custom title for the map vote (optional)',
            type: ApplicationCommandOptionType.String,
            required: false,
          },
          {
            name: 'game-number',
            description: 'The game number (optional)',
            type: ApplicationCommandOptionType.Number,
            required: false,
          },
        ],
      },
      {
        name: 'end',
        description: 'End the active map vote and declare the winning map',
        type: ApplicationCommandOptionType.Subcommand,
      },
      {
        name: 'cancel',
        description: 'Cancel the active map vote session and delete its message',
        type: ApplicationCommandOptionType.Subcommand,
      },
    ],
  },
  {
    name: CommandIds.PLAYER,
    description: 'Player management commands',
    defaultMemberPermissions: minimumAdminPermissions,
    options: [
      {
        name: 'move',
        description: 'Move a specific player to a voice channel',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'user',
            type: ApplicationCommandOptionType.User,
            description: 'The player to move',
            required: true,
          },
          {
            name: 'channel',
            type: ApplicationCommandOptionType.Channel,
            description: 'The voice channel to move the user to',
            channelTypes: [ChannelType.GuildVoice],
            required: true,
          },
        ],
      },
      {
        name: 'adjust',
        description: "View or adjust a player's MMR offset (leave amount blank to view)",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'player',
            type: ApplicationCommandOptionType.User,
            description: 'The player to check or adjust MMR for',
            required: true,
          },
          {
            name: 'amount',
            type: ApplicationCommandOptionType.Number,
            description: 'The MMR adjustment value to set (leave blank to view current adjustment)',
            required: false,
          },
          {
            name: CommandIds.PUBLISH,
            type: ApplicationCommandOptionType.Boolean,
            description: 'Show the response publicly instead of ephemeral (defaults to False)',
            required: false,
          },
          {
            name: CommandIds.COUNT,
            type: ApplicationCommandOptionType.Integer,
            description: 'Number of players above and below to include in the report (default: 5)',
            required: false,
            minValue: 0,
          },
        ],
      },
      {
        name: 'active',
        description: 'Change if a player is active in the lobby',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'user',
            description: 'The user to modify',
            type: ApplicationCommandOptionType.User,
            required: false,
          },
          {
            name: CommandIds.BATTLE_TAG,
            description: 'HotS BattleTag or account name',
            type: ApplicationCommandOptionType.String,
            required: false,
            autocomplete: true,
          },
          {
            name: CommandIds.ACTIVE,
            description: 'Set the player as active (true) or inactive (false)',
            type: ApplicationCommandOptionType.Boolean,
            required: false,
          },
        ],
      },
      {
        name: 'delete',
        description: "Delete a player's profile and linked HotS accounts from the database",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'user',
            type: ApplicationCommandOptionType.User,
            description: 'The player to delete',
            required: true,
          },
        ],
      },
      {
        name: 'delete-account',
        description: "Delete a specific HotS account from a player's profile",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: CommandIds.BATTLE_TAG,
            type: ApplicationCommandOptionType.String,
            description: 'The battle tag of the account to delete (including the # and number)',
            autocomplete: true,
            required: true,
          },
        ],
      },
    ],
  },
  {
    name: CommandIds.SUB,
    description: 'Account substitution commands',
    defaultMemberPermissions: minimumAdminPermissions,
    options: [
      {
        name: 'assign',
        description: 'Temporarily assign a HotS account to a player for this evening',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: CommandIds.ACCOUNT,
            type: ApplicationCommandOptionType.String,
            description: 'HotS account to assign (e.g. HealsOnly)',
            required: true,
            autocomplete: true,
          },
          {
            name: CommandIds.TO,
            type: ApplicationCommandOptionType.User,
            description: 'Player who will be temporarily playing on this account',
            required: true,
          },
        ],
      },
      {
        name: 'clear',
        description: 'Clear active account substitutions (optionally for a specific account)',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: CommandIds.ACCOUNT,
            type: ApplicationCommandOptionType.String,
            description: 'HotS account to clear assignment for (leave blank to clear all active substitutions)',
            required: false,
            autocomplete: true,
          },
        ],
      },
    ],
  },
  {
    name: CommandIds.REPLAYS,
    description: 'Replay match management and browsing',
    options: [
      {
        name: 'recent',
        description: 'View recently imported custom match replays',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: CommandIds.REPLAY,
            type: ApplicationCommandOptionType.Integer,
            description: 'Specific match ID to view (optional, select from recent matches)',
            required: false,
            autocomplete: true,
          },
          {
            name: CommandIds.COUNT,
            type: ApplicationCommandOptionType.Integer,
            description: 'Number of recent replays to show (default 5)',
            required: false,
            minValue: 1,
          },
        ],
      },
      {
        name: 'import',
        description: 'Import custom HotS replays into the database',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: CommandIds.START_DATE_OR_COUNT,
            description: 'Start date (MM-DD) OR max number of replays to import',
            type: ApplicationCommandOptionType.String,
            required: false,
          },
          {
            name: CommandIds.END_DATE,
            description: 'End date (MM-DD)',
            type: ApplicationCommandOptionType.String,
            required: false,
          },
        ],
      },
      {
        name: 'reassign',
        description: 'Reassign a player for a specific replay match to another user',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: CommandIds.REPLAY,
            type: ApplicationCommandOptionType.Integer,
            description: 'Replay match to update (select from recent 20 matches)',
            required: true,
            autocomplete: true,
          },
          {
            name: CommandIds.ACCOUNT,
            type: ApplicationCommandOptionType.String,
            description: 'HotS account or BattleTag played in this match',
            required: true,
            autocomplete: true,
          },
          {
            name: CommandIds.TO,
            type: ApplicationCommandOptionType.User,
            description: 'Player who actually played in this replay',
            required: true,
          },
        ],
      },
    ],
  },
]
