<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { ReplaySummary, ReplaysApiResponse } from '../types'
import { formatDuration, formatDateRelative, getHeroImageUrl, getMapImageUrl } from '../utils/hots'

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
              <img
                v-for="(hero, i) in match.heroes.slice(0, 5)"
                :key="i"
                :src="getHeroImageUrl(hero)"
                :alt="hero"
                :title="hero"
                class="hero-avatar"
              />
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
              <img
                v-for="(hero, i) in match.heroes.slice(5, 10)"
                :key="i"
                :src="getHeroImageUrl(hero)"
                :alt="hero"
                :title="hero"
                class="hero-avatar"
              />
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
