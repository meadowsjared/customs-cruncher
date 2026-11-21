import heroMapping from '../assets/heroes/heroes.json'
import talentsData from '../assets/talents/talents.json'

export interface TalentInfo {
  name: string
  description: string
  icon: string
  tier: string | number
  type: string
  hero: string
}

const heroMap: Record<string, string> = heroMapping
const talentsMap: Record<string, TalentInfo> = talentsData

const heroAttrMap: Record<string, string> = {
  Abat: 'Abathur',
  Alar: 'Alarak',
  Alex: 'Alexstrasza',
  HANA: 'Ana',
  Andu: 'Anduin',
  Anub: "Anub'arak",
  Arts: 'Artanis',
  Arth: 'Arthas',
  Auri: 'Auriel',
  Azmo: 'Azmodan',
  Fire: 'Blaze',
  Faer: 'Brightwing',
  Amaz: 'Cassia',
  Chen: 'Chen',
  CCho: 'Cho',
  Chro: 'Chromie',
  DEAT: 'Deathwing',
  DECK: 'Deckard',
  Deha: 'Dehaka',
  Diab: 'Diablo',
  DVA0: 'D.Va',
  L90E: 'E.T.C.',
  Fals: 'Falstad',
  FENX: 'Fenix',
  Gall: 'Gall',
  Garr: 'Garrosh',
  Tink: 'Gazlowe',
  Genj: 'Genji',
  Genn: 'Greymane',
  Guld: "Gul'dan",
  Hanz: 'Hanzo',
  HOGG: 'Hogger',
  HXAL: "Xal'atath",
  Illi: 'Illidan',
  IMPE: 'Imperius',
  Jain: 'Jaina',
  Crus: 'Johanna',
  Junk: 'Junkrat',
  Kael: "Kael'thas",
  KelT: "Kel'Thuzad",
  Kerr: 'Kerrigan',
  Monk: 'Kharazim',
  Leor: 'Leoric',
  LiLi: 'Li Li',
  Wiza: 'Li-Ming',
  Medi: 'Lt. Morales',
  Luci: 'Lucio',
  Drya: 'Lunara',
  Maie: 'Maiev',
  Malf: 'Malfurion',
  MalG: "Mal'Ganis",
  MALT: 'Malthael',
  Mdvh: 'Medivh',
  HMEI: 'Mei',
  MEPH: 'Mephisto',
  Mura: 'Muradin',
  Murk: 'Murky',
  Witc: 'Nazeebo',
  Nova: 'Nova',
  ORPH: 'Orphea',
  Prob: 'Probius',
  NXHU: 'Qhira',
  Ragn: 'Ragnaros',
  Rayn: 'Raynor',
  Rehg: 'Rehgar',
  Rexx: 'Rexxar',
  Samu: 'Samuro',
  Sgth: 'Sgt. Hammer',
  Barb: 'Sonya',
  Stit: 'Stitches',
  STUK: 'Stukov',
  Sylv: 'Sylvanas',
  Tass: 'Tassadar',
  Butc: 'The Butcher',
  Lost: 'The Lost Vikings',
  Thra: 'Thrall',
  Tra0: 'Tracer',
  Tych: 'Tychus',
  Tyrl: 'Tyrael',
  Tyrd: 'Tyrande',
  Uthe: 'Uther',
  VALE: 'Valeera',
  Demo: 'Valla',
  Vari: 'Varian',
  Necr: 'Xul',
  WHIT: 'Whitemane',
  YREL: 'Yrel',
  Zaga: 'Zagara',
  Zary: 'Zarya',
  Zera: 'Zeratul',
  ZULJ: "Zul'jin",
}

export function resolveHeroName(rawOrCode?: string | null): string {
  if (!rawOrCode) return ''
  return heroAttrMap[rawOrCode] || rawOrCode
}

// Vite eager glob to bundle and hash all hero portraits from src/assets/heroes/
const heroImages = import.meta.glob<string>(
  '../assets/heroes/*.png',
  { eager: true, import: 'default' }
)

export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function formatDateRelative(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  const days = Math.floor(diffSec / 86400)
  if (days < 30) return `${days}d ago`

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDateFull(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  })
}

export function formatNumber(num?: number): string {
  if (num === undefined || num === null || isNaN(num)) return '0'
  return new Intl.NumberFormat().format(Math.round(num))
}

export const ARAM_MAPS: readonly string[] = [
  'Braxis Outpost',
  'Industrial District',
  'Lost Cavern',
  'Silver City',
]

export function isAramMap(mapName?: string | null): boolean {
  if (!mapName) return false
  return ARAM_MAPS.some(m => m.toLowerCase() === mapName.trim().toLowerCase())
}

export function getMapImageUrl(mapName: string): string {
  if (!mapName) return ''
  const filename = mapName
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `/maps/${filename}.png`
}

export function getHeroImageUrl(heroName?: string | null): string {
  if (!heroName) return ''
  const resolved = resolveHeroName(heroName)
  const mappedFilename = heroMap[resolved] || heroMap[heroName]
  if (mappedFilename) {
    const key = `../assets/heroes/${mappedFilename}`
    if (heroImages[key]) return heroImages[key]
  }

  const cleaned = resolved
    .toLowerCase()
    .replace(/['.]/g, '')
    .replace(/[^a-z0-9]+/g, '')
  const fallbackKey = `../assets/heroes/${cleaned}.png`
  if (heroImages[fallbackKey]) return heroImages[fallbackKey]

  return `/heroes/${cleaned}.png`
}

export function getTalentInfo(talentKey?: string): TalentInfo | undefined {
  if (!talentKey) return undefined
  return talentsMap[talentKey]
}

export function getTalentImageUrl(talentKey?: string): string {
  if (!talentKey) return ''
  const info = talentsMap[talentKey]
  if (info && info.icon) {
    return `/talents/${info.icon}`
  }
  return `/talents/${talentKey}.png`
}

export function formatTalentName(talentKey?: string): string {
  if (!talentKey) return ''
  const info = talentsMap[talentKey]
  if (info && info.name) {
    return info.name
  }
  let cleaned = talentKey
  for (const hero of Object.keys(heroMap)) {
    const raw = hero.replace(/[^a-zA-Z0-9]/g, '')
    if (cleaned.startsWith(raw)) {
      cleaned = cleaned.slice(raw.length)
      break
    }
  }
  cleaned = cleaned.replace(/^Talent/i, '').replace(/Talent$/i, '')
  return cleaned.replace(/([A-Z])/g, ' $1').trim()
}

export function splitTalentDescriptionSections(description?: string): string[] {
  if (!description) return []
  const regex = /(?:^|\s+)((?:Repeatable\s+)?(?:Quest|Reward|Passive|Active|Gambit):)/g
  let match: RegExpExecArray | null
  const indices: { start: number; keyword: string }[] = []

  while ((match = regex.exec(description)) !== null) {
    const keywordStart = match.index + (match[0].length - match[1].length)
    indices.push({ start: keywordStart, keyword: match[1] })
  }

  if (indices.length === 0) {
    return [description.trim()]
  }

  const sections: string[] = []
  if (indices[0].start > 0) {
    const prefix = description.slice(0, indices[0].start).trim()
    if (prefix) sections.push(prefix)
  }

  for (let i = 0; i < indices.length; i++) {
    const start = indices[i].start
    const end = i + 1 < indices.length ? indices[i + 1].start : description.length
    sections.push(description.slice(start, end).trim())
  }

  return sections
}

export function getTalentTooltip(talentKey?: string, tierIndex: number = 0): string {
  const level = [1, 4, 7, 10, 13, 16, 20][tierIndex] || 1
  if (!talentKey) return `Level ${level}: Not reached or unselected`
  const info = talentsMap[talentKey]
  if (!info) return `Level ${level}: ${formatTalentName(talentKey)}`
  const typeStr = info.type ? ` [${info.type}]` : ''
  const sections = splitTalentDescriptionSections(info.description)
  const desc = sections.length > 0 ? `\n\n${sections.join('\n')}` : ''
  return `Level ${level}${typeStr}: ${info.name}${desc}`
}

export function formatTalentDescriptionHtml(description?: string): string {
  if (!description) return ''
  const sections = splitTalentDescriptionSections(description)

  return sections
    .map((section) => {
      const formatted = section
        .replace(/(Repeatable Quest:|Quest:)/g, '<span class="tooltip-quest">$1</span>')
        .replace(/(Reward:)/g, '<span class="tooltip-reward">$1</span>')
        .replace(/(Passive:)/g, '<span class="tooltip-passive">$1</span>')
        .replace(/(Active:)/g, '<span class="tooltip-active">$1</span>')
        .replace(/(Gambit:)/g, '<span class="tooltip-gambit">$1</span>')
        .replace(/(\b(?:[0-9]+(?:\.[0-9]+)?%|\+[0-9]+%|[0-9]+(?:\.[0-9]+)?\s*(?:seconds?|sec)|[0-9]+\s*Mana)\b)/g, '<span class="tooltip-num">$1</span>')
      return `<div class="tooltip-desc-line">${formatted}</div>`
    })
    .join('')
}

export interface CorrelatedQuestStat {
  type: 'globe' | 'takedown' | 'minion'
  label: string
  current: number
  target?: number
  completed?: boolean
  pct?: number
  displayText: string
}

export function isQuestTalent(talentKey?: string): boolean {
  if (!talentKey) return false
  const info = talentsMap[talentKey]
  if (!info || !info.description) return false
  return /(?:^|\s+)((?:Repeatable\s+)?Quest:)/i.test(info.description)
}

export function getCorrelatedQuestStats(
  talentKey?: string,
  gameStats?: { RegenGlobes?: number; Takedowns?: number; MinionKills?: number }
): CorrelatedQuestStat[] {
  if (!talentKey || !gameStats) return []
  const info = talentsMap[talentKey]
  if (!info || !info.description) return []
  const desc = info.description

  const isQuest = /(?:^|\s+)((?:Repeatable\s+)?Quest:)/i.test(desc)
  if (!isQuest) return []

  const results: CorrelatedQuestStat[] = []

  // 1. Globe Quests
  if (/regeneration globe|regen globe|\bglobes?\b/i.test(desc)) {
    const globes = gameStats.RegenGlobes || 0
    const targetMatches = Array.from(
      desc.matchAll(/(?:gather(?:ing)?|collect(?:ing)?|upon gathering|after gathering|after collecting|every)\s+([0-9]+)\s+(?:regeneration\s+globes?|regen\s+globes?|globes?)/gi)
    )
    let target: number | undefined
    if (targetMatches.length > 0) {
      const numbers: number[] = []
      for (const m of targetMatches) {
        const val = parseInt(m[1], 10)
        if (!isNaN(val)) numbers.push(val)
      }
      if (numbers.length > 0) {
        target = Math.max(...numbers)
      }
    }

    if (target !== undefined) {
      const completed = globes >= target
      const pct = Math.min(100, Math.round((globes / target) * 100))
      results.push({
        type: 'globe',
        label: 'Regen Globes',
        current: globes,
        target,
        completed,
        pct,
        displayText: completed ? `${globes} / ${target} Globes (Completed ✓)` : `${globes} / ${target} Globes (${pct}%)`,
      })
    } else {
      results.push({
        type: 'globe',
        label: 'Regen Globes',
        current: globes,
        displayText: `${globes} Globes Gathered`,
      })
    }
  }

  // 2. Takedowns
  if (/\btakedowns?\b/i.test(desc)) {
    const takedowns = gameStats.Takedowns || 0
    const targetMatch = desc.match(/(?:participate in|reach|after)\s+([0-9]+)\s+(?:hero\s+)?takedowns?/i)
    let target: number | undefined
    if (targetMatch) {
      const val = parseInt(targetMatch[1], 10)
      if (!isNaN(val)) target = val
    }
    if (target !== undefined) {
      const completed = takedowns >= target
      const pct = Math.min(100, Math.round((takedowns / target) * 100))
      results.push({
        type: 'takedown',
        label: 'Takedowns',
        current: takedowns,
        target,
        completed,
        pct,
        displayText: completed ? `${takedowns} / ${target} Takedowns (Completed ✓)` : `${takedowns} / ${target} Takedowns (${pct}%)`,
      })
    } else {
      results.push({
        type: 'takedown',
        label: 'Takedowns',
        current: takedowns,
        displayText: `${takedowns} Match Takedowns`,
      })
    }
  }

  // 3. Minion Kills
  if (/minions?\b/i.test(desc) && /kill|die/i.test(desc)) {
    const minionKills = gameStats.MinionKills || 0
    results.push({
      type: 'minion',
      label: 'Minion Kills',
      current: minionKills,
      displayText: `${minionKills} Minions Killed`,
    })
  }

  return results
}

export function getTalentBuildCode(player: { hero: string; gameStats?: { Tier1Talent?: number; Tier2Talent?: number; Tier3Talent?: number; Tier4Talent?: number; Tier5Talent?: number; Tier6Talent?: number; Tier7Talent?: number } }): string {
  const stats = player.gameStats
  if (!stats) return ''
  const t1 = stats.Tier1Talent || 0
  const t2 = stats.Tier2Talent || 0
  const t3 = stats.Tier3Talent || 0
  const t4 = stats.Tier4Talent || 0
  const t5 = stats.Tier5Talent || 0
  const t6 = stats.Tier6Talent || 0
  const t7 = stats.Tier7Talent || 0
  const heroClean = player.hero.replace(/[^a-zA-Z0-9]/g, '')
  return `[T${t1}${t2}${t3}${t4}${t5}${t6}${t7},${heroClean}]`
}
