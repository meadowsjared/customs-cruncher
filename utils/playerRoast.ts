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

export function getPlayerRoastTitle(p: RoastStatsInput): string {
  const avgDeaths = Number(p.avg_deaths || 0)
  const wr = Number(p.win_rate_pct || 0)
  const totalBm = getTotalBm(p)
  const spongeRatio = Number(p.avg_damage_taken || 0) / Math.max(1, Number(p.avg_hero_damage || 1))

  if (avgDeaths >= 4.0) return 'Professional Gray Screen Enthusiast 💀'
  if (spongeRatio >= 2.0) return 'Certified Damage Sponge 🧽'
  if (wr < 38) return 'Chief Charity Elo Contributor 📉'
  if (wr < 48) return 'Struggling Coinflip Veteran 🪙'
  if (totalBm >= 300) return 'BM Connoisseur, Map-Blind Tactician 💃'
  if (avgDeaths >= 3.0) return 'Cemetery Season Ticket Holder ⚰️'
  if (Number(p.total_bsteps || 0) === 0 && totalBm > 0) return 'All Spray, Zero B-Step 🎨'
  return 'Tactical Feeder in Disguise 🎯'
}
