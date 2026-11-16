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
  | 'win_rate_pct'
  | 'overall_kda'
  | 'avg_hero_damage'
  | 'avg_healing'
  | 'avg_siege_damage'
  | 'total_bsteps'
  | 'total_sprays'

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

const filteredPlayers = computed(() => {
  let list = players.value.filter((p) => p.games_played >= minGames.value)

  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase()
    list = list.filter((p) => p.player_name.toLowerCase().includes(q))
  }

  return list.sort((a, b) => {
    const valA = a[sortColumn.value] ?? 0
    const valB = b[sortColumn.value] ?? 0
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

function viewPlayerMatches(playerName: string) {
  router.push({ path: '/matches', query: { search: playerName } })
}

onMounted(() => {
  fetchLeaderboard()
})
</script>

<template>
  <div class="container">
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
    <div v-else class="table-container card">
      <table class="leaderboard-table">
        <thead>
          <tr>
            <th class="rank-col">Rank</th>
            <th>Player</th>
            <th class="sortable" @click="setSort('games_played')">
              Games {{ sortColumn === 'games_played' ? (sortAsc ? '▲' : '▼') : '' }}
            </th>
            <th>W - L</th>
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
            <th>Recent 10</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(p, idx) in filteredPlayers"
            :key="p.toon_handle"
            class="player-row"
            @click="viewPlayerMatches(p.player_name)"
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

.bm-cell {
  white-space: nowrap;
}
</style>

