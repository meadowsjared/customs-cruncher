export interface RoastStatsInput {
  avg_deaths?: number | string | null
  win_rate_pct?: number | string | null
  avg_damage_taken?: number | string | null
  avg_hero_damage?: number | string | null
  total_bsteps?: number | string | null
  total_sprays?: number | string | null
  total_taunts?: number | string | null
  total_dances?: number | string | null
  total_voice_lines?: number | string | null
}

export function getTotalBm(p: RoastStatsInput): number {
  return (
    Number(p.total_bsteps || 0) +
    Number(p.total_sprays || 0) +
    Number(p.total_taunts || 0) +
    Number(p.total_dances || 0) +
    Number(p.total_voice_lines || 0)
  )
}

export function formatDeadTime(avgDeadSecs: number, gamesPlayed: number): string {
  const totalSecs = Math.round((avgDeadSecs || 0) * (gamesPlayed || 0))
  if (totalSecs < 60) return `${totalSecs}s`
  const totalMins = Math.round(totalSecs / 60)
  if (totalMins < 60) return `${totalMins} mins`
  const hours = (totalSecs / 3600).toFixed(1)
  return `${hours} hours`
}

export interface RoastTier {
  title: string
  image: string
  themeColor: string
}

interface RoastMetrics {
  avgDeaths: number
  wr: number
  totalBm: number
  spongeRatio: number
  totalBsteps: number
}

interface RoastRule extends RoastTier {
  matches?: (m: RoastMetrics) => boolean
}

const ROAST_TIERS: RoastRule[] = [
  {
    title: 'Professional Gray Screen Enthusiast 💀',
    image: 'roast-gray-screen.png',
    themeColor: '#ef4444',
    matches: m => m.avgDeaths >= 4.0,
  },
  {
    title: 'Certified Damage Sponge 🧽',
    image: 'roast-damage-sponge.png',
    themeColor: '#f97316',
    matches: m => m.spongeRatio >= 2.0,
  },
  {
    title: 'Chief Charity Elo Contributor 📉',
    image: 'roast-charity-elo.png',
    themeColor: '#dc2626',
    matches: m => m.wr < 38,
  },
  {
    title: 'Struggling Coinflip Veteran 🪙',
    image: 'roast-coinflip-veteran.png',
    themeColor: '#eab308',
    matches: m => m.wr < 48,
  },
  {
    title: 'BM Connoisseur, Map-Blind Tactician 💃',
    image: 'roast-bm-connoisseur.png',
    themeColor: '#d946ef',
    matches: m => m.totalBm >= 300,
  },
  {
    title: 'Cemetery Season Ticket Holder ⚰️',
    image: 'roast-cemetery-ticket.png',
    themeColor: '#8b5cf6',
    matches: m => m.avgDeaths >= 3.0,
  },
  {
    title: 'All Spray, Zero B-Step 🎨',
    image: 'roast-all-spray.png',
    themeColor: '#06b6d4',
    matches: m => m.totalBsteps === 0 && m.totalBm > 0,
  },
  {
    title: 'Tactical Feeder in Disguise 🎯',
    image: 'roast-tactical-feeder.png',
    themeColor: '#10b981',
  },
]

const DEFAULT_ROAST_TIER = ROAST_TIERS[ROAST_TIERS.length - 1]

function findRoastTierByTitle(title: string): RoastRule {
  return ROAST_TIERS.find(tier => title.includes(tier.title.replace(/\s+\S+$/, ''))) ?? DEFAULT_ROAST_TIER
}

/** Resolve the full roast tier (title, badge image, and theme color) for a player's stats. */
export function getPlayerRoast(p: RoastStatsInput): RoastTier {
  const metrics: RoastMetrics = {
    avgDeaths: Number(p.avg_deaths || 0),
    wr: Number(p.win_rate_pct || 0),
    totalBm: getTotalBm(p),
    spongeRatio: Number(p.avg_damage_taken || 0) / Math.max(1, Number(p.avg_hero_damage || 1)),
    totalBsteps: Number(p.total_bsteps || 0),
  }

  return ROAST_TIERS.find(tier => !tier.matches || tier.matches(metrics)) ?? DEFAULT_ROAST_TIER
}

export function getPlayerRoastTitle(p: RoastStatsInput): string {
  return getPlayerRoast(p).title
}

export function getRoastImageFilename(title: string): string {
  return findRoastTierByTitle(title).image
}

export function getRoastThemeColor(title: string): string {
  return findRoastTierByTitle(title).themeColor
}
