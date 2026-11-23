<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import type { ReplaySummary, ReplaysApiResponse, ServerInfo } from '../types'
import {
  formatDuration,
  formatDateRelative,
  formatDateFull,
  getHeroImageUrl,
  getMapImageUrl,
  isAramMap,
  resolveHeroName,
} from '../utils/hots'

const router = useRouter()
const route = useRoute()
const replays = ref<ReplaySummary[]>([])
const loading = ref(true)
const page = ref(1)
const totalPages = ref(1)
const total = ref(0)
const limit = ref(15)
const search = ref('')
const selectedMap = ref('')
const selectedMode = ref('')
const selectedServer = ref('')
const jumpPageInput = ref('')

// Admin State
const isAdmin = ref(false)
const servers = ref<ServerInfo[]>([])
const selectedReplayIds = ref<number[]>([])
const bulkTargetServer = ref(
  typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('crunch_last_target_server') || '' : ''
)
const assigning = ref(false)
const assignSuccessMessage = ref('')

watch(bulkTargetServer, val => {
  if (typeof sessionStorage !== 'undefined' && val) {
    sessionStorage.setItem('crunch_last_target_server', val)
  }
})

// Add Server Modal State
const showAddServerModal = ref(false)
const newServerName = ref('')
const newServerId = ref('')
const addingServer = ref(false)
const addServerError = ref('')

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

  // Determine window around current page
  let start = Math.max(2, current - 2)
  let end = Math.min(totalCount - 1, current + 2)

  if (current <= 4) {
    start = 2
    end = Math.min(totalCount - 1, 5)
  } else if (current >= totalCount - 3) {
    start = Math.max(2, totalCount - 4)
    end = totalCount - 1
  }

  // Left ellipsis
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

  // Right ellipsis
  if (end < totalCount - 1) {
    items.push({
      type: 'ellipsis',
      label: '…',
      key: 'ellipsis-right',
    })
  }

  // Always show last page
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
  if (total.value === 0 || replays.value.length === 0) return '0'
  const start = (page.value - 1) * limit.value + 1
  const end = Math.min(page.value * limit.value, total.value)
  if (start > end) return '0'
  return `${start}–${end}`
})

const ARAM_MAPS = [
  'Braxis Outpost',
  'Industrial District',
  'Lost Cavern',
  'Silver City',
]

const STANDARD_MAPS = [
  'Alterac Pass',
  'Battlefield of Eternity',
  "Blackheart's Bay",
  'Braxis Holdout',
  'Cursed Hollow',
  'Dragon Shire',
  'Garden of Terror',
  'Garden of Terror Classic',
  'Hanamura Temple',
  'Haunted Mines',
  'Infernal Shrines',
  'Sky Temple',
  'Tomb of the Spider Queen',
  'Towers of Doom',
  'Volskaya Foundry',
  'Warhead Junction',
]

const ALL_MAPS = [...STANDARD_MAPS, ...ARAM_MAPS].sort()

const displayedMaps = computed<string[]>(() => {
  if (selectedMode.value === 'aram') {
    return ARAM_MAPS
  }
  if (selectedMode.value === 'standard') {
    return STANDARD_MAPS
  }
  return ALL_MAPS
})

let searchTimeout: ReturnType<typeof setTimeout> | null = null

async function fetchReplays() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    params.set('page', page.value.toString())
    params.set('limit', limit.value.toString())
    if (search.value.trim()) params.set('search', search.value.trim())
    if (selectedMap.value) params.set('map', selectedMap.value)
    if (selectedMode.value) params.set('mode', selectedMode.value)
    if (selectedServer.value) params.set('guild_id', selectedServer.value)

    const res = await fetch(`/api/replays?${params.toString()}`)
    const text = await res.text()
    const data: ReplaysApiResponse = JSON.parse(text)
    replays.value = data.replays
    totalPages.value = data.pagination.totalPages
    total.value = data.pagination.total

    // If query exceeded totalPages, clamp to totalPages
    if (data.pagination.totalPages > 0 && page.value > data.pagination.totalPages) {
      goToPage(data.pagination.totalPages)
    }
  } catch (err) {
    console.error('Failed to load replays:', err)
  } finally {
    loading.value = false
  }
}

function updateUrl(
  params: { page?: number; search?: string; map?: string; mode?: string; server?: string; limit?: number },
  replace: boolean = false
) {
  const query: Record<string, string> = {}
  const targetPage = params.page !== undefined ? params.page : page.value
  const targetSearch = params.search !== undefined ? params.search : search.value
  const targetMap = params.map !== undefined ? params.map : selectedMap.value
  const targetMode = params.mode !== undefined ? params.mode : selectedMode.value
  const targetServer = params.server !== undefined ? params.server : selectedServer.value
  const targetLimit = params.limit !== undefined ? params.limit : limit.value

  if (targetPage > 1) {
    query.page = String(targetPage)
  }
  if (targetSearch.trim()) {
    query.search = targetSearch.trim()
  }
  if (targetMap) {
    query.map = targetMap
  }
  if (targetMode) {
    query.mode = targetMode
  }
  if (targetServer) {
    query.server = targetServer
  }
  if (targetLimit !== 15) {
    query.limit = String(targetLimit)
  }

  const currentQ = route.query
  const isSame =
    (currentQ.page || '1') === (query.page || '1') &&
    (currentQ.search || '') === (query.search || '') &&
    (currentQ.map || '') === (query.map || '') &&
    (currentQ.mode || '') === (query.mode || '') &&
    (currentQ.server || '') === (query.server || '') &&
    (currentQ.limit || '15') === (query.limit || '15')

  if (isSame) {
    fetchReplays()
    return
  }

  if (replace) {
    router.replace({ path: '/matches', query })
  } else {
    router.push({ path: '/matches', query })
  }
}

function goToPage(newPage: number) {
  if (newPage < 1) newPage = 1
  if (totalPages.value > 0 && newPage > totalPages.value) newPage = totalPages.value
  if (newPage === page.value && replays.value.length > 0) return

  page.value = newPage
  updateUrl({ page: newPage }, false)
  if (typeof window !== 'undefined') {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

function handleJumpPage() {
  const parsed = parseInt(jumpPageInput.value.trim(), 10)
  if (!isNaN(parsed)) {
    goToPage(parsed)
    jumpPageInput.value = ''
  }
}

function onSearchInput() {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    updateUrl({ page: 1, search: search.value }, true)
  }, 350)
}

function onMapChange() {
  updateUrl({ page: 1, map: selectedMap.value, mode: selectedMode.value, server: selectedServer.value }, false)
}

function onModeChange() {
  if (selectedMode.value === 'aram' && !ARAM_MAPS.includes(selectedMap.value)) {
    selectedMap.value = ''
  } else if (selectedMode.value === 'standard' && !STANDARD_MAPS.includes(selectedMap.value)) {
    selectedMap.value = ''
  }
  updateUrl({ page: 1, map: selectedMap.value, mode: selectedMode.value, server: selectedServer.value }, false)
}

function onServerChange() {
  updateUrl({ page: 1, map: selectedMap.value, mode: selectedMode.value, server: selectedServer.value }, false)
}

function onLimitChange(newLimit: number) {
  updateUrl({ page: 1, limit: newLimit }, false)
}

async function checkAdminStatus() {
  const token = localStorage.getItem('crunch_admin_token')
  if (!token) {
    isAdmin.value = false
    return
  }
  try {
    const res = await fetch('/api/admin/verify', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      isAdmin.value = true
    } else {
      localStorage.removeItem('crunch_admin_token')
      localStorage.removeItem('crunch_admin_expires')
      isAdmin.value = false
    }
  } catch {
    isAdmin.value = false
  }
}

async function fetchServers() {
  try {
    const res = await fetch('/api/servers')
    if (res.ok) {
      const data: { servers: ServerInfo[] } = await res.json()
      servers.value = data.servers
    }
  } catch (err) {
    console.error('Failed to load servers:', err)
  }
}

onMounted(() => {
  checkAdminStatus()
  fetchServers()
})

function getServerName(guildId: string | null | undefined): string {
  if (!guildId) return 'Unassigned'
  const match = servers.value.find(s => s.id === guildId)
  return match ? match.name : guildId
}

const allOnPageSelected = computed(() => {
  return replays.value.length > 0 && replays.value.every(r => selectedReplayIds.value.includes(r.id))
})

function toggleSelectAll() {
  if (allOnPageSelected.value) {
    const pageIds = new Set(replays.value.map(r => r.id))
    selectedReplayIds.value = selectedReplayIds.value.filter(id => !pageIds.has(id))
  } else {
    const combined = new Set([...selectedReplayIds.value, ...replays.value.map(r => r.id)])
    selectedReplayIds.value = Array.from(combined)
  }
}

function toggleSelectReplay(id: number) {
  if (selectedReplayIds.value.includes(id)) {
    selectedReplayIds.value = selectedReplayIds.value.filter(x => x !== id)
  } else {
    selectedReplayIds.value.push(id)
  }
}

async function executeBulkAssign() {
  if (selectedReplayIds.value.length === 0 || !bulkTargetServer.value) return
  assigning.value = true
  try {
    const token = localStorage.getItem('crunch_admin_token')
    const targetGuild = bulkTargetServer.value === 'unassigned' ? null : bulkTargetServer.value
    const res = await fetch('/api/admin/replays/assign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        replayIds: selectedReplayIds.value,
        guildId: targetGuild,
      }),
    })
    if (res.ok) {
      const targetName = targetGuild ? getServerName(targetGuild) : 'Unassigned'
      assignSuccessMessage.value = `Assigned ${selectedReplayIds.value.length} match(es) to ${targetName}!`
      selectedReplayIds.value = []
      // Keep bulkTargetServer.value to remember choice for subsequent selections
      setTimeout(() => {
        assignSuccessMessage.value = ''
      }, 4000)
      await fetchReplays()
    }
  } catch (err) {
    console.error('Assign failed:', err)
  } finally {
    assigning.value = false
  }
}

function logoutAdmin() {
  localStorage.removeItem('crunch_admin_token')
  localStorage.removeItem('crunch_admin_expires')
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem('crunch_last_target_server')
  }
  isAdmin.value = false
  selectedReplayIds.value = []
  bulkTargetServer.value = ''
}

function openAddServerModal() {
  newServerName.value = ''
  newServerId.value = ''
  addServerError.value = ''
  showAddServerModal.value = true
}

function closeAddServerModal() {
  if (addingServer.value) return
  showAddServerModal.value = false
}

interface AddServerApiResponse {
  success?: boolean
  server?: ServerInfo
  error?: string
}

async function handleAddServer() {
  if (!newServerName.value.trim()) {
    addServerError.value = 'Please enter a server name.'
    return
  }

  addingServer.value = true
  addServerError.value = ''
  try {
    const token = localStorage.getItem('crunch_admin_token')
    const res = await fetch('/api/admin/servers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: newServerName.value.trim(),
        id: newServerId.value.trim() || undefined,
      }),
    })

    if (!res.ok) {
      const errData: AddServerApiResponse = await res.json().catch(() => ({ error: 'Failed to create server' }))
      addServerError.value = errData.error || 'Failed to create server'
      return
    }

    const data: AddServerApiResponse = await res.json()
    if (data.server) {
      await fetchServers()
      if (selectedReplayIds.value.length > 0) {
        bulkTargetServer.value = data.server.id
      }
      assignSuccessMessage.value = `Server "${data.server.name}" added successfully!`
      setTimeout(() => {
        assignSuccessMessage.value = ''
      }, 4000)
      showAddServerModal.value = false
    }
  } catch (err) {
    console.error('Error adding server:', err)
    addServerError.value = 'Network error while adding server.'
  } finally {
    addingServer.value = false
  }
}

watch(
  () => route.query,
  newQuery => {
    const qPage = parseInt(String(newQuery.page || '1'), 10)
    const targetPage = !isNaN(qPage) && qPage >= 1 ? qPage : 1

    const targetSearch = typeof newQuery.search === 'string' ? newQuery.search : ''
    const targetMap = typeof newQuery.map === 'string' ? newQuery.map : ''
    const rawMode = typeof newQuery.mode === 'string' ? newQuery.mode.toLowerCase() : ''
    const targetMode = rawMode === 'aram' || rawMode === 'standard' ? rawMode : ''
    const targetServer = typeof newQuery.server === 'string' ? newQuery.server : ''
    const qLimit = parseInt(String(newQuery.limit || '15'), 10)
    const targetLimit = !isNaN(qLimit) && qLimit >= 1 && qLimit <= 100 ? qLimit : 15

    page.value = targetPage
    if (search.value !== targetSearch) {
      search.value = targetSearch
    }
    selectedMap.value = targetMap
    selectedMode.value = targetMode
    selectedServer.value = targetServer
    limit.value = targetLimit

    fetchReplays()
  },
  { immediate: true }
)

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
</script>

<template>
  <div class="container">
    <div class="matches-header">
      <div class="header-left">
        <div class="title-with-admin">
          <h1 class="page-title">Match History</h1>
          <div v-if="isAdmin" class="admin-status-pill">
            <span class="admin-icon">🔒</span>
            <span>Admin Active</span>
            <button class="admin-logout-btn" title="Exit Admin Mode" @click.stop="logoutAdmin">Log Out</button>
          </div>
        </div>
        <p class="page-subtitle">
          Showing <span class="highlight">{{ matchesRangeText }}</span> of <span class="highlight">{{ total }}</span> custom games recorded
          <span v-if="totalPages > 1 || page > 1" class="page-pill-badge">Page {{ page }} of {{ Math.max(totalPages, 1) }}</span>
        </p>
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
          <option v-for="map in displayedMaps" :key="map" :value="map">{{ map }}</option>
        </select>

        <select v-model="selectedMode" class="input-field mode-select" @change="onModeChange">
          <option value="">All Modes</option>
          <option value="standard">Standard</option>
          <option value="aram">ARAM</option>
        </select>

        <select v-model="selectedServer" class="input-field server-select" @change="onServerChange">
          <option value="">All Servers</option>
          <option v-for="server in servers" :key="server.id" :value="server.id">{{ server.name }}</option>
          <option value="unassigned">Unassigned</option>
        </select>

        <button
          v-if="isAdmin"
          type="button"
          class="add-server-btn"
          title="Manually register a Discord server"
          @click="openAddServerModal"
        >
          ➕ Add Server
        </button>
      </div>
    </div>

    <!-- Admin Assign Success Toast -->
    <div v-if="assignSuccessMessage" class="assign-toast">
      <span>✅ {{ assignSuccessMessage }}</span>
    </div>

    <!-- Admin Select All Bar -->
    <div v-if="isAdmin && replays.length > 0" class="admin-toolbar">
      <label class="select-all-label">
        <input
          type="checkbox"
          :checked="allOnPageSelected"
          class="match-checkbox"
          @change="toggleSelectAll"
        />
        <span>Select all on page ({{ replays.length }} matches)</span>
      </label>
      <span v-if="selectedReplayIds.length > 0" class="selected-count-badge">
        {{ selectedReplayIds.length }} match(es) selected
      </span>
      <button v-if="selectedReplayIds.length > 0" class="clear-btn" @click="selectedReplayIds = []">
        Clear selection
      </button>
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
      <p v-if="page > 1">
        There are no matches on page {{ page }}. Earlier pages may still have matches.
      </p>
      <p v-else>Try adjusting your search filters</p>
      <div v-if="page > 1" class="empty-state-nav">
        <button type="button" class="btn btn-page-nav" @click="goToPage(page - 1)">
          ‹ Go back to page {{ page - 1 }}
        </button>
        <button type="button" class="btn btn-page-nav" @click="goToPage(1)">
          « Go to page 1
        </button>
      </div>
    </div>

    <!-- Match Cards List -->
    <div v-else class="matches-list">
      <div
        v-for="match in replays"
        :key="match.id"
        class="match-card card"
        :class="{ 'admin-card': isAdmin }"
        @click="openMatch(match.id)"
      >
        <!-- Admin Checkbox Column -->
        <div
          v-if="isAdmin"
          class="admin-checkbox-col"
          :class="{ 'is-selected': selectedReplayIds.includes(match.id) }"
          role="checkbox"
          :aria-checked="selectedReplayIds.includes(match.id)"
          tabindex="0"
          title="Click to toggle selection"
          @click.stop="toggleSelectReplay(match.id)"
          @keydown.space.prevent="toggleSelectReplay(match.id)"
          @keydown.enter.prevent="toggleSelectReplay(match.id)"
        >
          <input
            type="checkbox"
            :checked="selectedReplayIds.includes(match.id)"
            class="match-checkbox"
            tabindex="-1"
            aria-hidden="true"
          />
        </div>

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
            <span v-if="isAramMap(match.map)" class="aram-badge">ARAM</span>
            <span v-if="!selectedServer" class="server-badge" :class="{ 'unassigned-badge': !match.guild_id }">
              {{ getServerName(match.guild_id) }}
            </span>
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
              <span
                v-for="(player, idx) in match.team0_players"
                :key="idx"
                class="player-entry"
              >
                {{ player }}<span v-if="idx < match.team0_players.length - 1" class="player-sep">,</span>
              </span>
            </div>
          </div>

          <div class="versus-divider">
            <span class="vs-text">VS</span>
            <span class="date-text" :title="formatDateFull(match.date)">{{ formatDateRelative(match.date) }}</span>
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
              <span
                v-for="(player, idx) in match.team1_players"
                :key="idx"
                class="player-entry"
              >
                {{ player }}<span v-if="idx < match.team1_players.length - 1" class="player-sep">,</span>
              </span>
            </div>
          </div>
        </div>

        <div class="view-match-action">
          <span class="arrow-btn">View Stats →</span>
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
          <label for="jump-input" class="jump-label">Go to page:</label>
          <input
            id="jump-input"
            v-model="jumpPageInput"
            type="number"
            min="1"
            :max="Math.max(totalPages, page)"
            placeholder="Page #"
            class="input-field jump-input"
          />
          <button type="submit" class="btn btn-jump" :disabled="!jumpPageInput">
            Go
          </button>
        </form>

        <!-- Per Page Limit Selector -->
        <div class="per-page-selector">
          <span class="per-page-label">Matches per page:</span>
          <div class="per-page-pills">
            <button
              v-for="opt in [15, 25, 50]"
              :key="opt"
              type="button"
              class="btn-limit-pill"
              :class="{ active: limit === opt }"
              @click="onLimitChange(opt)"
            >
              {{ opt }}
            </button>
          </div>
        </div>
      </div>
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
    <!-- Floating Admin Bulk Action Bar -->
    <div v-if="isAdmin && selectedReplayIds.length > 0" class="floating-admin-bar">
      <div class="admin-bar-inner">
        <span class="admin-bar-summary">
          <strong>{{ selectedReplayIds.length }}</strong> match(es) selected
        </span>
        <div class="admin-bar-actions">
          <select v-model="bulkTargetServer" class="input-field admin-server-select">
            <option value="" disabled>Choose target server...</option>
            <option v-for="s in servers" :key="s.id" :value="s.id">{{ s.name }}</option>
            <option value="unassigned">Remove Server (Unassign)</option>
          </select>
          <button
            class="assign-btn"
            :disabled="!bulkTargetServer || assigning"
            @click="executeBulkAssign"
          >
            <span v-if="assigning" class="spinner-small"></span>
            <span v-else>Assign Matches</span>
          </button>
          <button
            type="button"
            class="add-server-bar-btn"
            title="Register new server"
            @click="openAddServerModal"
          >
            ➕
          </button>
        </div>
      </div>
    </div>

    <!-- Add Server Modal -->
    <Teleport to="body">
      <div v-if="showAddServerModal" class="modal-backdrop" @click.self="closeAddServerModal">
        <div class="modal-card">
          <div class="modal-header">
            <div class="modal-title-group">
              <span class="modal-icon">🏰</span>
              <h3>Add Discord Server</h3>
            </div>
            <button
              type="button"
              class="modal-close-btn"
              :disabled="addingServer"
              @click="closeAddServerModal"
            >
              ✕
            </button>
          </div>

          <p class="modal-desc">
            Register a Discord server to filter and assign match replays, even if the bot is not yet present in that server.
          </p>

          <form class="modal-form" @submit.prevent="handleAddServer">
            <div v-if="addServerError" class="modal-error-banner">
              <span>⚠️ {{ addServerError }}</span>
            </div>

            <div class="form-group">
              <label for="new-server-name" class="form-label">
                Server Name <span class="required">*</span>
              </label>
              <input
                id="new-server-name"
                v-model="newServerName"
                type="text"
                class="input-field modal-input"
                placeholder="e.g. Nexus In-Houses"
                :disabled="addingServer"
                autofocus
                required
              />
            </div>

            <div class="form-group">
              <label for="new-server-id" class="form-label">
                Discord Server ID <span class="label-hint">(optional)</span>
              </label>
              <input
                id="new-server-id"
                v-model="newServerId"
                type="text"
                class="input-field modal-input"
                placeholder="e.g. 1051325819403894785"
                :disabled="addingServer"
              />
              <p class="field-hint">
                Leave blank to automatically generate an internal unique ID.
              </p>
            </div>

            <div class="modal-actions">
              <button
                type="button"
                class="btn-cancel"
                :disabled="addingServer"
                @click="closeAddServerModal"
              >
                Cancel
              </button>
              <button
                type="submit"
                class="btn-submit-server"
                :disabled="addingServer || !newServerName.trim()"
              >
                <span v-if="addingServer" class="spinner-small"></span>
                <span v-else>Save Server</span>
              </button>
            </div>
          </form>
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
  transition: padding 0.4s cubic-bezier(0.34, 1.3, 0.64, 1);
}

.card,
.match-card,
.pagination-container,
.empty-state,
.admin-toolbar,
.assign-toast {
  transition: border-radius 0.4s cubic-bezier(0.34, 1.3, 0.64, 1);
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.title-with-admin {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.admin-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.35);
  color: #4ade80;
  padding: 0.25rem 0.65rem;
  border-radius: 9999px;
  font-size: 0.78rem;
  font-weight: 600;
}

.admin-logout-btn {
  background: none;
  border: none;
  color: #f87171;
  cursor: pointer;
  font-size: 0.75rem;
  margin-left: 0.35rem;
  padding: 0;
  text-decoration: underline;
  transition: color 0.15s;
}

.admin-logout-btn:hover {
  color: #ef4444;
}

.page-title {
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  margin: 0;
}

.page-subtitle {
  color: var(--text-muted);
  font-size: 0.95rem;
  margin: 0;
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

.mode-select {
  min-width: 140px;
}

.server-select {
  min-width: 160px;
}

.assign-toast {
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.35);
  color: #4ade80;
  padding: 0.75rem 1.25rem;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  margin-bottom: 1.25rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  animation: fadeIn 0.2s ease-out;
}

.admin-toolbar {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid var(--border-subtle, #334155);
  border-radius: 8px;
  padding: 0.6rem 1rem;
  margin-bottom: 1rem;
  font-size: 0.88rem;
  color: var(--text-secondary, #cbd5e1);
}

.select-all-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  user-select: none;
}

.selected-count-badge {
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.35);
  color: #60a5fa;
  padding: 0.2rem 0.55rem;
  border-radius: 9999px;
  font-size: 0.78rem;
  font-weight: 600;
}

.clear-btn {
  background: none;
  border: none;
  color: var(--text-muted, #94a3b8);
  font-size: 0.8rem;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
}

.clear-btn:hover {
  color: var(--text-primary, #f8fafc);
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
}

.match-card.admin-card {
  padding-left: 0;
  grid-template-columns: 56px 200px 1fr 120px;
}

.admin-checkbox-col {
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin-top: -1.25rem;
  margin-bottom: -1.25rem;
  margin-right: -1.5rem;
  padding-right: 1.5rem;
  padding-left: 0.25rem;
  user-select: none;
  background: transparent;
  transition: background-color 0.15s ease, box-shadow 0.15s ease;
  position: relative;
  z-index: 2;
}

.admin-checkbox-col:hover {
  background-color: rgba(59, 130, 246, 0.14);
}

.admin-checkbox-col.is-selected {
  background-color: rgba(59, 130, 246, 0.18);
  box-shadow: inset 3px 0 0 #3b82f6;
}

.admin-checkbox-col.is-selected:hover {
  background-color: rgba(59, 130, 246, 0.26);
}

.match-checkbox {
  width: 20px;
  height: 20px;
  cursor: pointer;
  accent-color: #3b82f6;
  pointer-events: none;
}

.server-badge {
  display: inline-block;
  margin-top: 0.3rem;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.15rem 0.5rem;
  border-radius: var(--radius-full);
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.3);
  max-width: fit-content;
}

.unassigned-badge {
  background: rgba(239, 68, 68, 0.18);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.65);
  animation: pulseRed 2.2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulseRed {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4);
    border-color: rgba(239, 68, 68, 0.5);
    background: rgba(239, 68, 68, 0.16);
    color: #f87171;
  }
  50% {
    box-shadow: 0 0 8px 2px rgba(239, 68, 68, 0.35);
    border-color: rgba(248, 113, 113, 0.95);
    background: rgba(239, 68, 68, 0.28);
    color: #fca5a5;
  }
}

.floating-admin-bar {
  position: fixed;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  background: #111827;
  border: 1px solid #3b82f6;
  border-radius: 12px;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.65), 0 0 20px rgba(59, 130, 246, 0.25);
  padding: 0.85rem 1.5rem;
  animation: slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.admin-bar-inner {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.admin-bar-summary {
  font-size: 0.95rem;
  color: #f8fafc;
}

.admin-bar-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.admin-server-select {
  min-width: 200px;
  background: #1f2937;
  border-color: #374151;
  color: #f9fafb;
}

.assign-btn {
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #ffffff;
  padding: 0.55rem 1.15rem;
  border-radius: 8px;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
}

.assign-btn:hover:not(:disabled) {
  opacity: 0.92;
  transform: translateY(-1px);
}

.assign-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.add-server-btn {
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.35);
  color: #60a5fa;
  font-size: 0.82rem;
  font-weight: 600;
  padding: 0.5rem 0.85rem;
  border-radius: var(--radius-md);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.add-server-btn:hover {
  background: rgba(59, 130, 246, 0.25);
  border-color: #3b82f6;
  color: #fff;
}

.add-server-bar-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #fff;
  border-radius: 8px;
  padding: 0.55rem 0.85rem;
  font-size: 0.88rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.add-server-bar-btn:hover {
  background: rgba(59, 130, 246, 0.3);
  border-color: #3b82f6;
}

/* Modal styles */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(10, 15, 29, 0.8);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999;
  padding: 1rem;
  animation: fadeIn 0.2s ease-out;
}

.modal-card {
  background: #111827;
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: var(--radius-lg);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
  width: 100%;
  max-width: 460px;
  padding: 1.75rem;
  animation: popIn 0.25s ease-out;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.modal-title-group {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.modal-icon {
  font-size: 1.35rem;
}

.modal-header h3 {
  font-size: 1.15rem;
  font-weight: 700;
  color: #f8fafc;
  margin: 0;
}

.modal-close-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 1.15rem;
  cursor: pointer;
  padding: 0.25rem;
  line-height: 1;
  transition: color 0.15s ease;
}

.modal-close-btn:hover {
  color: #f8fafc;
}

.modal-desc {
  font-size: 0.85rem;
  color: #94a3b8;
  margin-bottom: 1.25rem;
  line-height: 1.45;
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 1.15rem;
}

.modal-error-banner {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #f87171;
  padding: 0.6rem 0.85rem;
  border-radius: var(--radius-md);
  font-size: 0.82rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.form-label {
  font-size: 0.82rem;
  font-weight: 600;
  color: #cbd5e1;
}

.required {
  color: #f87171;
}

.label-hint {
  font-size: 0.75rem;
  font-weight: 400;
  color: #64748b;
}

.modal-input {
  width: 100%;
}

.field-hint {
  font-size: 0.73rem;
  color: #64748b;
  margin: 0.2rem 0 0 0;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.btn-cancel {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  padding: 0.55rem 1.1rem;
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-cancel:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: #f8fafc;
}

.btn-submit-server {
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  border: none;
  color: #fff;
  padding: 0.55rem 1.25rem;
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.35);
  transition: all 0.2s ease;
}

.btn-submit-server:hover:not(:disabled) {
  opacity: 0.92;
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.5);
  transform: translateY(-1px);
}

.btn-submit-server:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.spinner-small {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes slideUp {
  from {
    transform: translate(-50%, 20px);
    opacity: 0;
  }
  to {
    transform: translate(-50%, 0);
    opacity: 1;
  }
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

.aram-badge {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: rgba(245, 158, 11, 0.18);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.4);
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.2);
  margin-top: 0.25rem;
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
  display: flex;
  flex-wrap: wrap;
  gap: 0.15rem 0.35rem;
  line-height: 1.4;
}

.player-entry {
  display: inline-flex;
  white-space: nowrap;
}

.player-sep {
  margin-right: 0.1rem;
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
  cursor: help;
  text-decoration: underline dotted rgba(255, 255, 255, 0.2);
  text-underline-offset: 3px;
  transition: color 0.15s ease, text-decoration-color 0.15s ease;
}

.date-text:hover {
  color: var(--text-main);
  text-decoration-color: var(--primary);
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

.empty-state-nav {
  display: flex;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 1.25rem;
  flex-wrap: wrap;
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

.page-pill-badge {
  display: inline-block;
  margin-left: 0.6rem;
  padding: 0.15rem 0.5rem;
  font-size: 0.75rem;
  font-family: var(--font-mono);
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.25);
  color: var(--accent-cyan);
  border-radius: var(--radius-sm);
}

.pagination-container {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  margin-top: 2.5rem;
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
  justify-content: space-between;
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
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-main);
  outline: none;
  transition: border-color 0.15s ease;
}

.jump-input:focus {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.btn-jump {
  height: 32px;
  padding: 0 0.75rem;
  font-size: 0.85rem;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-main);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-jump:hover:not(:disabled) {
  background: var(--accent-blue);
  border-color: var(--accent-blue);
  color: #fff;
}

.btn-jump:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.per-page-selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.per-page-label {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.per-page-pills {
  display: flex;
  gap: 0.25rem;
}

.btn-limit-pill {
  height: 28px;
  padding: 0 0.6rem;
  font-size: 0.75rem;
  font-weight: 600;
  font-family: var(--font-mono);
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-limit-pill:hover:not(.active) {
  background: var(--bg-surface-hover);
  color: var(--text-main);
}

.btn-limit-pill.active {
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.4);
  color: var(--accent-cyan);
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
  .match-card.admin-card {
    grid-template-columns: 52px 1fr;
    padding-left: 0;
  }
  .teams-versus {
    grid-template-columns: 1fr;
    padding: 1rem 1.25rem;
  }
  .view-match-action {
    display: none;
  }
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

@media (max-width: 700px) {
  .matches-header {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .card,
  .match-card,
  .pagination-container,
  .empty-state,
  .admin-toolbar,
  .assign-toast {
    border-radius: 0;
    border-left: none;
    border-right: none;
  }
}
</style>
