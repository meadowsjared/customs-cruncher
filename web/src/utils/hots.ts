import heroMapping from '../assets/heroes/heroes.json'
import talentsData from '../assets/talents/talents.json'

export interface TalentInfo {
  name: string
  description: string
  icon: string
  tier: string
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

export function resolveHeroName(rawOrCode: string): string {
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

export function formatNumber(num?: number): string {
  if (num === undefined || num === null || isNaN(num)) return '0'
  return new Intl.NumberFormat().format(Math.round(num))
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

export function getHeroImageUrl(heroName: string): string {
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

export function getTalentTooltip(talentKey?: string, tierIndex: number = 0): string {
  const level = [1, 4, 7, 10, 13, 16, 20][tierIndex] || 1
  if (!talentKey) return `Level ${level}: Not reached or unselected`
  const info = talentsMap[talentKey]
  if (!info) return `Level ${level}: ${formatTalentName(talentKey)}`
  const typeStr = info.type ? ` [${info.type}]` : ''
  const desc = info.description ? `\n\n${info.description}` : ''
  return `Level ${level}${typeStr}: ${info.name}${desc}`
}

export function formatTalentDescriptionHtml(description?: string): string {
  if (!description) return ''
  return description
    .replace(/(Quest:)/g, '<span class="tooltip-quest">$1</span>')
    .replace(/(Reward:)/g, '<span class="tooltip-reward">$1</span>')
    .replace(/(Passive:)/g, '<span class="tooltip-passive">$1</span>')
    .replace(/(Active:)/g, '<span class="tooltip-active">$1</span>')
    .replace(/(\b(?:[0-9]+(?:\.[0-9]+)?%|\+[0-9]+%|[0-9]+(?:\.[0-9]+)?\s*(?:seconds?|sec)|[0-9]+\s*Mana)\b)/g, '<span class="tooltip-num">$1</span>')
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
