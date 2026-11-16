<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import type { LeaderboardPlayer } from '../types'
import { formatNumber } from '../utils/hots'

const router = useRouter()
const players = ref<LeaderboardPlayer[]>([])
const loading = ref(true)
const search = ref('')
const minGames = ref(3)

type SortKey =
  | 'games_played'
  | 'wins'
  | 'losses'
  | 'win_rate_pct'
  | 'overall_kda'
  | 'avg_hero_damage'
  | 'avg_healing'
  | 'avg_siege_damage'
  | 'total_bsteps'
  | 'total_sprays'
  | 'total_taunts'
  | 'total_dances'
  | 'total_voice_lines'
  | 'total_bm'

const sortColumn = ref<SortKey>('games_played')
const sortAsc = ref(false)

async function fetchLeaderboard() {
  loading.value = true
  try {
    const res = await fetch('/api/leaderboard')
    const text = await res.text()
    const data: { players: LeaderboardPlayer[] } = JSON.parse(text)
    players.value = data.players || []
  } catch (err) {
    console.error('Failed to load leaderboard:', err)
  } finally {
    loading.value = false
  }
}

function setSort(col: SortKey) {
  if (sortColumn.value === col) {
    sortAsc.value = !sortAsc.value
  } else {
    sortColumn.value = col
    sortAsc.value = false
  }
}

function getTotalBm(p: LeaderboardPlayer): number {
  return (
    (p.total_bsteps || 0) +
    (p.total_sprays || 0) +
    (p.total_taunts || 0) +
    (p.total_dances || 0) +
    (p.total_voice_lines || 0)
  )
}

function getSortValue(p: LeaderboardPlayer, key: SortKey): number {
  if (key === 'total_bm') {
    return getTotalBm(p)
  }
  return p[key] ?? 0
}

const filteredPlayers = computed(() => {
  let list = players.value.filter((p) => p.games_played >= minGames.value)

  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase()
    list = list.filter((p) => p.player_name.toLowerCase().includes(q))
  }

  return list.sort((a, b) => {
    const valA = getSortValue(a, sortColumn.value)
    const valB = getSortValue(b, sortColumn.value)
    if (valA < valB) return sortAsc.value ? -1 : 1
    if (valA > valB) return sortAsc.value ? 1 : -1
    return 0
  })
})

function getRankBadge(idx: number): string {
  if (idx === 0) return '🥇'
  if (idx === 1) return '🥈'
  if (idx === 2) return '🥉'
  return `#${idx + 1}`
}

function viewPlayerMatches(player: LeaderboardPlayer) {
  if (player.row_id) {
    router.push(`/player/${player.row_id}`)
  } else {
    router.push(`/player/${encodeURIComponent(player.player_name)}`)
  }
}

onMounted(() => {
  fetchLeaderboard()
})
</script>

<template>
  <div class="container leaderboard-container">
    <div class="leaderboard-header">
      <div>
        <h1 class="page-title">Player Leaderboard</h1>
        <p class="page-subtitle">Track custom game rankings, win rates, and combat stats</p>
      </div>

      <div class="filter-bar">
        <input
          v-model="search"
          type="text"
          placeholder="Search player name..."
          class="input-field search-input"
        />

        <select v-model="minGames" class="input-field min-games-select">
          <option :value="1">Min 1 Game</option>
          <option :value="3">Min 3 Games</option>
          <option :value="5">Min 5 Games</option>
          <option :value="10">Min 10 Games</option>
          <option :value="20">Min 20 Games</option>
        </select>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Calculating leaderboard standings...</p>
    </div>

    <!-- Empty -->
    <div v-else-if="filteredPlayers.length === 0" class="empty-state card">
      <span class="empty-icon">🏆</span>
      <h3>No players meet the filter criteria</h3>
      <p>Try reducing the minimum games filter</p>
    </div>

    <!-- Leaderboard Table -->
    <div v-else class="table-container card leaderboard-table-container">
      <table class="leaderboard-table">
        <thead>
          <tr>
            <th class="rank-col">Rank</th>
            <th>Player</th>
            <th class="sortable" @click="setSort('games_played')">
              Games {{ sortColumn === 'games_played' ? (sortAsc ? '▲' : '▼') : '' }}
            </th>
            <th class="wl-header-th">
              <div class="wl-header-wrap">
                <span
                  class="wl-clickable"
                  :class="{ active: sortColumn === 'wins' }"
                  title="Sort by Wins"
                  @click="setSort('wins')"
                >
                  W{{ sortColumn === 'wins' ? (sortAsc ? ' ▲' : ' ▼') : '' }}
                </span>
                <span class="wl-sep">-</span>
                <span
                  class="wl-clickable"
                  :class="{ active: sortColumn === 'losses' }"
                  title="Sort by Losses"
                  @click="setSort('losses')"
                >
                  L{{ sortColumn === 'losses' ? (sortAsc ? ' ▲' : ' ▼') : '' }}
                </span>
              </div>
            </th>
            <th class="sortable" @click="setSort('win_rate_pct')">
              Win Rate {{ sortColumn === 'win_rate_pct' ? (sortAsc ? '▲' : '▼') : '' }}
            </th>
            <th class="sortable" @click="setSort('overall_kda')">
              KDA {{ sortColumn === 'overall_kda' ? (sortAsc ? '▲' : '▼') : '' }}
            </th>
            <th class="sortable" @click="setSort('avg_hero_damage')">
              Avg Hero Dmg {{ sortColumn === 'avg_hero_damage' ? (sortAsc ? '▲' : '▼') : '' }}
            </th>
            <th class="sortable" @click="setSort('avg_healing')">
              Avg Heal {{ sortColumn === 'avg_healing' ? (sortAsc ? '▲' : '▼') : '' }}
            </th>
            <th class="sortable" @click="setSort('avg_siege_damage')">
              Avg Siege {{ sortColumn === 'avg_siege_damage' ? (sortAsc ? '▲' : '▼') : '' }}
            </th>
            <th class="sortable" @click="setSort('total_bsteps')">
              B-Steps {{ sortColumn === 'total_bsteps' ? (sortAsc ? '▲' : '▼') : '' }}
            </th>
            <th class="sortable" @click="setSort('total_sprays')">
              Sprays {{ sortColumn === 'total_sprays' ? (sortAsc ? '▲' : '▼') : '' }}
            </th>
            <th class="sortable" @click="setSort('total_taunts')">
              Taunts {{ sortColumn === 'total_taunts' ? (sortAsc ? '▲' : '▼') : '' }}
            </th>
            <th class="sortable" @click="setSort('total_dances')">
              Dances {{ sortColumn === 'total_dances' ? (sortAsc ? '▲' : '▼') : '' }}
            </th>
            <th class="sortable" @click="setSort('total_voice_lines')">
              Voice {{ sortColumn === 'total_voice_lines' ? (sortAsc ? '▲' : '▼') : '' }}
            </th>
            <th class="sortable" @click="setSort('total_bm')">
              Total BM {{ sortColumn === 'total_bm' ? (sortAsc ? '▲' : '▼') : '' }}
            </th>
            <th>Recent 10</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(p, idx) in filteredPlayers"
            :key="p.toon_handle"
            class="player-row"
            @click="viewPlayerMatches(p)"
          >
            <!-- Rank -->
            <td class="rank-col">
              <span class="rank-badge" :class="{ 'top-three': idx < 3 }">
                {{ getRankBadge(idx) }}
              </span>
            </td>

            <!-- Player Name -->
            <td class="player-name-cell">
              <div class="player-name-wrapper">
                <span class="player-title">{{ p.player_name }}</span>
                <span class="view-matches-hint">View Matches →</span>
              </div>
            </td>

            <!-- Games -->
            <td class="num-cell bold-cell">{{ p.games_played }}</td>

            <!-- W - L -->
            <td class="num-cell">
              <span class="text-green">{{ p.wins }}W</span> - 
              <span class="text-red">{{ p.losses }}L</span>
            </td>

            <!-- Win Rate -->
            <td>
              <div class="wr-cell">
                <span
                  class="badge"
                  :class="p.win_rate_pct >= 50 ? 'badge-win' : 'badge-loss'"
                >
                  {{ p.win_rate_pct.toFixed(1) }}%
                </span>
              </div>
            </td>

            <!-- KDA -->
            <td class="num-cell bold-cell">{{ p.overall_kda.toFixed(2) }}</td>

            <!-- Avg Hero Dmg -->
            <td class="num-cell">{{ formatNumber(p.avg_hero_damage) }}</td>

            <!-- Avg Heal -->
            <td class="num-cell">{{ formatNumber(p.avg_healing) }}</td>

            <!-- Avg Siege -->
            <td class="num-cell">{{ formatNumber(p.avg_siege_damage) }}</td>

            <!-- B-Steps -->
            <td class="bm-cell">
              <span v-if="p.total_bsteps > 0" class="bm-tag">👟 {{ p.total_bsteps }}</span>
              <span v-else class="text-dim">-</span>
            </td>

            <!-- Sprays -->
            <td class="bm-cell">
              <span v-if="p.total_sprays > 0" class="bm-tag">🎨 {{ p.total_sprays }}</span>
              <span v-else class="text-dim">-</span>
            </td>

            <!-- Taunts -->
            <td class="bm-cell">
              <span v-if="p.total_taunts > 0" class="bm-tag">🗣️ {{ p.total_taunts }}</span>
              <span v-else class="text-dim">-</span>
            </td>

            <!-- Dances -->
            <td class="bm-cell">
              <span v-if="p.total_dances > 0" class="bm-tag">💃 {{ p.total_dances }}</span>
              <span v-else class="text-dim">-</span>
            </td>

            <!-- Voice -->
            <td class="bm-cell">
              <span v-if="(p.total_voice_lines ?? 0) > 0" class="bm-tag">🎙️ {{ p.total_voice_lines }}</span>
              <span v-else class="text-dim">-</span>
            </td>

            <!-- Total BM -->
            <td class="bm-cell">
              <span v-if="getTotalBm(p) > 0" class="bm-tag bm-total-tag">🔥 {{ getTotalBm(p) }}</span>
              <span v-else class="text-dim">-</span>
            </td>

            <!-- Recent 10 -->
            <td>
              <span
                v-if="p.recent_10_win_rate_pct !== undefined && p.recent_10_win_rate_pct !== null"
                class="badge"
                :class="p.recent_10_win_rate_pct >= 50 ? 'badge-win' : 'badge-loss'"
              >
                {{ p.recent_10_win_rate_pct.toFixed(0) }}%
              </span>
              <span v-else class="text-dim">-</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.leaderboard-header {
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
  min-width: 220px;
}

.min-games-select {
  min-width: 140px;
}

.leaderboard-table {
  padding: 0;
}

.player-row {
  cursor: pointer;
  transition: background 0.15s ease, transform 0.1s ease;
}

.player-row:hover {
  background: var(--bg-surface-elevated);
}

.player-row:hover .view-matches-hint {
  opacity: 1;
  transform: translateX(0);
}

.rank-col {
  width: 70px;
  text-align: center;
}

.rank-badge {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--text-dim);
}

.rank-badge.top-three {
  font-size: 1.25rem;
}

.player-name-wrapper {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.player-title {
  font-weight: 700;
  color: var(--text-main);
  font-size: 0.95rem;
}

.view-matches-hint {
  font-size: 0.75rem;
  color: var(--accent-cyan);
  opacity: 0;
  transform: translateX(-4px);
  transition: all 0.2s ease;
  font-weight: 600;
}

.num-cell {
  font-family: var(--font-mono);
  font-size: 0.85rem;
}

.bold-cell {
  font-weight: 700;
  color: #fff;
}

.text-green {
  color: var(--accent-green);
  font-weight: 600;
}

.text-red {
  color: var(--accent-red);
  font-weight: 600;
}

.wr-cell {
  display: flex;
  align-items: center;
}

.leaderboard-container {
  max-width: none;
  width: 100%;
  padding-left: 2rem;
  padding-right: 2rem;
}

.leaderboard-table-container {
  overflow: visible;
  width: 100%;
}

.leaderboard-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

.leaderboard-table thead th {
  position: sticky;
  top: 64px;
  z-index: 20;
  background: var(--bg-surface-elevated);
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.leaderboard-table thead tr th:first-child {
  border-top-left-radius: var(--radius-lg);
}

.leaderboard-table thead tr th:last-child {
  border-top-right-radius: var(--radius-lg);
}

.leaderboard-table tbody tr:last-child td:first-child {
  border-bottom-left-radius: var(--radius-lg);
}

.leaderboard-table tbody tr:last-child td:last-child {
  border-bottom-right-radius: var(--radius-lg);
}

.wl-header-th {
  user-select: none;
}

.wl-header-wrap {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.wl-clickable {
  cursor: pointer;
  padding: 0.15rem 0.4rem;
  border-radius: var(--radius-sm);
  transition: all 0.15s ease;
  font-weight: 700;
}

.wl-clickable:hover {
  background: var(--bg-surface-hover);
  color: #fff;
}

.wl-clickable.active {
  color: var(--accent-cyan);
  background: rgba(56, 189, 248, 0.15);
}

.wl-sep {
  color: var(--text-dim);
  opacity: 0.5;
}

.bm-cell {
  white-space: nowrap;
}

.bm-total-tag {
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.35);
  color: #fbbf24;
  font-weight: 700;
}
</style>

