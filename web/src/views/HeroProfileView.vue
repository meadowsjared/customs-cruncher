<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  HeroProfileData,
  HeroProfileMatch,
  HeroProfileTopPlayer,
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
const heroData = ref<HeroProfileData | null>(null)

// Search bar state for global lookup
const searchQuery = ref('')
const searchResults = ref<PlayerSearchItem[]>([])
const searchLoading = ref(false)
const showSearchDropdown = ref(false)

// In-page filters
const playerFilter = ref('')
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

async function fetchHeroProfile(heroName: string) {
  loading.value = true
  error.value = null

  try {
    const res = await fetch(`/api/hero/${encodeURIComponent(heroName)}`)
    if (!res.ok) {
      if (res.status === 404) {
        error.value = `Hero "${heroName}" not found in customs match records.`
      } else {
        error.value = `Failed to load hero profile (Status ${res.status}).`
      }
      heroData.value = null
      return
    }

    const data: HeroProfileData = await res.json()
    heroData.value = data
  } catch {
    error.value = 'Failed to load hero profile from server.'
    heroData.value = null
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

  searchLoading.value = true
  searchTimer = setTimeout(async () => {
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

function navigateToPlayerHero(m: HeroProfileMatch) {
  const targetId = m.player_row_id ? String(m.player_row_id) : `${m.player_name}-${m.player_tag}`
  const heroParam = heroData.value?.hero.canonicalName || m.hero
  router.push(`/player/${encodeURIComponent(targetId)}/hero/${encodeURIComponent(heroParam)}`)
}

function navigateToTopPlayerHero(tp: HeroProfileTopPlayer) {
  const targetId = tp.rowId ? String(tp.rowId) : `${tp.name}-${tp.tag}`
  const heroParam = heroData.value?.hero.canonicalName || (typeof route.params.heroName === 'string' ? route.params.heroName : '')
  router.push(`/player/${encodeURIComponent(targetId)}/hero/${encodeURIComponent(heroParam)}`)
}

const filteredMatches = computed<HeroProfileMatch[]>(() => {
  if (!heroData.value) return []
  let list = heroData.value.matches

  if (outcomeFilter.value === 'win') {
    list = list.filter(m => m.win)
  } else if (outcomeFilter.value === 'loss') {
    list = list.filter(m => !m.win)
  }

  if (playerFilter.value.trim()) {
    const pf = playerFilter.value.trim().toLowerCase()
    list = list.filter(m =>
      m.player_name.toLowerCase().includes(pf) ||
      m.player_battle_tag.toLowerCase().includes(pf)
    )
  }

  return list
})

watch(
  () => route.params.heroName,
  newHero => {
    if (typeof newHero === 'string') {
      fetchHeroProfile(newHero)
    }
  },
  { immediate: true }
)

onMounted(() => {
  const currentHero = route.params.heroName
  if (typeof currentHero === 'string' && !heroData.value) {
    fetchHeroProfile(currentHero)
  }
})
</script>

<template>
  <div class="hero-profile-view container">
    <!-- Talent Tooltip Portal -->
    <div
      v-if="activeTooltip.visible"
      class="talent-floating-tooltip"
      :style="tooltipStyle"
    >
      <div v-if="activeTooltip.talentKey && getTalentInfo(activeTooltip.talentKey)" class="tooltip-inner">
        <div class="tooltip-header">
          <img
            :src="getTalentImageUrl(activeTooltip.talentKey)"
            :alt="formatTalentName(activeTooltip.talentKey)"
            class="tooltip-icon"
            @error="hideBrokenImage"
          />
          <div class="tooltip-title-col">
            <div class="tooltip-name">
              {{ getTalentInfo(activeTooltip.talentKey)?.name || formatTalentName(activeTooltip.talentKey) }}
            </div>
            <div class="tooltip-meta">
              <span class="tooltip-level">
                Level {{ [1, 4, 7, 10, 13, 16, 20][activeTooltip.tierIndex] || 1 }}
              </span>
              <span
                v-if="getTalentInfo(activeTooltip.talentKey)?.type"
                class="tooltip-type-badge"
                :class="getTypeBadgeClass(getTalentInfo(activeTooltip.talentKey)?.type)"
              >
                {{ getTalentInfo(activeTooltip.talentKey)?.type }}
              </span>
            </div>
          </div>
        </div>
        <div
          v-if="getTalentInfo(activeTooltip.talentKey)?.description"
          class="tooltip-desc"
          v-html="formatTalentDescriptionHtml(getTalentInfo(activeTooltip.talentKey)?.description)"
        ></div>
      </div>
      <div v-else class="tooltip-inner tooltip-empty">
        <div class="tooltip-name">Level {{ [1, 4, 7, 10, 13, 16, 20][activeTooltip.tierIndex] || 1 }} Talent</div>
        <div class="tooltip-desc-empty">No talent choice recorded for this tier.</div>
      </div>
    </div>

    <!-- Top Navigation Bar -->
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
      <p>Retrieving hero records from the Nexus...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="card error-card">
      <span class="error-icon">⚠️</span>
      <h2>Hero Not Found</h2>
      <p>{{ error }}</p>
      <button class="btn btn-primary" @click="router.push('/matches')">
        Return to Matches
      </button>
    </div>

    <!-- Loaded Hero Profile -->
    <div v-else-if="heroData" class="profile-content">
      <!-- Hero Header Card -->
      <div class="profile-header-card card hero-overview-card">
        <div class="profile-header-top">
          <div class="profile-identity">
            <div class="hero-avatar-circle">
              <img
                :src="getHeroImageUrl(heroData.hero.canonicalName)"
                :alt="heroData.hero.canonicalName"
                class="hero-portrait-img"
                @error="hideBrokenImage"
              />
            </div>
            <div class="player-identity-info">
              <h1 class="player-display-name">
                {{ resolveHeroName(heroData.hero.canonicalName) }}
              </h1>
              <p class="hero-scope-badge">
                All Customs Matches Across All Players
              </p>
            </div>
          </div>

          <!-- Key Stats Badges -->
          <div class="profile-stat-pills">
            <div class="stat-pill-card">
              <span class="stat-pill-label">Win Rate</span>
              <span
                class="stat-pill-val"
                :class="heroData.hero.winRatePct >= 50 ? 'val-good' : 'val-dim'"
              >
                {{ heroData.hero.winRatePct }}%
              </span>
              <span class="stat-pill-sub">
                {{ heroData.hero.wins }}W - {{ heroData.hero.losses }}L
              </span>
            </div>

            <div class="stat-pill-card">
              <span class="stat-pill-label">Overall KAD</span>
              <span class="stat-pill-val val-kda">{{ heroData.hero.overallKda.toFixed(2) }}</span>
              <span class="stat-pill-sub">{{ heroData.hero.totalMatches }} Games</span>
            </div>

            <div class="stat-pill-card">
              <span class="stat-pill-label">Avg Hero Dmg</span>
              <span class="stat-pill-val">{{ formatNumber(heroData.hero.avgHeroDamage) }}</span>
              <span class="stat-pill-sub">Per Match</span>
            </div>

            <div class="stat-pill-card">
              <span class="stat-pill-label">Avg Heal / Dmg Taken</span>
              <span class="stat-pill-val">
                {{ formatNumber(heroData.hero.avgHealing || heroData.hero.avgDamageTaken) }}
              </span>
              <span class="stat-pill-sub">
                {{ heroData.hero.avgHealing ? 'Heal/Shield' : 'Dmg Taken' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Top Players Strip on this hero -->
        <div v-if="heroData.hero.topPlayers.length > 0" class="top-heroes-section">
          <span class="top-heroes-label">Most Active Players on {{ resolveHeroName(heroData.hero.canonicalName) }}:</span>
          <div class="top-heroes-chips">
            <div
              v-for="tp in heroData.hero.topPlayers"
              :key="tp.battleTag"
              class="top-hero-chip clickable-player-chip"
              :title="`View ${tp.name}'s matches on ${resolveHeroName(heroData.hero.canonicalName)}`"
              @click="navigateToTopPlayerHero(tp)"
            >
              <div class="mini-player-avatar">
                {{ tp.name.charAt(0).toUpperCase() }}
              </div>
              <span class="top-hero-name">{{ tp.name }}</span>
              <span class="top-hero-games">{{ tp.games }}g</span>
              <span
                class="top-hero-wr"
                :class="tp.winRatePct >= 50 ? 'wr-positive' : 'wr-negative'"
              >
                {{ tp.winRatePct }}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Match History List Section -->
      <div class="profile-matches-section card">
        <div class="matches-section-header">
          <div class="section-title-wrap">
            <h2>{{ resolveHeroName(heroData.hero.canonicalName) }} Match History</h2>
            <span class="count-badge">{{ filteredMatches.length }} matches</span>
          </div>

          <!-- Controls: Player Filter & Outcome Filter -->
          <div class="matches-filter-bar">
            <div class="filter-group">
              <label>Filter Player:</label>
              <input
                v-model="playerFilter"
                type="text"
                class="filter-hero-input"
                placeholder="Search player name..."
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

        <!-- Matches List -->
        <div v-if="filteredMatches.length === 0" class="empty-matches">
          <p>No matches match the selected filters.</p>
        </div>

        <div v-else class="matches-cards-list">
          <div
            v-for="m in filteredMatches"
            :key="`${m.replay_id}-${m.player_battle_tag}`"
            class="player-match-row hero-match-row"
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

            <!-- Player Column -->
            <div class="match-player-col" @click.stop="navigateToPlayerHero(m)">
              <div class="player-avatar-small">
                {{ m.player_name.charAt(0).toUpperCase() }}
              </div>
              <div class="player-meta-info">
                <span
                  class="player-name clickable-player-link"
                  :title="`View ${m.player_name}'s matches on ${resolveHeroName(m.hero)}`"
                >
                  {{ m.player_name }}
                </span>
                <span v-if="m.player_tag" class="player-subtag">#{{ m.player_tag }}</span>
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

            <!-- KDA Column -->
            <div class="match-kda-col">
              <div class="kda-counts">
                <span class="kda-kills">{{ m.solo_kills }}</span>
                <span class="kda-sep">/</span>
                <span class="kda-assists">{{ m.assists }}</span>
                <span class="kda-sep">/</span>
                <span class="kda-deaths">{{ m.deaths }}</span>
              </div>
              <div class="kda-ratio-badge">
                {{ m.kda.toFixed(1) }} KAD
              </div>
            </div>

            <!-- Performance Numbers Columns -->
            <div class="match-stats-cols">
              <div class="stat-col" title="Hero Damage">
                <span class="stat-col-label">Hero Dmg</span>
                <span class="stat-col-val text-red">{{ formatNumber(m.hero_damage) }}</span>
              </div>

              <div class="stat-col" title="Siege Damage">
                <span class="stat-col-label">Siege</span>
                <span class="stat-col-val text-orange">{{ formatNumber(m.siege_damage) }}</span>
              </div>

              <div class="stat-col" :title="m.healing ? 'Healing' : 'Damage Taken'">
                <span class="stat-col-label">{{ m.healing ? 'Heal' : 'Taken' }}</span>
                <span class="stat-col-val" :class="m.healing ? 'text-green' : 'text-purple'">
                  {{ formatNumber(m.healing ? (m.healing + m.self_healing) : m.damage_taken) }}
                </span>
              </div>

              <div class="stat-col" title="XP Contribution">
                <span class="stat-col-label">XP</span>
                <span class="stat-col-val text-blue">{{ formatNumber(m.xp_contribution) }}</span>
              </div>
            </div>

            <!-- Arrow Indicator -->
            <div class="match-arrow-col">
              <span>›</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hero-profile-view {
  padding-top: 1.5rem;
  padding-bottom: 3rem;
}

.profile-nav-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.btn-back {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 0.5rem 1rem;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-back:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--primary-accent);
}

.player-search-box {
  position: relative;
  width: 100%;
  max-width: 380px;
}

.search-icon {
  position: absolute;
  left: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.9rem;
  opacity: 0.6;
}

.player-search-input {
  width: 100%;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 0.5rem 0.75rem 0.5rem 2.25rem;
  color: var(--text-primary);
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.2s;
}

.player-search-input:focus {
  border-color: var(--primary-accent);
}

.player-search-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: 100;
  max-height: 280px;
  overflow-y: auto;
}

.search-result-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.6rem 0.85rem;
  cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.search-result-item:hover {
  background: var(--bg-hover);
}

.result-tag {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-primary);
}

.result-badge {
  font-size: 0.7rem;
  text-transform: uppercase;
  background: rgba(56, 189, 248, 0.15);
  color: var(--primary-accent);
  padding: 0.15rem 0.4rem;
  border-radius: var(--radius-sm);
  font-weight: 700;
}

.loading-card,
.error-card {
  padding: 3rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(56, 189, 248, 0.2);
  border-top-color: var(--primary-accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-icon {
  font-size: 2.5rem;
}

.profile-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.profile-header-card {
  padding: 1.75rem;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}

.profile-header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 2rem;
  flex-wrap: wrap;
}

.profile-identity {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.hero-avatar-circle {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid var(--primary-accent);
  box-shadow: 0 0 16px rgba(56, 189, 248, 0.35);
  flex-shrink: 0;
  background: #111827;
}

.hero-portrait-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.player-display-name {
  font-size: 2rem;
  font-weight: 800;
  margin: 0;
  color: var(--text-primary);
  line-height: 1.2;
}

.hero-scope-badge {
  margin: 0.35rem 0 0 0;
  font-size: 0.85rem;
  color: var(--primary-accent);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.profile-stat-pills {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.stat-pill-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  padding: 0.75rem 1.15rem;
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  min-width: 110px;
}

.stat-pill-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.stat-pill-val {
  font-size: 1.4rem;
  font-weight: 800;
  color: var(--text-primary);
  margin: 0.15rem 0;
}

.val-good {
  color: var(--accent-green);
}

.val-dim {
  color: var(--text-secondary);
}

.val-kda {
  color: var(--primary-accent);
}

.stat-pill-sub {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.top-heroes-section {
  margin-top: 1.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.top-heroes-label {
  font-size: 0.85rem;
  color: var(--text-secondary);
  font-weight: 600;
}

.top-heroes-chips {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.top-hero-chip {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 9999px;
  padding: 0.3rem 0.85rem 0.3rem 0.4rem;
  font-size: 0.85rem;
}

.clickable-player-chip {
  cursor: pointer;
  transition: all 0.2s;
}

.clickable-player-chip:hover {
  background: var(--bg-hover);
  border-color: var(--primary-accent);
  transform: translateY(-1px);
}

.mini-player-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: linear-gradient(135deg, #38bdf8, #818cf8);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}

.top-hero-name {
  font-weight: 600;
  color: var(--text-primary);
}

.top-hero-games {
  color: var(--text-secondary);
  font-size: 0.75rem;
}

.top-hero-wr {
  font-weight: 700;
  font-size: 0.75rem;
}

.wr-positive {
  color: var(--accent-green);
}

.wr-negative {
  color: var(--accent-red);
}

.profile-matches-section {
  padding: 1.5rem;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}

.matches-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1.5rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
}

.section-title-wrap {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.section-title-wrap h2 {
  font-size: 1.4rem;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary);
}

.count-badge {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-secondary);
  font-size: 0.8rem;
  padding: 0.2rem 0.5rem;
  border-radius: var(--radius-sm);
  font-weight: 600;
}

.matches-filter-bar {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.filter-group label {
  font-size: 0.85rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.filter-hero-input {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 0.4rem 0.75rem;
  color: var(--text-primary);
  font-size: 0.85rem;
  outline: none;
  min-width: 160px;
}

.filter-hero-input:focus {
  border-color: var(--primary-accent);
}

.outcome-toggle-btns {
  display: flex;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.toggle-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  padding: 0.4rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.toggle-btn.active {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.toggle-btn.toggle-win.active {
  background: rgba(34, 197, 94, 0.2);
  color: var(--accent-green);
}

.toggle-btn.toggle-loss.active {
  background: rgba(239, 68, 68, 0.2);
  color: var(--accent-red);
}

.empty-matches {
  padding: 2.5rem;
  text-align: center;
  color: var(--text-muted);
}

.matches-cards-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.player-match-row {
  display: grid;
  grid-template-columns: 100px 150px 140px auto 120px 240px 30px;
  align-items: center;
  gap: 0.75rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 0.65rem 1rem;
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
  overflow: hidden;
}

.player-match-row::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
}

.row-victory::before {
  background: var(--accent-green);
}

.row-defeat::before {
  background: var(--accent-red);
}

.player-match-row:hover {
  background: var(--bg-hover);
  transform: translateX(2px);
}

.match-result-col {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.outcome-pill {
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  padding: 0.2rem 0.5rem;
  border-radius: var(--radius-sm);
  display: inline-block;
  width: fit-content;
}

.outcome-win {
  background: rgba(34, 197, 94, 0.15);
  color: var(--accent-green);
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.outcome-loss {
  background: rgba(239, 68, 68, 0.15);
  color: var(--accent-red);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.match-time-rel {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.match-map-col {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.map-thumb {
  width: 38px;
  height: 38px;
  border-radius: var(--radius-sm);
  object-fit: cover;
  border: 1px solid var(--border-color);
}

.map-meta {
  display: flex;
  flex-direction: column;
}

.map-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100px;
}

.map-duration {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.match-player-col {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  padding: 0.2rem 0.4rem;
  border-radius: var(--radius-sm);
  transition: background 0.15s;
}

.match-player-col:hover {
  background: rgba(56, 189, 248, 0.12);
}

.player-avatar-small {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, #38bdf8, #818cf8);
  color: #fff;
  font-size: 0.8rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.player-meta-info {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.clickable-player-link {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--primary-accent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.clickable-player-link:hover {
  text-decoration: underline;
}

.player-subtag {
  font-size: 0.7rem;
  color: var(--text-muted);
}

.match-talents-col {
  display: flex;
  align-items: center;
}

.talents-strip {
  display: flex;
  gap: 4px;
}

.talent-slot {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: transform 0.15s, border-color 0.15s;
  cursor: pointer;
}

.talent-slot:hover {
  transform: scale(1.15);
  border-color: var(--primary-accent);
  z-index: 2;
}

.talent-icon-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.talent-empty-tier {
  font-size: 0.7rem;
  color: var(--text-muted);
  font-weight: 600;
}

.match-kda-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
}

.kda-counts {
  font-size: 0.85rem;
  font-weight: 700;
}

.kda-kills {
  color: var(--accent-green);
}

.kda-assists {
  color: var(--primary-accent);
}

.kda-deaths {
  color: var(--accent-red);
}

.kda-sep {
  color: var(--text-muted);
  margin: 0 0.2rem;
  font-weight: 400;
}

.kda-ratio-badge {
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-weight: 600;
}

.match-stats-cols {
  display: flex;
  gap: 0.85rem;
  justify-content: flex-end;
}

.stat-col {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 48px;
}

.stat-col-label {
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
}

.stat-col-val {
  font-size: 0.8rem;
  font-weight: 700;
}

.text-red {
  color: #f87171;
}

.text-orange {
  color: #fb923c;
}

.text-green {
  color: #4ade80;
}

.text-purple {
  color: #c084fc;
}

.text-blue {
  color: #38bdf8;
}

.match-arrow-col {
  font-size: 1.25rem;
  color: var(--text-muted);
  text-align: right;
}

/* Tooltip Styles */
.talent-floating-tooltip {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid var(--border-color);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  border-radius: var(--radius-md);
  padding: 0.85rem;
  max-width: 320px;
  backdrop-filter: blur(8px);
}

.tooltip-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.tooltip-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--primary-accent);
}

.tooltip-title-col {
  display: flex;
  flex-direction: column;
}

.tooltip-name {
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--text-primary);
}

.tooltip-meta {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  margin-top: 0.15rem;
}

.tooltip-level {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.tooltip-type-badge {
  font-size: 0.7rem;
  padding: 0.1rem 0.35rem;
  border-radius: var(--radius-sm);
  font-weight: 700;
  text-transform: uppercase;
}

.type-q { background: #3b82f6; color: #fff; }
.type-w { background: #10b981; color: #fff; }
.type-e { background: #f59e0b; color: #fff; }
.type-heroic { background: #8b5cf6; color: #fff; }
.type-trait { background: #ec4899; color: #fff; }
.type-active { background: #06b6d4; color: #fff; }
.type-passive { background: #64748b; color: #fff; }

.tooltip-desc {
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--text-secondary);
}

.tooltip-empty {
  padding: 0.25rem;
}

.tooltip-desc-empty {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 0.25rem;
}

@media (max-width: 1024px) {
  .player-match-row {
    grid-template-columns: 80px 120px 120px auto 100px 30px;
  }
  .match-stats-cols {
    display: none;
  }
}

@media (max-width: 768px) {
  .player-match-row {
    grid-template-columns: 1fr;
    gap: 0.5rem;
  }
  .match-arrow-col {
    display: none;
  }
}
</style>

