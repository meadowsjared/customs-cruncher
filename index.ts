import dotenv from 'dotenv'

dotenv.config()

process.on('unhandledRejection', error => {
  console.error('Unhandled Promise Rejection:', error)
})

process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error)
})

import { ActivityType, ChannelType, Client, GatewayIntentBits, InteractionContextType, Partials, PresenceUpdateStatus } from 'discord.js'
import { readFileSync } from 'fs'
import { join } from 'path'
import { dispatchInteraction } from './commands/dispatcher'
import { slashCommands } from './commands/definitions'
import { adminUserIds, botChannelName, CommandIds } from './constants'
import { setSetting } from './store/settings'
import { sql } from './store/db'
import { getBotChannel } from './utils/channel'
import { startWebServer, stopWebServer } from './server/webServer'
import { initCommandLogger } from './utils/commandLogger'

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Channel, Partials.Message],
})

// reply to direct messages
client.on('messageCreate', async msg => {
  if (msg.author.bot) return
  if (msg.channel.type === ChannelType.DM) {
    const text = msg.content.trim()
    const deleteMatch = text.match(/^(?:\/|!)?(?:delete(?:-message|_message)?)\s*:?\s*(\d{17,20})$/i)
    if (deleteMatch) {
      const targetId = deleteMatch[1]
      if (!adminUserIds.includes(msg.author.id)) {
        await msg.reply('You do not have permission to delete messages.')
        return
      }
      try {
        const targetMsg = await msg.channel.messages.fetch(targetId)
        if (targetMsg.author.id !== client.user?.id) {
          await msg.reply('Discord only allows bots to delete their own messages in DMs.')
          return
        }
        await targetMsg.delete()
        await msg.reply(`Deleted message: \`${targetId}\``)
      } catch {
        await msg.reply(`Could not find message with ID \`${targetId}\` in this DM.`)
      }
      return
    }

    msg.author.send('You are DMing me now!')
  }
})

client.on('guildCreate', async guild => {
  guild.commands.set(slashCommands).catch(err => console.error(`Error setting commands for guild ${guild.name}:`, err))
  let channel = await getBotChannel(guild)
  if (!channel) {
    try {
      channel = await guild.channels.create({
        name: botChannelName,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: guild.id,
            allow: ['ViewChannel', 'SendMessages'],
          },
        ],
      })
      await setSetting(CommandIds.BOT_CHANNEL_ID, channel.id, guild.id)
      console.log(`Joined new guild: ${guild.name} (ID: ${guild.id}) - Created bot channel.`)
    } catch (err) {
      console.error(`Could not create channel in guild ${guild.name}:`, err)
    }
  }

  if (channel && 'send' in channel) {
    await channel
      .send(
        `Hello! 👋 This channel (<#${channel.id}>) is configured as the bot channel for **Customs Cruncher Bot**. You can rename it anytime with \`/rename_bot_channel\` or select a different channel with \`/set_bot_channel\`.`
      )
      .catch(err => console.error(`Error sending welcome message in guild ${guild.name}:`, err))
  } else {
    try {
      const owner = await guild.fetchOwner()
      await owner.send(
        `Thanks for adding **Customs Cruncher Bot** to **${guild.name}**! 👋\n\nPlease run \`/set_bot_channel #channel\` in your server or create a text channel named \`${botChannelName}\` to complete setup.`
      )
    } catch (err) {
      console.error(`Could not DM owner of guild ${guild.name}:`, err)
    }
  }
})

client.once('clientReady', async () => {
  void initCommandLogger().catch(err => console.error('[CommandLogger] Initialization error:', err))

  // Set bot status/activity
  client.user?.setPresence({
    status: 'online',
    activities: [
      {
        name: 'Customs Cruncher',
        type: ActivityType.Watching,
        url: 'https://www.twitch.tv/norator',
        state: 'Heroes of the Storm',
      },
    ],
  })

  // Log all guilds the bot is in and resolve bot channel
  client.guilds.cache.forEach(async guild => {
    guild.commands.set(slashCommands)
    const botChannel = await getBotChannel(guild)
    const channelName = botChannel && 'name' in botChannel ? botChannel.name : 'None/Not Found'
    console.log(`Guild: ${guild.name} (ID: ${guild.id}) - Bot Channel: ${channelName}`)
    try {
      await sql`
        INSERT INTO guilds (id, name, updated_at)
        VALUES (${guild.id}, ${guild.name}, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = CURRENT_TIMESTAMP
      `
    } catch (err) {
      console.error(`[Guilds] Error syncing guild ${guild.name} to DB:`, err)
    }
  })

  // Register only DM-enabled slash commands globally to avoid duplicating guild commands
  const dmCommands = slashCommands.filter(
    cmd =>
      typeof cmd === 'object' &&
      cmd !== null &&
      (('dmPermission' in cmd && cmd.dmPermission === true) ||
        ('contexts' in cmd && Array.isArray(cmd.contexts) && cmd.contexts.includes(InteractionContextType.BotDM)))
  )
  client.application?.commands.set(dmCommands).catch(err => {
    console.error('Error setting global application commands:', err)
  })

  // List all commands in first server for debugging
  client.guilds.cache
    .first()
    ?.commands.fetch()
    .then(commands => {
      console.log('--- Commands in Guild ---')
      commands.forEach(command => {
        console.log(`Command: ${command.name}, ID: ${command.id}`)
      })
      const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'))
      console.log(`Bot version: ${packageJson.version}`)
    })
    .catch(error => {
      console.error('Error fetching guild commands:', error)
    })

  console.log(`Bot is ready! Logged in as ${client.user?.tag}`)
  if (client.application?.id) {
    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${client.application.id}&permissions=8&scope=bot%20applications.commands`
    console.log(`Bot Invite Link (Guild Install):\n${inviteUrl}`)
  }
})

client.on('interactionCreate', async interaction => {
  try {
    await dispatchInteraction(interaction)
  } catch (error) {
    console.error('Error handling interaction:', error)
  }
})

async function startBot(maxRetries = 10, delayMs = 5000): Promise<void> {
  const token = process.env.DISCORD_TOKEN
  if (!token) {
    console.error('No DISCORD_TOKEN provided in environment.')
    process.exit(1)
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Connecting to Discord (attempt ${attempt}/${maxRetries})...`)
      await client.login(token)
      console.log('Discord client logged in successfully.')
      return
    } catch (error) {
      console.error(`Failed to connect to Discord on attempt ${attempt}/${maxRetries}:`, error)
      if (attempt < maxRetries) {
        console.log(`Retrying in ${delayMs / 1000}s...`)
        await new Promise(resolve => setTimeout(resolve, delayMs))
      } else {
        console.error('All connection attempts failed. Exiting process so systemd can restart.')
        process.exit(1)
      }
    }
  }
}

if (process.env.NODE_ENV !== 'test') {
  void startWebServer().catch(err => {
    console.error('[WebServer] Failed to start web server:', err)
  })
}
void startBot()

// Graceful shutdown handler
const shutdown = async () => {
  console.log('Shutting down bot and web server...')
  await stopWebServer().catch(err => {
    console.error('[WebServer] Error stopping web server:', err)
  })
  client.user?.setPresence({
    status: PresenceUpdateStatus.Invisible,
    activities: [{ name: 'Shutting down...', type: 0 }],
  })
  console.log('Bot disconnected')
  await new Promise(resolve => setTimeout(resolve, 1000))

  client.destroy()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
