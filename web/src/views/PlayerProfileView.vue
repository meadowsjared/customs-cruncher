<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MmrTrendGraph from '../components/MmrTrendGraph.vue'
import RoleBadge from '../components/RoleBadge.vue'
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
  getTierTalents,
  isTalentPicked,
  getTalentBuildCodeFromTalents,
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

// Page size constant (easily changeable)
const PAGE_SIZE = 15

// Pagination state
const page = ref(1)
const total = ref(0)
const totalPages = ref(1)
const matches = ref<PlayerProfileMatch[]>([])
const matchesLoading = ref(false)
const jumpPageInput = ref('')

// Filters for matches list and summary
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

// Expanded Talent Tier Options Modal State
interface ExpandedTierState {
  visible: boolean
  heroName: string
  tierIndex: number
  pickedTalentKey?: string
  match?: PlayerProfileMatch
}

const expandedTier = ref<ExpandedTierState>({
  visible: false,
  heroName: '',
  tierIndex: 0,
})

const copiedMatchId = ref<number | null>(null)
let copyTimeout: ReturnType<typeof setTimeout> | null = null

// MMR Trend Popover State
const showMmrTrend = ref(false)
const heroMmrPillRef = ref<HTMLElement | null>(null)
const generalMmrPillRef = ref<HTMLElement | null>(null)
let mmrTrendTimer: ReturnType<typeof setTimeout> | null = null

function onMmrMouseEnter() {
  if (mmrTrendTimer) {
    clearTimeout(mmrTrendTimer)
    mmrTrendTimer = null
  }
  showMmrTrend.value = true
}

function onMmrMouseLeave() {
  if (mmrTrendTimer) clearTimeout(mmrTrendTimer)
  mmrTrendTimer = setTimeout(() => {
    showMmrTrend.value = false
  }, 220)
}

function cancelMmrTrendTimer() {
  if (mmrTrendTimer) {
    clearTimeout(mmrTrendTimer)
    mmrTrendTimer = null
  }
}

function toggleMmrTrend(event: MouseEvent) {
  event.stopPropagation()
  if (mmrTrendTimer) {
    clearTimeout(mmrTrendTimer)
    mmrTrendTimer = null
  }
  showMmrTrend.value = !showMmrTrend.value
}

function closeMmrTrend() {
  if (mmrTrendTimer) {
    clearTimeout(mmrTrendTimer)
    mmrTrendTimer = null
  }
  showMmrTrend.value = false
}

function openExpandedTier(talentKey: string | undefined, tierIndex: number = 0, match?: PlayerProfileMatch) {
  hideTalentTooltip()
  const hero = getTalentInfo(talentKey)?.hero || match?.hero || ''
  expandedTier.value = {
    visible: true,
    heroName: hero,
    tierIndex,
    pickedTalentKey: talentKey,
    match,
  }
}

function closeExpandedTier() {
  expandedTier.value.visible = false
}

function switchExpandedTier(newTierIndex: number) {
  if (!expandedTier.value.match) return
  const matchTalents = getMatchTalentList(expandedTier.value.match.talents)
  const newPickedKey = matchTalents[newTierIndex]
  expandedTier.value.tierIndex = newTierIndex
  expandedTier.value.pickedTalentKey = newPickedKey
}

async function copyMatchBuildCode(match: PlayerProfileMatch) {
  const talents = getMatchTalentList(match.talents)
  const code = getTalentBuildCodeFromTalents(match.hero, talents)
  if (!code) return
  try {
    await navigator.clipboard.writeText(code)
    copiedMatchId.value = match.replay_id
    if (copyTimeout) clearTimeout(copyTimeout)
    copyTimeout = setTimeout(() => {
      copiedMatchId.value = null
    }, 2000)
  } catch (err) {
    console.error('Failed to copy build code:', err)
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (expandedTier.value.visible) {
      closeExpandedTier()
    } else if (activeTooltip.value.visible) {
      hideTalentTooltip()
    }
  }
}

function showTalentTooltip(event: MouseEvent | TouchEvent, talentKey: string | undefined, tierIndex: number, heroName: string) {
  if (expandedTier.value.visible) return
  // On touchscreens/mobile devices without pointer hover, suppress the floating tooltip
  // so a single tap opens the full expanded talent build modal cleanly
  if (typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches) return

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
  if (!activeTooltip.value.visible || expandedTier.value.visible) return
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
  if (expandedTier.value.visible) {
    if (isDomElement(e.target) && e.target.closest('.expanded-talent-modal')) {
      return
    }
    closeExpandedTier()
    return
  }
  if (!activeTooltip.value.visible) return
  if (isDomElement(e.target) && e.target.closest('.talent-mini-slot, .talent-slot, .hots-talent-tooltip')) {
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

let lastFetchedId = ''
let lastFetchedHeroName = ''
let lastFetchedHeroFilter = ''
let lastFetchedOutcome = 'all'
let lastFetchedLimit = 0
let lastFetchedCustomLimit: number | null = null

async function fetchPlayerProfile(identifier: string, isPageOnly = false) {
  if (isPageOnly) {
    matchesLoading.value = true
  } else {
    loading.value = true
  }
  error.value = null

  try {
    const params = new URLSearchParams()
    params.set('page', String(page.value))
    params.set('limit', String(PAGE_SIZE))

    if (activeHeroParam.value) {
      params.set('hero', activeHeroParam.value)
    }
    if (outcomeFilter.value !== 'all') {
      params.set('outcome', outcomeFilter.value)
    }
    if (heroFilter.value.trim()) {
      params.set('heroSearch', heroFilter.value.trim())
    }
    if (effectiveLimit.value > 0) {
      params.set('scopeLimit', String(effectiveLimit.value))
    }

    const url = `/api/player/${encodeURIComponent(identifier)}?${params.toString()}`
    const res = await fetch(url)
    if (!res.ok) {
      if (res.status === 404) {
        error.value = `Player "${identifier}" not found in customs match records.`
      } else {
        error.value = `Failed to load player (Status ${res.status}).`
      }
      profileData.value = null
      matches.value = []
      total.value = 0
      totalPages.value = 1
      return
    }

    const data: PlayerProfileData = await res.json()
    profileData.value = data
    matches.value = data.matches
    total.value = data.pagination?.total ?? data.matches.length
    totalPages.value = data.pagination?.totalPages ?? 1
    page.value = data.pagination?.page ?? page.value

    lastFetchedId = identifier
    lastFetchedHeroName = activeHeroParam.value
    lastFetchedHeroFilter = heroFilter.value.trim()
    lastFetchedOutcome = outcomeFilter.value
    lastFetchedLimit = limitFilter.value
    lastFetchedCustomLimit = customLimit.value

    if (data.player.rowId && String(data.player.rowId) !== route.params.identifier) {
      const q = { ...route.query }
      if (route.params.heroName) {
        router.replace({ path: `/player/${data.player.rowId}/hero/${route.params.heroName}`, query: q })
      } else {
        router.replace({ path: `/player/${data.player.rowId}`, query: q })
      }
    }

    if (data.pagination && data.pagination.totalPages > 0 && page.value > data.pagination.totalPages) {
      goToPage(data.pagination.totalPages)
    }
  } catch {
    error.value = 'Failed to load player profile from server.'
    profileData.value = null
    matches.value = []
    total.value = 0
    totalPages.value = 1
  } finally {
    loading.value = false
    matchesLoading.value = false
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

function updateUrl(
  params: { page?: number; hero?: string; outcome?: 'all' | 'win' | 'loss'; limit?: number; customLimit?: number | null },
  replace: boolean = false
) {
  const query: Record<string, string> = {}
  const targetPage = params.page !== undefined ? params.page : page.value
  const targetHero = params.hero !== undefined ? params.hero : heroFilter.value
  const targetOutcome = params.outcome !== undefined ? params.outcome : outcomeFilter.value
  const targetLimit = params.limit !== undefined ? params.limit : limitFilter.value
  const targetCustomLimit = params.customLimit !== undefined ? params.customLimit : customLimit.value

  if (targetPage > 1) {
    query.page = String(targetPage)
  }
  if (targetHero.trim()) {
    query.hero = targetHero.trim()
  }
  if (targetOutcome && targetOutcome !== 'all') {
    query.outcome = targetOutcome
  }
  if (targetLimit !== 0) {
    query.limit = String(targetLimit)
    if (targetLimit === -1 && targetCustomLimit !== null && targetCustomLimit > 0) {
      query.customLimit = String(targetCustomLimit)
    }
  }

  const currentQ = route.query
  const isSame =
    (currentQ.page || '1') === (query.page || '1') &&
    (currentQ.hero || '') === (query.hero || '') &&
    (currentQ.outcome || 'all') === (query.outcome || 'all') &&
    (currentQ.limit || '0') === (query.limit || '0') &&
    (currentQ.customLimit || '') === (query.customLimit || '')

  if (isSame) {
    const id = typeof route.params.identifier === 'string' ? route.params.identifier : ''
    if (id) {
      fetchPlayerProfile(id, false)
    }
    return
  }

  if (replace) {
    router.replace({ path: route.path, query })
  } else {
    router.push({ path: route.path, query })
  }
}

function onScopeChange() {
  updateUrl({ page: 1, limit: limitFilter.value }, false)
}

let customLimitTimer: ReturnType<typeof setTimeout> | null = null
function onCustomLimitInput() {
  if (customLimitTimer) clearTimeout(customLimitTimer)
  customLimitTimer = setTimeout(() => {
    updateUrl({ page: 1, limit: -1, customLimit: customLimit.value }, false)
  }, 400)
}

let heroFilterTimer: ReturnType<typeof setTimeout> | null = null
function onHeroFilterInput() {
  if (heroFilterTimer) clearTimeout(heroFilterTimer)
  heroFilterTimer = setTimeout(() => {
    updateUrl({ page: 1, hero: heroFilter.value }, true)
  }, 350)
}

function setOutcomeFilter(val: 'all' | 'win' | 'loss') {
  if (outcomeFilter.value === val) return
  outcomeFilter.value = val
  updateUrl({ page: 1, outcome: val }, false)
}

function goToPage(targetPage: number) {
  if (targetPage < 1) targetPage = 1
  if (totalPages.value > 0 && targetPage > totalPages.value) targetPage = totalPages.value
  if (targetPage === page.value && matches.value.length > 0) return

  page.value = targetPage
  updateUrl({ page: targetPage }, false)

  if (typeof window !== 'undefined') {
    const matchesSection = document.querySelector('.profile-matches-section')
    if (matchesSection && matchesSection.getBoundingClientRect().top < 0) {
      matchesSection.scrollIntoView({ behavior: 'smooth' })
    }
  }
}

function handleJumpPage() {
  const parsed = parseInt(jumpPageInput.value.trim(), 10)
  if (!isNaN(parsed)) {
    goToPage(parsed)
    jumpPageInput.value = ''
  }
}

interface PaginationItem {
  type: 'page' | 'ellipsis'
  page?: number
  label: string
  active?: boolean
  key: string
}

const paginationItems = computed<PaginationItem[]>(() => {
  const current = page.value
  const totalCount = Math.max(totalPages.value, current > 1 ? current : 0)
  if (totalCount <= 1) return []

  const items: PaginationItem[] = []

  if (totalCount <= 7) {
    for (let p = 1; p <= totalCount; p++) {
      items.push({
        type: 'page',
        page: p,
        label: String(p),
        active: p === current,
        key: `page-${p}`,
      })
    }
    return items
  }

  // Always show first page
  items.push({
    type: 'page',
    page: 1,
    label: '1',
    active: current === 1,
    key: 'page-1',
  })

  let start = Math.max(2, current - 2)
  let end = Math.min(totalCount - 1, current + 2)

  if (current <= 4) {
    start = 2
    end = Math.min(totalCount - 1, 5)
  } else if (current >= totalCount - 3) {
    start = Math.max(2, totalCount - 4)
    end = totalCount - 1
  }

  if (start > 2) {
    items.push({
      type: 'ellipsis',
      label: '…',
      key: 'ellipsis-left',
    })
  }

  for (let p = start; p <= end; p++) {
    items.push({
      type: 'page',
      page: p,
      label: String(p),
      active: p === current,
      key: `page-${p}`,
    })
  }

  if (end < totalCount - 1) {
    items.push({
      type: 'ellipsis',
      label: '…',
      key: 'ellipsis-right',
    })
  }

  items.push({
    type: 'page',
    page: totalCount,
    label: String(totalCount),
    active: current === totalCount,
    key: `page-${totalCount}`,
  })

  return items
})

const matchesRangeText = computed<string>(() => {
  if (total.value === 0 || matches.value.length === 0) return '0'
  const start = (page.value - 1) * PAGE_SIZE + 1
  const end = Math.min(page.value * PAGE_SIZE, total.value)
  if (start > end) return '0'
  return `${start}–${end}`
})

const filterHeroStripSuffix = computed<string>(() => {
  if (effectiveLimit.value > 0) {
    return ` (Last ${total.value || effectiveLimit.value})`
  }
  if (outcomeFilter.value !== 'all' || heroFilter.value.trim().length > 0) {
    return ' (Filtered)'
  }
  return ''
})

const displaySummary = computed<PlayerProfileSummary | null>(() => {
  return profileData.value?.player ?? null
})

const displayHeroStats = computed<PlayerHeroSpecificStats | null>(() => {
  return profileData.value?.heroStats ?? null
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
  [() => route.params.identifier, () => route.params.heroName, () => route.query],
  ([newId, newHero, newQuery]) => {
    if (typeof newId !== 'string') return

    const qPage = parseInt(String(newQuery.page || '1'), 10)
    const targetPage = !isNaN(qPage) && qPage >= 1 ? qPage : 1

    const targetHeroFilter = typeof newQuery.hero === 'string' ? newQuery.hero : ''
    const rawOutcome = typeof newQuery.outcome === 'string' ? newQuery.outcome.toLowerCase() : 'all'
    const targetOutcome: 'all' | 'win' | 'loss' = (rawOutcome === 'win' || rawOutcome === 'loss') ? rawOutcome : 'all'
    const qLimit = parseInt(String(newQuery.limit || '0'), 10)
    const targetLimit = !isNaN(qLimit) ? qLimit : 0
    const qCustomLimit = parseInt(String(newQuery.customLimit || '0'), 10)
    const targetCustomLimit: number | null = !isNaN(qCustomLimit) && qCustomLimit > 0 ? qCustomLimit : null

    const isPageOnly =
      profileData.value !== null &&
      lastFetchedId === newId &&
      lastFetchedHeroName === (typeof newHero === 'string' ? newHero : '') &&
      lastFetchedHeroFilter === targetHeroFilter.trim() &&
      lastFetchedOutcome === targetOutcome &&
      lastFetchedLimit === targetLimit &&
      (targetLimit !== -1 || lastFetchedCustomLimit === targetCustomLimit) &&
      targetPage !== page.value

    page.value = targetPage
    heroFilter.value = targetHeroFilter
    outcomeFilter.value = targetOutcome
    limitFilter.value = targetLimit
    if (targetLimit === -1) {
      customLimit.value = targetCustomLimit
    }

    fetchPlayerProfile(newId, isPageOnly)
  },
  { immediate: true }
)

onMounted(() => {
  window.addEventListener('pointerdown', handlePointerDown)
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('pointerdown', handlePointerDown)
  window.removeEventListener('keydown', handleKeydown)
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
                 ref="heroMmrPillRef"
                 class="stat-pill-card mmr-pill"
                 @mouseenter="onMmrMouseEnter"
                 @mouseleave="onMmrMouseLeave"
                 @click="toggleMmrTrend">
              <span class="stat-pill-label">
                Player MMR <span class="mmr-trend-sparkle" title="Hover or tap for MMR Trend">📈</span>
              </span>
              <span class="stat-pill-val val-mmr">{{ formatNumber(profileData.player.mmr) }}</span>
              <span class="stat-pill-sub">
                <span v-if="profileData.player.baseMmr">Base: {{ formatNumber(profileData.player.baseMmr) }}</span>
                <span v-if="profileData.player.adjustment"
                      class="mmr-adj-badge">
                  ({{ profileData.player.adjustment > 0 ? '+' : '' }}{{ profileData.player.adjustment }})
                </span>
                <span v-if="!profileData.player.baseMmr">In-House</span>
              </span>

              <!-- MMR Trend Hover Popover Graph -->
              <MmrTrendGraph
                v-if="showMmrTrend"
                :history="profileData.mmrHistory"
                :current-mmr="profileData.player.mmr"
                :base-mmr="profileData.player.baseMmr"
                :adjustment="profileData.player.adjustment"
                :player-name="profileData.player.name"
                :highlight-hero="displayHeroStats?.hero"
                :anchor-el="heroMmrPillRef"
                @mouseenter="cancelMmrTrendTimer"
                @mouseleave="onMmrMouseLeave"
                @close="closeMmrTrend"
              />
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
                <span>{{ effectiveLimit > 0 ? `Last ${displayHeroStats.total} Games` : `${displayHeroStats.total} Games`
                }}</span>
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

        <!-- Summary Controls Bar -->
        <div class="summary-filter-bar">
          <div class="summary-controls-left">
            <span class="count-badge">{{ total }} matches</span>
          </div>
          <div class="summary-controls-right">
            <div class="filter-group">
              <label>Matches:</label>
              <select v-model="limitFilter"
                      class="filter-limit-select"
                      @change="onScopeChange">
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
              <input v-if="limitFilter === -1"
                     v-model.number="customLimit"
                     type="number"
                     min="1"
                     placeholder="# games"
                     class="filter-custom-limit-input"
                     @input="onCustomLimitInput" />
            </div>

            <div class="filter-group">
              <label>Result:</label>
              <div class="outcome-toggle-btns">
                <button class="toggle-btn"
                        :class="{ active: outcomeFilter === 'all' }"
                        @click="setOutcomeFilter('all')">
                  All
                </button>
                <button class="toggle-btn toggle-win"
                        :class="{ active: outcomeFilter === 'win' }"
                        @click="setOutcomeFilter('win')">
                  Victory
                </button>
                <button class="toggle-btn toggle-loss"
                        :class="{ active: outcomeFilter === 'loss' }"
                        @click="setOutcomeFilter('loss')">
                  Defeat
                </button>
              </div>
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
                <span class="player-name-group">
                  <span class="player-name-text">{{ displaySummary.name }}</span>
                  <span v-if="displaySummary.tag"
                        class="player-bnet-tag">#{{ displaySummary.tag }}</span>
                </span>
                <RoleBadge
                  v-if="displaySummary.role"
                  :role="displaySummary.role"
                  class="profile-role-badge"
                />
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
                 ref="generalMmrPillRef"
                 class="stat-pill-card mmr-pill"
                 @mouseenter="onMmrMouseEnter"
                 @mouseleave="onMmrMouseLeave"
                 @click="toggleMmrTrend">
              <span class="stat-pill-label">
                Current MMR <span class="mmr-trend-sparkle" title="Hover or tap for MMR Trend">📈</span>
              </span>
              <span class="stat-pill-val val-mmr">{{ formatNumber(displaySummary.mmr) }}</span>
              <span class="stat-pill-sub">
                <span v-if="displaySummary.baseMmr">Base: {{ formatNumber(displaySummary.baseMmr) }}</span>
                <span v-if="displaySummary.adjustment"
                      class="mmr-adj-badge">
                  ({{ displaySummary.adjustment > 0 ? '+' : '' }}{{ displaySummary.adjustment }})
                </span>
                <span v-if="!displaySummary.baseMmr">In-House</span>
              </span>

              <!-- MMR Trend Hover Popover Graph -->
              <MmrTrendGraph
                v-if="showMmrTrend"
                :history="profileData.mmrHistory"
                :current-mmr="displaySummary.mmr"
                :base-mmr="displaySummary.baseMmr"
                :adjustment="displaySummary.adjustment"
                :player-name="displaySummary.name"
                :anchor-el="generalMmrPillRef"
                @mouseenter="cancelMmrTrendTimer"
                @mouseleave="onMmrMouseLeave"
                @close="closeMmrTrend"
              />
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
                <span>{{ effectiveLimit > 0 ? `Last ${displaySummary.totalMatches} Games` :
                  `${displaySummary.totalMatches} Games` }}</span>
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

        <!-- Summary Controls Bar -->
        <div class="summary-filter-bar">
          <div class="summary-controls-left">
            <span class="count-badge">{{ total }} matches</span>
          </div>
          <div class="summary-controls-right">
            <div class="filter-group">
              <label>Matches:</label>
              <select v-model="limitFilter"
                      class="filter-limit-select"
                      @change="onScopeChange">
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
              <input v-if="limitFilter === -1"
                     v-model.number="customLimit"
                     type="number"
                     min="1"
                     placeholder="# games"
                     class="filter-custom-limit-input"
                     @input="onCustomLimitInput" />
            </div>

            <div v-if="!activeHeroParam" class="filter-group">
              <label>Filter Hero:</label>
              <input v-model="heroFilter"
                     type="text"
                     class="filter-hero-input"
                     placeholder="Search hero..."
                     @input="onHeroFilterInput" />
            </div>

            <div class="filter-group">
              <label>Result:</label>
              <div class="outcome-toggle-btns">
                <button class="toggle-btn"
                        :class="{ active: outcomeFilter === 'all' }"
                        @click="setOutcomeFilter('all')">
                  All
                </button>
                <button class="toggle-btn toggle-win"
                        :class="{ active: outcomeFilter === 'win' }"
                        @click="setOutcomeFilter('win')">
                  Victory
                </button>
                <button class="toggle-btn toggle-loss"
                        :class="{ active: outcomeFilter === 'loss' }"
                        @click="setOutcomeFilter('loss')">
                  Defeat
                </button>
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
              <span class="range-highlight">{{ matchesRangeText }} of {{ total }} matches</span>
              <span v-if="totalPages > 1" class="page-subtle">(Page {{ page }}/{{ Math.max(totalPages, 1) }})</span>
            </span>
          </div>
        </div>

        <!-- Matches Table -->
        <div v-if="matchesLoading"
             class="loading-matches">
          <div class="spinner"></div>
          <p>Loading matches...</p>
        </div>

        <div v-else-if="matches.length === 0"
             class="empty-matches">
          <p>No matches match the selected filters.</p>
        </div>

        <div v-else
             class="matches-cards-list">
          <div v-for="m in matches"
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
                <div class="map-duration-row">
                  <span class="map-duration">{{ formatDuration(m.length) }}</span>
                  <span v-if="m.mmr_delta != null"
                        class="match-mmr-badge"
                        :class="m.mmr_delta > 0 ? 'mmr-up' : (m.mmr_delta < 0 ? 'mmr-down' : 'mmr-zero')"
                        :title="m.is_rated ? `Rating change: ${m.mmr_delta > 0 ? '+' : ''}${m.mmr_delta} MMR` : 'Unrated Match'">
                    {{ m.mmr_delta > 0 ? `+${m.mmr_delta}` : (m.mmr_delta < 0 ? m.mmr_delta : '±0') }}
                  </span>
                </div>
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

            <!-- Talents Strip (7 Tiers with tooltips & HotS hex modal) -->
            <div class="match-talents-col"
                 @click.stop>
              <div class="talents-strip">
                <div v-for="(tKey, tIdx) in getMatchTalentList(m.talents)"
                     :key="tIdx"
                     class="talent-mini-slot"
                     :class="{
                      'is-heroic': [3, 6].includes(tIdx),
                      'is-empty': !tKey
                    }"
                     :title="'Click to view all Level ' + [1, 4, 7, 10, 13, 16, 20][tIdx] + ' options'"
                     @mouseenter="showTalentTooltip($event, tKey, tIdx, m.hero)"
                     @mousemove="updateTooltipPosition($event)"
                     @mouseleave="hideTalentTooltip"
                     @click.stop="openExpandedTier(tKey, tIdx, m)">
                  <div class="talent-mini-hex-outer">
                    <div class="talent-mini-hex-inner">
                      <img v-if="tKey"
                           :src="getTalentImageUrl(tKey)"
                           :alt="formatTalentName(tKey)"
                           class="talent-mini-img"
                           @error="hideBrokenImage" />
                      <span v-else
                            class="talent-mini-empty">
                        {{ [1, 4, 7, 10, 13, 16, 20][tIdx] }}
                      </span>
                    </div>
                  </div>
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

            <!-- Combat Stats (Direct Grid Areas) -->
            <div class="stat-item stat-hero"
                 title="Hero Damage">
              <span class="stat-label">Hero</span>
              <span class="stat-val dmg-hero">{{ formatNumber(m.hero_damage) }}</span>
            </div>
            <div class="stat-item stat-siege"
                 title="Siege Damage">
              <span class="stat-label">Siege</span>
              <span class="stat-val dmg-siege">{{ formatNumber(m.siege_damage) }}</span>
            </div>
            <div class="stat-item stat-heal"
                 title="Healing / Shielding">
              <span class="stat-label">Heal</span>
              <span class="stat-val dmg-heal">{{ formatNumber(m.healing + m.self_healing) }}</span>
            </div>
            <div class="stat-item stat-taken"
                 title="Damage Taken">
              <span class="stat-label">Taken</span>
              <span class="stat-val dmg-taken">{{ formatNumber(m.damage_taken) }}</span>
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

      <!-- Pagination Bar -->
      <div v-if="totalPages > 1 || page > 1" class="pagination-container card">
        <div class="pagination-main-row">
          <div class="pagination-meta">
            Showing matches <strong>{{ matchesRangeText }}</strong> of <strong>{{ total }}</strong>
          </div>

          <div class="pagination-controls">
            <button
              :disabled="page <= 1"
              class="btn btn-page-nav"
              title="First Page"
              @click="goToPage(1)"
            >
              « First
            </button>
            <button
              :disabled="page <= 1"
              class="btn btn-page-nav"
              title="Previous Page"
              @click="goToPage(page - 1)"
            >
              ‹ Prev
            </button>

            <div class="page-numbers-group">
              <template v-for="item in paginationItems" :key="item.key">
                <span v-if="item.type === 'ellipsis'" class="page-ellipsis">…</span>
                <button
                  v-else
                  class="btn-page-num"
                  :class="{ active: item.active }"
                  :title="`Page ${item.label}`"
                  @click="goToPage(item.page!)"
                >
                  {{ item.label }}
                </button>
              </template>
            </div>

            <button
              :disabled="totalPages <= 1 || page >= totalPages"
              class="btn btn-page-nav"
              title="Next Page"
              @click="goToPage(page + 1)"
            >
              Next ›
            </button>
            <button
              :disabled="totalPages <= 1 || page >= totalPages"
              class="btn btn-page-nav"
              title="Last Page"
              @click="goToPage(Math.max(totalPages, 1))"
            >
              Last »
            </button>
          </div>
        </div>

        <div class="pagination-secondary-row">
          <!-- Quick Jump Form -->
          <form class="jump-form" @submit.prevent="handleJumpPage">
            <label for="player-jump-input" class="jump-label">Go to page:</label>
            <input
              id="player-jump-input"
              v-model="jumpPageInput"
              type="number"
              min="1"
              :max="totalPages"
              placeholder="#"
              class="jump-input"
            />
            <button type="submit" class="btn btn-jump">Go</button>
          </form>
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
              <div class="tooltip-hex-inner">
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

    <!-- Expanded Talent Tier Options Modal -->
    <Teleport to="body">
      <div v-if="expandedTier.visible"
           class="expanded-talent-overlay"
           @click.self="closeExpandedTier">
        <div class="expanded-talent-modal"
             role="dialog"
             aria-modal="true"
             @click.stop>
          <!-- HotS In-Game Style Talent Build Bar -->
          <div class="hots-build-bar">
            <div class="hots-build-header">
              <div class="hots-build-title-group">
                <span class="hots-build-title">{{ resolveHeroName(expandedTier.heroName) }} Talent Build</span>
                <div v-if="expandedTier.match"
                     class="hots-build-player-info">
                  <span class="hots-player-name">{{ expandedTier.match.battle_tag || profileData?.player.name }}</span>
                  <span class="team-pill"
                        :class="expandedTier.match.win ? 'pill-blue' : 'pill-red'">
                    {{ expandedTier.match.win ? 'Victory' : 'Defeat' }}
                  </span>
                </div>
              </div>

              <div class="hots-build-controls">
                <button v-if="expandedTier.match"
                        class="copy-code-btn"
                        :class="{ copied: copiedMatchId === expandedTier.match.replay_id }"
                        title="Copy in-game talent build code to clipboard"
                        @click="copyMatchBuildCode(expandedTier.match)">
                  <template v-if="copiedMatchId === expandedTier.match.replay_id">
                    <svg class="copy-btn-icon check-icon"
                         viewBox="0 0 16 16"
                         fill="none"
                         stroke="currentColor"
                         stroke-width="2"
                         stroke-linecap="round"
                         stroke-linejoin="round">
                      <polyline points="3.5 8.5 6.5 11.5 12.5 4.5" />
                    </svg>
                    <span>Copied!</span>
                  </template>
                  <template v-else>
                    <svg class="copy-btn-icon"
                         viewBox="0 0 16 16"
                         fill="none"
                         stroke="currentColor"
                         stroke-width="1.6"
                         stroke-linecap="round"
                         stroke-linejoin="round">
                      <rect x="5.5"
                            y="5.5"
                            width="7"
                            height="7"
                            rx="1.2" />
                      <path d="M10.5 5.5V3.5A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5h2" />
                    </svg>
                    <span>Copy</span>
                  </template>
                </button>

                <button class="hots-build-close-btn"
                        aria-label="Close"
                        @click="closeExpandedTier">
                  ✕
                </button>
              </div>
            </div>

            <!-- Hexagonal In-Game Talent Slots (Levels 1, 4, 7, 10, 13, 16, 20) -->
            <div class="hots-hex-bar">
              <button v-for="(lvl, tIdx) in [1, 4, 7, 10, 13, 16, 20]"
                      :key="lvl"
                      type="button"
                      class="hots-hex-slot"
                      :class="{
                        'is-active': expandedTier.tierIndex === tIdx,
                        'has-picked': !!getMatchTalentList(expandedTier.match?.talents)[tIdx],
                        'is-empty': !getMatchTalentList(expandedTier.match?.talents)[tIdx]
                      }"
                      :title="`Tier Level ${lvl}`"
                      @click="switchExpandedTier(tIdx)">
                <div class="hots-hex-outer">
                  <div class="hots-hex-inner">
                    <img v-if="getMatchTalentList(expandedTier.match?.talents)[tIdx]"
                         :src="getTalentImageUrl(getMatchTalentList(expandedTier.match?.talents)[tIdx])"
                         :alt="formatTalentName(getMatchTalentList(expandedTier.match?.talents)[tIdx])"
                         class="hots-hex-img"
                         @error="hideBrokenImage" />
                    <span v-else
                          class="hots-hex-empty-lvl">{{ lvl }}</span>
                  </div>
                </div>
                <span class="hots-hex-lvl-label">Lvl {{ lvl }}</span>
              </button>
            </div>
          </div>

          <!-- Tier Indicator Subheader -->
          <div class="expanded-tier-banner">
            <span class="expanded-tier-banner-title">
              Level {{ [1, 4, 7, 10, 13, 16, 20][expandedTier.tierIndex] }} Talents
            </span>
            <span class="expanded-tier-banner-hint">
              Click any hexagon above to switch tier options
            </span>
          </div>

          <!-- All Options List for this Tier -->
          <div class="expanded-options-body">
            <div class="expanded-options-grid">
              <div v-for="t in getTierTalents(expandedTier.heroName, expandedTier.tierIndex)"
                   :key="t.key"
                   class="expanded-talent-card"
                   :class="{
                    'is-picked': isTalentPicked(t, expandedTier.pickedTalentKey),
                    'is-not-picked': !isTalentPicked(t, expandedTier.pickedTalentKey)
                  }">
                <!-- Card Header with Hexagonal Option Icon -->
                <div class="talent-card-top">
                  <div class="talent-card-hex-wrap">
                    <div class="talent-card-hex-outer"
                         :class="{
                          'is-picked': isTalentPicked(t, expandedTier.pickedTalentKey),
                          'is-not-picked': !isTalentPicked(t, expandedTier.pickedTalentKey)
                        }">
                      <div class="talent-card-hex-inner">
                        <img :src="getTalentImageUrl(t.key)"
                             :alt="t.name"
                             class="talent-card-hex-img"
                             @error="hideBrokenImage" />
                      </div>
                    </div>
                    <span v-if="isTalentPicked(t, expandedTier.pickedTalentKey)"
                          class="talent-card-hex-fav-badge"
                          title="Selected talent">
                      <svg viewBox="0 0 16 16"
                           class="hex-fav-heart">
                        <path d="M8 13.5l-5.3-5.3a3.3 3.3 0 0 1 4.7-4.7L8 4.1l.6-.6a3.3 3.3 0 0 1 4.7 4.7z"
                              fill="currentColor" />
                      </svg>
                    </span>
                  </div>

                  <div class="talent-card-meta">
                    <div class="talent-card-status-row">
                      <span v-if="isTalentPicked(t, expandedTier.pickedTalentKey)"
                            class="picked-badge">
                        ✓ SELECTED
                      </span>
                      <span v-else
                            class="unpicked-badge">
                        NOT PICKED
                      </span>

                      <span v-if="t.type"
                            class="talent-type-badge"
                            :class="getTypeBadgeClass(t.type)">
                        {{ t.type }}
                      </span>
                    </div>

                    <h4 class="expanded-talent-name">{{ t.name }}</h4>
                  </div>
                </div>

                <!-- Card Description -->
                <div v-if="t.description"
                     class="expanded-talent-desc"
                     v-html="formatTalentDescriptionHtml(t.description)">
                </div>
              </div>
            </div>

            <!-- Fallback if no talents found in database -->
            <div v-if="getTierTalents(expandedTier.heroName, expandedTier.tierIndex).length === 0"
                 class="expanded-empty-state">
              <p>No other talent options found for this tier.</p>
              <div v-if="expandedTier.pickedTalentKey"
                   class="fallback-picked-only">
                <strong>Picked:</strong> {{ formatTalentName(expandedTier.pickedTalentKey) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.container,
.player-profile-view.container {
  max-width: 1300px;
  margin-left: calc((100% - 1300px) / 2);
  margin-right: calc((100% - 1300px) / 2);
  padding-left: 1rem;
  padding-right: 1rem;
  transition: padding 0.4s cubic-bezier(0.34, 1.3, 0.64, 1),
              margin 0.4s cubic-bezier(0.34, 1.3, 0.64, 1),
              max-width 0.4s cubic-bezier(0.34, 1.3, 0.64, 1);
}

.player-profile-view {
  padding-top: 1.5rem;
  padding-bottom: 3rem;
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
  transition: padding 0.4s cubic-bezier(0.34, 1.3, 0.64, 1);
}

.card,
.profile-header-card,
.profile-matches-section,
.pagination-container {
  transition: border-radius 0.4s cubic-bezier(0.34, 1.3, 0.64, 1);
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
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: var(--radius-md);
  color: #fff;
  font-size: 0.85rem;
  outline: none;
  transition: all 0.2s ease;
}

.player-search-input::placeholder {
  color: #94a3b8;
  opacity: 0.85;
}

.player-search-input:hover {
  border-color: rgba(148, 163, 184, 0.6);
}

.player-search-input:focus {
  border-color: var(--accent-cyan);
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.25);
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
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.player-name-group {
  display: inline-flex;
  align-items: baseline;
  gap: 0.35rem;
}

.player-bnet-tag {
  font-size: 1.15rem;
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-weight: 500;
}

.profile-role-badge,
.player-role-badge {
  display: inline-flex;
  align-items: center;
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
  position: relative;
  border-color: rgba(251, 191, 36, 0.28);
  background: rgba(251, 191, 36, 0.05);
  cursor: pointer;
  transition: all 0.2s ease;
}

.mmr-pill:hover {
  border-color: rgba(251, 191, 36, 0.55);
  background: rgba(251, 191, 36, 0.1);
  box-shadow: 0 0 14px rgba(251, 191, 36, 0.2);
}

.mmr-trend-sparkle {
  font-size: 0.72rem;
  margin-left: 0.25rem;
  opacity: 0.8;
  display: inline-block;
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.mmr-pill:hover .mmr-trend-sparkle {
  opacity: 1;
  transform: scale(1.15);
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
  display: inline-flex;
  align-items: center;
  font-size: 0.78rem;
  background: rgba(14, 165, 233, 0.08);
  border: 1px solid rgba(56, 189, 248, 0.2);
  color: #38bdf8;
  padding: 0.22rem 0.65rem;
  border-radius: var(--radius-full);
  font-family: var(--font-mono);
  gap: 0.35rem;
}

.range-highlight {
  color: #38bdf8;
  font-weight: 600;
}

.page-subtle {
  color: #94a3b8;
  font-weight: 400;
  opacity: 0.8;
  font-size: 0.74rem;
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
  font-size: 0.82rem;
  color: #cbd5e1;
  font-weight: 500;
}

.filter-hero-input {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: var(--radius-md);
  color: #fff;
  padding: 0.35rem 0.65rem;
  font-size: 0.8rem;
  outline: none;
  transition: all 0.2s ease;
}

.filter-hero-input::placeholder {
  color: #94a3b8;
  opacity: 0.85;
}

.filter-hero-input:hover {
  border-color: rgba(148, 163, 184, 0.6);
}

.filter-hero-input:focus {
  border-color: var(--accent-cyan);
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.25);
}

.filter-limit-select,
.filter-custom-limit-input {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: var(--radius-md);
  color: #fff;
  padding: 0.35rem 0.65rem;
  font-size: 0.8rem;
  outline: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.filter-limit-select:hover,
.filter-custom-limit-input:hover {
  border-color: rgba(148, 163, 184, 0.6);
}

.filter-limit-select:focus,
.filter-custom-limit-input:focus {
  border-color: var(--accent-cyan);
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.25);
}

.filter-custom-limit-input {
  width: 80px;
  cursor: text;
}

.filter-custom-limit-input::placeholder {
  color: #94a3b8;
  opacity: 0.85;
}

.outcome-toggle-btns {
  display: flex;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.35);
  transition: border-color 0.2s ease;
}

.outcome-toggle-btns:hover {
  border-color: rgba(148, 163, 184, 0.6);
}

.toggle-btn {
  background: rgba(15, 23, 42, 0.7);
  border: none;
  border-right: 1px solid rgba(148, 163, 184, 0.25);
  color: #94a3b8;
  padding: 0.35rem 0.75rem;
  font-size: 0.78rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.toggle-btn:last-child {
  border-right: none;
}

.toggle-btn:hover {
  color: #fff;
  background: rgba(30, 41, 59, 0.8);
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

/* Summary Filter Bar */
.summary-filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  margin-top: 1.5rem;
  padding-top: 1.25rem;
}

.summary-controls-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.summary-controls-right {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.loading-matches {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 3rem 1rem;
  color: var(--text-dim);
}

/* Pagination Bar */
.pagination-container {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  margin-top: 1.5rem;
  padding: 1.25rem 1.75rem;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.pagination-main-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
}

.pagination-meta {
  font-size: 0.9rem;
  color: var(--text-muted);
}

.pagination-meta strong {
  color: var(--text-main);
  font-family: var(--font-mono);
}

.pagination-controls {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.btn-page-nav {
  font-size: 0.85rem;
  padding: 0.4rem 0.75rem;
  min-height: 36px;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-main);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-page-nav:hover:not(:disabled) {
  background: var(--bg-surface-hover);
  border-color: var(--accent-blue);
  color: #fff;
}

.btn-page-nav:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  pointer-events: none;
}

.page-numbers-group {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.btn-page-num {
  min-width: 36px;
  height: 36px;
  padding: 0 0.5rem;
  font-size: 0.85rem;
  font-weight: 600;
  font-family: var(--font-mono);
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  border-radius: var(--radius-md);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.btn-page-num:hover:not(.active) {
  background: var(--bg-surface-hover);
  border-color: var(--border-focus);
  color: var(--text-main);
}

.btn-page-num.active {
  background: linear-gradient(135deg, #0284c7, #2563eb);
  border-color: rgba(56, 189, 248, 0.6);
  color: #ffffff;
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.35);
  cursor: default;
}

.page-ellipsis {
  padding: 0 0.4rem;
  color: var(--text-dim);
  font-size: 0.9rem;
  user-select: none;
}

.pagination-secondary-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  padding-top: 1rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.jump-form {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.jump-label {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.jump-input {
  width: 72px;
  height: 32px;
  padding: 0 0.4rem;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: var(--radius-sm);
  color: var(--text-main);
  outline: none;
  transition: all 0.2s ease;
}

.jump-input::placeholder {
  color: #94a3b8;
  opacity: 0.85;
}

.jump-input:hover {
  border-color: rgba(148, 163, 184, 0.6);
}

.jump-input:focus {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);
}

.btn-jump {
  height: 32px;
  padding: 0 0.75rem;
  font-size: 0.82rem;
  font-weight: 600;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-main);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-jump:hover {
  background: var(--bg-surface-hover);
  border-color: var(--accent-blue);
  color: #fff;
}

/* Matches Cards List */
.matches-cards-list {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.profile-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.player-match-row {
  display: grid;
  grid-template-columns: minmax(95px, 110px) max-content max-content max-content max-content repeat(4, minmax(45px, 60px)) min-content;
  grid-template-areas: "result map hero talents kad stat-hero stat-siege stat-heal stat-taken action";
  align-items: center;
  gap: 0.85rem;
  background: rgba(15, 23, 42, 0.7);
  border-radius: var(--radius-md);
  padding: 0.85rem 1.15rem;
  border-left: 4px solid #64748b;
  cursor: pointer;
  transition: all 0.15s ease, border-radius 0.4s cubic-bezier(0.34, 1.3, 0.64, 1);
}

@supports (grid-template-columns: subgrid) {
  .matches-cards-list {
    display: grid;
    grid-template-columns: minmax(95px, 110px) max-content max-content max-content max-content repeat(4, minmax(45px, 60px)) min-content;
    gap: 0.65rem;
    justify-content: center;
  }

  .player-match-row {
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
  }
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
  grid-area: result;
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
  grid-area: map;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
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
  min-width: 0;
}

.map-name {
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.map-duration-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.map-duration {
  font-size: 0.72rem;
  color: var(--text-dim);
  font-family: var(--font-mono);
}

.match-mmr-badge {
  font-size: 0.68rem;
  font-family: var(--font-mono);
  font-weight: 700;
  padding: 0.05rem 0.35rem;
  border-radius: 4px;
  line-height: 1.2;
}

.match-mmr-badge.mmr-up {
  color: #34d399;
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.match-mmr-badge.mmr-down {
  color: #fb7185;
  background: rgba(244, 63, 94, 0.15);
  border: 1px solid rgba(244, 63, 94, 0.3);
}

.match-mmr-badge.mmr-zero {
  color: #94a3b8;
  background: rgba(148, 163, 184, 0.1);
  border: 1px solid rgba(148, 163, 184, 0.2);
}

/* Hero Col */
.match-hero-col {
  grid-area: hero;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
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
  overflow: hidden;
  text-overflow: ellipsis;
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
  grid-area: talents;
  display: flex;
  align-items: center;
}

.talents-strip {
  display: flex;
  align-items: center;
  gap: 4px;
}

.match-talents-col .talent-mini-hex-outer {
  width: 25px;
  height: 29px;
}

/* KDA Col */
.match-kda-col {
  grid-area: kad;
  display: flex;
  flex-direction: column;
  width: max-content;
  gap: 0.15rem;
  margin-inline: auto;
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

/* Individual Combat Stats Grid Areas */
.stat-hero {
  grid-area: stat-hero;
}

.stat-siege {
  grid-area: stat-siege;
}

.stat-heal {
  grid-area: stat-heal;
}

.stat-taken {
  grid-area: stat-taken;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
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
.match-action-col {
  grid-area: action;
}

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
@media (max-width: 1348px) {
  .container,
  .player-profile-view.container {
    max-width: 100%;
    margin-left: 0;
    margin-right: 0;
    padding-left: 0;
    padding-right: 0;
  }

  .profile-nav-bar {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .card,
  .profile-header-card,
  .profile-matches-section,
  .pagination-container,
  .player-match-row {
    border-radius: 0;
  }

  .card,
  .profile-header-card,
  .profile-matches-section,
  .pagination-container {
    border-left: none;
    border-right: none;
  }
}

@media (max-width: 900px) {
  .pagination-main-row {
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  .pagination-secondary-row {
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  .pagination-controls {
    justify-content: center;
  }
}

@media (max-width: 1210px) {
  .profile-matches-section .matches-cards-list {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .player-match-row {
    grid-column: auto;
    display: grid;
    grid-template-columns: minmax(85px, 95px) minmax(200px, 220px) minmax(115px, 135px) repeat(4, minmax(50px, 1fr)) auto;
    grid-template-rows: auto auto;
    grid-template-areas:
      "result map     hero hero       hero       hero       hero       action"
      "result talents kad  stat-hero  stat-siege stat-heal  stat-taken action";
    row-gap: 0.65rem;
    column-gap: 0.75rem;
    align-items: center;
  }

  .match-result-col {
    align-self: center;
  }

  .match-action-col {
    align-self: center;
    justify-self: end;
  }

  .match-kda-col {
    margin-inline: 0;
  }

  .stat-hero,
  .stat-siege,
  .stat-heal,
  .stat-taken {
    display: flex;
  }
}

@media (max-width: 880px) {
  .player-match-row {
    grid-template-columns: minmax(75px, 90px) repeat(3, minmax(55px, 1fr)) minmax(80px, 95px);
    grid-template-rows: auto auto auto;
    grid-template-areas:
      "map    map        hero       hero       action"
      "result talents    talents    talents    kad"
      "result stat-hero  stat-siege stat-heal  stat-taken";
    row-gap: 0.65rem;
    column-gap: 0.75rem;
  }

  .match-map-col {
    justify-self: start;
    min-width: 0;
  }

  .match-hero-col {
    justify-self: start;
    min-width: 0;
  }

  .match-result-col {
    align-self: center;
  }

  .match-action-col {
    align-self: center;
    justify-self: end;
  }

  .match-kda-col {
    margin-inline: 0;
    justify-self: end;
  }

  .stat-hero,
  .stat-siege,
  .stat-heal,
  .stat-taken {
    display: flex;
  }

  .profile-header-top {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 640px) {
  .profile-matches-section,
  .profile-header-card {
    padding: 1rem 0.75rem;
  }

  .player-match-row {
    padding: 0.75rem;
    column-gap: 0.5rem;
  }
}

@media (max-width: 450px) {
  .match-action-col {
    display: none;
  }

  .player-match-row {
    padding: 0.65rem 0.45rem;
    column-gap: 0.35rem;
    row-gap: 0.5rem;
    grid-template-columns: minmax(65px, 75px) repeat(4, minmax(45px, 1fr));
    grid-template-areas:
      "map    map        hero       hero       hero"
      "result talents    talents    talents    kad"
      "result stat-hero  stat-siege stat-heal  stat-taken";
  }

  .match-talents-col .talent-mini-hex-outer {
    width: 21px;
    height: 25px;
  }

  .talents-strip {
    gap: 2px;
  }
}
</style>
