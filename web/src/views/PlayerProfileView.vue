<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  PlayerProfileData,
  PlayerProfileMatch,
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

function showTalentTooltip(event: MouseEvent, talentKey: string | undefined, tierIndex: number, heroName: string) {
  activeTooltip.value = {
    visible: true,
    talentKey,
    tierIndex,
    heroName,
    x: event.clientX,
    y: event.clientY,
  }
}

function updateTooltipPosition(event: MouseEvent) {
  activeTooltip.value.x = event.clientX
  activeTooltip.value.y = event.clientY
}

function hideTalentTooltip() {
  activeTooltip.value.visible = false
}

const tooltipStyle = computed(() => {
  const padding = 16
  const tooltipWidth = 330
  const tooltipHeight = 220
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 1080

  let left = activeTooltip.value.x + 16
  let top = activeTooltip.value.y + 16

  if (left + tooltipWidth > viewportWidth - padding) {
    left = Math.max(padding, activeTooltip.value.x - tooltipWidth - 16)
  }

  if (top + tooltipHeight > viewportHeight - padding) {
    top = Math.max(padding, viewportHeight - tooltipHeight - padding)
  }

  return {
    left: `${left}px`,
    top: `${top}px`,
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

async function fetchPlayerProfile(identifier: string) {
  loading.value = true
  error.value = null

  try {
    const res = await fetch(`/api/player/${encodeURIComponent(identifier)}`)
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

const playerHeroStats = computed(() => {
  if (!profileData.value || !activeHeroParam.value) return null
  const target = activeHeroParam.value.toLowerCase().replace(/[^a-z0-9]/g, '')
  const matches = profileData.value.matches.filter(m => {
    const raw = m.hero.toLowerCase().replace(/[^a-z0-9]/g, '')
    const resolved = resolveHeroName(m.hero).toLowerCase().replace(/[^a-z0-9]/g, '')
    return raw === target || resolved === target
  })

  const total = matches.length
  const wins = matches.filter(m => m.win).length
  const losses = total - wins
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

  return {
    hero: matches[0]?.hero || activeHeroParam.value,
    total,
    wins,
    losses,
    winRatePct,
    kda,
    avgHeroDamage,
    avgSiegeDamage,
    avgHealing,
    avgDamageTaken,
  }
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

  return list
})

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
  () => route.params.identifier,
  newId => {
    if (typeof newId === 'string') {
      fetchPlayerProfile(newId)
    }
  },
  { immediate: true }
)

onMounted(() => {
  const currentId = route.params.identifier
  if (typeof currentId === 'string' && !profileData.value) {
    fetchPlayerProfile(currentId)
  }
})
</script>

<template>
  <div class="player-profile-view container">
    <!-- Back to Matches / Search Bar Row -->
    <div class="profile-nav-bar">
      <button class="btn btn-back" @click="router.push('/matches')">
        ← Back to Matches
      </button>

      <!-- Player Search Input with Dropdown -->
      <div class="player-search-box">
        <span class="search-icon">🔍</span>
        <input
          v-model="searchQuery"
          type="text"
          class="player-search-input"
          placeholder="Lookup player by name or BattleTag..."
          @input="onSearchInput"
          @focus="searchResults.length > 0 ? (showSearchDropdown = true) : null"
          @blur="handleSearchBlur"
        />
        <div v-if="showSearchDropdown && searchResults.length > 0" class="player-search-dropdown">
          <div
            v-for="item in searchResults"
            :key="item.rowId"
            class="search-result-item"
            @mousedown.prevent="selectPlayer(item)"
          >
            <span class="result-tag">{{ item.battleTag }}</span>
            <span v-if="item.isPrimary" class="result-badge">Primary</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="card loading-card">
      <div class="spinner"></div>
      <p>Retrieving match history from the Nexus...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="card error-card">
      <span class="error-icon">⚠️</span>
      <h2>Player Not Found</h2>
      <p>{{ error }}</p>
      <button class="btn btn-primary" @click="router.push('/matches')">
        Return to Matches
      </button>
    </div>

    <!-- Loaded Player Profile -->
    <div v-else-if="profileData" class="profile-content">
      <!-- Player Specific Hero Header Card -->
      <div v-if="activeHeroParam && playerHeroStats" class="profile-header-card card hero-mode-card">
        <div class="hero-mode-nav">
          <button class="btn btn-back-all-heroes" @click="navigateToPlayerAllHeroes">
            ← View All Heroes for {{ profileData.player.name }}
          </button>
        </div>

        <div class="profile-header-top">
          <div class="profile-identity">
            <div
              class="hero-portrait-circle clickable-hero-portrait"
              :title="`Click to view all matches for ${resolveHeroName(playerHeroStats.hero)} across ALL players`"
              @click="navigateToHeroAllPlayers(playerHeroStats.hero)"
            >
              <img
                :src="getHeroImageUrl(playerHeroStats.hero)"
                :alt="playerHeroStats.hero"
                class="hero-portrait-img"
                @error="hideBrokenImage"
              />
              <span class="hero-portrait-badge">View All Players ↗</span>
            </div>
            <div class="player-identity-info">
              <h1 class="player-display-name">
                {{ profileData.player.name }}'s {{ resolveHeroName(playerHeroStats.hero) }}
              </h1>
              <p class="hero-specific-sub">
                Performance on {{ resolveHeroName(playerHeroStats.hero) }}.
                <a class="hero-global-link" @click="navigateToHeroAllPlayers(playerHeroStats.hero)">
                  Click portrait to view all players on {{ resolveHeroName(playerHeroStats.hero) }} →
                </a>
              </p>
            </div>
          </div>

          <!-- Key Stats Badges for this hero -->
          <div class="profile-stat-pills">
            <div class="stat-pill-card">
              <span class="stat-pill-label">Hero Win Rate</span>
              <span
                class="stat-pill-val"
                :class="playerHeroStats.winRatePct >= 50 ? 'val-good' : 'val-dim'"
              >
                {{ playerHeroStats.winRatePct }}%
              </span>
              <span class="stat-pill-sub">
                {{ playerHeroStats.wins }}W - {{ playerHeroStats.losses }}L
              </span>
            </div>

            <div class="stat-pill-card">
              <span class="stat-pill-label">Hero KDA</span>
              <span class="stat-pill-val val-kda">{{ playerHeroStats.kda.toFixed(2) }}</span>
              <span class="stat-pill-sub">{{ playerHeroStats.total }} Games</span>
            </div>

            <div class="stat-pill-card">
              <span class="stat-pill-label">Avg Hero Dmg</span>
              <span class="stat-pill-val">{{ formatNumber(playerHeroStats.avgHeroDamage) }}</span>
              <span class="stat-pill-sub">Per Match</span>
            </div>

            <div class="stat-pill-card">
              <span class="stat-pill-label">Avg Heal / Dmg Taken</span>
              <span class="stat-pill-val">
                {{ formatNumber(playerHeroStats.avgHealing || playerHeroStats.avgDamageTaken) }}
              </span>
              <span class="stat-pill-sub">
                {{ playerHeroStats.avgHealing ? 'Heal/Shield' : 'Dmg Taken' }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- General Player Header Card (When not viewing a single hero) -->
      <div v-else class="profile-header-card card">
        <div class="profile-header-top">
          <div class="profile-identity">
            <div class="player-avatar-circle">
              <span>{{ profileData.player.name.charAt(0).toUpperCase() }}</span>
            </div>
            <div class="player-identity-info">
              <h1 class="player-display-name">
                {{ profileData.player.name }}
                <span v-if="profileData.player.tag" class="player-bnet-tag">#{{ profileData.player.tag }}</span>
              </h1>
              <div v-if="profileData.player.allTags.length > 1" class="linked-accounts-wrap">
                <span class="linked-label">Linked Accounts:</span>
                <span
                  v-for="tag in profileData.player.allTags"
                  :key="tag"
                  class="linked-tag-badge"
                  :class="{ active: tag === profileData.player.battleTag }"
                >
                  {{ tag }}
                </span>
              </div>
            </div>
          </div>

          <!-- Key Stats Badges -->
          <div class="profile-stat-pills">
            <div class="stat-pill-card">
              <span class="stat-pill-label">Win Rate</span>
              <span
                class="stat-pill-val"
                :class="profileData.player.winRatePct >= 50 ? 'val-good' : 'val-dim'"
              >
                {{ profileData.player.winRatePct }}%
              </span>
              <span class="stat-pill-sub">
                {{ profileData.player.wins }}W - {{ profileData.player.losses }}L
              </span>
            </div>

            <div class="stat-pill-card">
              <span class="stat-pill-label">Overall KDA</span>
              <span class="stat-pill-val val-kda">{{ profileData.player.overallKda.toFixed(2) }}</span>
              <span class="stat-pill-sub">{{ profileData.player.totalMatches }} Games</span>
            </div>

            <div class="stat-pill-card">
              <span class="stat-pill-label">Avg Hero Dmg</span>
              <span class="stat-pill-val">{{ formatNumber(profileData.player.avgHeroDamage) }}</span>
              <span class="stat-pill-sub">Per Match</span>
            </div>

            <div class="stat-pill-card">
              <span class="stat-pill-label">Avg Heal / Dmg Taken</span>
              <span class="stat-pill-val">
                {{ formatNumber(profileData.player.avgHealing || profileData.player.avgDamageTaken) }}
              </span>
              <span class="stat-pill-sub">
                {{ profileData.player.avgHealing ? 'Heal/Shield' : 'Dmg Taken' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Top Heroes Strip -->
        <div v-if="profileData.player.topHeroes.length > 0" class="top-heroes-section">
          <span class="top-heroes-label">Most Played Heroes:</span>
          <div class="top-heroes-chips">
            <div
              v-for="th in profileData.player.topHeroes"
              :key="th.hero"
              class="top-hero-chip clickable-top-hero-chip"
              :title="`View ${profileData.player.name}'s matches on ${resolveHeroName(th.hero)}`"
              @click="navigateToPlayerSpecificHero(th.hero)"
            >
              <img
                :src="getHeroImageUrl(th.hero)"
                :alt="th.hero"
                class="top-hero-avatar"
                @error="hideBrokenImage"
              />
              <span class="top-hero-name">{{ resolveHeroName(th.hero) }}</span>
              <span class="top-hero-games">{{ th.games }}g</span>
              <span
                class="top-hero-wr"
                :class="th.winRatePct >= 50 ? 'wr-positive' : 'wr-negative'"
              >
                {{ th.winRatePct }}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Match History List Section -->
      <div class="profile-matches-section card">
        <div class="matches-section-header">
          <div class="section-title-wrap">
            <h2>
              {{ activeHeroParam && playerHeroStats ? `${profileData.player.name}'s ${resolveHeroName(playerHeroStats.hero)} Matches` : 'Match History' }}
            </h2>
            <span class="count-badge">{{ filteredMatches.length }} matches</span>
          </div>

          <!-- Controls: Hero Filter & Outcome Filter -->
          <div class="matches-filter-bar">
            <div class="filter-group">
              <label>Filter Hero:</label>
              <input
                v-model="heroFilter"
                type="text"
                class="filter-hero-input"
                placeholder="Search hero..."
              />
            </div>

            <div class="filter-group">
              <label>Result:</label>
              <div class="outcome-toggle-btns">
                <button
                  class="toggle-btn"
                  :class="{ active: outcomeFilter === 'all' }"
                  @click="outcomeFilter = 'all'"
                >
                  All
                </button>
                <button
                  class="toggle-btn toggle-win"
                  :class="{ active: outcomeFilter === 'win' }"
                  @click="outcomeFilter = 'win'"
                >
                  Victory
                </button>
                <button
                  class="toggle-btn toggle-loss"
                  :class="{ active: outcomeFilter === 'loss' }"
                  @click="outcomeFilter = 'loss'"
                >
                  Defeat
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Matches Table -->
        <div v-if="filteredMatches.length === 0" class="empty-matches">
          <p>No matches match the selected filters.</p>
        </div>

        <div v-else class="matches-cards-list">
          <div
            v-for="m in filteredMatches"
            :key="m.replay_id"
            class="player-match-row"
            :class="m.win ? 'row-victory' : 'row-defeat'"
            @click="navigateToMatch(m.replay_id)"
          >
            <!-- Result Color Bar & Badge -->
            <div class="match-result-col">
              <span class="outcome-pill" :class="m.win ? 'outcome-win' : 'outcome-loss'">
                {{ m.win ? 'VICTORY' : 'DEFEAT' }}
              </span>
              <span class="match-time-rel">{{ formatDateRelative(m.date) }}</span>
            </div>

            <!-- Map Column -->
            <div class="match-map-col">
              <img
                :src="getMapImageUrl(m.map)"
                :alt="m.map"
                class="map-thumb"
                @error="hideBrokenImage"
              />
              <div class="map-meta">
                <span class="map-name">{{ m.map }}</span>
                <span class="map-duration">{{ formatDuration(m.length) }}</span>
              </div>
            </div>

            <!-- Hero Column -->
            <div class="match-hero-col">
              <img
                :src="getHeroImageUrl(m.hero)"
                :alt="m.hero"
                class="hero-thumb clickable-match-hero"
                :title="activeHeroParam ? `Click to view all matches for ${resolveHeroName(m.hero)} across ALL players` : `View ${profileData.player.name}'s matches on ${resolveHeroName(m.hero)}`"
                @click.stop="activeHeroParam ? navigateToHeroAllPlayers(m.hero) : navigateToPlayerSpecificHero(m.hero)"
                @error="hideBrokenImage"
              />
              <div class="hero-name-col">
                <span
                  class="hero-name clickable-match-hero"
                  :title="activeHeroParam ? `Click to view all matches for ${resolveHeroName(m.hero)} across ALL players` : `View ${profileData.player.name}'s matches on ${resolveHeroName(m.hero)}`"
                  @click.stop="activeHeroParam ? navigateToHeroAllPlayers(m.hero) : navigateToPlayerSpecificHero(m.hero)"
                >
                  {{ resolveHeroName(m.hero) }}
                </span>
                <span v-if="m.battle_tag" class="hero-match-btag" :title="`Played as ${m.battle_tag}`">
                  {{ m.battle_tag }}
                </span>
              </div>
            </div>

            <!-- Talents Strip (7 Tiers with tooltips) -->
            <div class="match-talents-col" @click.stop>
              <div class="talents-strip">
                <div
                  v-for="(tKey, tIdx) in getMatchTalentList(m.talents)"
                  :key="tIdx"
                  class="talent-slot"
                  @mouseenter="showTalentTooltip($event, tKey, tIdx, m.hero)"
                  @mousemove="updateTooltipPosition($event)"
                  @mouseleave="hideTalentTooltip"
                >
                  <img
                    v-if="tKey"
                    :src="getTalentImageUrl(tKey)"
                    :alt="formatTalentName(tKey)"
                    class="talent-icon-img"
                    @error="hideBrokenImage"
                  />
                  <span v-else class="talent-empty-tier">
                    {{ [1, 4, 7, 10, 13, 16, 20][tIdx] }}
                  </span>
                </div>
              </div>
            </div>

            <!-- KDA Stats Column -->
            <div class="match-kda-col">
              <span class="kda-values">
                {{ m.solo_kills }} / {{ m.assists }} / <span class="death-num">{{ m.deaths }}</span>
              </span>
              <span class="kda-ratio">{{ m.kda.toFixed(1) }} KDA</span>
            </div>

            <!-- Combat Numbers Column -->
            <div class="match-stats-col">
              <div class="stat-item" title="Hero Damage">
                <span class="stat-label">Hero</span>
                <span class="stat-val dmg-hero">{{ formatNumber(m.hero_damage) }}</span>
              </div>
              <div class="stat-item" title="Siege Damage">
                <span class="stat-label">Siege</span>
                <span class="stat-val dmg-siege">{{ formatNumber(m.siege_damage) }}</span>
              </div>
              <div class="stat-item" title="Healing / Shielding">
                <span class="stat-label">Heal</span>
                <span class="stat-val dmg-heal">{{ formatNumber(m.healing + m.self_healing) }}</span>
              </div>
              <div class="stat-item" title="Damage Taken">
                <span class="stat-label">Taken</span>
                <span class="stat-val dmg-taken">{{ formatNumber(m.damage_taken) }}</span>
              </div>
            </div>

            <!-- Action Button -->
            <div class="match-action-col">
              <button class="btn btn-view-match" @click.stop="navigateToMatch(m.replay_id)">
                Details →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Floating Talent Tooltip Teleport -->
    <Teleport to="body">
      <div
        v-if="activeTooltip.visible"
        class="hots-talent-tooltip"
        :style="tooltipStyle"
      >
        <div
          class="tooltip-inner"
          :class="{ 'heroic-tier': [10, 20].includes([1, 4, 7, 10, 13, 16, 20][activeTooltip.tierIndex]) }"
        >
          <div class="tooltip-header">
            <div class="tooltip-icon-wrap">
              <img
                v-if="activeTooltip.talentKey"
                :src="getTalentImageUrl(activeTooltip.talentKey)"
                :alt="formatTalentName(activeTooltip.talentKey)"
                class="tooltip-talent-img"
                @error="hideBrokenImage"
              />
              <span v-else class="tooltip-empty-lvl">
                {{ [1, 4, 7, 10, 13, 16, 20][activeTooltip.tierIndex] }}
              </span>
            </div>
            <div class="tooltip-header-info">
              <div class="tooltip-badges-row">
                <span class="tooltip-lvl-badge">
                  Level {{ [1, 4, 7, 10, 13, 16, 20][activeTooltip.tierIndex] }}
                </span>
                <span
                  v-if="getTalentInfo(activeTooltip.talentKey)?.type"
                  class="tooltip-type-badge"
                  :class="getTypeBadgeClass(getTalentInfo(activeTooltip.talentKey)?.type)"
                >
                  {{ getTalentInfo(activeTooltip.talentKey)?.type }}
                </span>
              </div>
              <h4 class="tooltip-title">
                {{ formatTalentName(activeTooltip.talentKey) }}
              </h4>
            </div>
          </div>

          <div class="tooltip-body">
            <div
              v-if="getTalentInfo(activeTooltip.talentKey)?.description"
              class="tooltip-desc"
              v-html="formatTalentDescriptionHtml(getTalentInfo(activeTooltip.talentKey)?.description)"
            ></div>
            <div v-else-if="activeTooltip.talentKey" class="tooltip-desc fallback-desc">
              {{ formatTalentName(activeTooltip.talentKey) }}
            </div>
            <div v-else class="tooltip-desc empty-desc">
              Level {{ [1, 4, 7, 10, 13, 16, 20][activeTooltip.tierIndex] }} talent was not reached or selected in this match.
            </div>
          </div>

          <div class="tooltip-footer">
            <span class="tooltip-footer-tier">Tier {{ activeTooltip.tierIndex + 1 }}</span>
            <span v-if="activeTooltip.heroName" class="tooltip-footer-hero">
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

.stat-pill-sub {
  font-size: 0.72rem;
  color: var(--text-dim);
}

/* Top Heroes Strip */
.top-heroes-section {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 1rem;
  flex-wrap: wrap;
}

.top-heroes-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-dim);
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

