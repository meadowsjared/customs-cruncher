import fs from 'fs'
import path from 'path'
import { getWebBaseUrl } from '../commands/lookup'
import { sql } from './db'

export interface CustomLink {
  id: number
  guildId: string
  name: string
  title: string
  url: string
  description: string | null
  authorName: string | null
  authorIconUrl: string | null
  thumbnailUrl: string | null
  imageUrl: string | null
  color: string | null
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
}

interface CustomLinkRow {
  id: number
  guild_id: string
  name: string
  title: string
  url: string
  description: string | null
  author_name: string | null
  author_icon_url: string | null
  thumbnail_url: string | null
  image_url: string | null
  color: string | null
  created_by: string | null
  created_at: Date | string
  updated_at: Date | string
}

export interface UpsertCustomLinkInput {
  name: string
  title: string
  url: string
  description?: string | null
  authorName?: string | null
  authorIconUrl?: string | null
  thumbnailUrl?: string | null
  imageUrl?: string | null
  color?: string | null
  createdBy?: string | null
}

const CUSTOM_LINKS_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS custom_links (
    id SERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT,
    author_name TEXT,
    author_icon_url TEXT,
    thumbnail_url TEXT,
    image_url TEXT,
    color TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_custom_links_guild_name
    ON custom_links (guild_id, LOWER(name));
`

function mapRow(row: CustomLinkRow): CustomLink {
  return {
    id: row.id,
    guildId: row.guild_id,
    name: row.name,
    title: row.title,
    url: row.url,
    description: row.description,
    authorName: row.author_name,
    authorIconUrl: row.author_icon_url,
    thumbnailUrl: row.thumbnail_url,
    imageUrl: row.image_url,
    color: row.color,
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
  }
}

/**
 * Initializes the `custom_links` table in PostgreSQL.
 */
export async function initLinksTable(): Promise<void> {
  await sql.unsafe(CUSTOM_LINKS_SCHEMA_SQL)
}

initLinksTable().catch(error => {
  console.error('Error initializing custom_links table:', error)
})

export async function getLinks(guildId: string): Promise<CustomLink[]> {
  const rows = await sql<CustomLinkRow[]>`
    SELECT *
    FROM custom_links
    WHERE guild_id = ${guildId}
    ORDER BY LOWER(name) ASC
  `
  return rows.map(mapRow)
}

export async function getLinkByName(guildId: string, name: string): Promise<CustomLink | null> {
  const rows = await sql<CustomLinkRow[]>`
    SELECT *
    FROM custom_links
    WHERE guild_id = ${guildId} AND LOWER(name) = LOWER(${name.trim()})
    LIMIT 1
  `
  return rows[0] ? mapRow(rows[0]) : null
}

export function extractLocalLinkAssetFilename(url?: string | null): string | null {
  if (!url) return null
  try {
    const pathname = new URL(url).pathname
    const prefix = pathname.startsWith('/api/links-assets/')
      ? '/api/links-assets/'
      : pathname.startsWith('/links-assets/')
        ? '/links-assets/'
        : null
    if (!prefix) return null
    const filename = path.basename(pathname.slice(prefix.length))
    return filename && filename !== '.' && filename !== '..' ? filename : null
  } catch {
    return null
  }
}

function deleteLocalLinkAsset(url?: string | null): void {
  const filename = extractLocalLinkAssetFilename(url)
  if (!filename) return
  try {
    const filePath = path.resolve(process.cwd(), 'assets/links', filename)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  } catch (err) {
    console.error(`Failed to delete local link asset (${filename}):`, err)
  }
}

export async function upsertLink(guildId: string, input: UpsertCustomLinkInput): Promise<CustomLink> {
  const previous = await getLinkByName(guildId, input.name)

  const rows = await sql<CustomLinkRow[]>`
    INSERT INTO custom_links (
      guild_id, name, title, url, description, author_name, author_icon_url, thumbnail_url, image_url, color, created_by
    ) VALUES (
      ${guildId},
      ${input.name.trim()},
      ${input.title.trim()},
      ${input.url.trim()},
      ${input.description ?? null},
      ${input.authorName ?? null},
      ${input.authorIconUrl ?? null},
      ${input.thumbnailUrl ?? null},
      ${input.imageUrl ?? null},
      ${input.color ?? null},
      ${input.createdBy ?? null}
    )
    ON CONFLICT (guild_id, LOWER(name)) DO UPDATE SET
      name = EXCLUDED.name,
      title = EXCLUDED.title,
      url = EXCLUDED.url,
      description = COALESCE(EXCLUDED.description, custom_links.description),
      author_name = COALESCE(EXCLUDED.author_name, custom_links.author_name),
      author_icon_url = COALESCE(EXCLUDED.author_icon_url, custom_links.author_icon_url),
      thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, custom_links.thumbnail_url),
      image_url = COALESCE(EXCLUDED.image_url, custom_links.image_url),
      color = COALESCE(EXCLUDED.color, custom_links.color),
      updated_at = NOW()
    RETURNING *
  `
  const updated = mapRow(rows[0])

  if (previous) {
    if (previous.authorIconUrl && previous.authorIconUrl !== updated.authorIconUrl) {
      deleteLocalLinkAsset(previous.authorIconUrl)
    }
    if (previous.thumbnailUrl && previous.thumbnailUrl !== updated.thumbnailUrl) {
      deleteLocalLinkAsset(previous.thumbnailUrl)
    }
    if (previous.imageUrl && previous.imageUrl !== updated.imageUrl) {
      deleteLocalLinkAsset(previous.imageUrl)
    }
  }

  return updated
}

export async function deleteLink(guildId: string, name: string): Promise<boolean> {
  const deletedRows = await sql<CustomLinkRow[]>`
    DELETE FROM custom_links
    WHERE guild_id = ${guildId} AND LOWER(name) = LOWER(${name.trim()})
    RETURNING *
  `
  if (deletedRows.length === 0) {
    return false
  }

  const deleted = deletedRows[0]
  const assetUrls = new Set([deleted.author_icon_url, deleted.thumbnail_url, deleted.image_url])
  for (const url of assetUrls) {
    deleteLocalLinkAsset(url)
  }

  return true
}

function getExtensionFromAttachment(attachmentUrl: string, contentType?: string | null): string {
  if (contentType) {
    if (contentType.includes('png')) return 'png'
    if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg'
    if (contentType.includes('gif')) return 'gif'
    if (contentType.includes('webp')) return 'webp'
  }
  const cleanPath = attachmentUrl.split('?')[0] ?? ''
  const ext = path.extname(cleanPath).replace('.', '').toLowerCase()
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
    return ext === 'jpeg' ? 'jpg' : ext
  }
  return 'png'
}

/**
 * Downloads an uploaded Discord attachment and persists it under `assets/links/`
 * so the embed image URL does not expire when Discord's CDN token rotates.
 */
export async function saveLinkAsset(
  guildId: string,
  linkName: string,
  kind: 'author' | 'thumbnail' | 'image',
  attachmentUrl: string,
  contentType?: string | null
): Promise<string | null> {
  try {
    const response = await fetch(attachmentUrl)
    if (!response.ok) return null
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const linksDir = path.resolve(process.cwd(), 'assets/links')
    if (!fs.existsSync(linksDir)) {
      fs.mkdirSync(linksDir, { recursive: true })
    }

    const safeGuild = guildId.replace(/[^a-zA-Z0-9_-]/g, '')
    const safeName = linkName.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'link'
    const ext = getExtensionFromAttachment(attachmentUrl, contentType)
    const filename = `${safeGuild}_${safeName}_${kind}_${Date.now()}.${ext}`
    const filePath = path.join(linksDir, filename)

    fs.writeFileSync(filePath, buffer)
    return `${getWebBaseUrl()}/links-assets/${filename}`
  } catch (err) {
    console.error(`Failed to save link asset (${kind}) for ${linkName}:`, err)
    return null
  }
}
