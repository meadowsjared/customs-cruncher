<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import type { LeaderboardPlayer } from '../types'
import { formatNumber } from '../utils/hots'

interface TargetQuery {
  type: 'rowId' | 'battleTag' | 'any'
  value: string
}

const router = useRouter()
const route = useRoute()
const players = ref<LeaderboardPlayer[]>([])
const loading = ref(true)
const search = ref('')
const minGames = ref(30)
const viewMode = ref<'showcase' | 'table'>('showcase')

function formatDeadTime(p: LeaderboardPlayer): string {
  const avg = p.avg_time_spent_dead || 0
  const totalSecs = Math.round(avg * p.games_played)
  if (totalSecs < 60) return `${totalSecs}s`
  const totalMins = Math.round(totalSecs / 60)
  if (totalMins < 60) return `${totalMins} mins`
  const hours = (totalSecs / 3600).toFixed(1)
  return `${hours} hours`
}

function getPlayerRoastTitle(p: LeaderboardPlayer): string {
  const avgDeaths = p.avg_deaths || 0
  const wr = p.win_rate_pct || 0
  const totalBm = getTotalBm(p)
  const spongeRatio = (p.avg_damage_taken || 0) / Math.max(1, p.avg_hero_damage || 1)

  if (avgDeaths >= 4.0) return 'Professional Gray Screen Enthusiast 💀'
  if (spongeRatio >= 2.0) return 'Certified Damage Sponge 🧽'
  if (wr < 38) return 'Chief Charity Elo Contributor 📉'
  if (wr < 48) return 'Struggling Coinflip Veteran 🪙'
  if (totalBm >= 300) return 'BM Connoisseur, Objective Skeptic 💃'
  if (avgDeaths >= 3.0) return 'Cemetery Season Ticket Holder ⚰️'
  if (p.total_bsteps === 0 && totalBm > 0) return 'All Spray, Zero B-Step 🎨'
  return 'Tactical Feeder in Disguise 🎯'
}

function getDamageSpongeRatio(p: LeaderboardPlayer): string {
  const dealt = Math.max(1, p.avg_hero_damage || 0)
  const taken = p.avg_damage_taken || 0
  return (taken / dealt).toFixed(1)
}

function getBmCommentary(p: LeaderboardPlayer): string {
  const total = getTotalBm(p)
  if (total === 0) return 'Completely BM-free. Playing like an NPC.'
  if (p.total_bsteps === 0 && p.total_sprays > 0)
    return 'Spraying without B-stepping — pure cowardly BM.'
  if (p.total_dances > 50) return 'Spends more time dancing in lane than soaking XP.'
  if (p.total_bsteps > 50) return 'Chronically B-stepping into enemy skillshots.'
  return 'Never misses an opportunity to BM right before dying.'
}

type SortKey =
  | 'player_name'
  | 'mmr'
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
  | 'recent_10_win_rate_pct'

const sortColumn = ref<SortKey>('games_played')
const sortAsc = ref(false)

const activeQuery = computed<TargetQuery | null>(() => {
  const qRowId = route.query.rowId || route.query.row_id
  if (typeof qRowId === 'string' && qRowId.trim()) {
    return { type: 'rowId', value: qRowId.trim() }
  }

  const qBattleTag =
    route.query.battleTag || route.query.battle_tag || route.query.battletag
  if (typeof qBattleTag === 'string' && qBattleTag.trim()) {
    return { type: 'battleTag', value: qBattleTag.trim() }
  }

  const qPlayer = route.query.player || route.query.q || route.query.search
  if (typeof qPlayer === 'string' && qPlayer.trim()) {
    return { type: 'any', value: qPlayer.trim() }
  }

  const paramId = route.params.identifier
  if (typeof paramId === 'string' && paramId.trim()) {
    return { type: 'any', value: decodeURIComponent(paramId).trim() }
  }

  return null
})

const hasRowIdMatch = computed(() => {
  const target = activeQuery.value
  if (!target) return false
  const valNum = /^\d+$/.test(target.value.trim()) ? parseInt(target.value.trim(), 10) : null
  if (valNum === null) return false
  return players.value.some(
    (p) => p.row_id === valNum || (p.all_row_ids && p.all_row_ids.includes(valNum))
  )
})

function matchesTarget(p: LeaderboardPlayer, target: TargetQuery): boolean {
  const val = target.value.trim()
  const valNorm = val.replace('-', '#').toLowerCase()
  const valNum = /^\d+$/.test(val) ? parseInt(val, 10) : null

  if (target.type === 'rowId') {
    if (valNum !== null) {
      return (
        p.row_id === valNum ||
        Boolean(p.all_row_ids && p.all_row_ids.includes(valNum))
      )
    }
    return false
  }

  if (target.type === 'battleTag') {
    if (
      p.hots_battle_tag &&
      (p.hots_battle_tag.toLowerCase() === valNorm ||
        p.hots_battle_tag.toLowerCase().includes(valNorm))
    ) {
      return true
    }
    if (
      p.all_battle_tags &&
      p.all_battle_tags.some(
        (t) =>
          t.toLowerCase() === valNorm || t.toLowerCase().includes(valNorm)
      )
    ) {
      return true
    }
    return false
  }

  // target.type === 'any'
  // If this numeric query matches player(s) by rowId, prioritize rowId match
  if (valNum !== null && hasRowIdMatch.value) {
    return (
      p.row_id === valNum ||
      Boolean(p.all_row_ids && p.all_row_ids.includes(valNum))
    )
  }

  // Exact matches
  if (p.hots_battle_tag && p.hots_battle_tag.toLowerCase() === valNorm) {
    return true
  }
  if (
    p.all_battle_tags &&
    p.all_battle_tags.some((t) => t.toLowerCase() === valNorm)
  ) {
    return true
  }
  if (p.player_name.toLowerCase() === valNorm) {
    return true
  }

  // Substring matches
  if (
    p.hots_battle_tag &&
    p.hots_battle_tag.toLowerCase().includes(valNorm)
  ) {
    return true
  }
  if (
    p.all_battle_tags &&
    p.all_battle_tags.some((t) => t.toLowerCase().includes(valNorm))
  ) {
    return true
  }
  if (p.player_name.toLowerCase().includes(valNorm)) {
    return true
  }

  return false
}

function matchesSearch(p: LeaderboardPlayer, q: string): boolean {
  if (!q) return true
  const qTrim = q.trim()
  const qNorm = qTrim.replace('-', '#').toLowerCase()
  const qNum = /^\d+$/.test(qTrim) ? parseInt(qTrim, 10) : null

  if (p.player_name.toLowerCase().includes(qNorm)) return true
  if (p.hots_battle_tag && p.hots_battle_tag.toLowerCase().includes(qNorm)) return true
  if (
    p.all_battle_tags &&
    p.all_battle_tags.some((t) => t.toLowerCase().includes(qNorm))
  ) {
    return true
  }
  if (qNum !== null) {
    if (p.row_id === qNum) return true
    if (p.all_row_ids && p.all_row_ids.includes(qNum)) return true
  }
  return false
}

const activeFilterPlayer = computed(() => {
  const target = activeQuery.value
  if (!target) return null
  return players.value.find((p) => matchesTarget(p, target)) || null
})

const activeFilterDescription = computed(() => {
  const target = activeQuery.value
  if (!target) return ''
  const p = activeFilterPlayer.value
  if (p) {
    const details: string[] = []
    if (p.hots_battle_tag) details.push(p.hots_battle_tag)
    if (p.row_id) details.push(`Row #${p.row_id}`)
    return details.length > 0 ? `${p.player_name} (${details.join(' · ')})` : p.player_name
  }
  if (target.type === 'rowId') {
    return `Row ID #${target.value}`
  }
  if (target.type === 'battleTag') {
    return `BattleTag "${target.value}"`
  }
  return `"${target.value}"`
})

function clearFilter() {
  search.value = ''
  router.push('/leaderboard')
}

async function fetchLeaderboard() {
  loading.value = true
  try {
    const res = await fetch(`/api/leaderboard?recent=${minGames.value}`)
    const text = await res.text()
    const data: { players: LeaderboardPlayer[] } = JSON.parse(text)
    players.value = data.players || []
  } catch (err) {
    console.error('Failed to load leaderboard:', err)
  } finally {
    loading.value = false
  }
}

watch(minGames, () => {
  fetchLeaderboard()
})

watch(
  [() => activeQuery.value, () => players.value],
  () => {
    if (activeQuery.value) {
      viewMode.value = 'showcase'
      if (players.value.length > 0) {
        const match = activeFilterPlayer.value
        if (match && match.games_played < minGames.value) {
          minGames.value = 1
        }
      }
    }
  },
  { immediate: true }
)

function setSort(col: SortKey) {
  if (sortColumn.value === col) {
    sortAsc.value = !sortAsc.value
  } else {
    sortColumn.value = col
    sortAsc.value = col === 'player_name' ? true : false
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
  if (key === 'mmr') {
    return p.mmr ?? 0
  }
  if (key === 'player_name') {
    return 0
  }
  return p[key] ?? 0
}

function getPlayerKey(p: LeaderboardPlayer): string {
  return p.player_identity || p.toon_handle || (p.row_id ? `row_${p.row_id}` : p.player_name)
}

const sortedAllPlayers = computed(() => {
  const min = minGames.value
  const col = sortColumn.value
  const asc = sortAsc.value

  const list = players.value.filter((p) => p.games_played >= min)

  return [...list].sort((a, b) => {
    if (col === 'player_name') {
      const cmp = a.player_name.localeCompare(b.player_name, undefined, { sensitivity: 'base' })
      if (cmp !== 0) {
        return asc ? cmp : -cmp
      }
      return b.games_played - a.games_played
    }

    if (col === 'mmr') {
      const aVal = a.mmr != null && a.mmr > 0 ? a.mmr : null
      const bVal = b.mmr != null && b.mmr > 0 ? b.mmr : null

      if (aVal === null && bVal === null) {
        return b.games_played - a.games_played
      }
      if (aVal === null) return 1
      if (bVal === null) return -1

      if (aVal !== bVal) {
        return asc ? aVal - bVal : bVal - aVal
      }

      if (a.games_played !== b.games_played) {
        return b.games_played - a.games_played
      }
      if (a.win_rate_pct !== b.win_rate_pct) {
        return b.win_rate_pct - a.win_rate_pct
      }
      return a.player_name.localeCompare(b.player_name)
    }

    if (col === 'recent_10_win_rate_pct') {
      const aVal =
        a.games_played >= min &&
          a.recent_10_win_rate_pct !== undefined &&
          a.recent_10_win_rate_pct !== null
          ? a.recent_10_win_rate_pct
          : null
      const bVal =
        b.games_played >= min &&
          b.recent_10_win_rate_pct !== undefined &&
          b.recent_10_win_rate_pct !== null
          ? b.recent_10_win_rate_pct
          : null

      if (aVal === null && bVal === null) {
        return b.games_played - a.games_played
      }
      if (aVal === null) return 1
      if (bVal === null) return -1

      if (aVal !== bVal) {
        return asc ? aVal - bVal : bVal - aVal
      }

      if (a.games_played !== b.games_played) {
        return b.games_played - a.games_played
      }
      if (a.win_rate_pct !== b.win_rate_pct) {
        return b.win_rate_pct - a.win_rate_pct
      }
      return a.player_name.localeCompare(b.player_name)
    }

    const valA = getSortValue(a, col)
    const valB = getSortValue(b, col)
    if (valA !== valB) {
      if (valA < valB) return asc ? -1 : 1
      if (valA > valB) return asc ? 1 : -1
    }

    if (a.games_played !== b.games_played) {
      return b.games_played - a.games_played
    }
    if (a.win_rate_pct !== b.win_rate_pct) {
      return b.win_rate_pct - a.win_rate_pct
    }
    return a.player_name.localeCompare(b.player_name)
  })
})

const playerRanks = computed(() => {
  const map = new Map<string, number>()
  sortedAllPlayers.value.forEach((p, idx) => {
    map.set(getPlayerKey(p), idx + 1)
  })
  return map
})

function getPlayerRank(p: LeaderboardPlayer): number {
  return playerRanks.value.get(getPlayerKey(p)) || 0
}

function getRankBadge(p: LeaderboardPlayer): string {
  const rank = getPlayerRank(p)
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return rank > 0 ? `#${rank}` : '-'
}

const filteredPlayers = computed(() => {
  const min = minGames.value
  const col = sortColumn.value
  const asc = sortAsc.value
  const q = search.value.trim()
  const target = activeQuery.value

  let list = players.value.filter((p) => {
    if (target && !matchesTarget(p, target)) {
      return false
    }
    if (q && !matchesSearch(p, q)) {
      return false
    }
    if (!target && p.games_played < min) {
      return false
    }
    return true
  })

  return [...list].sort((a, b) => {
    if (col === 'player_name') {
      const cmp = a.player_name.localeCompare(b.player_name, undefined, { sensitivity: 'base' })
      if (cmp !== 0) {
        return asc ? cmp : -cmp
      }
      return b.games_played - a.games_played
    }

    if (col === 'mmr') {
      const aVal = a.mmr != null && a.mmr > 0 ? a.mmr : null
      const bVal = b.mmr != null && b.mmr > 0 ? b.mmr : null

      if (aVal === null && bVal === null) {
        return b.games_played - a.games_played
      }
      if (aVal === null) return 1
      if (bVal === null) return -1

      if (aVal !== bVal) {
        return asc ? aVal - bVal : bVal - aVal
      }

      if (a.games_played !== b.games_played) {
        return b.games_played - a.games_played
      }
      if (a.win_rate_pct !== b.win_rate_pct) {
        return b.win_rate_pct - a.win_rate_pct
      }
      return a.player_name.localeCompare(b.player_name)
    }

    if (col === 'recent_10_win_rate_pct') {
      const aVal =
        a.games_played >= min &&
          a.recent_10_win_rate_pct !== undefined &&
          a.recent_10_win_rate_pct !== null
          ? a.recent_10_win_rate_pct
          : null
      const bVal =
        b.games_played >= min &&
          b.recent_10_win_rate_pct !== undefined &&
          b.recent_10_win_rate_pct !== null
          ? b.recent_10_win_rate_pct
          : null

      if (aVal === null && bVal === null) {
        return b.games_played - a.games_played
      }
      if (aVal === null) return 1
      if (bVal === null) return -1

      if (aVal !== bVal) {
        return asc ? aVal - bVal : bVal - aVal
      }

      // Tie-breaker: games_played DESC, then win_rate_pct DESC, then name
      if (a.games_played !== b.games_played) {
        return b.games_played - a.games_played
      }
      if (a.win_rate_pct !== b.win_rate_pct) {
        return b.win_rate_pct - a.win_rate_pct
      }
      return a.player_name.localeCompare(b.player_name)
    }

    const valA = getSortValue(a, col)
    const valB = getSortValue(b, col)
    if (valA !== valB) {
      if (valA < valB) return asc ? -1 : 1
      if (valA > valB) return asc ? 1 : -1
    }

    // Tie-breaker: games_played DESC, then win_rate_pct DESC, then name
    if (a.games_played !== b.games_played) {
      return b.games_played - a.games_played
    }
    if (a.win_rate_pct !== b.win_rate_pct) {
      return b.win_rate_pct - a.win_rate_pct
    }
    return a.player_name.localeCompare(b.player_name)
  })
})

function viewPlayerMatches(player: LeaderboardPlayer) {
  if (player.row_id) {
    router.push(`/player/${player.row_id}`)
  } else {
    router.push(`/player/${encodeURIComponent(player.player_name)}`)
  }
}

const tableContainerRef = ref<HTMLElement | null>(null)
const isSticky = ref(false)

function checkSticky() {
  if (!tableContainerRef.value) return
  const rect = tableContainerRef.value.getBoundingClientRect()
  const isMobile = window.innerWidth <= 768
  const navH = isMobile ? 0 : (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--navbar-height')) || 64)
  isSticky.value = rect.top <= navH + 1
}

onMounted(() => {
  fetchLeaderboard()
  checkSticky()
  window.addEventListener('scroll', checkSticky, { passive: true })
  window.addEventListener('resize', checkSticky, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', checkSticky)
  window.removeEventListener('resize', checkSticky)
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
        <input v-model="search"
               type="text"
               placeholder="Search player, tag, or row ID..."
               class="input-field search-input" />

        <select v-model="minGames"
                class="input-field min-games-select">
          <option :value="1">Min 1 Game</option>
          <option :value="3">Min 3 Games</option>
          <option :value="5">Min 5 Games</option>
          <option :value="10">Min 10 Games</option>
          <option :value="20">Min 20 Games</option>
          <option :value="30">Min 30 Games</option>
          <option :value="40">Min 40 Games</option>
        </select>
      </div>
    </div>

    <!-- Active Query / Pre-filter Banner -->
    <div v-if="activeQuery"
         class="active-query-banner">
      <div class="active-query-info">
        <span class="active-query-icon">🎯</span>
        <span class="active-query-text">
          Leaderboard query: <strong>{{ activeFilterDescription }}</strong>
        </span>
      </div>
      <div class="active-query-actions">
        <button v-if="activeFilterPlayer"
                class="toggle-view-btn"
                @click="viewMode = viewMode === 'showcase' ? 'table' : 'showcase'">
          {{ viewMode === 'showcase' ? '📊 Switch to Table View' : '🤡 Switch to Player Roast Card' }}
        </button>
        <button class="clear-query-btn"
                title="View full leaderboard"
                @click="clearFilter">
          ✕ Show Full Leaderboard
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading"
         class="loading-state">
      <div class="spinner"></div>
      <p>Calculating leaderboard standings...</p>
    </div>

    <!-- Empty -->
    <div v-else-if="filteredPlayers.length === 0"
         class="empty-state card">
      <span class="empty-icon">🏆</span>
      <h3>No players meet the filter criteria</h3>
      <p>Try reducing the minimum games filter</p>
    </div>

    <!-- Single Player Roast & Embarrassing Stats Showcase View -->
    <div v-else-if="activeFilterPlayer && viewMode === 'showcase'"
         class="player-roast-showcase card">
      <!-- Header / Identity Strip -->
      <div class="roast-header">
        <div class="roast-identity">
          <div class="roast-rank-circle"
               :class="{ 'top-three': getPlayerRank(activeFilterPlayer) <= 3 && getPlayerRank(activeFilterPlayer) > 0 }">
            {{ getRankBadge(activeFilterPlayer) }}
          </div>
          <div>
            <div class="roast-name-row">
              <h2 class="roast-player-name">{{ activeFilterPlayer.player_name }}</h2>
              <span v-if="activeFilterPlayer.role"
                    class="roast-role-badge"
                    :title="`Preferred Roles: ${activeFilterPlayer.role}`">
                {{ activeFilterPlayer.role }}
              </span>
              <span v-if="activeFilterPlayer.mmr != null"
                    class="roast-mmr-badge"
                    :title="activeFilterPlayer.base_mmr ? `Base: ${formatNumber(activeFilterPlayer.base_mmr)}${activeFilterPlayer.adjustment ? ` (${activeFilterPlayer.adjustment > 0 ? '+' : ''}${activeFilterPlayer.adjustment})` : ''}` : 'Effective MMR'">
                MMR {{ formatNumber(activeFilterPlayer.mmr) }}
              </span>
              <span v-if="activeFilterPlayer.hots_battle_tag"
                    class="roast-tag">
                {{ activeFilterPlayer.hots_battle_tag }}
              </span>
              <span v-if="activeFilterPlayer.row_id"
                    class="roast-row-id">
                Row #{{ activeFilterPlayer.row_id }}
              </span>
            </div>
            <div class="roast-title-badge">
              <span>{{ getPlayerRoastTitle(activeFilterPlayer) }}</span>
            </div>
          </div>
        </div>

        <div class="roast-header-actions">
          <button class="action-btn-primary"
                  @click="viewPlayerMatches(activeFilterPlayer)">
            ⚔️ View Full Match History →
          </button>
          <button class="action-btn-secondary"
                  @click="viewMode = 'table'">
            📊 View Table Row
          </button>
        </div>
      </div>

      <!-- The Hall of Shame (Mega Embarrassing Stat Cards) -->
      <div class="hall-of-shame-grid">
        <!-- 💀 Total Deaths -->
        <div class="shame-card shame-deaths">
          <div class="shame-card-header">
            <span class="shame-icon">💀</span>
            <span class="shame-label">FEED COUNTER</span>
          </div>
          <div class="shame-mega-value text-red">
            {{ activeFilterPlayer.total_deaths ?? Math.round(activeFilterPlayer.avg_deaths *
              activeFilterPlayer.games_played) }}
          </div>
          <div class="shame-subtext">
            <strong>{{ (activeFilterPlayer.avg_deaths ?? 0).toFixed(1) }}</strong> deaths per match
          </div>
          <div class="shame-quote">
            "Feeding enemy heroes with alarming dedication across {{ activeFilterPlayer.games_played }} games."
          </div>
        </div>

        <!-- ⚰️ Gray Screen Time -->
        <div class="shame-card shame-time-dead">
          <div class="shame-card-header">
            <span class="shame-icon">⚰️</span>
            <span class="shame-label">GRAY SCREEN SENTENCE</span>
          </div>
          <div class="shame-mega-value text-purple">
            {{ formatDeadTime(activeFilterPlayer) }}
          </div>
          <div class="shame-subtext">
            Avg <strong>{{ Math.round(activeFilterPlayer.avg_time_spent_dead ?? 0) }}s</strong> dead per match
          </div>
          <div class="shame-quote">
            "Plenty of time spent dead to ponder life choices and watch YouTube positioning guides."
          </div>
        </div>

        <!-- ❌ Loss Record & Win Rate -->
        <div class="shame-card shame-losses">
          <div class="shame-card-header">
            <span class="shame-icon">📉</span>
            <span class="shame-label">CHARITY RECORD</span>
          </div>
          <div class="shame-mega-value text-orange">
            {{ activeFilterPlayer.losses }} Losses
          </div>
          <div class="shame-subtext">
            <span :class="activeFilterPlayer.win_rate_pct >= 50 ? 'text-green' : 'text-red'">
              {{ activeFilterPlayer.win_rate_pct.toFixed(1) }}% Win Rate
            </span>
            ({{ activeFilterPlayer.wins }}W - {{ activeFilterPlayer.losses }}L)
          </div>
          <div class="shame-quote">
            {{
              activeFilterPlayer.win_rate_pct < 50
                ? "A true philanthropist: generously donating free wins to the opposing team."
                : "Just barely clinging to a positive win rate against all tactical odds."
            }}
              </div>
          </div>

          <!-- 🧽 Damage Sponge -->
          <div class="shame-card shame-sponge">
            <div class="shame-card-header">
              <span class="shame-icon">🧽</span>
              <span class="shame-label">DAMAGE SPONGE INDEX</span>
            </div>
            <div class="shame-mega-value text-cyan">
              {{ getDamageSpongeRatio(activeFilterPlayer) }}x
            </div>
            <div class="shame-subtext">
              <strong>{{ formatNumber(Math.round(activeFilterPlayer.avg_damage_taken || 0)) }}</strong> taken vs
              <strong>{{ formatNumber(Math.round(activeFilterPlayer.avg_hero_damage || 0)) }}</strong> dealt
            </div>
            <div class="shame-quote">
              "Body-blocking skillshots with their face so teammates don't have to."
            </div>
          </div>
        </div>

        <!-- BM & Emote Dossier -->
        <div class="roast-section-card bm-dossier">
          <div class="roast-section-title">
            <span>🔥 Bad Manners & Flare Dossier</span>
            <span class="bm-total-pill">Total BM: {{ getTotalBm(activeFilterPlayer) }}</span>
          </div>
          <div class="bm-quote-banner">
            {{ getBmCommentary(activeFilterPlayer) }}
          </div>
          <div class="bm-stats-row">
            <div class="bm-item">
              <span class="bm-emoji">🎨</span>
              <span class="bm-count">{{ activeFilterPlayer.total_sprays || 0 }}</span>
              <span class="bm-name">Sprays Sprayed</span>
            </div>
            <div class="bm-item">
              <span class="bm-emoji">👟</span>
              <span class="bm-count">{{ activeFilterPlayer.total_bsteps || 0 }}</span>
              <span class="bm-name">B-Steps Tapped</span>
            </div>
            <div class="bm-item">
              <span class="bm-emoji">💃</span>
              <span class="bm-count">{{ activeFilterPlayer.total_dances || 0 }}</span>
              <span class="bm-name">Dances Performed</span>
            </div>
            <div class="bm-item">
              <span class="bm-emoji">🗣️</span>
              <span class="bm-count">{{ activeFilterPlayer.total_taunts || 0 }}</span>
              <span class="bm-name">Taunts Thrown</span>
            </div>
            <div class="bm-item">
              <span class="bm-emoji">🎙️</span>
              <span class="bm-count">{{ activeFilterPlayer.total_voice_lines || 0 }}</span>
              <span class="bm-name">Voice Lines Spammed</span>
            </div>
          </div>
        </div>

        <!-- Full Performance & Macro Dossier -->
        <div class="roast-section-card">
          <div class="roast-section-title">
            <span>📊 Full Career Combat & Macro Performance</span>
            <span class="rank-standings-pill">
              Leaderboard Standing: {{ getRankBadge(activeFilterPlayer) }} (Position {{
                getPlayerRank(activeFilterPlayer) }} of {{ sortedAllPlayers.length }})
            </span>
          </div>

          <div class="stat-dossier-grid">
            <div class="stat-dossier-item">
              <span class="dossier-label">Overall KAD</span>
              <span class="dossier-value"
                    :class="(activeFilterPlayer.overall_kda || 0) < 3.0 ? 'text-red' : 'text-green'">
                {{ (activeFilterPlayer.overall_kda || 0).toFixed(2) }}
              </span>
            </div>

            <div class="stat-dossier-item">
              <span class="dossier-label">Total Takedowns</span>
              <span class="dossier-value">{{ formatNumber(activeFilterPlayer.total_takedowns || 0) }}</span>
              <span class="dossier-sub">{{ (activeFilterPlayer.avg_takedowns || 0).toFixed(1) }} / match</span>
            </div>

            <div class="stat-dossier-item">
              <span class="dossier-label">Solo Kills</span>
              <span class="dossier-value">{{ formatNumber(activeFilterPlayer.total_solo_kills || 0) }}</span>
              <span class="dossier-sub">Eliminations without help</span>
            </div>

            <div class="stat-dossier-item">
              <span class="dossier-label">Total Assists</span>
              <span class="dossier-value">{{ formatNumber(activeFilterPlayer.total_assists || 0) }}</span>
              <span class="dossier-sub">{{ (activeFilterPlayer.avg_assists || 0).toFixed(1) }} / match</span>
            </div>

            <div class="stat-dossier-item">
              <span class="dossier-label">Avg Hero Damage</span>
              <span class="dossier-value">{{ formatNumber(Math.round(activeFilterPlayer.avg_hero_damage || 0)) }}</span>
              <span class="dossier-sub">{{ Math.round(activeFilterPlayer.avg_dpm || 0) }} DPM</span>
            </div>

            <div class="stat-dossier-item">
              <span class="dossier-label">Avg Siege Damage</span>
              <span class="dossier-value">{{ formatNumber(Math.round(activeFilterPlayer.avg_siege_damage || 0))
                }}</span>
              <span class="dossier-sub">Minion & structure clear</span>
            </div>

            <div class="stat-dossier-item">
              <span class="dossier-label">Avg Healing / Shield</span>
              <span class="dossier-value">{{ formatNumber(Math.round(activeFilterPlayer.avg_healing || 0)) }}</span>
              <span class="dossier-sub">{{ Math.round(activeFilterPlayer.avg_hpm || 0) }} HPM</span>
            </div>

            <div class="stat-dossier-item">
              <span class="dossier-label">Avg Damage Soaked</span>
              <span class="dossier-value">{{ formatNumber(Math.round(activeFilterPlayer.avg_damage_soaked || 0))
                }}</span>
              <span class="dossier-sub">Mitigated & healed</span>
            </div>

            <div class="stat-dossier-item">
              <span class="dossier-label">Avg XP Contribution</span>
              <span class="dossier-value">{{ formatNumber(Math.round(activeFilterPlayer.avg_xp_contribution || 0))
                }}</span>
              <span class="dossier-sub">{{ Math.round(activeFilterPlayer.avg_xpm || 0) }} XPM</span>
            </div>

            <div class="stat-dossier-item">
              <span class="dossier-label">Kill Participation</span>
              <span class="dossier-value">{{ (activeFilterPlayer.avg_kill_participation_pct || 0).toFixed(1) }}%</span>
              <span class="dossier-sub">Team fight presence</span>
            </div>

            <div class="stat-dossier-item">
              <span class="dossier-label">Recent {{ minGames }} Form</span>
              <span class="dossier-value"
                    :class="activeFilterPlayer.recent_10_win_rate_pct != null && activeFilterPlayer.recent_10_win_rate_pct >= 50 ? 'text-green' : 'text-red'">
                {{ activeFilterPlayer.recent_10_win_rate_pct != null ? activeFilterPlayer.recent_10_win_rate_pct + '%' :
                  'N/A' }}
              </span>
              <span class="dossier-sub">Last {{ minGames }} games</span>
            </div>

            <div class="stat-dossier-item"
                 v-if="activeFilterPlayer.mmr != null">
              <span class="dossier-label">Current MMR</span>
              <span class="dossier-value text-gold">{{ formatNumber(activeFilterPlayer.mmr) }}</span>
              <span class="dossier-sub"
                    v-if="activeFilterPlayer.base_mmr">
                Base: {{ formatNumber(activeFilterPlayer.base_mmr) }}
                <span v-if="activeFilterPlayer.adjustment">
                  ({{ activeFilterPlayer.adjustment > 0 ? '+' : '' }}{{ activeFilterPlayer.adjustment }})
                </span>
              </span>
            </div>

            <div class="stat-dossier-item">
              <span class="dossier-label">Total Custom Games</span>
              <span class="dossier-value text-cyan">{{ activeFilterPlayer.games_played }}</span>
              <span class="dossier-sub">{{ activeFilterPlayer.wins }}W - {{ activeFilterPlayer.losses }}L</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Leaderboard Table -->
      <div v-else
           ref="tableContainerRef"
           class="table-container card leaderboard-table-container"
           :class="{ 'is-sticky': isSticky }">
        <table class="leaderboard-table">
          <thead>
            <tr>
              <th class="rank-col">Rank</th>
              <th class="sortable player-col"
                  @click="setSort('player_name')">
                Player {{ sortColumn === 'player_name' ? (sortAsc ? '▲' : '▼') : '' }}
              </th>
              <!-- MMR (Detailed) -->
              <th class="sortable mmr-col mmr-col-detailed"
                  title="Current In-House Effective MMR"
                  @click="setSort('mmr')">
                MMR {{ sortColumn === 'mmr' ? (sortAsc ? '▲' : '▼') : '' }}
              </th>
              <!-- Win Rate (Detailed) -->
              <th class="sortable wr-col-detailed"
                  @click="setSort('win_rate_pct')">
                Win Rate {{ sortColumn === 'win_rate_pct' ? (sortAsc ? '▲' : '▼') : '' }}
              </th>

              <!-- W - L (Detailed) -->
              <th class="wl-header-th wl-col-detailed">
                <div class="wl-header-wrap">
                  <span class="wl-clickable"
                        :class="{ active: sortColumn === 'wins' }"
                        title="Sort by Wins"
                        @click="setSort('wins')">
                    W{{ sortColumn === 'wins' ? (sortAsc ? ' ▲' : ' ▼') : '' }}
                  </span>
                  <span class="wl-sep">-</span>
                  <span class="wl-clickable"
                        :class="{ active: sortColumn === 'losses' }"
                        title="Sort by Losses"
                        @click="setSort('losses')">
                    L{{ sortColumn === 'losses' ? (sortAsc ? ' ▲' : ' ▼') : '' }}
                  </span>
                </div>
              </th>

              <!-- Stacked Win Rate / Record (medium screens) -->
              <th class="wr-header-th wr-col-stacked">
                <div class="wr-stacked-header-wrap">
                  <span class="wr-clickable"
                        :class="{ active: sortColumn === 'win_rate_pct' }"
                        title="Sort by Win Rate"
                        @click="setSort('win_rate_pct')">
                    WIN RATE{{ sortColumn === 'win_rate_pct' ? (sortAsc ? ' ▲' : ' ▼') : '' }}
                  </span>
                  <div class="wl-header-wrap">
                    <span class="wl-clickable"
                          :class="{ active: sortColumn === 'wins' }"
                          title="Sort by Wins"
                          @click="setSort('wins')">
                      W{{ sortColumn === 'wins' ? (sortAsc ? ' ▲' : ' ▼') : '' }}
                    </span>
                    <span class="wl-sep">-</span>
                    <span class="wl-clickable"
                          :class="{ active: sortColumn === 'losses' }"
                          title="Sort by Losses"
                          @click="setSort('losses')">
                      L{{ sortColumn === 'losses' ? (sortAsc ? ' ▲' : ' ▼') : '' }}
                    </span>
                  </div>
                </div>
              </th>

              <!-- Mega-Stacked MMR / Win Rate / Record (compact/mobile screens) -->
              <th class="wr-header-th stat-trio-col-stacked">
                <div class="stat-trio-stacked-header-wrap">
                  <div class="stat-trio-header-row">
                    <span class="wr-clickable"
                          :class="{ active: sortColumn === 'mmr' }"
                          title="Sort by MMR"
                          @click="setSort('mmr')">
                      MMR{{ sortColumn === 'mmr' ? (sortAsc ? ' ▲' : ' ▼') : '' }}
                    </span>
                    <span class="wr-clickable"
                          :class="{ active: sortColumn === 'win_rate_pct' }"
                          title="Sort by Win Rate"
                          @click="setSort('win_rate_pct')">
                      WR{{ sortColumn === 'win_rate_pct' ? (sortAsc ? ' ▲' : ' ▼') : '' }}
                    </span>
                  </div>
                  <div class="wl-header-wrap">
                    <span class="wl-clickable"
                          :class="{ active: sortColumn === 'wins' }"
                          title="Sort by Wins"
                          @click="setSort('wins')">
                      W{{ sortColumn === 'wins' ? (sortAsc ? ' ▲' : ' ▼') : '' }}
                    </span>
                    <span class="wl-sep">-</span>
                    <span class="wl-clickable"
                          :class="{ active: sortColumn === 'losses' }"
                          title="Sort by Losses"
                          @click="setSort('losses')">
                      L{{ sortColumn === 'losses' ? (sortAsc ? ' ▲' : ' ▼') : '' }}
                    </span>
                  </div>
                </div>
              </th>

              <!-- Games (Detailed) -->
              <th class="sortable games-col-detailed"
                  @click="setSort('games_played')">
                Games {{ sortColumn === 'games_played' ? (sortAsc ? '▲' : '▼') : '' }}
              </th>

              <!-- KAD (Detailed) -->
              <th class="sortable kad-col-detailed"
                  @click="setSort('overall_kda')">
                KAD {{ sortColumn === 'overall_kda' ? (sortAsc ? '▲' : '▼') : '' }}
              </th>

              <!-- Stacked Games / KAD (compact screens) -->
              <th class="games-kad-header-th games-kad-col-stacked">
                <div class="games-kad-stacked-header-wrap">
                  <span class="wl-clickable"
                        :class="{ active: sortColumn === 'games_played' }"
                        title="Sort by Games"
                        @click="setSort('games_played')">
                    GAMES{{ sortColumn === 'games_played' ? (sortAsc ? ' ▲' : ' ▼') : '' }}
                  </span>
                  <span class="wl-clickable"
                        :class="{ active: sortColumn === 'overall_kda' }"
                        title="Sort by KAD"
                        @click="setSort('overall_kda')">
                    KAD{{ sortColumn === 'overall_kda' ? (sortAsc ? ' ▲' : ' ▼') : '' }}
                  </span>
                </div>
              </th>
              <th class="sortable combat-col-detailed th-hero"
                  @click="setSort('avg_hero_damage')">
                Avg Hero Dmg {{ sortColumn === 'avg_hero_damage' ? (sortAsc ? '▲' : '▼') : '' }}
              </th>
              <th class="sortable combat-col-detailed th-heal"
                  @click="setSort('avg_healing')">
                Avg Heal {{ sortColumn === 'avg_healing' ? (sortAsc ? '▲' : '▼') : '' }}
              </th>
              <th class="sortable combat-col-detailed th-siege"
                  @click="setSort('avg_siege_damage')">
                Avg Siege {{ sortColumn === 'avg_siege_damage' ? (sortAsc ? '▲' : '▼') : '' }}
              </th>
              <th class="combat-header-th combat-col-stacked">
                <div class="combat-header-wrap">
                  <span class="combat-clickable combat-click-hero"
                        :class="{ active: sortColumn === 'avg_hero_damage' }"
                        title="Sort by Avg Hero Damage"
                        @click="setSort('avg_hero_damage')">
                    Hero{{ sortColumn === 'avg_hero_damage' ? (sortAsc ? ' ▲' : ' ▼') : '' }}
                  </span>
                  <span class="combat-sep">/</span>
                  <span class="combat-clickable combat-click-heal"
                        :class="{ active: sortColumn === 'avg_healing' }"
                        title="Sort by Avg Healing"
                        @click="setSort('avg_healing')">
                    Heal{{ sortColumn === 'avg_healing' ? (sortAsc ? ' ▲' : ' ▼') : '' }}
                  </span>
                  <span class="combat-sep">/</span>
                  <span class="combat-clickable combat-click-siege"
                        :class="{ active: sortColumn === 'avg_siege_damage' }"
                        title="Sort by Avg Siege"
                        @click="setSort('avg_siege_damage')">
                    Siege{{ sortColumn === 'avg_siege_damage' ? (sortAsc ? ' ▲' : ' ▼') : '' }}
                  </span>
                </div>
              </th>
              <th class="sortable bm-col-detailed"
                  @click="setSort('total_bsteps')">
                B-Steps {{ sortColumn === 'total_bsteps' ? (sortAsc ? '▲' : '▼') : '' }}
              </th>
              <th class="sortable bm-col-detailed"
                  @click="setSort('total_sprays')">
                Sprays {{ sortColumn === 'total_sprays' ? (sortAsc ? '▲' : '▼') : '' }}
              </th>
              <th class="sortable bm-col-detailed"
                  @click="setSort('total_taunts')">
                Taunts {{ sortColumn === 'total_taunts' ? (sortAsc ? '▲' : '▼') : '' }}
              </th>
              <th class="sortable bm-col-detailed"
                  @click="setSort('total_dances')">
                Dances {{ sortColumn === 'total_dances' ? (sortAsc ? '▲' : '▼') : '' }}
              </th>
              <th class="sortable bm-col-detailed"
                  @click="setSort('total_voice_lines')">
                Voice {{ sortColumn === 'total_voice_lines' ? (sortAsc ? '▲' : '▼') : '' }}
              </th>
              <th class="sortable bm-col-detailed"
                  @click="setSort('total_bm')">
                Total BM {{ sortColumn === 'total_bm' ? (sortAsc ? '▲' : '▼') : '' }}
              </th>
              <th class="sortable bm-col-stacked"
                  @click="setSort('total_bm')"
                  title="Total Bad Manners (B-steps, Sprays, Taunts, Dances, Voice)">
                BM {{ sortColumn === 'total_bm' ? (sortAsc ? '▲' : '▼') : '' }}
              </th>
              <th class="sortable"
                  :title="`Win rate over the player's last ${minGames} games`"
                  @click="setSort('recent_10_win_rate_pct')">
                Recent {{ minGames }} {{ sortColumn === 'recent_10_win_rate_pct' ? (sortAsc ? '▲' : '▼') : '' }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(p, idx) in filteredPlayers"
                :key="getPlayerKey(p)"
                class="player-row"
                @click="viewPlayerMatches(p)">
              <!-- Rank -->
              <td class="rank-col">
                <span class="rank-badge"
                      :class="{ 'top-three': getPlayerRank(p) <= 3 && getPlayerRank(p) > 0 }">
                  {{ getRankBadge(p) }}
                </span>
              </td>

              <!-- Player Name -->
              <td class="player-name-cell">
                <div class="player-name-wrapper">
                  <span class="player-title">
                    <span class="player-name-text">{{ p.player_name }}</span>
                    <span v-if="p.role"
                          class="player-role-pill"
                          :title="`Preferred Roles: ${p.role}`">{{ p.role }}</span>
                  </span>
                  <span v-if="p.hots_battle_tag"
                        class="player-tag-hint">
                    {{ p.hots_battle_tag }}
                  </span>
                  <span class="view-matches-hint">View Matches →</span>
                </div>
              </td>

              <!-- MMR (Detailed) -->
              <td class="num-cell mmr-cell mmr-cell-detailed">
                <span v-if="p.mmr != null"
                      class="mmr-val"
                      :title="p.base_mmr ? `Base: ${formatNumber(p.base_mmr)}${p.adjustment ? ` (${p.adjustment > 0 ? '+' : ''}${p.adjustment})` : ''}` : 'Effective In-House MMR'">
                  {{ formatNumber(p.mmr) }}
                </span>
                <span v-else
                      class="text-dim">-</span>
              </td>

              <!-- Win Rate (Detailed) -->
              <td class="wr-cell-detailed">
                <div class="wr-cell">
                  <span class="badge"
                        :class="p.win_rate_pct >= 50 ? 'badge-win' : 'badge-loss'">
                    {{ p.win_rate_pct.toFixed(1) }}%
                  </span>
                </div>
              </td>

              <!-- W - L (Detailed) -->
              <td class="num-cell wl-cell-detailed">
                <span class="text-green">{{ p.wins }}W</span> -
                <span class="text-red">{{ p.losses }}L</span>
              </td>

              <!-- Stacked Win Rate / Record (medium screens) -->
              <td class="wr-cell-stacked">
                <div class="wr-stacked-wrapper">
                  <span class="badge"
                        :class="p.win_rate_pct >= 50 ? 'badge-win' : 'badge-loss'">
                    {{ p.win_rate_pct.toFixed(1) }}%
                  </span>
                  <div class="wr-stacked-record num-cell">
                    <span class="text-green">{{ p.wins }}W</span>
                    <span class="wl-sep">-</span>
                    <span class="text-red">{{ p.losses }}L</span>
                  </div>
                </div>
              </td>

              <!-- Mega-Stacked MMR / Win Rate / Record (compact/mobile screens) -->
              <td class="stat-trio-cell-stacked">
                <div class="stat-trio-stacked-wrapper">
                  <div class="stat-trio-top-row">
                    <span v-if="p.mmr != null"
                          class="mmr-val stat-trio-mmr"
                          :title="p.base_mmr ? `Base: ${formatNumber(p.base_mmr)}${p.adjustment ? ` (${p.adjustment > 0 ? '+' : ''}${p.adjustment})` : ''}` : 'Effective In-House MMR'">
                      {{ formatNumber(p.mmr) }}
                    </span>
                    <span v-else
                          class="text-dim">-</span>
                    <span class="badge"
                          :class="p.win_rate_pct >= 50 ? 'badge-win' : 'badge-loss'">
                      {{ p.win_rate_pct.toFixed(1) }}%
                    </span>
                  </div>
                  <div class="stat-trio-record num-cell">
                    <span class="text-green">{{ p.wins }}W</span>
                    <span class="wl-sep">-</span>
                    <span class="text-red">{{ p.losses }}L</span>
                  </div>
                </div>
              </td>

              <!-- Games (Detailed) -->
              <td class="num-cell bold-cell games-cell-detailed">{{ p.games_played }}</td>

              <!-- KDA (Detailed) -->
              <td class="num-cell bold-cell kad-cell-detailed">{{ p.overall_kda.toFixed(2) }}</td>

              <!-- Stacked Games / KAD (compact screens) -->
              <td class="num-cell games-kad-cell-stacked">
                <div class="games-kad-stacked-wrapper">
                  <span class="bold-cell games-stacked-val"
                        title="Games Played">{{ p.games_played }}</span>
                  <span class="kad-stacked-val"
                        title="KAD ratio">{{ p.overall_kda.toFixed(2) }}</span>
                </div>
              </td>

              <!-- Avg Hero Dmg (detailed) -->
              <td class="num-cell combat-col-detailed dmg-hero">{{ formatNumber(p.avg_hero_damage) }}</td>

              <!-- Avg Heal (detailed) -->
              <td class="num-cell combat-col-detailed dmg-heal">{{ formatNumber(p.avg_healing) }}</td>

              <!-- Avg Siege (detailed) -->
              <td class="num-cell combat-col-detailed dmg-siege">{{ formatNumber(p.avg_siege_damage) }}</td>

              <!-- Stacked Combat Stats (small screens) -->
              <td class="combat-cell-stacked">
                <div class="combat-stacked-wrapper">
                  <span class="combat-stat-val dmg-hero"
                        title="Avg Hero Damage">{{ formatNumber(p.avg_hero_damage) }}</span>
                  <span class="combat-stat-val dmg-heal"
                        title="Avg Healing">{{ formatNumber(p.avg_healing) }}</span>
                  <span class="combat-stat-val dmg-siege"
                        title="Avg Siege Damage">{{ formatNumber(p.avg_siege_damage) }}</span>
                </div>
              </td>

              <!-- B-Steps (detailed) -->
              <td class="bm-cell bm-cell-detailed">
                <span v-if="p.total_bsteps > 0"
                      class="bm-tag">👟 {{ p.total_bsteps }}</span>
                <span v-else
                      class="text-dim">-</span>
              </td>

              <!-- Sprays (detailed) -->
              <td class="bm-cell bm-cell-detailed">
                <span v-if="p.total_sprays > 0"
                      class="bm-tag">🎨 {{ p.total_sprays }}</span>
                <span v-else
                      class="text-dim">-</span>
              </td>

              <!-- Taunts (detailed) -->
              <td class="bm-cell bm-cell-detailed">
                <span v-if="p.total_taunts > 0"
                      class="bm-tag">🗣️ {{ p.total_taunts }}</span>
                <span v-else
                      class="text-dim">-</span>
              </td>

              <!-- Dances (detailed) -->
              <td class="bm-cell bm-cell-detailed">
                <span v-if="p.total_dances > 0"
                      class="bm-tag">💃 {{ p.total_dances }}</span>
                <span v-else
                      class="text-dim">-</span>
              </td>

              <!-- Voice (detailed) -->
              <td class="bm-cell bm-cell-detailed">
                <span v-if="(p.total_voice_lines ?? 0) > 0"
                      class="bm-tag">🎙️ {{ p.total_voice_lines }}</span>
                <span v-else
                      class="text-dim">-</span>
              </td>

              <!-- Total BM (detailed) -->
              <td class="bm-cell bm-cell-detailed">
                <span v-if="getTotalBm(p) > 0"
                      class="bm-tag bm-total-tag">🔥 {{ getTotalBm(p) }}</span>
                <span v-else
                      class="text-dim">-</span>
              </td>

              <!-- Stacked BM cell (compact screens) -->
              <td class="bm-cell bm-cell-stacked">
                <div v-if="getTotalBm(p) > 0"
                     class="bm-stacked-wrapper">
                  <span class="bm-tag bm-total-tag">🔥 {{ getTotalBm(p) }}</span>
                  <div class="bm-stacked-breakdown">
                    <span v-if="p.total_bsteps > 0"
                          class="bm-mini-pill"
                          title="B-Steps">👟 {{ p.total_bsteps }}</span>
                    <span v-if="p.total_sprays > 0"
                          class="bm-mini-pill"
                          title="Sprays">🎨 {{ p.total_sprays }}</span>
                    <span v-if="p.total_taunts > 0"
                          class="bm-mini-pill"
                          title="Taunts">🗣️ {{ p.total_taunts }}</span>
                    <span v-if="p.total_dances > 0"
                          class="bm-mini-pill"
                          title="Dances">💃 {{ p.total_dances }}</span>
                    <span v-if="(p.total_voice_lines ?? 0) > 0"
                          class="bm-mini-pill"
                          title="Voice Lines">🎙️ {{ p.total_voice_lines }}</span>
                  </div>
                </div>
                <span v-else
                      class="text-dim">-</span>
              </td>

              <!-- Recent {{ minGames }} -->
              <td>
                <span v-if="p.games_played >= minGames && p.recent_10_win_rate_pct !== undefined && p.recent_10_win_rate_pct !== null"
                      class="badge"
                      :class="p.recent_10_win_rate_pct >= 50 ? 'badge-win' : 'badge-loss'">
                  {{ p.recent_10_win_rate_pct.toFixed(0) }}%
                </span>
                <span v-else
                      class="text-dim">-</span>
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
  transition: padding 0.4s cubic-bezier(0.34, 1.3, 0.64, 1);
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
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
  max-width: 140px;
}

.player-title {
  font-weight: 700;
  color: var(--text-main);
  font-size: 0.95rem;
  max-width: 100%;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.player-name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-role-pill {
  flex-shrink: 0;
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
  min-width: min-content;
  padding-left: 2rem;
  padding-right: 2rem;
  transition: padding 0.4s cubic-bezier(0.34, 1.3, 0.64, 1);
}

.leaderboard-table-container {
  overflow: visible;
  width: 100%;
  padding: 0;
  border-radius: var(--radius-lg);
  background: var(--bg-surface-elevated);
  transition: border-radius 0.4s cubic-bezier(0.34, 1.3, 0.64, 1);
}

.leaderboard-table-container.is-sticky {
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

.leaderboard-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

.leaderboard-table th,
.leaderboard-table td {
  padding: 0.6rem 0.65rem;
}

.leaderboard-table thead th {
  position: -webkit-sticky;
  position: sticky;
  top: var(--navbar-height, 64px);
  z-index: 20;
  background: var(--bg-surface-elevated);
  background-clip: padding-box;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  will-change: transform;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
}

.leaderboard-table thead tr th:first-child {
  border-top-left-radius: var(--radius-lg);
  transition: border-radius 0.4s cubic-bezier(0.34, 1.3, 0.64, 1);
}

.leaderboard-table thead tr th:last-child {
  border-top-right-radius: var(--radius-lg);
  transition: border-radius 0.4s cubic-bezier(0.34, 1.3, 0.64, 1);
}

.leaderboard-table-container.is-sticky .leaderboard-table thead tr th:first-child {
  border-top-left-radius: 0;
}

.leaderboard-table-container.is-sticky .leaderboard-table thead tr th:last-child {
  border-top-right-radius: 0;
}

.leaderboard-table tbody tr:last-child td:first-child {
  border-bottom-left-radius: var(--radius-lg);
  transition: border-radius 0.4s cubic-bezier(0.34, 1.3, 0.64, 1);
}

.leaderboard-table tbody tr:last-child td:last-child {
  border-bottom-right-radius: var(--radius-lg);
  transition: border-radius 0.4s cubic-bezier(0.34, 1.3, 0.64, 1);
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

.mmr-col-detailed,
.mmr-cell-detailed,
.wr-col-detailed,
.wr-cell-detailed,
.wl-col-detailed,
.wl-cell-detailed {
  display: table-cell;
}

.wr-col-stacked,
.wr-cell-stacked,
.stat-trio-col-stacked,
.stat-trio-cell-stacked {
  display: none;
}

.stat-trio-stacked-header-wrap {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
}

.stat-trio-header-row {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.stat-trio-stacked-wrapper {
  display: inline-flex;
  flex-direction: column;
  gap: 0.25rem;
  align-items: flex-start;
}

.stat-trio-top-row {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.stat-trio-mmr {
  font-family: var(--font-mono);
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--accent-amber);
}

.stat-trio-record {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  white-space: nowrap;
}

.games-col-detailed,
.games-cell-detailed,
.kad-col-detailed,
.kad-cell-detailed {
  display: table-cell;
}

.games-kad-col-stacked,
.games-kad-cell-stacked {
  display: none;
}

.games-kad-header-th {
  user-select: none;
  white-space: normal !important;
}

.games-kad-stacked-header-wrap {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
}

.games-kad-stacked-wrapper {
  display: inline-flex;
  flex-direction: column;
  gap: 0.2rem;
  align-items: flex-start;
}

.games-stacked-val {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 700;
  color: #fff;
}

.kad-stacked-val {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-muted);
}

.wr-header-th {
  user-select: none;
  white-space: normal !important;
}

.wr-stacked-header-wrap {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
}

.wr-clickable {
  cursor: pointer;
  padding: 0.15rem 0.35rem;
  border-radius: var(--radius-sm);
  transition: all 0.15s ease;
  font-weight: 700;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.wr-clickable:hover {
  background: var(--bg-surface-hover);
  color: #fff;
}

.wr-clickable.active {
  color: var(--accent-cyan) !important;
  background: rgba(56, 189, 248, 0.15) !important;
}

.wr-stacked-wrapper {
  display: inline-flex;
  flex-direction: column;
  gap: 0.25rem;
  align-items: flex-start;
}

.wr-stacked-record {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  white-space: nowrap;
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

.bm-col-detailed,
.bm-cell-detailed {
  display: table-cell;
}

.bm-col-stacked,
.bm-cell-stacked {
  display: none;
}

.combat-col-detailed {
  display: table-cell;
}

.combat-col-stacked,
.combat-cell-stacked {
  display: none;
}

.th-hero {
  color: #f87171 !important;
}

.th-heal {
  color: #34d399 !important;
}

.th-siege {
  color: #fbbf24 !important;
}

.combat-header-th {
  user-select: none;
  white-space: normal !important;
}

.combat-header-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
}

.combat-clickable {
  cursor: pointer;
  padding: 0.15rem 0.35rem;
  border-radius: var(--radius-sm);
  transition: all 0.15s ease;
  font-weight: 700;
}

.combat-clickable:hover {
  background: var(--bg-surface-hover);
}

.combat-click-hero {
  color: #f87171;
}

.combat-click-hero.active {
  color: #f87171 !important;
  background: rgba(248, 113, 113, 0.2) !important;
}

.combat-click-heal {
  color: #34d399;
}

.combat-click-heal.active {
  color: #34d399 !important;
  background: rgba(52, 211, 153, 0.2) !important;
}

.combat-click-siege {
  color: #fbbf24;
}

.combat-click-siege.active {
  color: #fbbf24 !important;
  background: rgba(251, 191, 36, 0.2) !important;
}

.combat-sep {
  display: none;
}

.combat-stacked-wrapper {
  display: inline-flex;
  flex-direction: column;
  gap: 0.15rem;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  align-items: flex-start;
}

.combat-stat-val {
  font-weight: 700;
  line-height: 1.25;
}

.dmg-hero {
  color: #f87171 !important;
  font-family: var(--font-mono);
  font-weight: 700;
}

.dmg-heal {
  color: #34d399 !important;
  font-family: var(--font-mono);
  font-weight: 700;
}

.dmg-siege {
  color: #fbbf24 !important;
  font-family: var(--font-mono);
  font-weight: 700;
}

.bm-stacked-wrapper {
  display: inline-flex;
  flex-direction: column;
  gap: 0.25rem;
  align-items: flex-start;
}

.bm-stacked-breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem;
  max-width: 140px;
}

.bm-mini-pill {
  font-size: 0.7rem;
  padding: 0.05rem 0.25rem;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--radius-sm);
  white-space: nowrap;
  color: var(--text-muted);
}

@media (max-width: 1450px) {

  .bm-col-detailed,
  .bm-cell-detailed {
    display: none !important;
  }

  .bm-col-stacked,
  .bm-cell-stacked {
    display: table-cell !important;
  }

  .combat-col-detailed {
    display: none !important;
  }

  .combat-col-stacked,
  .combat-cell-stacked {
    display: table-cell !important;
  }
}

@media (max-width: 1250px) {

  .wr-col-detailed,
  .wr-cell-detailed,
  .wl-col-detailed,
  .wl-cell-detailed {
    display: none !important;
  }

  .wr-col-stacked,
  .wr-cell-stacked {
    display: table-cell !important;
  }
}

@media (max-width: 900px) {

  .mmr-col-detailed,
  .mmr-cell-detailed {
    display: none !important;
  }

  .wr-col-stacked,
  .wr-cell-stacked {
    display: none !important;
  }

  .stat-trio-col-stacked,
  .stat-trio-cell-stacked {
    display: table-cell !important;
  }

  .games-col-detailed,
  .games-cell-detailed,
  .kad-col-detailed,
  .kad-cell-detailed {
    display: none !important;
  }

  .games-kad-col-stacked,
  .games-kad-cell-stacked {
    display: table-cell !important;
  }
}

@media (max-width: 768px) {
  .leaderboard-container {
    padding-left: 0;
    padding-right: 0;
  }

  .leaderboard-table th,
  .leaderboard-table td {
    padding: 0.5rem 0.35rem;
  }

  .rank-col {
    width: 36px !important;
    min-width: 36px;
    padding-left: 0.35rem !important;
    padding-right: 0.15rem !important;
    text-align: center;
  }

  .player-col,
  .player-name-cell {
    max-width: 140px;
    padding-left: 0.25rem !important;
    padding-right: 0.25rem !important;
  }

  .player-name-wrapper {
    max-width: 140px;
  }

  .leaderboard-header {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .active-query-banner {
    margin-left: 1rem;
    margin-right: 1rem;
  }

  .empty-state,
  .loading-state,
  .player-roast-showcase {
    margin-left: 1rem;
    margin-right: 1rem;
  }

  .leaderboard-table-container {
    border-radius: 0;
    border-left: none;
    border-right: none;
  }

  .leaderboard-table thead tr th:first-child,
  .leaderboard-table thead tr th:last-child,
  .leaderboard-table tbody tr:last-child td:first-child,
  .leaderboard-table tbody tr:last-child td:last-child {
    border-radius: 0;
  }

  .leaderboard-table thead th {
    top: 0;
  }
}

@media (max-width: 700px) {

  .leaderboard-table th,
  .leaderboard-table td {
    padding: 0.35rem 0.4vw !important;
  }

  .rank-col {
    width: 5.5vw !important;
    min-width: 0 !important;
    padding-left: 0.1vw !important;
    padding-right: 0.1vw !important;
  }

  .rank-badge {
    font-size: 2.4vw !important;
  }

  .rank-badge.top-three {
    font-size: 2.8vw !important;
  }

  .player-col,
  .player-name-cell {
    max-width: 21vw !important;
    padding-left: 0.2vw !important;
    padding-right: 0.2vw !important;
  }

  .player-name-wrapper {
    max-width: 21vw !important;
  }

  .player-title {
    font-size: 2.3vw !important;
    gap: 0.2vw !important;
  }

  .player-name-text {
    font-size: 2.3vw !important;
  }

  .player-tag-hint {
    font-size: 1.7vw !important;
  }

  .player-role-pill {
    font-size: 1.7vw !important;
    padding: 0 0.25vw !important;
  }

  .stat-trio-mmr {
    font-size: 2.4vw !important;
  }

  .stat-trio-record {
    font-size: 1.9vw !important;
  }

  .stat-trio-cell-stacked .badge {
    font-size: 1.9vw !important;
    padding: 0.05rem 0.25vw !important;
  }

  .games-stacked-val {
    font-size: 2.2vw !important;
  }

  .kad-stacked-val {
    font-size: 1.9vw !important;
  }

  .combat-stacked-wrapper {
    font-size: 1.9vw !important;
  }

  .combat-stat-val {
    font-size: 1.9vw !important;
  }

  .bm-total-tag {
    font-size: 1.9vw !important;
    padding: 0.05rem 0.25vw !important;
  }

  .bm-mini-pill {
    font-size: 1.5vw !important;
    padding: 0 0.15vw !important;
  }

  .bm-stacked-breakdown {
    max-width: 13vw !important;
    gap: 0.1vw !important;
  }

  .recent-cell .badge {
    font-size: 1.9vw !important;
    padding: 0.05rem 0.25vw !important;
  }

  .wl-clickable,
  .wr-clickable,
  .combat-clickable {
    font-size: 1.9vw !important;
    padding: 0.1vw 0.2vw !important;
  }

  .leaderboard-table thead th {
    font-size: 1.9vw !important;
  }
}

.player-tag-hint {
  font-size: 0.75rem;
  color: var(--text-dim);
  font-weight: 500;
  opacity: 0.7;
  margin-top: 0.1rem;
}

.active-query-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: var(--radius-md);
  padding: 0.75rem 1.25rem;
  margin-bottom: 1.25rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}

.active-query-info {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.active-query-icon {
  font-size: 1.2rem;
}

.active-query-text {
  font-size: 0.95rem;
  color: var(--text-secondary);
}

.active-query-text strong {
  color: var(--accent-cyan);
  font-weight: 600;
}

.active-query-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.toggle-view-btn {
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.4);
  color: #7dd3fc;
  padding: 0.4rem 0.85rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.toggle-view-btn:hover {
  background: rgba(56, 189, 248, 0.3);
  color: #ffffff;
  border-color: rgba(56, 189, 248, 0.7);
}

.clear-query-btn {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #fca5a5;
  padding: 0.4rem 0.85rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.clear-query-btn:hover {
  background: rgba(239, 68, 68, 0.3);
  color: #ffffff;
  border-color: rgba(239, 68, 68, 0.7);
}

/* Player Roast Showcase Styles */
.player-roast-showcase {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
  padding: 2rem;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
}

.roast-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.roast-identity {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.roast-rank-circle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  font-size: 1.75rem;
  font-weight: 800;
  background: rgba(255, 255, 255, 0.06);
  border: 2px solid rgba(255, 255, 255, 0.15);
  color: #e2e8f0;
}

.roast-rank-circle.top-three {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.15);
  box-shadow: 0 0 20px rgba(245, 158, 11, 0.3);
}

.roast-name-row {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.roast-player-name {
  font-size: 2rem;
  font-weight: 800;
  color: #ffffff;
  margin: 0;
  letter-spacing: -0.02em;
}

.roast-tag {
  font-size: 1rem;
  color: var(--text-dim);
  font-weight: 500;
}

.roast-row-id {
  font-size: 0.8rem;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.06);
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
}

.roast-title-badge {
  margin-top: 0.35rem;
}

.roast-title-badge span {
  display: inline-block;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #fca5a5;
  font-weight: 700;
  font-size: 0.9rem;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  letter-spacing: 0.02em;
}

.roast-header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.action-btn-primary {
  background: var(--accent-cyan);
  color: #0b0f19;
  border: none;
  font-weight: 700;
  padding: 0.65rem 1.25rem;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 0.95rem;
  transition: all 0.2s ease;
  box-shadow: 0 4px 14px rgba(56, 189, 248, 0.3);
}

.action-btn-primary:hover {
  transform: translateY(-1px);
  filter: brightness(1.1);
  box-shadow: 0 6px 20px rgba(56, 189, 248, 0.45);
}

.action-btn-secondary {
  background: rgba(255, 255, 255, 0.08);
  color: #e2e8f0;
  border: 1px solid rgba(255, 255, 255, 0.15);
  font-weight: 600;
  padding: 0.65rem 1rem;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 0.95rem;
  transition: all 0.2s ease;
}

.action-btn-secondary:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
}

/* Hall of Shame Grid */
.hall-of-shame-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.25rem;
}

.shame-card {
  background: rgba(15, 23, 42, 0.75);
  border-radius: var(--radius-md);
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  position: relative;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.shame-card:hover {
  transform: translateY(-2px);
}

.shame-deaths {
  border-color: rgba(239, 68, 68, 0.45);
  background: linear-gradient(180deg, rgba(239, 68, 68, 0.08) 0%, rgba(15, 23, 42, 0.8) 100%);
  box-shadow: 0 4px 20px rgba(239, 68, 68, 0.15);
}

.shame-time-dead {
  border-color: rgba(168, 85, 247, 0.45);
  background: linear-gradient(180deg, rgba(168, 85, 247, 0.08) 0%, rgba(15, 23, 42, 0.8) 100%);
  box-shadow: 0 4px 20px rgba(168, 85, 247, 0.15);
}

.shame-losses {
  border-color: rgba(245, 158, 11, 0.45);
  background: linear-gradient(180deg, rgba(245, 158, 11, 0.08) 0%, rgba(15, 23, 42, 0.8) 100%);
  box-shadow: 0 4px 20px rgba(245, 158, 11, 0.15);
}

.shame-sponge {
  border-color: rgba(56, 189, 248, 0.45);
  background: linear-gradient(180deg, rgba(56, 189, 248, 0.08) 0%, rgba(15, 23, 42, 0.8) 100%);
  box-shadow: 0 4px 20px rgba(56, 189, 248, 0.15);
}

.shame-card-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.shame-icon {
  font-size: 1.3rem;
}

.shame-label {
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--text-dim);
}

.shame-mega-value {
  font-size: 2.4rem;
  font-weight: 900;
  line-height: 1.1;
  letter-spacing: -0.03em;
}

.text-purple {
  color: #c084fc;
}

.text-orange {
  color: #fb923c;
}

.text-cyan {
  color: var(--accent-cyan);
}

.shame-subtext {
  font-size: 0.9rem;
  color: #cbd5e1;
}

.shame-quote {
  font-size: 0.8rem;
  font-style: italic;
  color: var(--text-dim);
  line-height: 1.35;
  margin-top: 0.25rem;
  border-top: 1px dashed rgba(255, 255, 255, 0.1);
  padding-top: 0.5rem;
}

/* BM & Section Cards */
.roast-section-card {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-md);
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.roast-section-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 1.1rem;
  font-weight: 700;
  color: #ffffff;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.bm-total-pill {
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.4);
  color: #fbbf24;
  font-size: 0.85rem;
  font-weight: 700;
  padding: 0.25rem 0.65rem;
  border-radius: 9999px;
}

.bm-quote-banner {
  background: rgba(245, 158, 11, 0.08);
  border-left: 3px solid #f59e0b;
  padding: 0.65rem 1rem;
  font-size: 0.9rem;
  font-style: italic;
  color: #fef08a;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.bm-stats-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 1rem;
}

.bm-item {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--radius-sm);
  padding: 0.9rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.25rem;
}

.bm-emoji {
  font-size: 1.5rem;
}

.bm-count {
  font-size: 1.5rem;
  font-weight: 800;
  color: #ffffff;
}

.bm-name {
  font-size: 0.75rem;
  color: var(--text-dim);
  font-weight: 500;
}

.rank-standings-pill {
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.35);
  color: #7dd3fc;
  font-size: 0.85rem;
  font-weight: 700;
  padding: 0.25rem 0.65rem;
  border-radius: 9999px;
}

/* Stat Dossier Grid */
.stat-dossier-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1rem;
}

.stat-dossier-item {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--radius-sm);
  padding: 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.dossier-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.dossier-value {
  font-size: 1.4rem;
  font-weight: 800;
  color: #ffffff;
}

.dossier-sub {
  font-size: 0.75rem;
  color: var(--text-dim);
  opacity: 0.85;
}

.text-gold {
  color: var(--accent-gold);
  font-weight: 700;
}

.mmr-col {
  min-width: 85px;
}

.mmr-cell {
  font-weight: 700;
}

.mmr-val {
  color: var(--accent-gold);
  font-family: var(--font-mono);
  font-weight: 700;
}

.player-role-pill {
  display: inline-block;
  margin-left: 0.45rem;
  padding: 0.1rem 0.4rem;
  font-size: 0.7rem;
  font-weight: 700;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: var(--radius-sm);
  vertical-align: middle;
}

.roast-role-badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: var(--radius-sm);
  vertical-align: middle;
}

.roast-mmr-badge {
  display: inline-block;
  padding: 0.15rem 0.55rem;
  font-size: 0.8rem;
  font-weight: 800;
  font-family: var(--font-mono);
  color: var(--accent-gold);
  background: rgba(251, 191, 36, 0.12);
  border: 1px solid rgba(251, 191, 36, 0.35);
  border-radius: var(--radius-sm);
  vertical-align: middle;
}
</style>
