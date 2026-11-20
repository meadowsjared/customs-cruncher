<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute, RouterLink } from 'vue-router'
import { PlayerSearchItem } from '../types'

const router = useRouter()
const route = useRoute()
const navbarRef = ref<HTMLElement | null>(null)
const navLinksRef = ref<HTMLElement | null>(null)
let resizeObserver: ResizeObserver | null = null

const isReady = ref(false)

const isMatches = computed(() => {
  return (
    route.path === '/' ||
    route.path.startsWith('/matches') ||
    route.path.startsWith('/replay') ||
    route.path.startsWith('/match')
  )
})

const isLeaderboard = computed(() => {
  return route.path.startsWith('/leaderboard')
})

const sliderStyle = ref<{
  transform: string
  width: string
  opacity: number
}>({
  transform: 'translate3d(0, 0, 0)',
  width: '0px',
  opacity: 0,
})

function updateSlider() {
  if (!navLinksRef.value) return

  let activeEl: HTMLElement | null = null
  if (isMatches.value) {
    activeEl = navLinksRef.value.querySelector<HTMLElement>('.nav-matches')
  } else if (isLeaderboard.value) {
    activeEl = navLinksRef.value.querySelector<HTMLElement>('.nav-leaderboard')
  }

  if (activeEl) {
    const left = activeEl.offsetLeft
    const width = activeEl.offsetWidth
    sliderStyle.value = {
      transform: `translate3d(${left}px, 0, 0)`,
      width: `${width}px`,
      opacity: 1,
    }
  } else {
    sliderStyle.value = {
      ...sliderStyle.value,
      opacity: 0,
    }
  }
}

watch(
  () => route.path,
  () => {
    nextTick(() => {
      updateSlider()
    })
  }
)

onMounted(() => {
  updateSlider()
  requestAnimationFrame(() => {
    updateSlider()
    isReady.value = true
  })
  if (typeof document !== 'undefined' && 'fonts' in document) {
    document.fonts.ready.then(() => {
      updateSlider()
    })
  }
  window.addEventListener('resize', updateSlider)

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (navbarRef.value && entry.target === navbarRef.value) {
          const height = entry.target.getBoundingClientRect().height
          document.documentElement.style.setProperty('--navbar-height', `${height}px`)
        }
        if (navLinksRef.value && entry.target === navLinksRef.value) {
          updateSlider()
        }
      }
    })
    if (navbarRef.value) {
      resizeObserver.observe(navbarRef.value)
    }
    if (navLinksRef.value) {
      resizeObserver.observe(navLinksRef.value)
    }
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', updateSlider)
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})
const searchQuery = ref('')
const searchResults = ref<PlayerSearchItem[]>([])
const showDropdown = ref(false)

let searchTimer: ReturnType<typeof setTimeout> | null = null

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  const q = searchQuery.value.trim()
  if (!q) {
    searchResults.value = []
    showDropdown.value = false
    return
  }

  searchTimer = setTimeout(async () => {
    try {
      const res = await fetch(`/api/players/search?q=${encodeURIComponent(q)}`)
      if (res.ok) {
        const json: { results: PlayerSearchItem[] } = await res.json()
        searchResults.value = json.results
        showDropdown.value = true
      }
    } catch {
      searchResults.value = []
    }
  }, 200)
}

function selectPlayer(p: PlayerSearchItem) {
  showDropdown.value = false
  searchQuery.value = ''
  router.push(`/player/${p.rowId}`)
}

function handleBlur() {
  setTimeout(() => {
    showDropdown.value = false
  }, 250)
}
</script>

<template>
  <header ref="navbarRef" class="navbar">
    <div class="nav-container">
      <RouterLink to="/matches" class="brand">
        <img :src="'/branding/Avatar_no_BG.png'" alt="Customs Cruncher" class="brand-icon" />
        <span>CUSTOMS CRUNCHER</span>
      </RouterLink>

      <div class="nav-search-wrap">
        <span class="nav-search-icon">🔍</span>
        <input
          v-model="searchQuery"
          type="text"
          class="nav-search-input"
          placeholder="Lookup player..."
          @input="onSearchInput"
          @focus="searchResults.length > 0 ? (showDropdown = true) : null"
          @blur="handleBlur"
        />
        <div v-if="showDropdown && searchResults.length > 0" class="nav-search-dropdown">
          <div
            v-for="item in searchResults"
            :key="item.rowId"
            class="nav-search-item"
            @mousedown.prevent="selectPlayer(item)"
          >
            <span class="nav-result-tag">{{ item.battleTag }}</span>
            <span v-if="item.isPrimary" class="nav-result-badge">Primary</span>
          </div>
        </div>
      </div>

      <nav
        ref="navLinksRef"
        class="nav-links"
        :class="{
          'is-ready': isReady,
          'has-active': isMatches || isLeaderboard,
          'is-matches': isMatches,
          'is-leaderboard': isLeaderboard,
        }"
      >
        <div
          class="nav-slider"
          :style="sliderStyle"
          aria-hidden="true"
        />
        <RouterLink
          to="/matches"
          class="nav-link nav-matches"
          :class="{ 'is-active': isMatches }"
        >
          <span>⚔️</span>
          <span>Matches</span>
        </RouterLink>
        <RouterLink
          to="/leaderboard"
          class="nav-link nav-leaderboard"
          :class="{ 'is-active': isLeaderboard }"
        >
          <span>🏆</span>
          <span>Leaderboard</span>
        </RouterLink>
      </nav>
    </div>
  </header>
</template>

<style scoped>
.nav-search-wrap {
  position: relative;
  display: flex;
  align-items: center;
  width: 240px;
  max-width: 100%;
}

.nav-search-icon {
  position: absolute;
  left: 0.65rem;
  font-size: 0.8rem;
  opacity: 0.55;
  pointer-events: none;
}

.nav-search-input {
  width: 100%;
  padding: 0.45rem 0.65rem 0.45rem 2rem;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-full);
  color: #fff;
  font-size: 0.8rem;
  outline: none;
  transition: all 0.2s ease;
}

.nav-search-input:focus {
  background: rgba(15, 23, 42, 0.95);
  border-color: var(--accent-cyan);
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
  width: 280px;
}

.nav-search-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  min-width: 260px;
  background: #0f172a;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.7);
  z-index: 1000;
  max-height: 260px;
  overflow-y: auto;
}

.nav-search-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.55rem 0.75rem;
  cursor: pointer;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  transition: background 0.15s ease;
}

.nav-search-item:hover {
  background: rgba(56, 189, 248, 0.15);
}

.nav-result-tag {
  color: #fff;
  font-family: var(--font-mono);
  font-size: 0.82rem;
}

.nav-result-badge {
  font-size: 0.65rem;
  padding: 0.1rem 0.35rem;
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
  border-radius: 4px;
}

@media (max-width: 768px) {
  .nav-search-wrap {
    display: none;
  }
}
</style>
