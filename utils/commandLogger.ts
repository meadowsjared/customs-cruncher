import fs from 'fs'
import path from 'path'
import type { CacheType, Interaction } from 'discord.js'
import { getSetting } from '../store/settings'

const DEFAULT_LOG_PATH = path.join(process.cwd(), 'logs', 'commands.log')
const CACHE_TTL_MS = 15000

let isLoggingEnabled = false
let lastCacheCheck = 0

export function getCommandLogPath(): string {
  const envPath = process.env.COMMAND_LOG_PATH
  return envPath && envPath.trim().length > 0 ? path.resolve(envPath.trim()) : DEFAULT_LOG_PATH
}

export async function refreshLoggingSetting(): Promise<boolean> {
  try {
    const val = await getSetting('command_logging', 'global')
    isLoggingEnabled = val !== undefined ? val.toLowerCase() === 'true' : process.env.COMMAND_LOGGING === 'true'
  } catch {
    isLoggingEnabled = process.env.COMMAND_LOGGING === 'true'
  }
  lastCacheCheck = Date.now()
  return isLoggingEnabled
}

export async function initCommandLogger(): Promise<void> {
  await refreshLoggingSetting()
}

export function isCommandLoggingEnabled(): boolean {
  return isLoggingEnabled
}

export interface CommandOptionLike {
  name: string
  value?: string | number | boolean
  options?: readonly CommandOptionLike[]
}

export interface LoggableInteraction {
  user: { tag: string; id: string }
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
      return opt.value !== undefined ? `${opt.name}: ${String(opt.value)}` : opt.name
    })
    .join(' ')
}

export function formatInteraction(interaction: LoggableInteraction): string {
  const timestamp = new Date().toISOString()
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

  return `[${timestamp}] User: ${user} | Command: ${detail}`
}

function extractLoggableFromDiscordInteraction(interaction: Interaction<CacheType>): LoggableInteraction {
  const user = { tag: interaction.user.tag, id: interaction.user.id }

  if (interaction.isChatInputCommand()) {
    return {
      user,
      isChatInputCommand: () => true,
      commandName: interaction.commandName,
      options: interaction.options,
    }
  }

  if (interaction.isButton()) {
    return {
      user,
      isButton: () => true,
      customId: interaction.customId,
    }
  }

  if (interaction.isStringSelectMenu()) {
    return {
      user,
      isStringSelectMenu: () => true,
      customId: interaction.customId,
      values: interaction.values,
    }
  }

  if (interaction.isModalSubmit()) {
    return {
      user,
      isModalSubmit: () => true,
      customId: interaction.customId,
    }
  }

  return { user }
}

export async function logCommandInteraction(interaction: Interaction<CacheType>): Promise<void> {
  if (interaction.isAutocomplete()) {
    return
  }

  if (Date.now() - lastCacheCheck > CACHE_TTL_MS) {
    await refreshLoggingSetting()
  }

  if (!isLoggingEnabled) {
    return
  }

  const loggable = extractLoggableFromDiscordInteraction(interaction)
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
