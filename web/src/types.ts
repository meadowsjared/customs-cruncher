export interface ReplaySummary {
  id: number
  date: string
  map: string
  length: number
  winner: number
  team0_takedowns: number
  team1_takedowns: number
  team0_players: string[]
  team1_players: string[]
  heroes: string[]
}

export interface ReplaysApiResponse {
  replays: ReplaySummary[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface PlayerGameStats {
  KDA?: number
  SoloKill?: number
  Assists?: number
  Deaths?: number
  Takedowns?: number
  HeroDamage?: number
  SiegeDamage?: number
  Healing?: number
  SelfHealing?: number
  DamageTaken?: number
  DamageSoaked?: number
  ExperienceContribution?: number
  DPM?: number
  HPM?: number
  XPM?: number
  Level?: number
  Tier1Talent?: number
  Tier2Talent?: number
  Tier3Talent?: number
  Tier4Talent?: number
  Tier5Talent?: number
  Tier6Talent?: number
  Tier7Talent?: number
  awards?: string[]
  PhysicalDamage?: number
  SpellDamage?: number
  TeamfightHeroDamage?: number
  TeamfightDamageTaken?: number
  TeamfightHealingDone?: number
  TeamfightEscapesPerformed?: number
  HighestKillStreak?: number
  Multikill?: number
  OutnumberedDeaths?: number
  VengeancesPerformed?: number
  EscapesPerformed?: number
  RegenGlobes?: number
  MinionKills?: number
  StructureDamage?: number
  MinionDamage?: number
  CreepDamage?: number
  SummonDamage?: number
  MercCampCaptures?: number
  WatchTowerCaptures?: number
  TimeSpentDead?: number
  TimeSilencingEnemyHeroes?: number
  TimeRootingEnemyHeroes?: number
  TimeStunningEnemyHeroes?: number
  TimeCCdEnemyHeroes?: number
  ClutchHealsPerformed?: number
  ProtectionGivenToAllies?: number
  TownKills?: number
  bsteps?: number
  sprays?: number
  taunts?: number
  dances?: number
}

export interface ReplayPlayerTalents {
  Tier1Choice?: string
  Tier2Choice?: string
  Tier3Choice?: string
  Tier4Choice?: string
  Tier5Choice?: string
  Tier6Choice?: string
  Tier7Choice?: string
}

export interface ReplayPlayer {
  ToonHandle: string
  name: string
  tag: number | string
  hero: string
  skin?: string
  team: number
  win: boolean
  rowId?: number | null
  gameStats?: PlayerGameStats
  talents?: ReplayPlayerTalents
  bsteps?: unknown[]
  sprays?: unknown[]
  taunts?: unknown[]
  dances?: unknown[]
}

export interface TeamStats {
  ids: string[]
  names: string[]
  tags: (number | string)[]
  heroes: string[]
  level: number
  takedowns: number
  stats?: {
    KDA?: number
    totals?: {
      HeroDamage?: number
      SiegeDamage?: number
      Healing?: number
      DamageTaken?: number
    }
    timeTo10?: number
    timeTo20?: number
  }
}

export interface ReplayBanItem {
  hero: string
  order: number
  absolute?: number
}

export interface ReplayPicks {
  0?: (string | null)[]
  1?: (string | null)[]
  first?: number
  [key: string]: (string | null)[] | number | undefined
}

export interface ReplayDetail {
  id: number
  date: string
  map: string
  length: number
  winner: number
  team0_takedowns: number
  team1_takedowns: number
  first_pick_win?: boolean
  first_objective?: number | null
  first_objective_win?: boolean
  first_fort?: number | null
  first_keep?: number | null
  first_fort_win?: boolean
  first_keep_win?: boolean
  teams: Record<string, TeamStats>
  players: Record<string, ReplayPlayer>
  bans?: Record<string, ReplayBanItem[]>
  picks?: ReplayPicks
}

export interface LeaderboardPlayer {
  toon_handle: string
  player_name: string
  row_id?: number | null
  games_played: number
  wins: number
  losses: number
  win_rate_pct: number
  overall_kda: number
  avg_takedowns: number
  avg_deaths: number
  avg_assists: number
  avg_hero_damage: number
  avg_siege_damage: number
  avg_healing: number
  avg_damage_taken: number
  avg_xp_contribution: number
  total_bsteps: number
  total_sprays: number
  total_taunts: number
  total_dances: number
  total_voice_lines?: number
  recent_10_win_rate_pct?: number
}

export interface PlayerSearchItem {
  rowId: number
  battleTag: string
  isPrimary: boolean
}

export interface PlayerProfileTopHero {
  hero: string
  games: number
  wins: number
  winRatePct: number
}

export interface PlayerProfileSummary {
  rowId: number
  battleTag: string
  name: string
  tag: string
  allTags: string[]
  totalMatches: number
  wins: number
  losses: number
  winRatePct: number
  overallKda: number
  avgHeroDamage: number
  avgSiegeDamage: number
  avgHealing: number
  avgDamageTaken: number
  avgXp: number
  topHeroes: PlayerProfileTopHero[]
  highestWinRateHeroes: PlayerProfileTopHero[]
}

export interface PlayerProfileMatch {
  replay_id: number
  date: string
  map: string
  hero: string
  battle_tag?: string
  win: boolean
  kda: number
  solo_kills: number
  assists: number
  deaths: number
  hero_damage: number
  siege_damage: number
  healing: number
  self_healing: number
  damage_taken: number
  xp_contribution: number
  length: number
  talents: ReplayPlayerTalents | null
}

export interface PlayerHeroSpecificStats {
  hero: string
  total: number
  wins: number
  losses: number
  winRatePct: number
  kda: number
  avgHeroDamage: number
  avgSiegeDamage: number
  avgHealing: number
  avgDamageTaken: number
}

export interface PlayerProfileData {
  player: PlayerProfileSummary
  matches: PlayerProfileMatch[]
  heroStats?: PlayerHeroSpecificStats | null
}

export interface HeroProfileTopPlayer {
  rowId: number | null
  battleTag: string
  name: string
  tag: string
  games: number
  wins: number
  winRatePct: number
  kda: number
}

export interface HeroProfileSummary {
  hero: string
  canonicalName: string
  totalMatches: number
  wins: number
  losses: number
  winRatePct: number
  overallKda: number
  avgHeroDamage: number
  avgSiegeDamage: number
  avgHealing: number
  avgDamageTaken: number
  avgXp: number
  topPlayers: HeroProfileTopPlayer[]
}

export interface HeroProfileMatch {
  replay_id: number
  date: string
  map: string
  hero: string
  player_row_id: number | null
  player_name: string
  player_tag: string
  player_battle_tag: string
  win: boolean
  kda: number
  solo_kills: number
  assists: number
  deaths: number
  hero_damage: number
  siege_damage: number
  healing: number
  self_healing: number
  damage_taken: number
  xp_contribution: number
  length: number
  talents: ReplayPlayerTalents | null
}

export interface HeroProfileData {
  hero: HeroProfileSummary
  matches: HeroProfileMatch[]
}

