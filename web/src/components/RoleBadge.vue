<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, nextTick } from 'vue'

interface Props {
  role: string
  size?: 'sm' | 'md' | 'lg'
  badgeClass?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  badgeClass: '',
})

export interface RoleMeta {
  code: string
  name: string
  icon: string
  color: string
}

const ALL_ROLES: RoleMeta[] = [
  { code: 'T', name: 'Tank', icon: '🛡️', color: '#38bdf8' },
  { code: 'A', name: 'Assassin', icon: '⚔️', color: '#f87171' },
  { code: 'B', name: 'Bruiser', icon: '💪', color: '#fbbf24' },
  { code: 'H', name: 'Healer', icon: '💉', color: '#34d399' },
  { code: 'F', name: 'Flex', icon: '🔄', color: '#c084fc' },
]

const roleMap = new Map<string, RoleMeta>(ALL_ROLES.map(r => [r.code, r]))

// Parse active roles in the exact order chosen
const activeRoles = computed(() => {
  const raw = (props.role || '').trim().toUpperCase()
  if (!raw) return []

  const result: Array<{ meta: RoleMeta; priority: number }> = []
  const seen = new Set<string>()

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]
    if (seen.has(char)) continue
    seen.add(char)

    const meta = roleMap.get(char) ?? {
      code: char,
      name: `Role ${char}`,
      icon: '🎮',
      color: '#94a3b8',
    }

    result.push({ meta, priority: result.length + 1 })
  }

  return result
})

// Popover positioning
const badgeRef = ref<HTMLElement | null>(null)
const popoverRef = ref<HTMLElement | null>(null)
const isVisible = ref(false)
const popoverCoords = ref({ top: 0, left: 0 })

let showTimeout: ReturnType<typeof setTimeout> | null = null
let hideTimeout: ReturnType<typeof setTimeout> | null = null

function updatePosition() {
  if (!badgeRef.value) return
  const rect = badgeRef.value.getBoundingClientRect()
  const popoverWidth = 245
  const popoverHeight = 42 + activeRoles.value.length * 36

  const spaceBelow = window.innerHeight - rect.bottom
  const placeAbove = spaceBelow < popoverHeight + 12 && rect.top > popoverHeight + 12

  const top = placeAbove
    ? rect.top - popoverHeight - 6
    : rect.bottom + 6

  const idealLeft = rect.left + rect.width / 2 - popoverWidth / 2
  const left = Math.max(12, Math.min(window.innerWidth - popoverWidth - 12, idealLeft))

  popoverCoords.value = { top, left }
}

function handleMouseEnter() {
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }
  showTimeout = setTimeout(() => {
    updatePosition()
    isVisible.value = true
    nextTick(() => updatePosition())
  }, 70)
}

function handleMouseLeave() {
  if (showTimeout) {
    clearTimeout(showTimeout)
    showTimeout = null
  }
  hideTimeout = setTimeout(() => {
    isVisible.value = false
  }, 160)
}

function handlePopoverEnter() {
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }
}

function handlePopoverLeave() {
  hideTimeout = setTimeout(() => {
    isVisible.value = false
  }, 140)
}

function toggleClick(event: MouseEvent) {
  event.stopPropagation()
  if (isVisible.value) {
    isVisible.value = false
  } else {
    updatePosition()
    isVisible.value = true
    nextTick(() => updatePosition())
  }
}

function handleDocumentClick(event: MouseEvent) {
  if (!isVisible.value) return
  const path = event.composedPath()
  if (badgeRef.value && path.includes(badgeRef.value)) return
  if (popoverRef.value && path.includes(popoverRef.value)) return
  isVisible.value = false
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isVisible.value) {
    isVisible.value = false
  }
}

onMounted(() => {
  window.addEventListener('scroll', updatePosition, true)
  window.addEventListener('resize', updatePosition)
  document.addEventListener('click', handleDocumentClick)
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  if (showTimeout) clearTimeout(showTimeout)
  if (hideTimeout) clearTimeout(hideTimeout)
  window.removeEventListener('scroll', updatePosition, true)
  window.removeEventListener('resize', updatePosition)
  document.removeEventListener('click', handleDocumentClick)
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div
    ref="badgeRef"
    class="discord-role-badge-container"
    :class="[`size-${size}`, badgeClass]"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    @click="toggleClick"
  >
    <!-- Combined single tag with all role icons in choice order -->
    <div class="discord-role-tag">
      <span
        v-for="r in activeRoles"
        :key="r.meta.code"
        class="role-icon-item"
      >
        {{ r.meta.icon }}
      </span>
    </div>

    <!-- Teleported Discord Role Popover -->
    <Teleport to="body">
      <Transition name="discord-popover-fade">
        <div
          v-if="isVisible && activeRoles.length > 0"
          ref="popoverRef"
          class="discord-popover-card"
          :style="{
            top: `${popoverCoords.top}px`,
            left: `${popoverCoords.left}px`,
          }"
          @mouseenter="handlePopoverEnter"
          @mouseleave="handlePopoverLeave"
        >
          <!-- Popover Header Row -->
          <div class="popover-header-row">
            <span class="header-text">Update with <code class="cmd-pill">/role</code> in Discord</span>
          </div>

          <!-- Selected Roles Only (In order chosen) -->
          <div class="discord-roles-list">
            <div
              v-for="roleItem in activeRoles"
              :key="roleItem.meta.code"
              class="discord-role-btn"
              :class="{ 'is-primary': roleItem.priority === 1 }"
            >
              <div class="btn-left">
                <span class="btn-icon">{{ roleItem.meta.icon }}</span>
                <span class="btn-name">{{ roleItem.meta.name }}</span>
              </div>
              <span v-if="activeRoles.length > 1" class="btn-rank">#{{ roleItem.priority }}</span>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.discord-role-badge-container {
  display: inline-flex;
  align-items: center;
  position: relative;
  vertical-align: middle;
  cursor: pointer;
  user-select: none;
}

/* Combined Single Role Tag */
.discord-role-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.52rem;
  line-height: 1;
  background: #2b2d31;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  transition: all 0.16s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}

.discord-role-badge-container:hover .discord-role-tag {
  background: #35373c;
  border-color: rgba(88, 101, 242, 0.55);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5), 0 0 10px rgba(88, 101, 242, 0.25);
  transform: translateY(-1px);
}

.role-icon-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  font-size: 0.95rem;
}

/* Sizing */
.size-sm .discord-role-tag {
  padding: 0.1rem 0.38rem;
  gap: 0.22rem;
  border-radius: 4px;
}

.size-sm .role-icon-item {
  font-size: 0.78rem;
}

/* Discord Popover Card */
.discord-popover-card {
  position: fixed;
  width: 240px;
  background: #1e1f22;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 0.7rem 0.8rem;
  box-shadow:
    0 12px 28px rgba(0, 0, 0, 0.75),
    0 0 16px rgba(0, 0, 0, 0.4);
  z-index: 99999;
  user-select: none;
  cursor: default;
  text-align: left;
  animation: popoverDrop 0.14s ease-out;
}

@keyframes popoverDrop {
  from {
    opacity: 0;
    transform: translateY(-4px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* Popover Header Row */
.popover-header-row {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.45rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.header-text {
  font-size: 0.72rem;
  color: #949ba4;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
}

.cmd-pill {
  font-family: var(--font-mono, monospace);
  font-size: 0.72rem;
  color: #e0e4ff;
  background: rgba(88, 101, 242, 0.25);
  border: 1px solid rgba(88, 101, 242, 0.45);
  padding: 1px 5px;
  border-radius: 4px;
  margin: 0 0.25rem;
  font-weight: 700;
}

/* Selected Roles List */
.discord-roles-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.discord-role-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.38rem 0.65rem;
  font-size: 0.76rem;
  font-weight: 600;
  border-radius: 4px;
  background: #5865f2;
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 2px 6px rgba(88, 101, 242, 0.35);
  transition: all 0.14s ease;
}

.discord-role-btn.is-primary {
  background: #4752c4;
  box-shadow: 0 2px 8px rgba(71, 82, 196, 0.45);
}

.btn-left {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.btn-icon {
  font-size: 0.88rem;
  line-height: 1;
}

.btn-name {
  line-height: 1.2;
}

.btn-rank {
  font-size: 0.64rem;
  font-weight: 700;
  background: rgba(0, 0, 0, 0.28);
  padding: 2px 5px;
  border-radius: 3px;
  color: #e0e4ff;
  letter-spacing: 0.02em;
}

/* Transition */
.discord-popover-fade-enter-active,
.discord-popover-fade-leave-active {
  transition: opacity 0.14s ease-out, transform 0.14s ease-out;
}

.discord-popover-fade-enter-from,
.discord-popover-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>
