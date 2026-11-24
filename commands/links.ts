import {
  AutocompleteInteraction,
  CacheType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js'
import { CustomLink, deleteLink, getLinkByName, getLinks, saveLinkAsset, upsertLink } from '../store/links'
import { safePing } from '../utils/announce'
import { requireGuildId, safeReply } from '../utils/interaction'
import { userIsAdmin } from './shared'

const DEFAULT_EMBED_COLOR = 0x0099ff

export function parseEmbedColor(colorStr?: string | null): number {
  if (!colorStr) return DEFAULT_EMBED_COLOR
  const cleaned = colorStr.trim().replace(/^#|^0x/i, '')
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return DEFAULT_EMBED_COLOR
  }
  return parseInt(cleaned, 16)
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function buildCustomLinkEmbed(link: CustomLink): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(parseEmbedColor(link.color))
    .setTitle(link.title)
    .setURL(link.url)

  if (link.description) {
    embed.setDescription(link.description)
  }

  if (link.authorName || link.authorIconUrl) {
    embed.setAuthor({
      name: link.authorName ?? link.title,
      iconURL: link.authorIconUrl ?? undefined,
      url: link.url,
    })
  }

  if (link.thumbnailUrl) {
    embed.setThumbnail(link.thumbnailUrl)
  }

  if (link.imageUrl) {
    embed.setImage(link.imageUrl)
  }

  return embed
}

export async function handleLinksSubCommand(interaction: ChatInputCommandInteraction<CacheType>): Promise<void> {
  const subcommand = interaction.options.getSubcommand(false)
  switch (subcommand) {
    case 'add':
      await handleLinksAddCommand(interaction)
      return
    case 'remove':
      await handleLinksRemoveCommand(interaction)
      return
    case 'list':
      await handleLinksListCommand(interaction)
      return
    case 'show':
    default:
      await handleLinksShowCommand(interaction)
      return
  }
}

async function handleLinksShowCommand(interaction: ChatInputCommandInteraction<CacheType>): Promise<void> {
  const guildId = await requireGuildId(interaction)
  if (!guildId) return

  const name = interaction.options.getString('name')?.trim()
  if (!name) {
    await handleLinksListCommand(interaction)
    return
  }

  const link = await getLinkByName(guildId, name)
  if (!link) {
    await safeReply(interaction, {
      content: `No saved link found with name \`${name}\`. Use \`/links list\` to see available links.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await safeReply(interaction, {
    embeds: [buildCustomLinkEmbed(link)],
    flags: safePing(),
  })
}

async function handleLinksListCommand(interaction: ChatInputCommandInteraction<CacheType>): Promise<void> {
  const guildId = await requireGuildId(interaction)
  if (!guildId) return

  const links = await getLinks(guildId)
  if (links.length === 0) {
    await safeReply(interaction, {
      content: 'No links are saved yet. An admin can add one with `/links add`.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const lines = links.map(l => `• **\`${l.name}\`** — [${l.title}](${l.url})`)
  const embed = new EmbedBuilder()
    .setColor(DEFAULT_EMBED_COLOR)
    .setTitle('🔗 Saved Server Links')
    .setDescription(lines.join('\n'))
    .setFooter({ text: 'Use /links show name:<key> to post one in chat' })

  await safeReply(interaction, {
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  })
}

async function handleLinksAddCommand(interaction: ChatInputCommandInteraction<CacheType>): Promise<void> {
  if (!(await userIsAdmin(interaction))) {
    await safeReply(interaction, {
      content: 'You do not have permission to add links.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const guildId = await requireGuildId(interaction)
  if (!guildId) return

  const name = interaction.options.getString('name', true).trim()
  const title = interaction.options.getString('title', true).trim()
  const url = interaction.options.getString('url', true).trim()

  if (!isValidHttpUrl(url)) {
    await safeReply(interaction, {
      content: `Invalid URL \`${url}\`. Please provide a valid \`http://\` or \`https://\` URL.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const description = interaction.options.getString('description')?.trim() ?? null
  const authorName = interaction.options.getString('author-name')?.trim() ?? null
  const color = interaction.options.getString('color')?.trim() ?? null

  const authorIconAttachment = interaction.options.getAttachment('author-icon')
  const authorIconUrlOpt = interaction.options.getString('author-icon-url')?.trim() ?? null
  const thumbnailAttachment = interaction.options.getAttachment('thumbnail')
  const thumbnailUrlOpt = interaction.options.getString('thumbnail-url')?.trim() ?? null
  const imageAttachment = interaction.options.getAttachment('image')
  const imageUrlOpt = interaction.options.getString('image-url')?.trim() ?? null

  for (const [label, urlOpt] of [
    ['author-icon-url', authorIconUrlOpt],
    ['thumbnail-url', thumbnailUrlOpt],
    ['image-url', imageUrlOpt],
  ] as const) {
    if (urlOpt && !isValidHttpUrl(urlOpt)) {
      await safeReply(interaction, {
        content: `Invalid \`${label}\`: \`${urlOpt}\`. Must start with \`http://\` or \`https://\`.`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const authorIconUrl = authorIconAttachment
    ? (await saveLinkAsset(guildId, name, 'author', authorIconAttachment.url, authorIconAttachment.contentType)) ??
      authorIconAttachment.url
    : authorIconUrlOpt

  const thumbnailUrl = thumbnailAttachment
    ? (await saveLinkAsset(guildId, name, 'thumbnail', thumbnailAttachment.url, thumbnailAttachment.contentType)) ??
      thumbnailAttachment.url
    : thumbnailUrlOpt

  const imageUrl = imageAttachment
    ? (await saveLinkAsset(guildId, name, 'image', imageAttachment.url, imageAttachment.contentType)) ??
      imageAttachment.url
    : imageUrlOpt

  const saved = await upsertLink(guildId, {
    name,
    title,
    url,
    description,
    authorName,
    authorIconUrl,
    thumbnailUrl,
    imageUrl,
    color,
    createdBy: interaction.user.id,
  })

  await safeReply(interaction, {
    content: `Saved link **\`${saved.name}\`**. Preview:`,
    embeds: [buildCustomLinkEmbed(saved)],
    flags: MessageFlags.Ephemeral,
  })
}

async function handleLinksRemoveCommand(interaction: ChatInputCommandInteraction<CacheType>): Promise<void> {
  if (!(await userIsAdmin(interaction))) {
    await safeReply(interaction, {
      content: 'You do not have permission to remove links.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const guildId = await requireGuildId(interaction)
  if (!guildId) return

  const name = interaction.options.getString('name', true).trim()
  const deleted = await deleteLink(guildId, name)

  await safeReply(interaction, {
    content: deleted
      ? `Removed link \`${name}\` from the database.`
      : `No saved link found with name \`${name}\`.`,
    flags: MessageFlags.Ephemeral,
  })
}

export async function handleLinksAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const guildId = await requireGuildId(interaction)
  if (!guildId) {
    await interaction.respond([])
    return
  }

  const query = interaction.options.getFocused().trim().toLowerCase()
  const links = await getLinks(guildId)

  const matches = links
    .filter(l => !query || l.name.toLowerCase().includes(query) || l.title.toLowerCase().includes(query))
    .slice(0, 25)
    .map(l => ({
      name: `${l.name} — ${l.title}`.slice(0, 100),
      value: l.name,
    }))

  await interaction.respond(matches)
}
