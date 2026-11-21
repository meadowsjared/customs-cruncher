<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  PlayerProfileData,
  PlayerProfileMatch,
  PlayerProfileSummary,
  PlayerProfileTopHero,
  PlayerHeroSpecificStats,
  PlayerSearchItem,
  ReplayPlayerTalents,
} from '../types'
import {
  resolveHeroName,
  formatDuration,
  formatDateRelative,
  formatNumber,
  getMapImageUrl,
  getHeroImageUrl,
  getTalentImageUrl,
  getTalentInfo,
  formatTalentName,
  formatTalentDescriptionHtml,
} from '../utils/hots'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const error = ref<string | null>(null)
const profileData = ref<PlayerProfileData | null>(null)

// Search bar state
const searchQuery = ref('')
const searchResults = ref<PlayerSearchItem[]>([])
const searchLoading = ref(false)
const showSearchDropdown = ref(false)

// Filters for matches list
const heroFilter = ref('')
const outcomeFilter = ref<'all' | 'win' | 'loss'>('all')
const limitFilter = ref<number>(0)
const customLimit = ref<number | null>(null)

const effectiveLimit = computed<number>(() => {
  if (limitFilter.value === 0) return 0
  if (limitFilter.value === -1) {
    return customLimit.value && customLimit.value > 0 ? customLimit.value : 0
  }
  return limitFilter.value
})

// Tooltip State
interface ActiveTooltipState {
  visible: boolean
  talentKey?: string
  tierIndex: number
  heroName: string
  x: number
  y: number
}

const activeTooltip = ref<ActiveTooltipState>({
  visible: false,
  tierIndex: 0,
  heroName: '',
  x: 0,
  y: 0,
})

function showTalentTooltip(event: MouseEvent | TouchEvent, talentKey: string | undefined, tierIndex: number, heroName: string) {
  let clientX = 0
  let clientY = 0
  if ('touches' in event && event.touches.length > 0) {
    clientX = event.touches[0].clientX
    clientY = event.touches[0].clientY
  } else if ('clientX' in event) {
    clientX = event.clientX
    clientY = event.clientY
  }

  activeTooltip.value = {
    visible: true,
    talentKey,
    tierIndex,
    heroName,
    x: clientX,
    y: clientY,
  }
}

function updateTooltipPosition(event: MouseEvent) {
  activeTooltip.value.x = event.clientX
  activeTooltip.value.y = event.clientY
}

function hideTalentTooltip() {
  activeTooltip.value.visible = false
}

function isDomElement(target: EventTarget | null): target is Element {
  return target instanceof Element
}

function handlePointerDown(e: Event) {
  if (!activeTooltip.value.visible) return
  if (isDomElement(e.target) && e.target.closest('.talent-slot, .hots-talent-tooltip')) {
    return
  }
  hideTalentTooltip()
}

const tooltipStyle = computed(() => {
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 1080
  const isMobile = viewportWidth < 600
  const padding = isMobile ? 12 : 16
  const tooltipWidth = Math.min(330, viewportWidth - padding * 2)
  const tooltipHeight = 220

  let left: number
  let top: number

  if (isMobile) {
    // Horizontally center relative to tap point on mobile
    left = activeTooltip.value.x - tooltipWidth / 2
    // Vertically place above or below finger so tap target isn't obscured
    if (activeTooltip.value.y > viewportHeight * 0.55) {
      top = activeTooltip.value.y - tooltipHeight - 16
    } else {
      top = activeTooltip.value.y + 24
    }
  } else {
    // Desktop: default to right/down from cursor, flip left if overflowing
    left = activeTooltip.value.x + 16
    top = activeTooltip.value.y + 16

    if (left + tooltipWidth > viewportWidth - padding) {
      left = activeTooltip.value.x - tooltipWidth - 16
    }
  }

  // Strict clamp within screen bounds so tooltip NEVER escapes viewport bounds
  left = Math.max(padding, Math.min(left, viewportWidth - tooltipWidth - padding))
  top = Math.max(padding, Math.min(top, viewportHeight - tooltipHeight - padding))

  return {
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    maxWidth: `${tooltipWidth}px`,
  }
})

function getTypeBadgeClass(type?: string): string {
  if (!type) return ''
  const t = type.toLowerCase()
  if (t === 'q') return 'type-q'
  if (t === 'w') return 'type-w'
  if (t === 'e') return 'type-e'
  if (t === 'r' || t === 'heroic') return 'type-heroic'
  if (t === 'trait' || t === 'd') return 'type-trait'
  if (t === 'active') return 'type-active'
  return 'type-passive'
}

function getMatchTalentList(talents: ReplayPlayerTalents | null | undefined): (string | undefined)[] {
  if (!talents) return [undefined, undefined, undefined, undefined, undefined, undefined, undefined]
  return [
    talents.Tier1Choice,
    talents.Tier2Choice,
    talents.Tier3Choice,
    talents.Tier4Choice,
    talents.Tier5Choice,
    talents.Tier6Choice,
    talents.Tier7Choice,
  ]
}

function hideBrokenImage(event: Event) {
  const target = event.target
  if (target instanceof HTMLImageElement) {
    target.style.display = 'none'
  }
}

async function fetchPlayerProfile(identifier: string, heroName?: string) {
  loading.value = true
  error.value = null

  try {
    const url = heroName
      ? `/api/player/${encodeURIComponent(identifier)}?hero=${encodeURIComponent(heroName)}`
      : `/api/player/${encodeURIComponent(identifier)}`
    const res = await fetch(url)
    if (!res.ok) {
      if (res.status === 404) {
        error.value = `Player "${identifier}" not found in customs match records.`
      } else {
        error.value = `Failed to load player (Status ${res.status}).`
      }
      profileData.value = null
      return
    }

    const data: PlayerProfileData = await res.json()
    profileData.value = data

    if (data.player.rowId && String(data.player.rowId) !== route.params.identifier) {
      if (route.params.heroName) {
        router.replace(`/player/${data.player.rowId}/hero/${route.params.heroName}`)
      } else {
        router.replace(`/player/${data.player.rowId}`)
      }
    }
  } catch {
    error.value = 'Failed to load player profile from server.'
    profileData.value = null
  } finally {
    loading.value = false
  }
}

let searchTimer: ReturnType<typeof setTimeout> | null = null

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  const q = searchQuery.value.trim()
  if (!q) {
    searchResults.value = []
    showSearchDropdown.value = false
    return
  }

  searchTimer = setTimeout(async () => {
    searchLoading.value = true
    try {
      const res = await fetch(`/api/players/search?q=${encodeURIComponent(q)}`)
      if (res.ok) {
        const json: { results: PlayerSearchItem[] } = await res.json()
        searchResults.value = json.results
        showSearchDropdown.value = true
      }
    } catch {
      searchResults.value = []
    } finally {
      searchLoading.value = false
    }
  }, 200)
}

function selectPlayer(p: PlayerSearchItem) {
  showSearchDropdown.value = false
  searchQuery.value = ''
  router.push(`/player/${p.rowId}`)
}

function handleSearchBlur() {
  setTimeout(() => {
    showSearchDropdown.value = false
  }, 250)
}

function navigateToMatch(matchId: number) {
  router.push(`/replay/${matchId}`)
}

const activeHeroParam = computed<string>(() => {
  if (typeof route.params.heroName === 'string') {
    return route.params.heroName
  }
  return ''
})

const filteredMatches = computed<PlayerProfileMatch[]>(() => {
  if (!profileData.value) return []
  let list = profileData.value.matches

  if (outcomeFilter.value === 'win') {
    list = list.filter(m => m.win)
  } else if (outcomeFilter.value === 'loss') {
    list = list.filter(m => !m.win)
  }

  if (heroFilter.value.trim()) {
    const h = heroFilter.value.trim().toLowerCase()
    list = list.filter(m => m.hero.toLowerCase().includes(h) || resolveHeroName(m.hero).toLowerCase().includes(h))
  }

  if (effectiveLimit.value > 0) {
    list = list.slice(0, effectiveLimit.value)
  }

  return list
})

const hasActiveSummaryFilters = computed<boolean>(() => {
  return (
    outcomeFilter.value !== 'all' ||
    heroFilter.value.trim().length > 0 ||
    effectiveLimit.value > 0
  )
})

const filterHeroStripSuffix = computed<string>(() => {
  if (effectiveLimit.value > 0) {
    return ` (Last ${displaySummary.value?.totalMatches ?? effectiveLimit.value})`
  }
  if (hasActiveSummaryFilters.value) {
    return ' (Filtered)'
  }
  return ''
})

const displaySummary = computed<PlayerProfileSummary | null>(() => {
  if (!profileData.value) return null
  if (!hasActiveSummaryFilters.value) {
    const p = profileData.value.player
    return {
      ...p,
      totalKills: p.totalKills !== undefined
        ? p.totalKills
        : profileData.value.matches.reduce((acc, m) => acc + (Number(m.solo_kills) || 0), 0),
      totalAssists: p.totalAssists !== undefined
        ? p.totalAssists
        : profileData.value.matches.reduce((acc, m) => acc + (Number(m.assists) || 0), 0),
      totalDeaths: p.totalDeaths !== undefined
        ? p.totalDeaths
        : profileData.value.matches.reduce((acc, m) => acc + (Number(m.deaths) || 0), 0),
      overallKda: p.overallKda,
    }
  }

  const targetMatches = filteredMatches.value
  const totalMatches = targetMatches.length
  const wins = targetMatches.filter(m => m.win).length
  const losses = totalMatches - wins
  const totalKills = targetMatches.reduce((acc, m) => acc + (Number(m.solo_kills) || 0), 0)
  const totalAssists = targetMatches.reduce((acc, m) => acc + (Number(m.assists) || 0), 0)
  const totalDeaths = targetMatches.reduce((acc, m) => acc + (Number(m.deaths) || 0), 0)
  const winRatePct = totalMatches > 0 ? Number(((wins / totalMatches) * 100).toFixed(1)) : 0
  const overallKda = totalMatches > 0
    ? Number((targetMatches.reduce((acc, m) => acc + (Number(m.kda) || 0), 0) / totalMatches).toFixed(2))
    : 0
  const avgHeroDamage = totalMatches > 0
    ? Math.round(targetMatches.reduce((acc, m) => acc + (Number(m.hero_damage) || 0), 0) / totalMatches)
    : 0
  const avgSiegeDamage = totalMatches > 0
    ? Math.round(targetMatches.reduce((acc, m) => acc + (Number(m.siege_damage) || 0), 0) / totalMatches)
    : 0
  const avgHealing = totalMatches > 0
    ? Math.round(targetMatches.reduce((acc, m) => acc + ((Number(m.healing) || 0) + (Number(m.self_healing) || 0)), 0) / totalMatches)
    : 0
  const avgDamageTaken = totalMatches > 0
    ? Math.round(targetMatches.reduce((acc, m) => acc + (Number(m.damage_taken) || 0), 0) / totalMatches)
    : 0
  const avgXp = totalMatches > 0
    ? Math.round(targetMatches.reduce((acc, m) => acc + (Number(m.xp_contribution) || 0), 0) / totalMatches)
    : 0

  const heroCounts = new Map<string, { hero: string; games: number; wins: number }>()
  for (const m of targetMatches) {
    const existing = heroCounts.get(m.hero)
    if (existing) {
      existing.games += 1
      if (m.win) existing.wins += 1
    } else {
      heroCounts.set(m.hero, {
        hero: m.hero,
        games: 1,
        wins: m.win ? 1 : 0,
      })
    }
  }

  const allHeroStats: PlayerProfileTopHero[] = Array.from(heroCounts.values()).map(h => ({
    hero: h.hero,
    games: h.games,
    wins: h.wins,
    winRatePct: h.games > 0 ? Number(((h.wins / h.games) * 100).toFixed(1)) : 0,
  }))

  const topHeroes: PlayerProfileTopHero[] = [...allHeroStats]
    .sort((a, b) => b.games - a.games || b.winRatePct - a.winRatePct)
    .slice(0, 5)

  let eligibleForWinrate = allHeroStats.filter(h => h.games >= 3)
  if (eligibleForWinrate.length < 3) {
    eligibleForWinrate = allHeroStats.filter(h => h.games >= 2)
  }
  if (eligibleForWinrate.length < 3) {
    eligibleForWinrate = allHeroStats
  }

  const highestWinRateHeroes: PlayerProfileTopHero[] = [...eligibleForWinrate]
    .sort((a, b) => b.winRatePct - a.winRatePct || b.games - a.games)
    .slice(0, 5)

  const summary: PlayerProfileSummary = {
    rowId: profileData.value.player.rowId,
    battleTag: profileData.value.player.battleTag,
    name: profileData.value.player.name,
    tag: profileData.value.player.tag,
    allTags: profileData.value.player.allTags,
    mmr: profileData.value.player.mmr,
    baseMmr: profileData.value.player.baseMmr,
    adjustment: profileData.value.player.adjustment,
    role: profileData.value.player.role,
    totalMatches,
    wins,
    losses,
    winRatePct,
    overallKda,
    totalKills,
    totalAssists,
    totalDeaths,
    avgHeroDamage,
    avgSiegeDamage,
    avgHealing,
    avgDamageTaken,
    avgXp,
    topHeroes,
    highestWinRateHeroes,
  }

  return summary
})

const displayHeroStats = computed<PlayerHeroSpecificStats | null>(() => {
  if (!profileData.value || !activeHeroParam.value) return null

  const target = activeHeroParam.value.toLowerCase().replace(/[^a-z0-9]/g, '')
  const hasExtraHeroFilters =
    outcomeFilter.value !== 'all' ||
    effectiveLimit.value > 0 ||
    (heroFilter.value.trim().length > 0 &&
      heroFilter.value.trim().toLowerCase() !== activeHeroParam.value.toLowerCase() &&
      heroFilter.value.trim().toLowerCase() !== resolveHeroName(activeHeroParam.value).toLowerCase())

  if (!hasExtraHeroFilters && profileData.value.heroStats) {
    const hs = profileData.value.heroStats
    const matches = profileData.value.matches.filter(m => {
      const raw = m.hero.toLowerCase().replace(/[^a-z0-9]/g, '')
      const resolved = resolveHeroName(m.hero).toLowerCase().replace(/[^a-z0-9]/g, '')
      return raw === target || resolved === target
    })
    return {
      ...hs,
      totalKills: hs.totalKills !== undefined
        ? hs.totalKills
        : matches.reduce((acc, m) => acc + (Number(m.solo_kills) || 0), 0),
      totalAssists: hs.totalAssists !== undefined
        ? hs.totalAssists
        : matches.reduce((acc, m) => acc + (Number(m.assists) || 0), 0),
      totalDeaths: hs.totalDeaths !== undefined
        ? hs.totalDeaths
        : matches.reduce((acc, m) => acc + (Number(m.deaths) || 0), 0),
      kda: hs.kda,
    }
  }

  const matches = filteredMatches.value
  const total = matches.length
  const wins = matches.filter(m => m.win).length
  const losses = total - wins
  const totalKills = matches.reduce((acc, m) => acc + (Number(m.solo_kills) || 0), 0)
  const totalAssists = matches.reduce((acc, m) => acc + (Number(m.assists) || 0), 0)
  const totalDeaths = matches.reduce((acc, m) => acc + (Number(m.deaths) || 0), 0)
  const winRatePct = total > 0 ? Number(((wins / total) * 100).toFixed(1)) : 0

  let sumKda = 0
  let sumHeroDmg = 0
  let sumSiegeDmg = 0
  let sumHealing = 0
  let sumDmgTaken = 0

  for (const m of matches) {
    sumKda += Number(m.kda) || 0
    sumHeroDmg += Number(m.hero_damage) || 0
    sumSiegeDmg += Number(m.siege_damage) || 0
    sumHealing += (Number(m.healing) || 0) + (Number(m.self_healing) || 0)
    sumDmgTaken += Number(m.damage_taken) || 0
  }

  const kda = total > 0 ? Number((sumKda / total).toFixed(2)) : 0
  const avgHeroDamage = total > 0 ? Math.round(sumHeroDmg / total) : 0
  const avgSiegeDamage = total > 0 ? Math.round(sumSiegeDmg / total) : 0
  const avgHealing = total > 0 ? Math.round(sumHealing / total) : 0
  const avgDamageTaken = total > 0 ? Math.round(sumDmgTaken / total) : 0

  const heroStats: PlayerHeroSpecificStats = {
    hero: matches[0]?.hero || activeHeroParam.value,
    total,
    wins,
    losses,
    winRatePct,
    kda,
    totalKills,
    totalAssists,
    totalDeaths,
    avgHeroDamage,
    avgSiegeDamage,
    avgHealing,
    avgDamageTaken,
  }

  return heroStats
})

function navigateToHeroAllPlayers(heroName: string) {
  router.push(`/hero/${encodeURIComponent(heroName)}`)
}

function navigateToPlayerAllHeroes() {
  const rowId = profileData.value?.player.rowId || route.params.identifier
  router.push(`/player/${rowId}`)
}

function navigateToPlayerSpecificHero(heroName: string) {
  const rowId = profileData.value?.player.rowId || route.params.identifier
  router.push(`/player/${rowId}/hero/${encodeURIComponent(heroName)}`)
}

watch(
  activeHeroParam,
  newHero => {
    if (newHero) {
      heroFilter.value = resolveHeroName(newHero) || newHero
    } else {
      heroFilter.value = ''
    }
  },
  { immediate: true }
)

watch(
  [() => route.params.identifier, () => route.params.heroName],
  ([newId, newHero]) => {
    if (typeof newId === 'string') {
      const heroStr = typeof newHero === 'string' ? newHero : undefined
      fetchPlayerProfile(newId, heroStr)
    }
  },
  { immediate: true }
)

onMounted(() => {
  const currentId = route.params.identifier
  if (typeof currentId === 'string' && !profileData.value) {
    const heroStr = typeof route.params.heroName === 'string' ? route.params.heroName : undefined
    fetchPlayerProfile(currentId, heroStr)
  }
  window.addEventListener('pointerdown', handlePointerDown)
})

onUnmounted(() => {
  window.removeEventListener('pointerdown', handlePointerDown)
})
</script>

<template>
  <div class="player-profile-view container">
    <!-- Back to Matches / Search Bar Row -->
    <div class="profile-nav-bar">
      <button class="btn btn-back"
              @click="router.push('/matches')">
        ← Back to Matches
      </button>

      <!-- Player Search Input with Dropdown -->
      <div class="player-search-box">
        <span class="search-icon">🔍</span>
        <input v-model="searchQuery"
               type="text"
               class="player-search-input"
               placeholder="Lookup player by name or BattleTag..."
               @input="onSearchInput"
               @focus="searchResults.length > 0 ? (showSearchDropdown = true) : null"
               @blur="handleSearchBlur" />
        <div v-if="showSearchDropdown && searchResults.length > 0"
             class="player-search-dropdown">
          <div v-for="item in searchResults"
               :key="item.rowId"
               class="search-result-item"
               @mousedown.prevent="selectPlayer(item)">
            <span class="result-tag">{{ item.battleTag }}</span>
            <span v-if="item.isPrimary"
                  class="result-badge">Primary</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading"
         class="card loading-card">
      <div class="spinner"></div>
      <p>Retrieving match history from the Nexus...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error"
         class="card error-card">
      <span class="error-icon">⚠️</span>
      <h2>Player Not Found</h2>
      <p>{{ error }}</p>
      <button class="btn btn-primary"
              @click="router.push('/matches')">
        Return to Matches
      </button>
    </div>

    <!-- Loaded Player Profile -->
    <div v-else-if="profileData"
         class="profile-content">
      <!-- Player Specific Hero Header Card -->
      <div v-if="activeHeroParam && displayHeroStats"
           class="profile-header-card card hero-mode-card">
        <div class="hero-mode-nav">
          <button class="btn btn-back-all-heroes"
                  @click="navigateToPlayerAllHeroes">
            ← View All Heroes for {{ profileData.player.name }}
          </button>
        </div>

        <div class="profile-header-top">
          <div class="profile-identity">
            <div class="hero-portrait-circle clickable-hero-portrait"
                 :title="`Click to view all matches for ${resolveHeroName(displayHeroStats.hero)} across ALL players`"
                 @click="navigateToHeroAllPlayers(displayHeroStats.hero)">
              <img :src="getHeroImageUrl(displayHeroStats.hero)"
                   :alt="displayHeroStats.hero"
                   class="hero-portrait-img"
                   @error="hideBrokenImage" />
              <span class="hero-portrait-badge">View All Players ↗</span>
            </div>
            <div class="player-identity-info">
              <h1 class="player-display-name">
                {{ profileData.player.name }}'s {{ resolveHeroName(displayHeroStats.hero) }}
              </h1>
              <p class="hero-specific-sub">
                Performance on {{ resolveHeroName(displayHeroStats.hero) }}.
                <a class="hero-global-link"
                   @click="navigateToHeroAllPlayers(displayHeroStats.hero)">
                  Click portrait to view all players on {{ resolveHeroName(displayHeroStats.hero) }} →
                </a>
              </p>
            </div>
          </div>

          <!-- Key Stats Badges for this hero -->
          <div class="profile-stat-pills">
            <div v-if="profileData.player.mmr != null"
                 class="stat-pill-card mmr-pill"
                 :title="profileData.player.baseMmr ? `Base MMR: ${formatNumber(profileData.player.baseMmr)}${profileData.player.adjustment ? ` (Adjustment: ${profileData.player.adjustment > 0 ? '+' : ''}${profileData.player.adjustment})` : ''}` : 'Effective In-House MMR'">
              <span class="stat-pill-label">Player MMR</span>
              <span class="stat-pill-val val-mmr">{{ formatNumber(profileData.player.mmr) }}</span>
              <span class="stat-pill-sub">
                <span v-if="profileData.player.baseMmr">Base: {{ formatNumber(profileData.player.baseMmr) }}</span>
                <span v-if="profileData.player.adjustment"
                      class="mmr-adj-badge">
                  ({{ profileData.player.adjustment > 0 ? '+' : '' }}{{ profileData.player.adjustment }})
                </span>
                <span v-if="!profileData.player.baseMmr">In-House</span>
              </span>
            </div>

            <div class="stat-pill-card">
              <span class="stat-pill-label">Hero Win Rate</span>
              <span class="stat-pill-val"
                    :class="displayHeroStats.winRatePct >= 50 ? 'val-good' : 'val-dim'">
                {{ displayHeroStats.winRatePct }}%
              </span>
              <span class="stat-pill-sub">
                {{ displayHeroStats.wins }}W - {{ displayHeroStats.losses }}L
              </span>
            </div>

            <div class="stat-pill-card"
                 :title="`${formatNumber(displayHeroStats.totalKills)} Kills / ${formatNumber(displayHeroStats.totalAssists)} Assists / ${formatNumber(displayHeroStats.totalDeaths)} Deaths (${effectiveLimit > 0 ? `Last ${displayHeroStats.total} Games` : `${displayHeroStats.total} Games`})`">
              <span class="stat-pill-label">Hero KAD</span>
              <span class="stat-pill-val val-kda">{{ displayHeroStats.kda.toFixed(2) }}</span>
              <span class="stat-pill-sub">
                <span class="kad-breakdown">
                  <span class="stat-k-text">{{ formatNumber(displayHeroStats.totalKills) }}</span>
                  <span class="stat-slash">/</span>
                  <span class="stat-a-text">{{ formatNumber(displayHeroStats.totalAssists) }}</span>
                  <span class="stat-slash">/</span>
                  <span class="stat-deaths-text">{{ formatNumber(displayHeroStats.totalDeaths) }}</span>
                </span>
                <span class="stat-pill-separator">•</span>
                <span>{{ effectiveLimit > 0 ? `Last ${displayHeroStats.total} Games` : `${displayHeroStats.total} Games` }}</span>
              </span>
            </div>

            <div class="stat-pill-card">
              <span class="stat-pill-label">Avg Hero Dmg</span>
              <span class="stat-pill-val">{{ formatNumber(displayHeroStats.avgHeroDamage) }}</span>
              <span class="stat-pill-sub">Per Match</span>
            </div>

            <div class="stat-pill-card">
              <span class="stat-pill-label">Avg Heal / Dmg Taken</span>
              <span class="stat-pill-val">
                {{ formatNumber(displayHeroStats.avgHealing || displayHeroStats.avgDamageTaken) }}
              </span>
              <span class="stat-pill-sub">
                {{ displayHeroStats.avgHealing ? 'Heal/Shield' : 'Dmg Taken' }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- General Player Header Card (When not viewing a single hero) -->
      <div v-else-if="displaySummary"
           class="profile-header-card card">
        <div class="profile-header-top">
          <div class="profile-identity">
            <div class="player-avatar-circle">
              <span>{{ displaySummary.name.charAt(0).toUpperCase() }}</span>
            </div>
            <div class="player-identity-info">
              <h1 class="player-display-name">
                {{ displaySummary.name }}
                <span v-if="displaySummary.tag"
                      class="player-bnet-tag">#{{ displaySummary.tag }}</span>
                <span v-if="displaySummary.role"
                      class="player-role-badge"
                      :title="`Preferred Roles: ${displaySummary.role}`">
                  {{ displaySummary.role }}
                </span>
              </h1>
              <div v-if="displaySummary.allTags.length > 1"
                   class="linked-accounts-wrap">
                <span class="linked-label">Linked Accounts:</span>
                <span v-for="tag in displaySummary.allTags"
                      :key="tag"
                      class="linked-tag-badge"
                      :class="{ active: tag === displaySummary.battleTag }">
                  {{ tag }}
                </span>
              </div>
            </div>
          </div>

          <!-- Key Stats Badges -->
          <div class="profile-stat-pills">
            <div v-if="displaySummary.mmr != null"
                 class="stat-pill-card mmr-pill"
                 :title="displaySummary.baseMmr ? `Base MMR: ${formatNumber(displaySummary.baseMmr)}${displaySummary.adjustment ? ` (Adjustment: ${displaySummary.adjustment > 0 ? '+' : ''}${displaySummary.adjustment})` : ''}` : 'Effective In-House MMR'">
              <span class="stat-pill-label">Current MMR</span>
              <span class="stat-pill-val val-mmr">{{ formatNumber(displaySummary.mmr) }}</span>
              <span class="stat-pill-sub">
                <span v-if="displaySummary.baseMmr">Base: {{ formatNumber(displaySummary.baseMmr) }}</span>
                <span v-if="displaySummary.adjustment"
                      class="mmr-adj-badge">
                  ({{ displaySummary.adjustment > 0 ? '+' : '' }}{{ displaySummary.adjustment }})
                </span>
                <span v-if="!displaySummary.baseMmr">In-House</span>
              </span>
            </div>

            <div class="stat-pill-card">
              <span class="stat-pill-label">Win Rate</span>
              <span class="stat-pill-val"
                    :class="displaySummary.winRatePct >= 50 ? 'val-good' : 'val-dim'">
                {{ displaySummary.winRatePct }}%
              </span>
              <span class="stat-pill-sub">
                {{ displaySummary.wins }}W - {{ displaySummary.losses }}L
              </span>
            </div>

            <div class="stat-pill-card"
                 :title="`${formatNumber(displaySummary.totalKills)} Kills / ${formatNumber(displaySummary.totalAssists)} Assists / ${formatNumber(displaySummary.totalDeaths)} Deaths (${effectiveLimit > 0 ? `Last ${displaySummary.totalMatches} Games` : `${displaySummary.totalMatches} Games`})`">
              <span class="stat-pill-label">Overall KAD</span>
              <span class="stat-pill-val val-kda">{{ displaySummary.overallKda.toFixed(2) }}</span>
              <span class="stat-pill-sub">
                <span class="kad-breakdown">
                  <span class="stat-k-text">{{ formatNumber(displaySummary.totalKills) }}</span>
                  <span class="stat-slash">/</span>
                  <span class="stat-a-text">{{ formatNumber(displaySummary.totalAssists) }}</span>
                  <span class="stat-slash">/</span>
                  <span class="stat-deaths-text">{{ formatNumber(displaySummary.totalDeaths) }}</span>
                </span>
                <span class="stat-pill-separator">•</span>
                <span>{{ effectiveLimit > 0 ? `Last ${displaySummary.totalMatches} Games` : `${displaySummary.totalMatches} Games` }}</span>
              </span>
            </div>

            <div class="stat-pill-card">
              <span class="stat-pill-label">Avg Hero Dmg</span>
              <span class="stat-pill-val">{{ formatNumber(displaySummary.avgHeroDamage) }}</span>
              <span class="stat-pill-sub">Per Match</span>
            </div>

            <div class="stat-pill-card">
              <span class="stat-pill-label">Avg Heal / Dmg Taken</span>
              <span class="stat-pill-val">
                {{ formatNumber(displaySummary.avgHealing || displaySummary.avgDamageTaken) }}
              </span>
              <span class="stat-pill-sub">
                {{ displaySummary.avgHealing ? 'Heal/Shield' : 'Dmg Taken' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Hero Highlights Wrapper -->
        <div v-if="displaySummary.topHeroes.length > 0 || (displaySummary.highestWinRateHeroes && displaySummary.highestWinRateHeroes.length > 0)"
             class="hero-strips-wrap">
          <!-- Top Heroes Strip -->
          <div v-if="displaySummary.topHeroes.length > 0"
               class="top-heroes-section">
            <span class="top-heroes-label">Most Played Heroes{{ filterHeroStripSuffix }}:</span>
            <div class="top-heroes-chips">
              <div v-for="th in displaySummary.topHeroes"
                   :key="th.hero"
                   class="top-hero-chip clickable-top-hero-chip"
                   :title="`View ${displaySummary.name}'s matches on ${resolveHeroName(th.hero)}`"
                   @click="navigateToPlayerSpecificHero(th.hero)">
                <img :src="getHeroImageUrl(th.hero)"
                     :alt="th.hero"
                     class="top-hero-avatar"
                     @error="hideBrokenImage" />
                <span class="top-hero-name">{{ resolveHeroName(th.hero) }}</span>
                <span class="top-hero-games">{{ th.games }}g</span>
                <span class="top-hero-wr"
                      :class="th.winRatePct >= 50 ? 'wr-positive' : 'wr-negative'">
                  {{ th.winRatePct }}%
                </span>
              </div>
            </div>
          </div>

          <!-- Highest Winrate Heroes Strip -->
          <div v-if="displaySummary.highestWinRateHeroes && displaySummary.highestWinRateHeroes.length > 0"
               class="top-heroes-section winrate-heroes-section">
            <span class="top-heroes-label">Highest Winrate Heroes{{ filterHeroStripSuffix }}:</span>
            <div class="top-heroes-chips">
              <div v-for="th in displaySummary.highestWinRateHeroes"
                   :key="th.hero"
                   class="top-hero-chip clickable-top-hero-chip wr-hero-chip"
                   :title="`View ${displaySummary.name}'s matches on ${resolveHeroName(th.hero)} (${th.wins}W - ${th.games - th.wins}L)`"
                   @click="navigateToPlayerSpecificHero(th.hero)">
                <img :src="getHeroImageUrl(th.hero)"
                     :alt="th.hero"
                     class="top-hero-avatar"
                     @error="hideBrokenImage" />
                <span class="top-hero-name">{{ resolveHeroName(th.hero) }}</span>
                <span class="top-hero-games">{{ th.games }}g</span>
                <span class="top-hero-wr"
                      :class="th.winRatePct >= 50 ? 'wr-positive' : 'wr-negative'">
                  {{ th.winRatePct }}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Match History List Section -->
      <div class="profile-matches-section card">
        <div class="matches-section-header">
          <div class="section-title-wrap">
            <h2>
              {{ activeHeroParam && displayHeroStats ? `${profileData.player.name}'s
              ${resolveHeroName(displayHeroStats.hero)} Matches` : 'Match History' }}
            </h2>
            <span class="count-badge">
              {{ filteredMatches.length }}
              <template v-if="profileData && filteredMatches.length !== profileData.matches.length">
                of {{ profileData.matches.length }}
              </template>
              matches
            </span>
          </div>

          <!-- Controls: Hero Filter, Outcome Filter & Match Limit -->
          <div class="matches-filter-bar">
            <div class="filter-group">
              <label>Filter Hero:</label>
              <input v-model="heroFilter"
                     type="text"
                     class="filter-hero-input"
                     placeholder="Search hero..." />
            </div>

            <div class="filter-group">
              <label>Result:</label>
              <div class="outcome-toggle-btns">
                <button class="toggle-btn"
                        :class="{ active: outcomeFilter === 'all' }"
                        @click="outcomeFilter = 'all'">
                  All
                </button>
                <button class="toggle-btn toggle-win"
                        :class="{ active: outcomeFilter === 'win' }"
                        @click="outcomeFilter = 'win'">
                  Victory
                </button>
                <button class="toggle-btn toggle-loss"
                        :class="{ active: outcomeFilter === 'loss' }"
                        @click="outcomeFilter = 'loss'">
                  Defeat
                </button>
              </div>
            </div>

            <div class="filter-group">
              <label>Matches:</label>
              <select v-model="limitFilter" class="filter-limit-select">
                <option :value="0">All Matches</option>
                <option :value="5">Last 5 Matches</option>
                <option :value="10">Last 10 Matches</option>
                <option :value="20">Last 20 Matches</option>
                <option :value="30">Last 30 Matches</option>
                <option :value="50">Last 50 Matches</option>
                <option :value="100">Last 100 Matches</option>
                <option :value="250">Last 250 Matches</option>
                <option :value="-1">Custom Count...</option>
              </select>
              <input
                v-if="limitFilter === -1"
                v-model.number="customLimit"
                type="number"
                min="1"
                placeholder="# games"
                class="filter-custom-limit-input"
              />
            </div>
          </div>
        </div>

        <!-- Matches Table -->
        <div v-if="filteredMatches.length === 0"
             class="empty-matches">
          <p>No matches match the selected filters.</p>
        </div>

        <div v-else
             class="matches-cards-list">
          <div v-for="m in filteredMatches"
               :key="m.replay_id"
               class="player-match-row"
               :class="m.win ? 'row-victory' : 'row-defeat'"
               @click="navigateToMatch(m.replay_id)">
            <!-- Result Color Bar & Badge -->
            <div class="match-result-col">
              <span class="outcome-pill"
                    :class="m.win ? 'outcome-win' : 'outcome-loss'">
                {{ m.win ? 'VICTORY' : 'DEFEAT' }}
              </span>
              <span class="match-time-rel">{{ formatDateRelative(m.date) }}</span>
            </div>

            <!-- Map Column -->
            <div class="match-map-col">
              <img :src="getMapImageUrl(m.map)"
                   :alt="m.map"
                   class="map-thumb"
                   @error="hideBrokenImage" />
              <div class="map-meta">
                <span class="map-name">{{ m.map }}</span>
                <span class="map-duration">{{ formatDuration(m.length) }}</span>
              </div>
            </div>

            <!-- Hero Column -->
            <div class="match-hero-col">
              <img :src="getHeroImageUrl(m.hero)"
                   :alt="m.hero"
                   class="hero-thumb clickable-match-hero"
                   :title="activeHeroParam ? `Click to view all matches for ${resolveHeroName(m.hero)} across ALL players` : `View ${profileData.player.name}'s matches on ${resolveHeroName(m.hero)}`"
                   @click.stop="activeHeroParam ? navigateToHeroAllPlayers(m.hero) : navigateToPlayerSpecificHero(m.hero)"
                   @error="hideBrokenImage" />
              <div class="hero-name-col">
                <span class="hero-name clickable-match-hero"
                      :title="activeHeroParam ? `Click to view all matches for ${resolveHeroName(m.hero)} across ALL players` : `View ${profileData.player.name}'s matches on ${resolveHeroName(m.hero)}`"
                      @click.stop="activeHeroParam ? navigateToHeroAllPlayers(m.hero) : navigateToPlayerSpecificHero(m.hero)">
                  {{ resolveHeroName(m.hero) }}
                </span>
                <span v-if="m.battle_tag"
                      class="hero-match-btag"
                      :title="`Played as ${m.battle_tag}`">
                  {{ m.battle_tag }}
                </span>
              </div>
            </div>

            <!-- Talents Strip (7 Tiers with tooltips) -->
            <div class="match-talents-col"
                 @click.stop>
              <div class="talents-strip">
                <div v-for="(tKey, tIdx) in getMatchTalentList(m.talents)"
                     :key="tIdx"
                     class="talent-slot"
                     @mouseenter="showTalentTooltip($event, tKey, tIdx, m.hero)"
                     @mousemove="updateTooltipPosition($event)"
                     @mouseleave="hideTalentTooltip"
                     @click.stop="showTalentTooltip($event, tKey, tIdx, m.hero)">
                  <img v-if="tKey"
                       :src="getTalentImageUrl(tKey)"
                       :alt="formatTalentName(tKey)"
                       class="talent-icon-img"
                       @error="hideBrokenImage" />
                  <span v-else
                        class="talent-empty-tier">
                    {{ [1, 4, 7, 10, 13, 16, 20][tIdx] }}
                  </span>
                </div>
              </div>
            </div>

            <!-- KAD Stats Column -->
            <div class="match-kda-col">
              <span class="kda-values">
                {{ m.solo_kills }} / {{ m.assists }} / <span class="death-num">{{ m.deaths }}</span>
              </span>
              <span class="kda-ratio">{{ m.kda.toFixed(1) }} KAD</span>
            </div>

            <!-- Combat Numbers Column -->
            <div class="match-stats-col">
              <div class="stat-item"
                   title="Hero Damage">
                <span class="stat-label">Hero</span>
                <span class="stat-val dmg-hero">{{ formatNumber(m.hero_damage) }}</span>
              </div>
              <div class="stat-item"
                   title="Siege Damage">
                <span class="stat-label">Siege</span>
                <span class="stat-val dmg-siege">{{ formatNumber(m.siege_damage) }}</span>
              </div>
              <div class="stat-item"
                   title="Healing / Shielding">
                <span class="stat-label">Heal</span>
                <span class="stat-val dmg-heal">{{ formatNumber(m.healing + m.self_healing) }}</span>
              </div>
              <div class="stat-item"
                   title="Damage Taken">
                <span class="stat-label">Taken</span>
                <span class="stat-val dmg-taken">{{ formatNumber(m.damage_taken) }}</span>
              </div>
            </div>

            <!-- Action Button -->
            <div class="match-action-col">
              <button class="btn btn-view-match"
                      @click.stop="navigateToMatch(m.replay_id)">
                Details →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Floating Talent Tooltip Teleport -->
    <Teleport to="body">
      <div v-if="activeTooltip.visible"
           class="hots-talent-tooltip"
           :style="tooltipStyle">
        <div class="tooltip-inner"
             :class="{ 'heroic-tier': [10, 20].includes([1, 4, 7, 10, 13, 16, 20][activeTooltip.tierIndex]) }">
          <div class="tooltip-header">
            <div class="tooltip-icon-wrap">
              <img v-if="activeTooltip.talentKey"
                   :src="getTalentImageUrl(activeTooltip.talentKey)"
                   :alt="formatTalentName(activeTooltip.talentKey)"
                   class="tooltip-talent-img"
                   @error="hideBrokenImage" />
              <span v-else
                    class="tooltip-empty-lvl">
                {{ [1, 4, 7, 10, 13, 16, 20][activeTooltip.tierIndex] }}
              </span>
            </div>
            <div class="tooltip-header-info">
              <div class="tooltip-badges-row">
                <span class="tooltip-lvl-badge">
                  Level {{ [1, 4, 7, 10, 13, 16, 20][activeTooltip.tierIndex] }}
                </span>
                <span v-if="getTalentInfo(activeTooltip.talentKey)?.type"
                      class="tooltip-type-badge"
                      :class="getTypeBadgeClass(getTalentInfo(activeTooltip.talentKey)?.type)">
                  {{ getTalentInfo(activeTooltip.talentKey)?.type }}
                </span>
              </div>
              <h4 class="tooltip-title">
                {{ formatTalentName(activeTooltip.talentKey) }}
              </h4>
            </div>
          </div>

          <div class="tooltip-body">
            <div v-if="getTalentInfo(activeTooltip.talentKey)?.description"
                 class="tooltip-desc"
                 v-html="formatTalentDescriptionHtml(getTalentInfo(activeTooltip.talentKey)?.description)"></div>
            <div v-else-if="activeTooltip.talentKey"
                 class="tooltip-desc fallback-desc">
              {{ formatTalentName(activeTooltip.talentKey) }}
            </div>
            <div v-else
                 class="tooltip-desc empty-desc">
              Level {{ [1, 4, 7, 10, 13, 16, 20][activeTooltip.tierIndex] }} talent was not reached or selected in this
              match.
            </div>
          </div>

          <div class="tooltip-footer">
            <span class="tooltip-footer-tier">Tier {{ activeTooltip.tierIndex + 1 }}</span>
            <span v-if="activeTooltip.heroName"
                  class="tooltip-footer-hero">
              {{ resolveHeroName(activeTooltip.heroName) }}
            </span>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.player-profile-view {
  padding: 1.5rem 0 3rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* Nav & Search Bar */
.profile-nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.btn-back {
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-main);
  padding: 0.5rem 1rem;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s ease;
}

.btn-back:hover {
  background: var(--bg-surface-hover);
  border-color: var(--border-focus);
}

.player-search-box {
  position: relative;
  display: flex;
  align-items: center;
  width: 340px;
  max-width: 100%;
}

.search-icon {
  position: absolute;
  left: 0.75rem;
  font-size: 0.9rem;
  opacity: 0.6;
  pointer-events: none;
}

.player-search-input {
  width: 100%;
  padding: 0.55rem 0.75rem 0.55rem 2.2rem;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: #fff;
  font-size: 0.85rem;
  outline: none;
  transition: all 0.2s ease;
}

.player-search-input:focus {
  border-color: var(--accent-cyan);
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
}

.player-search-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: #111827;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  z-index: 1000;
  max-height: 260px;
  overflow-y: auto;
}

.search-result-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.85rem;
  cursor: pointer;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  transition: background 0.15s ease;
}

.search-result-item:hover {
  background: rgba(56, 189, 248, 0.12);
}

.result-tag {
  color: #fff;
  font-family: var(--font-mono);
  font-size: 0.85rem;
}

.result-badge {
  font-size: 0.68rem;
  padding: 0.1rem 0.4rem;
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
  border-radius: 4px;
}

/* Header Card */
.profile-header-card {
  padding: 1.75rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.85));
  border: 1px solid var(--border-subtle);
}

.profile-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2rem;
  flex-wrap: wrap;
}

.profile-identity {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.player-avatar-circle {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: linear-gradient(135deg, #0284c7, #38bdf8);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.75rem;
  font-weight: 800;
  color: #fff;
  box-shadow: 0 4px 14px rgba(2, 132, 199, 0.4);
}

.player-identity-info {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.player-display-name {
  margin: 0;
  font-size: 1.85rem;
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.02em;
}

.player-bnet-tag {
  font-size: 1.15rem;
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-weight: 500;
  margin-left: 0.25rem;
}

.player-role-badge {
  display: inline-block;
  margin-left: 0.6rem;
  padding: 0.15rem 0.55rem;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: var(--radius-sm);
  vertical-align: middle;
}

.linked-accounts-wrap {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.linked-label {
  font-size: 0.75rem;
  color: var(--text-dim);
}

.linked-tag-badge {
  font-size: 0.72rem;
  font-family: var(--font-mono);
  padding: 0.1rem 0.45rem;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-sub);
}

.linked-tag-badge.active {
  background: rgba(56, 189, 248, 0.18);
  color: var(--accent-cyan);
  border: 1px solid rgba(56, 189, 248, 0.35);
}

/* Stat Pills */
.profile-stat-pills {
  display: flex;
  gap: 0.85rem;
  flex-wrap: wrap;
}

.stat-pill-card {
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-md);
  padding: 0.65rem 1.1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 105px;
}

.stat-pill-label {
  font-size: 0.72rem;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}

.stat-pill-val {
  font-size: 1.4rem;
  font-weight: 800;
  color: #fff;
  line-height: 1.2;
}

.val-good {
  color: #34d399;
}

.val-dim {
  color: #f87171;
}

.val-kda {
  color: #38bdf8;
}

.val-mmr {
  color: var(--accent-gold);
}

.mmr-pill {
  border-color: rgba(251, 191, 36, 0.28);
  background: rgba(251, 191, 36, 0.05);
}

.mmr-adj-badge {
  color: var(--accent-cyan);
  margin-left: 0.2rem;
  font-weight: 600;
}

.stat-pill-sub {
  font-size: 0.72rem;
  color: var(--text-dim);
}

.kad-breakdown {
  font-family: var(--font-mono);
  font-weight: 600;
}

.stat-k-text {
  color: #f1f5f9;
}

.stat-a-text {
  color: #94a3b8;
}

.stat-slash {
  color: rgba(255, 255, 255, 0.3);
  margin: 0 0.1rem;
}

.stat-deaths-text {
  color: #f87171;
  font-weight: 600;
}

.stat-pill-separator {
  opacity: 0.4;
  margin: 0 0.25rem;
}

/* Hero Strips Wrapper */
.hero-strips-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 1rem;
}

.top-heroes-section {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  flex-wrap: wrap;
}

.top-heroes-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-dim);
  min-width: 170px;
}

.winrate-heroes-section {
  border-top: 1px dashed rgba(255, 255, 255, 0.06);
  margin-top: 0;
  padding-top: 0.75rem;
}

.top-heroes-chips {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.top-hero-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-full);
  padding: 0.2rem 0.65rem 0.2rem 0.25rem;
  font-size: 0.8rem;
}

.top-hero-avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  object-fit: cover;
}

.top-hero-name {
  color: #fff;
  font-weight: 600;
}

.top-hero-games {
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: 0.75rem;
}

.top-hero-wr {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.75rem;
}

.wr-positive {
  color: #34d399;
}

.wr-negative {
  color: #f87171;
}

/* Matches Section */
.profile-matches-section {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.matches-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.section-title-wrap {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.section-title-wrap h2 {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
  color: #fff;
}

.count-badge {
  font-size: 0.75rem;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-dim);
  padding: 0.15rem 0.5rem;
  border-radius: var(--radius-full);
  font-family: var(--font-mono);
}

.matches-filter-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: var(--text-dim);
}

.filter-hero-input {
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: #fff;
  padding: 0.35rem 0.65rem;
  font-size: 0.8rem;
  outline: none;
}

.filter-hero-input:focus {
  border-color: var(--accent-cyan);
}

.filter-limit-select,
.filter-custom-limit-input {
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: #fff;
  padding: 0.35rem 0.65rem;
  font-size: 0.8rem;
  outline: none;
  cursor: pointer;
}

.filter-limit-select:focus,
.filter-custom-limit-input:focus {
  border-color: var(--accent-cyan);
}

.filter-custom-limit-input {
  width: 80px;
  cursor: text;
}

.outcome-toggle-btns {
  display: flex;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--border-subtle);
}

.toggle-btn {
  background: var(--bg-surface-elevated);
  border: none;
  color: var(--text-dim);
  padding: 0.35rem 0.75rem;
  font-size: 0.78rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.toggle-btn.active {
  background: #334155;
  color: #fff;
  font-weight: 600;
}

.toggle-btn.toggle-win.active {
  background: rgba(16, 185, 129, 0.25);
  color: #34d399;
}

.toggle-btn.toggle-loss.active {
  background: rgba(244, 63, 94, 0.25);
  color: #fb7185;
}

/* Matches Cards List */
.matches-cards-list {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.player-match-row {
  display: grid;
  grid-template-columns: 110px 170px 145px 180px 110px 1fr auto;
  align-items: center;
  gap: 1rem;
  background: rgba(15, 23, 42, 0.7);
  border-radius: var(--radius-md);
  padding: 0.85rem 1.15rem;
  border-left: 4px solid #64748b;
  cursor: pointer;
  transition: all 0.15s ease;
}

.player-match-row:hover {
  background: rgba(30, 41, 59, 0.8);
  transform: translateX(2px);
}

.player-match-row.row-victory {
  border-left-color: #10b981;
}

.player-match-row.row-defeat {
  border-left-color: #ef4444;
}

/* Result Col */
.match-result-col {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.outcome-pill {
  font-size: 0.72rem;
  font-weight: 800;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  text-align: center;
  letter-spacing: 0.05em;
  display: inline-block;
  width: fit-content;
}

.outcome-win {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.outcome-loss {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.match-time-rel {
  font-size: 0.7rem;
  color: var(--text-dim);
}

/* Map Col */
.match-map-col {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.map-thumb {
  width: 42px;
  height: 28px;
  border-radius: 4px;
  object-fit: cover;
  flex-shrink: 0;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.map-meta {
  display: flex;
  flex-direction: column;
}

.map-name {
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.map-duration {
  font-size: 0.72rem;
  color: var(--text-dim);
  font-family: var(--font-mono);
}

/* Hero Col */
.match-hero-col {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.hero-thumb {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid rgba(255, 255, 255, 0.15);
  flex-shrink: 0;
}

.hero-name-col {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  min-width: 0;
}

.hero-name {
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
}

.hero-match-btag {
  font-size: 0.7rem;
  color: var(--text-dim);
  font-family: var(--font-mono);
  white-space: nowrap;
  letter-spacing: -0.01em;
  opacity: 0.85;
}

/* Talents Strip */
.match-talents-col {
  display: flex;
  align-items: center;
}

.talents-strip {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.talent-slot {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.1s ease;
}

.talent-slot:hover {
  transform: scale(1.15);
  border-color: var(--accent-cyan);
  z-index: 5;
}

.talent-icon-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.talent-empty-tier {
  font-size: 0.55rem;
  font-family: var(--font-mono);
  color: rgba(255, 255, 255, 0.25);
}

/* KDA Col */
.match-kda-col {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.kda-values {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: #fff;
  font-weight: 600;
}

.death-num {
  color: #f87171;
}

.kda-ratio {
  font-size: 0.72rem;
  color: var(--accent-cyan);
  font-family: var(--font-mono);
}

/* Stats Numbers Col */
.match-stats-col {
  display: flex;
  gap: 1.15rem;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.stat-label {
  font-size: 0.65rem;
  text-transform: uppercase;
  color: var(--text-dim);
  font-weight: 600;
}

.stat-val {
  font-size: 0.8rem;
  font-family: var(--font-mono);
  font-weight: 600;
}

.dmg-hero {
  color: #f87171;
}

.dmg-siege {
  color: #fbbf24;
}

.dmg-heal {
  color: #34d399;
}

.dmg-taken {
  color: #a78bfa;
}

/* Action Col */
.btn-view-match {
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.25);
  color: var(--accent-cyan);
  font-size: 0.78rem;
  padding: 0.4rem 0.75rem;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.btn-view-match:hover {
  background: var(--accent-cyan);
  color: #0b1120;
}

.hero-mode-card {
  border-color: rgba(56, 189, 248, 0.35);
  box-shadow: 0 4px 24px rgba(56, 189, 248, 0.08);
}

.hero-mode-nav {
  margin-bottom: 1.25rem;
}

.btn-back-all-heroes {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--primary-accent);
  padding: 0.4rem 0.85rem;
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-back-all-heroes:hover {
  background: var(--bg-hover);
  border-color: var(--primary-accent);
}

.hero-portrait-circle {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid var(--primary-accent);
  box-shadow: 0 0 16px rgba(56, 189, 248, 0.35);
  flex-shrink: 0;
  background: #111827;
  position: relative;
}

.clickable-hero-portrait {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.clickable-hero-portrait:hover {
  transform: scale(1.06);
  box-shadow: 0 0 24px rgba(56, 189, 248, 0.6);
  border-color: #38bdf8;
}

.hero-portrait-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hero-portrait-badge {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(15, 23, 42, 0.9);
  color: var(--primary-accent);
  font-size: 0.6rem;
  font-weight: 700;
  text-align: center;
  padding: 0.1rem 0;
}

.hero-specific-sub {
  margin: 0.35rem 0 0 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.hero-global-link {
  color: var(--primary-accent);
  font-weight: 600;
  cursor: pointer;
  margin-left: 0.4rem;
  text-decoration: underline;
}

.hero-global-link:hover {
  color: #fff;
}

.clickable-top-hero-chip {
  cursor: pointer;
  transition: all 0.2s;
}

.clickable-top-hero-chip:hover {
  background: var(--bg-hover);
  border-color: var(--primary-accent);
  transform: translateY(-2px);
}

.clickable-match-hero {
  cursor: pointer;
  transition: color 0.15s, transform 0.15s;
}

.clickable-match-hero:hover {
  color: var(--primary-accent);
  transform: scale(1.05);
}

/* Responsive */
@media (max-width: 1080px) {
  .player-match-row {
    grid-template-columns: 100px 140px 120px 1fr auto;
  }

  .match-stats-col {
    display: none;
  }
}

@media (max-width: 768px) {
  .player-match-row {
    grid-template-columns: 1fr;
    gap: 0.6rem;
  }

  .profile-header-top {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
