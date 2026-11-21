import fs from 'fs'
import path from 'path'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type CacheType,
  type CommandInteractionOption,
  type Interaction,
} from 'discord.js'
import { getSetting } from '../store/settings'

const DEFAULT_LOG_PATH = path.join(process.cwd(), 'logs', 'commands.log')
const CACHE_TTL_MS = 15000

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

const guildCache = new Map<string, CacheEntry<boolean | null>>()
let globalCache: CacheEntry<boolean> | null = null

const guildDmCache = new Map<string, CacheEntry<string[] | null>>()
let globalDmCache: CacheEntry<string[]> | null = null

export function clearLoggingCache(): void {
  guildCache.clear()
  globalCache = null
  guildDmCache.clear()
  globalDmCache = null
}

export function getCommandLogPath(): string {
  const envPath = process.env.COMMAND_LOG_PATH
  return envPath && envPath.trim().length > 0 ? path.resolve(envPath.trim()) : DEFAULT_LOG_PATH
}

export async function getGuildLoggingSetting(guildId: string): Promise<boolean | null> {
  const cached = guildCache.get(guildId)
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value
  }

  try {
    const val = await getSetting('command_logging', guildId)
    const result = val !== undefined ? val.toLowerCase() === 'true' : null
    guildCache.set(guildId, { value: result, expiresAt: Date.now() + CACHE_TTL_MS })
    return result
  } catch {
    return cached ? cached.value : null
  }
}

export async function getGlobalLoggingSetting(): Promise<boolean> {
  if (globalCache && Date.now() < globalCache.expiresAt) {
    return globalCache.value
  }

  try {
    const val = await getSetting('command_logging', 'global')
    const result = val !== undefined ? val.toLowerCase() === 'true' : process.env.COMMAND_LOGGING === 'true'
    globalCache = { value: result, expiresAt: Date.now() + CACHE_TTL_MS }
    return result
  } catch {
    const fallback = process.env.COMMAND_LOGGING === 'true'
    globalCache = { value: fallback, expiresAt: Date.now() + CACHE_TTL_MS }
    return fallback
  }
}

export async function isLoggingEnabledForGuild(guildId?: string | null): Promise<boolean> {
  if (guildId) {
    const guildVal = await getGuildLoggingSetting(guildId)
    if (guildVal !== null) {
      return guildVal
    }
  }
  return await getGlobalLoggingSetting()
}

function parseUserIds(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map(s => s.trim().replace(/[<@!>]/g, ''))
    .filter(s => /^\d{17,20}$/.test(s))
}

async function resolveDmRecipientsFromDb(guildId: string): Promise<string[] | null> {
  const val = await getSetting('command_logging_dm', guildId)
  if (val === undefined) {
    return null
  }
  const trimmed = val.trim().toLowerCase()
  if (trimmed === 'false' || trimmed === '0' || trimmed === 'off') {
    return []
  }
  if (trimmed === 'true' || trimmed === '1' || trimmed === 'on') {
    const userIdVal = await getSetting('command_logging_dm_user_id', guildId)
    return parseUserIds(userIdVal)
  }
  return parseUserIds(val)
}

export async function getDmRecipientsForGuild(guildId?: string | null): Promise<string[]> {
  if (guildId) {
    const cached = guildDmCache.get(guildId)
    if (cached && Date.now() < cached.expiresAt) {
      if (cached.value !== null) return cached.value
    } else {
      try {
        const guildResult = await resolveDmRecipientsFromDb(guildId)
        guildDmCache.set(guildId, { value: guildResult, expiresAt: Date.now() + CACHE_TTL_MS })
        if (guildResult !== null) return guildResult
      } catch {
        if (cached && cached.value !== null) return cached.value
      }
    }
  }

  if (globalDmCache && Date.now() < globalDmCache.expiresAt) {
    return globalDmCache.value
  }

  try {
    const globalResult = await resolveDmRecipientsFromDb('global')
    const finalResult = globalResult !== null ? globalResult : parseUserIds(process.env.COMMAND_LOGGING_DM_USER_ID)
    globalDmCache = { value: finalResult, expiresAt: Date.now() + CACHE_TTL_MS }
    return finalResult
  } catch {
    const fallback = parseUserIds(process.env.COMMAND_LOGGING_DM_USER_ID)
    globalDmCache = { value: fallback, expiresAt: Date.now() + CACHE_TTL_MS }
    return fallback
  }
}

export async function isDmLoggingEnabledForGuild(guildId?: string | null): Promise<boolean> {
  const recipients = await getDmRecipientsForGuild(guildId)
  return recipients.length > 0
}

export async function initCommandLogger(): Promise<void> {
  await Promise.all([getGlobalLoggingSetting(), getDmRecipientsForGuild()])
}

export function isCommandLoggingEnabled(guildId?: string | null): boolean {
  if (guildId) {
    const cached = guildCache.get(guildId)
    if (cached && cached.value !== null) {
      return cached.value
    }
  }
  return globalCache ? globalCache.value : process.env.COMMAND_LOGGING === 'true'
}

export interface CommandOptionLike {
  name: string
  value?: string | number | boolean
  userName?: string
  options?: readonly CommandOptionLike[]
}

export interface LoggableInteraction {
  user: { tag: string; id: string }
  guild?: { name: string; id: string } | null
  isChatInputCommand?: () => boolean
  isButton?: () => boolean
  isStringSelectMenu?: () => boolean
  isModalSubmit?: () => boolean
  isAutocomplete?: () => boolean
  commandName?: string
  options?: { data: readonly CommandOptionLike[] }
  customId?: string
  values?: readonly string[]
}

function formatOptions(options: readonly CommandOptionLike[]): string {
  return options
    .map(opt => {
      if (opt.options && opt.options.length > 0) {
        return `${opt.name} ${formatOptions(opt.options)}`
      }
      if (opt.userName && opt.value !== undefined) {
        return `${opt.name}: ${opt.userName} (ID: ${String(opt.value)})`
      }
      if (opt.userName) {
        return `${opt.name}: ${opt.userName}`
      }
      return opt.value !== undefined ? `${opt.name}: ${String(opt.value)}` : opt.name
    })
    .join(' ')
}

export function formatInteraction(interaction: LoggableInteraction): string {
  const timestamp = new Date().toISOString()
  const serverStr = interaction.guild
    ? `${interaction.guild.name} (ID: ${interaction.guild.id})`
    : 'Direct Message (DM)'
  const user = `${interaction.user.tag} (ID: ${interaction.user.id})`

  let detail = 'Unknown Interaction'

  if (interaction.isChatInputCommand?.()) {
    const opts = interaction.options?.data ? formatOptions(interaction.options.data) : ''
    detail = `/${interaction.commandName ?? 'unknown'}${opts ? ` ${opts}` : ''}`
  } else if (interaction.isButton?.()) {
    detail = `[Button] "${interaction.customId ?? ''}"`
  } else if (interaction.isStringSelectMenu?.()) {
    const values = (interaction.values ?? []).map(v => `"${v}"`).join(', ')
    detail = `[Select] "${interaction.customId ?? ''}" [${values}]`
  } else if (interaction.isModalSubmit?.()) {
    detail = `[Modal] "${interaction.customId ?? ''}"`
  }

  return `[${timestamp}] Server: ${serverStr} | User: ${user} | Command: ${detail}`
}

function formatOptionsForDm(options: readonly CommandOptionLike[]): string {
  return options
    .map(opt => {
      if (opt.options && opt.options.length > 0) {
        return `${opt.name} ${formatOptionsForDm(opt.options)}`
      }
      const rawValue =
        typeof opt.value === 'string' || typeof opt.value === 'number'
          ? String(opt.value).replace(/[<@!>]/g, '')
          : ''
      if (rawValue && /^\d{17,20}$/.test(rawValue)) {
        const mention = opt.name.toLowerCase().includes('channel') ? `<#${rawValue}>` : `<@${rawValue}>`
        return `${opt.name}: ${mention} (ID: ${rawValue})`
      }
      if (opt.userName && opt.value !== undefined) {
        const idStr = String(opt.value).replace(/[<@!>]/g, '')
        return `${opt.name}: <@${idStr}> (ID: ${idStr})`
      }
      if (opt.userName) {
        return `${opt.name}: ${opt.userName}`
      }
      return opt.value !== undefined ? `${opt.name}: \`${String(opt.value)}\`` : opt.name
    })
    .join(' ')
}

export function formatInteractionForDm(interaction: LoggableInteraction): string {
  const serverStr = interaction.guild ? ` in **${interaction.guild.name}**` : ' in **Direct Message**'
  const userMention = `<@${interaction.user.id}>`

  let detail = 'Unknown Interaction'

  if (interaction.isChatInputCommand?.()) {
    const opts = interaction.options?.data ? formatOptionsForDm(interaction.options.data) : ''
    detail = `\`/${interaction.commandName ?? 'unknown'}\`${opts ? ` ${opts}` : ''}`
  } else if (interaction.isButton?.()) {
    detail = `Button: \`${interaction.customId ?? ''}\``
  } else if (interaction.isStringSelectMenu?.()) {
    const values = (interaction.values ?? []).map(v => `"${v}"`).join(', ')
    detail = `Select: \`${interaction.customId ?? ''}\` [${values}]`
  } else if (interaction.isModalSubmit?.()) {
    detail = `Modal: \`${interaction.customId ?? ''}\``
  }

  return `${userMention}${serverStr}:\n${detail}`
}

function extractOptions(
  options: readonly CommandInteractionOption<CacheType>[],
  interaction: Interaction<CacheType>
): CommandOptionLike[] {
  return options.map(opt => {
    let userName: string | undefined = undefined

    if (opt.user) {
      userName = opt.user.tag ?? opt.user.username
    } else if (
      typeof opt.value === 'string' &&
      (opt.name.toLowerCase().includes('user') || /^\d{17,20}$/.test(opt.value))
    ) {
      const rawId = opt.value.replace(/[<@!>]/g, '')
      const cachedUser = interaction.client.users.cache.get(rawId)
      if (cachedUser) {
        userName = cachedUser.tag ?? cachedUser.username
      } else if (interaction.guild) {
        const cachedMember = interaction.guild.members.cache.get(rawId)
        if (cachedMember) {
          userName = cachedMember.user.tag ?? cachedMember.displayName
        }
      }
    }

    const entry: CommandOptionLike = {
      name: opt.name,
      value:
        typeof opt.value === 'string' || typeof opt.value === 'number' || typeof opt.value === 'boolean'
          ? opt.value
          : undefined,
      userName,
    }

    if (opt.options && opt.options.length > 0) {
      entry.options = extractOptions(opt.options, interaction)
    }

    return entry
  })
}

function extractLoggableFromDiscordInteraction(interaction: Interaction<CacheType>): LoggableInteraction {
  const user = { tag: interaction.user.tag, id: interaction.user.id }
  const guild = interaction.guild ? { name: interaction.guild.name, id: interaction.guild.id } : null

  if (interaction.isChatInputCommand()) {
    return {
      user,
      guild,
      isChatInputCommand: () => true,
      commandName: interaction.commandName,
      options: { data: extractOptions(interaction.options.data, interaction) },
    }
  }

  if (interaction.isButton()) {
    return {
      user,
      guild,
      isButton: () => true,
      customId: interaction.customId,
    }
  }

  if (interaction.isStringSelectMenu()) {
    return {
      user,
      guild,
      isStringSelectMenu: () => true,
      customId: interaction.customId,
      values: interaction.values,
    }
  }

  if (interaction.isModalSubmit()) {
    return {
      user,
      guild,
      isModalSubmit: () => true,
      customId: interaction.customId,
    }
  }

  return { user, guild }
}

export async function logCommandInteraction(interaction: Interaction<CacheType>): Promise<void> {
  if (interaction.isAutocomplete()) {
    return
  }

  const [fileLoggingEnabled, rawDmRecipients] = await Promise.all([
    isLoggingEnabledForGuild(interaction.guildId),
    getDmRecipientsForGuild(interaction.guildId),
  ])

  // Do not send DM notification to the user who ran the command
  const callerId = interaction.user?.id
  const dmRecipients = callerId ? rawDmRecipients.filter(id => id !== callerId) : rawDmRecipients

  if (!fileLoggingEnabled && dmRecipients.length === 0) {
    return
  }

  const loggable = extractLoggableFromDiscordInteraction(interaction)

  if (fileLoggingEnabled) {
    const line = formatInteraction(loggable)
    const logFile = getCommandLogPath()

    try {
      const dir = path.dirname(logFile)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      await fs.promises.appendFile(logFile, line + '\n', 'utf8')
    } catch (err) {
      console.error(`[CommandLogger] Failed to write to ${logFile}:`, err)
    }
  }

  if (dmRecipients.length > 0) {
    const dmText = formatInteractionForDm(loggable)
    const dismissRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('delete_dm_message')
        .setLabel('Dismiss')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Secondary)
    )
    for (const recipientId of dmRecipients) {
      try {
        const recipient = await interaction.client.users.fetch(recipientId)
        if (recipient) {
          await recipient.send({
            content: dmText,
            components: [dismissRow],
          })
        }
      } catch (err) {
        console.error(`[CommandLogger] Failed to send DM notification to ${recipientId}:`, err)
      }
    }
  }
}
