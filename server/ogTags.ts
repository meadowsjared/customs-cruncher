import { sql } from '../store/db'
import { getPlayerProfile } from '../store/playerProfile'
import { getPlayerAggregatedStats } from '../store/playerStats'
import { getHeroProfile } from '../store/heroProfile'
import type { PlayerAggregatedStats } from '../types/player'
import { formatDeadTime, getPlayerRoast, getTotalBm } from '../utils/playerRoast'

export interface OgMetadata {
  title: string
  description: string
  url: string
  image: string
  themeColor: string
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function formatRoastDescription(p: PlayerAggregatedStats): string {
  const games = Number(p.games_played || 0)
  const avgDeaths = Number(p.avg_deaths || 0)
  const totalDeaths = p.total_deaths != null ? Number(p.total_deaths) : Math.round(avgDeaths * games)
  const deadTime = formatDeadTime(Number(p.avg_time_spent_dead || 0), games)
  const losses = Number(p.losses || 0)
  const wr = Number(p.win_rate_pct || 0).toFixed(1)
  const totalBm = getTotalBm(p)

  const parts = [
    `💀 ${totalDeaths.toLocaleString()} deaths (${avgDeaths.toFixed(1)}/gm)`,
    `⚰️ ${deadTime} spent dead`,
    `📉 ${losses.toLocaleString()}L (${wr}% WR)`,
  ]
  if (totalBm > 0) {
    parts.push(`🔥 ${totalBm.toLocaleString()} BM`)
  }
  return parts.join(' • ')
}

function formatPlayerTitle(name: string, tag: string): string {
  return tag ? `${name} #${tag}` : name
}

function formatPlayerDescription(profile: NonNullable<Awaited<ReturnType<typeof getPlayerProfile>>>): string {
  const parts: string[] = []
  if (profile.player.mmr != null) {
    parts.push(`MMR: ${profile.player.mmr.toLocaleString()}`)
  }
  parts.push(`Win Rate: ${profile.player.winRatePct}% (${profile.player.wins}W - ${profile.player.losses}L)`)
  parts.push(`KDA: ${profile.player.overallKda.toFixed(1)}`)
  if (profile.player.topHeroes.length > 0) {
    const top = profile.player.topHeroes
      .slice(0, 3)
      .map(h => h.hero)
      .join(', ')
    parts.push(`Top: ${top}`)
  }
  return parts.join(' • ')
}

export async function resolveOgMetadata(pathname: string, origin: string): Promise<OgMetadata> {
  const normalizedPath = pathname === '/' ? '/' : pathname.replace(/\/+$/, '')
  const url = `${origin}${normalizedPath}`
  const defaultImage = `${origin}/apple-touch-icon.png`

  const defaultOg: OgMetadata = {
    title: 'Customs Cruncher — HotS Customs & Stats',
    description: 'In-house 5v5 Heroes of the Storm match history, MMR leaderboard, drafts, and player profiles.',
    url,
    image: defaultImage,
    themeColor: '#5865f2',
  }

  try {
    // /player/:identifier/hero/:heroName
    const playerHeroMatch = normalizedPath.match(/^\/player\/([^/]+)\/hero\/([^/]+)$/)
    if (playerHeroMatch) {
      const identifier = decodeURIComponent(playerHeroMatch[1])
      const heroName = decodeURIComponent(playerHeroMatch[2])
      const profile = await getPlayerProfile(identifier, heroName, { page: 1, limit: 1 })
      if (profile && profile.heroStats) {
        return {
          title: `${profile.player.name}'s ${profile.heroStats.hero} — Hero Profile`,
          description: `${profile.heroStats.total} Games • ${profile.heroStats.winRatePct}% Win Rate (${profile.heroStats.wins}W - ${profile.heroStats.losses}L) • ${profile.heroStats.kda.toFixed(1)} KDA`,
          url,
          image: defaultImage,
          themeColor: '#38bdf8',
        }
      }
      if (profile) {
        return {
          title: `${formatPlayerTitle(profile.player.name, profile.player.tag)} — Player Profile`,
          description: formatPlayerDescription(profile),
          url,
          image: defaultImage,
          themeColor: '#38bdf8',
        }
      }
      return {
        ...defaultOg,
        title: 'Player Hero Profile — Customs Cruncher',
      }
    }

    // /player/:identifier
    const playerMatch = normalizedPath.match(/^\/player\/([^/]+)$/)
    if (playerMatch) {
      const identifier = decodeURIComponent(playerMatch[1])
      const profile = await getPlayerProfile(identifier, undefined, { page: 1, limit: 1 })
      if (profile) {
        return {
          title: `${formatPlayerTitle(profile.player.name, profile.player.tag)} — Player Profile`,
          description: formatPlayerDescription(profile),
          url,
          image: defaultImage,
          themeColor: '#38bdf8',
        }
      }
      return {
        ...defaultOg,
        title: 'Player Profile — Customs Cruncher',
      }
    }

    // /replay/:id or /match/:id
    const replayMatch = normalizedPath.match(/^\/(?:replay|match)\/(\d+)$/)
    if (replayMatch) {
      const replayId = parseInt(replayMatch[1], 10)
      const rows = await sql<
        Array<{
          id: number
          map: string
          length: number
          player_name: string | null
          hero: string | null
          team: number | null
          win: boolean | null
        }>
      >`
        SELECT r.id, r.map, r.length, rp.player_name, rp.hero, rp.team, rp.win
        FROM replays r
        LEFT JOIN replay_players rp ON rp.replay_id = r.id
        WHERE r.id = ${replayId}
      `
      if (rows.length > 0) {
        const { map, length } = rows[0]
        const team1 = rows.filter(r => r.team === 0)
        const team2 = rows.filter(r => r.team === 1)
        const team1Won = team1.some(r => r.win === true)
        const team2Won = team2.some(r => r.win === true)

        const winnerLabel = team1Won ? 'Blue Team Victory' : team2Won ? 'Red Team Victory' : 'Custom 5v5 Match'
        const t1Heroes = team1
          .map(r => r.hero)
          .filter(Boolean)
          .join(', ')
        const t2Heroes = team2
          .map(r => r.hero)
          .filter(Boolean)
          .join(', ')
        const matchSummary = t1Heroes && t2Heroes ? `${winnerLabel} • ${t1Heroes} vs ${t2Heroes}` : winnerLabel

        return {
          title: `Match #${replayId} — ${map} (${formatDuration(length)})`,
          description: matchSummary,
          url,
          image: defaultImage,
          themeColor: '#10b981',
        }
      }
      return {
        ...defaultOg,
        title: `Match #${replayId} — Customs Cruncher`,
        description: 'View match details, draft, talent builds, and post-game statistics.',
        themeColor: '#10b981',
      }
    }

    // /leaderboard/player/:identifier or /leaderboard/:identifier (Hall of Shame roast card)
    const lbPlayerMatch = normalizedPath.match(/^\/leaderboard\/(?:player\/)?([^/]+)$/)
    if (lbPlayerMatch) {
      const identifier = decodeURIComponent(lbPlayerMatch[1])
      const [profile, allStats] = await Promise.all([
        getPlayerProfile(identifier, undefined, { page: 1, limit: 1 }),
        getPlayerAggregatedStats(),
      ])

      let matchedStat: PlayerAggregatedStats | undefined
      if (profile) {
        const lowerTags = new Set(profile.player.allTags.map(t => t.toLowerCase()))
        matchedStat = allStats.find(
          s =>
            (s.row_id != null && s.row_id === profile.player.rowId) ||
            (s.hots_battle_tag && lowerTags.has(s.hots_battle_tag.toLowerCase())) ||
            s.player_name.toLowerCase() === profile.player.name.toLowerCase()
        )
      } else {
        const numericId = /^\d+$/.test(identifier) ? parseInt(identifier, 10) : null
        const lowerId = identifier.toLowerCase()
        matchedStat = allStats.find(
          s =>
            (numericId != null && s.row_id === numericId) ||
            (s.hots_battle_tag && s.hots_battle_tag.toLowerCase() === lowerId) ||
            s.player_name.toLowerCase() === lowerId
        )
      }

      const defaultShameImage = `${origin}/roast-gray-screen.png`
      if (matchedStat) {
        const roast = getPlayerRoast(matchedStat)
        const displayName = profile ? profile.player.name : matchedStat.player_name
        return {
          title: `${displayName}'s Hall of Shame — ${roast.title}`,
          description: formatRoastDescription(matchedStat),
          url,
          image: `${origin}/${roast.image}`,
          themeColor: roast.themeColor,
        }
      }

      if (profile) {
        return {
          title: `${profile.player.name}'s Hall of Shame 💀`,
          description: `📉 ${profile.player.losses.toLocaleString()}L (${profile.player.winRatePct}% WR) • Total Matches: ${profile.player.totalMatches}`,
          url,
          image: defaultShameImage,
          themeColor: '#ef4444',
        }
      }

      return {
        title: 'Hall of Shame — Customs Cruncher Leaderboard',
        description: 'In-house 5v5 MMR rankings, win rates, deaths, gray-screen time, and BM stats.',
        url,
        image: defaultShameImage,
        themeColor: '#ef4444',
      }
    }

    // /leaderboard
    if (normalizedPath === '/leaderboard') {
      return {
        title: 'Leaderboard — Customs Cruncher',
        description: 'In-house 5v5 MMR rankings, win rates, KDA, and detailed player stats.',
        url,
        image: defaultImage,
        themeColor: '#fbbf24',
      }
    }

    // /matches
    if (normalizedPath === '/matches') {
      return {
        title: 'Match History — Customs Cruncher',
        description:
          'Browse recent 5v5 custom Heroes of the Storm matches, drafts, talent builds, and post-game stats.',
        url,
        image: defaultImage,
        themeColor: '#5865f2',
      }
    }

    // /hero/:heroName
    const heroMatch = normalizedPath.match(/^\/hero\/([^/]+)$/)
    if (heroMatch) {
      const heroName = decodeURIComponent(heroMatch[1])
      const heroProfile = await getHeroProfile(heroName)
      if (heroProfile) {
        return {
          title: `${heroProfile.hero.canonicalName} — Hero Stats | Customs Cruncher`,
          description: `${heroProfile.hero.totalMatches} Games • ${heroProfile.hero.winRatePct}% Win Rate (${heroProfile.hero.wins}W - ${heroProfile.hero.losses}L) • ${heroProfile.hero.overallKda.toFixed(1)} KDA`,
          url,
          image: defaultImage,
          themeColor: '#a855f7',
        }
      }
      return {
        title: `${heroName} — Hero Stats | Customs Cruncher`,
        description: `View ${heroName} win rates, talent builds, and top players in custom 5v5 matches.`,
        url,
        image: defaultImage,
        themeColor: '#a855f7',
      }
    }

    return defaultOg
  } catch (err) {
    console.warn('[ogTags] Error resolving OG metadata:', err)
    return defaultOg
  }
}

export function injectOgTags(html: string, og: OgMetadata): string {
  const escapedTitle = escapeHtml(og.title)
  const escapedDesc = escapeHtml(og.description)
  const escapedUrl = escapeHtml(og.url)
  const escapedImage = escapeHtml(og.image)
  const escapedColor = escapeHtml(og.themeColor)

  const metaBlock = [
    `    <meta name="description" content="${escapedDesc}" />`,
    `    <meta name="theme-color" content="${escapedColor}" />`,
    `    <meta property="og:site_name" content="Customs Cruncher" />`,
    `    <meta property="og:type" content="website" />`,
    `    <meta property="og:title" content="${escapedTitle}" />`,
    `    <meta property="og:description" content="${escapedDesc}" />`,
    `    <meta property="og:url" content="${escapedUrl}" />`,
    `    <meta property="og:image" content="${escapedImage}" />`,
    `    <meta property="og:image:type" content="image/png" />`,
    `    <meta name="twitter:card" content="summary" />`,
    `    <meta name="twitter:title" content="${escapedTitle}" />`,
    `    <meta name="twitter:description" content="${escapedDesc}" />`,
    `    <meta name="twitter:image" content="${escapedImage}" />`,
  ].join('\n')

  let updated = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapedTitle}</title>`)
  if (updated.includes('</head>')) {
    updated = updated.replace('</head>', `${metaBlock}\n  </head>`)
  }
  return updated
}
