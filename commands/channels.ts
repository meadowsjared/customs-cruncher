import {
  ButtonInteraction,
  CacheType,
  ChannelType,
  ChatInputCommandInteraction,
  MessageFlags,
  VoiceChannel,
} from 'discord.js'
import { getChannels, saveChannel } from '../store/channels'
import { getGameHostId, setGameHostId, setSetting } from '../store/settings'
import { getBotChannel } from '../utils/channel'
import { requireGuildId, safeReply } from '../utils/interaction'
import { CommandIds } from '../constants'

export async function handleSetChannelTeamIdCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (interaction.isButton()) {
    console.error('Interaction is not a command or button interaction')
    return
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  const channel =
    interaction.options.getChannel('channel', false) ??
    interaction.options.getChannel('channel_id', false)
  const teamId =
    interaction.options.getString('team', false) ??
    interaction.options.getString('team_number', false)
  if (!channel || !teamId) {
    await handleGetChannelsCommand(interaction)
    return
  }
  if (!(channel instanceof VoiceChannel)) {
    await safeReply(interaction, {
      content: 'Please select a valid voice channel.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  await saveChannel(guildId, teamId, channel)
  await safeReply(interaction, {
    content: `\`${teamId}\` channel set to <#${channel.id}>.`,
    flags: MessageFlags.Ephemeral,
  })
}

export async function handleSetLobbyChannelCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (!interaction.isChatInputCommand() || interaction.isButton()) {
    console.error('Interaction is not a command or button interaction')
    return
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  const channel =
    interaction.options.getChannel('channel', false) ??
    interaction.options.getChannel('channel_id', false)
  if (channel === null) {
    await handleGetChannelsCommand(interaction)
    return
  }

  if (!(channel instanceof VoiceChannel)) {
    await safeReply(interaction, {
      content: 'Please select a valid voice channel.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  await saveChannel(guildId, 'lobby', channel)
  await safeReply(interaction, {
    content: `\`lobby\` channel set to <#${channel.id}>`,
    flags: MessageFlags.Ephemeral,
  })
}

export async function handleSetBotChannelCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (!interaction.isChatInputCommand() || interaction.isButton()) {
    console.error('Interaction is not a chat input command')
    return
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return

  const channel = interaction.options.getChannel('channel', true)
  if (channel.type !== ChannelType.GuildText) {
    return await safeReply(interaction, {
      content: 'Please select a valid text channel.',
      flags: MessageFlags.Ephemeral,
    })
  }

  await setSetting(CommandIds.BOT_CHANNEL_ID, channel.id, guildId)

  return await safeReply(interaction, {
    content: `Bot channel set to <#${channel.id}>.`,
    flags: MessageFlags.Ephemeral,
  })
}

export async function handleRenameBotChannelCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (!interaction.isChatInputCommand() || interaction.isButton()) {
    console.error('Interaction is not a chat input command')
    return
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return

  const newName = interaction.options.getString('name', true)
  const channel = await getBotChannel(interaction.guild)

  if (!channel) {
    return await safeReply(interaction, {
      content: 'Bot channel is not set or not found. Use `/channel bot` first.',
      flags: MessageFlags.Ephemeral,
    })
  }

  if ('setName' in channel && typeof channel.setName === 'function') {
    try {
      await channel.setName(newName)
      return await safeReply(interaction, {
        content: `Bot channel <#${channel.id}> renamed to **${newName}**!`,
        flags: MessageFlags.Ephemeral,
      })
    } catch (error) {
      console.error('Error renaming bot channel:', error)
      return await safeReply(interaction, {
        content: 'Failed to rename bot channel. Please check bot permissions.',
        flags: MessageFlags.Ephemeral,
      })
    }
  }

  return await safeReply(interaction, {
    content: 'The configured bot channel cannot be renamed.',
    flags: MessageFlags.Ephemeral,
  })
}

export async function handleGetChannelsCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  const guildId = await requireGuildId(interaction)
  if (!guildId) return
  const channels = await getChannels(guildId, ['lobby', 'team1', 'team2'])
  const lobbyChannel = channels?.find(c => c.channelType === 'lobby')
  const team1Channel = channels?.find(c => c.channelType === 'team1')
  const team2Channel = channels?.find(c => c.channelType === 'team2')
  const botChannel = await getBotChannel(interaction.guild)
  const hostId = await getGameHostId(guildId)

  await safeReply(interaction, {
    content: `**Server Configuration:**\n- Lobby: ${
      lobbyChannel ? `<#${lobbyChannel.channelId}>` : '*Not set*'
    }\n- Team 1: ${team1Channel ? `<#${team1Channel.channelId}>` : '*Not set*'}\n- Team 2: ${
      team2Channel ? `<#${team2Channel.channelId}>` : '*Not set*'
    }\n- Bot Channel: ${botChannel ? `<#${botChannel.id}>` : '*Not set*'}\n- Game Host: ${
      hostId ? `<@${hostId}>` : '*Not set*'
    }`,
    flags: MessageFlags.Ephemeral,
  })
}

export async function handleSetGameHostCommand(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  if (!interaction.isChatInputCommand()) {
    console.error('Interaction is not a chat input command')
    return
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return

  const targetUser = interaction.options.getUser(CommandIds.USER)
  if (!targetUser) {
    const currentHostId = await getGameHostId(guildId)
    if (currentHostId) {
      return await safeReply(interaction, {
        content: `Current game host for this server is <@${currentHostId}>.`,
        flags: MessageFlags.Ephemeral,
      })
    } else {
      const ownerId = interaction.guild?.ownerId
      const ownerText = ownerId ? ` (defaults to server owner <@${ownerId}>)` : ''
      return await safeReply(interaction, {
        content: `No game host is currently configured for this server${ownerText}. Run \`/channel host user:@username\` to assign one.`,
        flags: MessageFlags.Ephemeral,
      })
    }
  }

  await setGameHostId(guildId, targetUser.id)
  return await safeReply(interaction, {
    content: `✅ Game host for this server set to <@${targetUser.id}>.`,
    flags: MessageFlags.Ephemeral,
  })
}

export async function handleChannelSubCommand(
  interaction: ChatInputCommandInteraction<CacheType>
) {
  const subcommand = interaction.options.getSubcommand(false)
  switch (subcommand) {
    case 'lobby':
      await handleSetLobbyChannelCommand(interaction)
      return
    case 'team':
      await handleSetChannelTeamIdCommand(interaction)
      return
    case 'bot':
      await handleSetBotChannelCommand(interaction)
      return
    case 'rename-bot':
      await handleRenameBotChannelCommand(interaction)
      return
    case 'host':
      await handleSetGameHostCommand(interaction)
      return
    case 'show':
    default:
      await handleGetChannelsCommand(interaction)
      return
  }
}
