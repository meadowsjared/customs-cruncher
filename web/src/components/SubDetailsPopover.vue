<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import type { ReplayPlayer } from '../types'

const props = defineProps<{
  player: ReplayPlayer
  anchorEl: HTMLElement | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'mouseenter'): void
  (e: 'mouseleave'): void
}>()

const popoverRef = ref<HTMLElement | null>(null)
const popoverCoords = ref({ top: 0, left: 0, width: 320 })

const subPath = computed(() => {
  if (props.player.rowId) return `/player/${props.player.rowId}`
  if (props.player.subBattleTag) return `/player/${encodeURIComponent(props.player.subBattleTag.replace('#', '-'))}`
  return ''
})

const ownerPath = computed(() => {
  if (props.player.account_owner_row_id) return `/player/${props.player.account_owner_row_id}`
  if (props.player.account_owner_tag) {
    return `/player/${encodeURIComponent(props.player.account_owner_tag.replace('#', '-'))}`
  }
  if (props.player.account_owner_name) {
    return `/player/${encodeURIComponent(props.player.account_owner_name)}`
  }
  return ''
})

function buildHeroPath(basePath: string): string {
  if (!basePath || !props.player.hero) return ''
  const [pathPart, queryPart] = basePath.split('?')
  const heroSegment = `/hero/${encodeURIComponent(props.player.hero)}`
  return queryPart ? `${pathPart}${heroSegment}?${queryPart}` : `${pathPart}${heroSegment}`
}

const subHeroPath = computed(() => buildHeroPath(subPath.value))
const ownerHeroPath = computed(() => buildHeroPath(ownerPath.value))

const subDisplayName = computed(() => {
  return props.player.subBattleTag ? props.player.subBattleTag.split('#')[0] : ''
})

const ownerDisplayName = computed(() => {
  if (props.player.account_owner_name) return props.player.account_owner_name
  return props.player.account_owner_tag ? props.player.account_owner_tag.split('#')[0] : ''
})

function updatePosition() {
  if (!props.anchorEl) return
  const rect = props.anchorEl.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  const targetWidth = Math.min(340, viewportWidth - 24)
  const popoverHeight = popoverRef.value ? popoverRef.value.offsetHeight : 180

  let top = rect.bottom + 8
  let left = rect.left

  if (top + popoverHeight > viewportHeight - 16) {
    const aboveTop = rect.top - popoverHeight - 8
    if (aboveTop >= 16) {
      top = aboveTop
    } else {
      top = Math.max(16, viewportHeight - popoverHeight - 16)
    }
  }

  if (left + targetWidth > viewportWidth - 12) {
    left = viewportWidth - targetWidth - 12
  }
  if (left < 12) {
    left = 12
  }

  popoverCoords.value = { top, left, width: targetWidth }
}

function handleDocumentClick(e: MouseEvent) {
  const target = e.target
  if (
    target instanceof Node &&
    popoverRef.value &&
    !popoverRef.value.contains(target) &&
    props.anchorEl &&
    !props.anchorEl.contains(target)
  ) {
    emit('close')
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  }
}

watch(
  () => [props.anchorEl, props.player],
  async () => {
    await nextTick()
    updatePosition()
  },
  { immediate: true }
)

onMounted(() => {
  window.addEventListener('scroll', updatePosition, true)
  window.addEventListener('resize', updatePosition)
  document.addEventListener('click', handleDocumentClick)
  document.addEventListener('keydown', handleKeyDown)
  nextTick(updatePosition)
})

onUnmounted(() => {
  window.removeEventListener('scroll', updatePosition, true)
  window.removeEventListener('resize', updatePosition)
  document.removeEventListener('click', handleDocumentClick)
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="sub-popover-fade">
      <div
        ref="popoverRef"
        class="sub-details-popover"
        role="dialog"
        aria-label="Account substitution details"
        :style="{
          top: `${popoverCoords.top}px`,
          left: `${popoverCoords.left}px`,
          width: `${popoverCoords.width}px`,
        }"
        @click.stop
        @mouseenter="$emit('mouseenter')"
        @mouseleave="$emit('mouseleave')"
      >
        <div class="sub-popover-header">
          <div class="sub-header-title-row">
            <span class="sub-header-icon">🔄</span>
            <span class="sub-header-title">Account Substitution</span>
          </div>
          <button type="button" class="sub-close-btn" aria-label="Close" @click="$emit('close')">✕</button>
        </div>

        <div class="sub-cards-list">
          <div
            v-if="player.subBattleTag"
            class="sub-link-card sub-card-actual"
          >
            <div class="sub-card-meta">
              <span class="sub-card-label">Played By</span>
              <span class="sub-card-value">{{ player.subBattleTag }}</span>
            </div>
            <div class="sub-card-actions">
              <router-link
                v-if="subPath"
                :to="subPath"
                class="sub-action-btn"
                :title="`View player history for ${subDisplayName}`"
                @click="emit('close')"
              >
                Profile →
              </router-link>
              <router-link
                v-if="subHeroPath"
                :to="subHeroPath"
                class="sub-action-btn sub-action-hero"
                :title="`View ${subDisplayName}'s ${player.hero} matches`"
                @click="emit('close')"
              >
                {{ player.hero }} →
              </router-link>
            </div>
          </div>

          <div
            v-if="player.account_owner_name"
            class="sub-link-card sub-card-owner"
          >
            <div class="sub-card-meta">
              <span class="sub-card-label">Loaned By (Owner)</span>
              <span class="sub-card-value">{{ player.account_owner_tag || player.account_owner_name }}</span>
            </div>
            <div class="sub-card-actions">
              <router-link
                v-if="ownerPath"
                :to="ownerPath"
                class="sub-action-btn"
                :title="`View player history for ${ownerDisplayName}`"
                @click="emit('close')"
              >
                Owner →
              </router-link>
              <router-link
                v-if="ownerHeroPath"
                :to="ownerHeroPath"
                class="sub-action-btn sub-action-hero"
                :title="`View ${ownerDisplayName}'s ${player.hero} matches`"
                @click="emit('close')"
              >
                {{ player.hero }} →
              </router-link>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sub-details-popover {
  position: fixed;
  background: rgba(15, 23, 42, 0.97);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(168, 85, 247, 0.45);
  border-radius: 12px;
  padding: 0.9rem;
  box-shadow: 0 20px 44px rgba(0, 0, 0, 0.72), 0 0 22px rgba(168, 85, 247, 0.18);
  z-index: 9999;
  color: #f8fafc;
}

.sub-popover-fade-enter-active,
.sub-popover-fade-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.sub-popover-fade-enter-from,
.sub-popover-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}

.sub-popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.7rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
}

.sub-header-title-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.sub-header-icon {
  font-size: 0.95rem;
}

.sub-header-title {
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: #e9d5ff;
}

.sub-close-btn {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(148, 163, 184, 0.25);
  color: #94a3b8;
  border-radius: 6px;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.sub-close-btn:hover {
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
}

.sub-cards-list {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.sub-link-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  width: 100%;
  padding: 0.55rem 0.7rem;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(30, 41, 59, 0.65);
  text-align: left;
  transition: border-color 0.14s ease, background 0.14s ease;
}

.sub-link-card:hover {
  background: rgba(51, 65, 85, 0.65);
}

.sub-card-actual {
  border-color: rgba(168, 85, 247, 0.55);
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(59, 130, 246, 0.1));
  box-shadow: 0 4px 16px rgba(168, 85, 247, 0.16);
}

.sub-card-actual:hover {
  border-color: rgba(192, 132, 252, 0.85);
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.26), rgba(59, 130, 246, 0.14));
}

.sub-card-actual .sub-card-label {
  color: #d8b4fe;
}

.sub-card-owner {
  border-color: rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.55);
}

.sub-card-owner:hover {
  border-color: rgba(148, 163, 184, 0.32);
  background: rgba(30, 41, 59, 0.65);
}

.sub-card-owner .sub-card-value {
  color: #cbd5e1;
  font-weight: 600;
}

.sub-card-meta {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
  flex: 1 1 auto;
}

.sub-card-label {
  font-size: 0.66rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
}

.sub-card-value {
  font-size: 0.86rem;
  font-weight: 700;
  color: #f8fafc;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sub-card-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.sub-action-btn {
  display: inline-flex;
  align-items: center;
  padding: 0.28rem 0.52rem;
  border-radius: 6px;
  border: 1px solid rgba(56, 189, 248, 0.35);
  background: rgba(56, 189, 248, 0.1);
  color: #38bdf8;
  font-size: 0.7rem;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
  transition: transform 0.12s ease, background 0.12s ease, border-color 0.12s ease;
}

.sub-action-btn:hover {
  transform: translateY(-1px);
  background: rgba(56, 189, 248, 0.22);
  border-color: rgba(56, 189, 248, 0.65);
}

.sub-card-actual .sub-action-btn {
  border-color: rgba(192, 132, 252, 0.7);
  background: rgba(168, 85, 247, 0.34);
  color: #f5f3ff;
  box-shadow: 0 2px 8px rgba(168, 85, 247, 0.24);
}

.sub-card-actual .sub-action-btn:hover {
  background: rgba(168, 85, 247, 0.52);
  border-color: rgba(216, 180, 254, 0.9);
  color: #ffffff;
}

.sub-card-owner .sub-action-btn {
  border-color: rgba(148, 163, 184, 0.24);
  background: rgba(255, 255, 255, 0.04);
  color: #94a3b8;
  font-weight: 600;
}

.sub-card-owner .sub-action-btn:hover {
  background: rgba(251, 191, 36, 0.14);
  border-color: rgba(251, 191, 36, 0.45);
  color: #fbbf24;
}
</style>
