<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { ReplaySummary, ReplaysApiResponse } from '../types'
import {
  formatDuration,
  formatDateRelative,
  getHeroImageUrl,
  getMapImageUrl,
  resolveHeroName,
} from '../utils/hots'

const router = useRouter()
const replays = ref<ReplaySummary[]>([])
const loading = ref(true)
const page = ref(1)
const totalPages = ref(1)
const total = ref(0)
const search = ref('')
const selectedMap = ref('')

const availableMaps = [
  'Alterac Pass',
  'Battlefield of Eternity',
  'Blackheart\'s Bay',
  'Braxis Holdout',
  'Cursed Hollow',
  'Dragon Shire',
  'Garden of Terror',
  'Hanamura Temple',
  'Infernal Shrines',
  'Sky Temple',
  'Tomb of the Spider Queen',
  'Towers of Doom',
  'Volskaya Foundry',
  'Warhead Junction',
]

let searchTimeout: ReturnType<typeof setTimeout> | null = null

async function fetchReplays() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    params.set('page', page.value.toString())
    params.set('limit', '15')
    if (search.value.trim()) params.set('search', search.value.trim())
    if (selectedMap.value) params.set('map', selectedMap.value)

    const res = await fetch(`/api/replays?${params.toString()}`)
    const text = await res.text()
    const data: ReplaysApiResponse = JSON.parse(text)
    replays.value = data.replays
    totalPages.value = data.pagination.totalPages
    total.value = data.pagination.total
  } catch (err) {
    console.error('Failed to load replays:', err)
  } finally {
    loading.value = false
  }
}

function onSearchInput() {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    page.value = 1
    fetchReplays()
  }, 350)
}

function onMapChange() {
  page.value = 1
  fetchReplays()
}

function goToPage(newPage: number) {
  if (newPage < 1 || newPage > totalPages.value) return
  page.value = newPage
  fetchReplays()
}

function hideBrokenImage(event: Event) {
  const target = event.target
  if (target instanceof HTMLImageElement) {
    target.style.display = 'none'
  }
}

function openMatch(id: number) {
  router.push(`/replay/${id}`)
}

interface TeamMemberInfo {
  hero: string
  player: string
  playerName: string
  playerTag: string
}

function parsePlayerEntry(raw: string, fallbackHero?: string): TeamMemberInfo {
  const trimmed = raw.trim()
  const match = trimmed.match(/^(.+?)\s*\((.+?)\)$/)
  let playerStr = trimmed
  let heroName = fallbackHero || 'Unknown'

  if (match) {
    playerStr = match[1].trim()
    heroName = match[2].trim()
  }

  const [name, tag] = playerStr.split('#')
  return {
    hero: heroName,
    player: playerStr,
    playerName: name || playerStr,
    playerTag: tag ? `#${tag}` : '',
  }
}

function getTeamMembers(match: ReplaySummary, teamIndex: 0 | 1): TeamMemberInfo[] {
  const playersList = teamIndex === 0 ? match.team0_players : match.team1_players
  if (Array.isArray(playersList) && playersList.length > 0) {
    return playersList.map((p, idx) => {
      const fallbackHero = teamIndex === 0 ? match.heroes[idx] : match.heroes[idx + 5]
      return parsePlayerEntry(p, fallbackHero)
    })
  }

  const startIdx = teamIndex === 0 ? 0 : 5
  return match.heroes.slice(startIdx, startIdx + 5).map(h => ({
    hero: h,
    player: 'Unknown Player',
    playerName: 'Unknown Player',
    playerTag: '',
  }))
}

// Tooltip State
interface ActiveHeroTooltipState {
  visible: boolean
  member: TeamMemberInfo | null
  team: string
  isWinner: boolean
  x: number
  y: number
}

const activeHeroTooltip = ref<ActiveHeroTooltipState>({
  visible: false,
  member: null,
  team: '',
  isWinner: false,
  x: 0,
  y: 0,
})

function showHeroTooltip(event: MouseEvent, member: TeamMemberInfo, team: string, isWinner: boolean) {
  activeHeroTooltip.value = {
    visible: true,
    member,
    team,
    isWinner,
    x: event.clientX,
    y: event.clientY,
  }
}

function updateTooltipPosition(event: MouseEvent) {
  activeHeroTooltip.value.x = event.clientX
  activeHeroTooltip.value.y = event.clientY
}

function hideHeroTooltip() {
  activeHeroTooltip.value.visible = false
}

const tooltipStyle = computed(() => {
  const padding = 16
  const tooltipWidth = 260
  const tooltipHeight = 110
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 1080

  let left = activeHeroTooltip.value.x + 14
  let top = activeHeroTooltip.value.y + 14

  if (left + tooltipWidth > viewportWidth - padding) {
    left = Math.max(padding, activeHeroTooltip.value.x - tooltipWidth - 14)
  }

  if (top + tooltipHeight > viewportHeight - padding) {
    top = Math.max(padding, activeHeroTooltip.value.y - tooltipHeight - 14)
  }

  return {
    left: `${left}px`,
    top: `${top}px`,
  }
})

onMounted(() => {
  fetchReplays()
})
</script>

<template>
  <div class="container">
    <div class="matches-header">
      <div>
        <h1 class="page-title">Match History</h1>
        <p class="page-subtitle">Showing {{ total }} custom games recorded</p>
      </div>

      <div class="filter-bar">
        <input
          v-model="search"
          type="text"
          placeholder="Search player or hero..."
          class="input-field search-input"
          @input="onSearchInput"
        />

        <select v-model="selectedMap" class="input-field map-select" @change="onMapChange">
          <option value="">All Battlegrounds</option>
          <option v-for="map in availableMaps" :key="map" :value="map">{{ map }}</option>
        </select>
      </div>
    </div>

    <!-- Loading Skeleton -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Loading matches from the Nexus...</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="replays.length === 0" class="empty-state card">
      <span class="empty-icon">🛡️</span>
      <h3>No matches found</h3>
      <p>Try adjusting your search filters</p>
    </div>

    <!-- Match Cards List -->
    <div v-else class="matches-list">
      <div
        v-for="match in replays"
        :key="match.id"
        class="match-card card"
        @click="openMatch(match.id)"
      >
        <!-- Map Banner / Info -->
        <div class="map-thumb-wrapper">
          <img
            :src="getMapImageUrl(match.map)"
            :alt="match.map"
            class="map-thumb"
            @error="hideBrokenImage"
          />
          <div class="map-overlay"></div>
          <div class="map-text">
            <span class="map-name">{{ match.map }}</span>
            <span class="match-meta">#{{ match.id }} • {{ formatDuration(match.length) }}</span>
          </div>
        </div>

        <!-- Teams Display -->
        <div class="teams-versus">
          <!-- Team 0 (Blue) -->
          <div class="team-side" :class="{ 'team-winner': match.winner === 0 }">
            <div class="team-header-row">
              <span class="team-pill pill-blue">Blue Team</span>
              <span v-if="match.winner === 0" class="badge badge-win">Victory 🏆</span>
              <span class="score-pill">{{ match.team0_takedowns }} Kills</span>
            </div>
            <div class="hero-icons-row">
              <div
                v-for="(member, i) in getTeamMembers(match, 0)"
                :key="i"
                class="hero-avatar-wrapper"
                @mouseenter.stop="showHeroTooltip($event, member, 'Blue Team', match.winner === 0)"
                @mousemove.stop="updateTooltipPosition"
                @mouseleave.stop="hideHeroTooltip"
              >
                <img
                  :src="getHeroImageUrl(member.hero)"
                  :alt="member.hero"
                  class="hero-avatar"
                  @error="hideBrokenImage"
                />
              </div>
            </div>
            <div class="players-subtext">
              {{ match.team0_players.join(', ') }}
            </div>
          </div>

          <div class="versus-divider">
            <span class="vs-text">VS</span>
            <span class="date-text">{{ formatDateRelative(match.date) }}</span>
          </div>

          <!-- Team 1 (Red) -->
          <div class="team-side" :class="{ 'team-winner': match.winner === 1 }">
            <div class="team-header-row">
              <span class="team-pill pill-red">Red Team</span>
              <span v-if="match.winner === 1" class="badge badge-win">Victory 🏆</span>
              <span class="score-pill">{{ match.team1_takedowns }} Kills</span>
            </div>
            <div class="hero-icons-row">
              <div
                v-for="(member, i) in getTeamMembers(match, 1)"
                :key="i"
                class="hero-avatar-wrapper"
                @mouseenter.stop="showHeroTooltip($event, member, 'Red Team', match.winner === 1)"
                @mousemove.stop="updateTooltipPosition"
                @mouseleave.stop="hideHeroTooltip"
              >
                <img
                  :src="getHeroImageUrl(member.hero)"
                  :alt="member.hero"
                  class="hero-avatar"
                  @error="hideBrokenImage"
                />
              </div>
            </div>
            <div class="players-subtext">
              {{ match.team1_players.join(', ') }}
            </div>
          </div>
        </div>

        <div class="view-match-action">
          <span class="arrow-btn">View Stats →</span>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="pagination-bar">
      <button :disabled="page <= 1" class="btn" @click="goToPage(page - 1)">
        ← Previous
      </button>
      <span class="page-indicator">Page {{ page }} of {{ totalPages }}</span>
      <button :disabled="page >= totalPages" class="btn" @click="goToPage(page + 1)">
        Next →
      </button>
    </div>

    <!-- Beautiful Floating Hero & Player Tooltip -->
    <Teleport to="body">
      <div
        v-if="activeHeroTooltip.visible && activeHeroTooltip.member"
        class="match-hero-tooltip"
        :style="tooltipStyle"
      >
        <div class="tooltip-header">
          <img
            :src="getHeroImageUrl(activeHeroTooltip.member.hero)"
            :alt="activeHeroTooltip.member.hero"
            class="tooltip-hero-avatar"
            @error="hideBrokenImage"
          />
          <div class="tooltip-title-wrap">
            <span class="tooltip-hero-name">{{ resolveHeroName(activeHeroTooltip.member.hero) }}</span>
            <div class="tooltip-player-line">
              <span class="tooltip-played-by">Played by</span>
              <span class="tooltip-player-name">
                {{ activeHeroTooltip.member.playerName }}<span v-if="activeHeroTooltip.member.playerTag" class="tooltip-player-tag">{{ activeHeroTooltip.member.playerTag }}</span>
              </span>
            </div>
          </div>
        </div>

        <div class="tooltip-footer">
          <span
            class="tooltip-team-tag"
            :class="activeHeroTooltip.team === 'Blue Team' ? 'tag-blue' : 'tag-red'"
          >
            {{ activeHeroTooltip.team }}
          </span>
          <span
            class="tooltip-outcome-tag"
            :class="activeHeroTooltip.isWinner ? 'outcome-win' : 'outcome-loss'"
          >
            {{ activeHeroTooltip.isWinner ? 'Victory 🏆' : 'Defeat' }}
          </span>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.matches-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  gap: 1.25rem;
}

.page-title {
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.page-subtitle {
  color: var(--text-muted);
  font-size: 0.95rem;
}

.filter-bar {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.search-input {
  min-width: 240px;
}

.map-select {
  min-width: 180px;
}

.matches-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.match-card {
  display: grid;
  grid-template-columns: 200px 1fr 120px;
  align-items: center;
  gap: 1.5rem;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  padding: 0;
}

.match-card:hover {
  transform: translateY(-2px);
  border-color: rgba(99, 102, 241, 0.5);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}

.map-thumb-wrapper {
  position: relative;
  height: 100%;
  min-height: 110px;
  background: #1e293b;
  overflow: hidden;
}

.map-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s ease;
}

.match-card:hover .map-thumb {
  transform: scale(1.06);
}

.map-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to right, rgba(10, 14, 23, 0.3), rgba(17, 23, 38, 0.95));
}

.map-text {
  position: absolute;
  inset: 0;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.map-name {
  font-weight: 700;
  font-size: 1rem;
  color: #fff;
  text-shadow: 0 2px 4px rgba(0,0,0,0.8);
}

.match-meta {
  font-size: 0.8rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.teams-versus {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 1.5rem;
  padding: 1rem 0;
}

.team-side {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.team-header-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.team-pill {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: var(--radius-full);
}

.pill-blue {
  background: var(--team-0-bg);
  color: var(--team-0);
  border: 1px solid var(--team-0-border);
}

.pill-red {
  background: var(--team-1-bg);
  color: var(--team-1);
  border: 1px solid var(--team-1-border);
}

.score-pill {
  font-size: 0.75rem;
  font-weight: 600;
  font-family: var(--font-mono);
  color: var(--text-dim);
}

.hero-icons-row {
  display: flex;
  gap: 0.4rem;
}

.players-subtext {
  font-size: 0.75rem;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 280px;
}

.versus-divider {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
}

.vs-text {
  font-weight: 800;
  font-size: 0.85rem;
  color: var(--text-dim);
  background: var(--bg-surface-elevated);
  padding: 0.2rem 0.6rem;
  border-radius: var(--radius-full);
}

.date-text {
  font-size: 0.75rem;
  color: var(--text-dim);
}

.view-match-action {
  padding-right: 1.5rem;
  text-align: right;
}

.arrow-btn {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--accent-cyan);
  transition: transform 0.2s ease;
  display: inline-block;
}

.match-card:hover .arrow-btn {
  transform: translateX(4px);
}

.loading-state, .empty-state {
  text-align: center;
  padding: 4rem 2rem;
  color: var(--text-muted);
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(56, 189, 248, 0.2);
  border-top-color: var(--accent-cyan);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.pagination-bar {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1.5rem;
  margin-top: 2rem;
}

.page-indicator {
  font-size: 0.9rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.hero-avatar-wrapper {
  position: relative;
  display: inline-flex;
}

.hero-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--border-subtle);
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  cursor: pointer;
}

.hero-avatar:hover {
  transform: scale(1.15);
  border-color: var(--accent-cyan);
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.45);
  z-index: 2;
}

/* Custom Floating Hero & Player Tooltip */
.match-hero-tooltip {
  position: fixed;
  z-index: 99999;
  pointer-events: none;
  background: rgba(13, 20, 36, 0.96);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: var(--radius-md);
  padding: 0.65rem 0.85rem;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.8), 0 0 15px rgba(56, 189, 248, 0.2);
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-width: 200px;
  max-width: 280px;
  animation: tooltipFadeIn 0.12s ease-out;
}

@keyframes tooltipFadeIn {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.tooltip-header {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.tooltip-hero-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--accent-cyan);
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.4);
  flex-shrink: 0;
}

.tooltip-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.tooltip-hero-name {
  font-size: 0.95rem;
  font-weight: 800;
  color: #fff;
  line-height: 1.2;
}

.tooltip-player-line {
  font-size: 0.75rem;
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
  white-space: nowrap;
}

.tooltip-played-by {
  color: var(--text-muted);
}

.tooltip-player-name {
  color: #38bdf8;
  font-weight: 600;
}

.tooltip-player-tag {
  color: #94a3b8;
  font-size: 0.7rem;
}

.tooltip-footer {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 0.4rem;
}

.tooltip-team-tag {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 0.15rem 0.45rem;
  border-radius: var(--radius-sm);
  letter-spacing: 0.03em;
}

.tag-blue {
  background: rgba(14, 165, 233, 0.2);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.tag-red {
  background: rgba(244, 63, 94, 0.2);
  color: #fb7185;
  border: 1px solid rgba(251, 113, 133, 0.3);
}

.tooltip-outcome-tag {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.15rem 0.45rem;
  border-radius: var(--radius-sm);
}

.outcome-win {
  background: rgba(16, 185, 129, 0.18);
  color: #34d399;
  border: 1px solid rgba(52, 211, 153, 0.3);
}

.outcome-loss {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(248, 113, 113, 0.25);
}

@media (max-width: 900px) {
  .match-card {
    grid-template-columns: 1fr;
  }
  .teams-versus {
    grid-template-columns: 1fr;
    padding: 1rem 1.25rem;
  }
  .view-match-action {
    display: none;
  }
}
</style>
