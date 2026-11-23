<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { PlayerMmrHistoryPoint } from '../types'

interface Props {
  history?: PlayerMmrHistoryPoint[]
  currentMmr: number
  baseMmr?: number | null
  adjustment?: number | null
  playerName?: string
  highlightHero?: string
}

const props = withDefaults(defineProps<Props>(), {
  history: () => [],
  baseMmr: null,
  adjustment: null,
  playerName: '',
  highlightHero: '',
})

const router = useRouter()

function openMatch(replayId?: number) {
  if (replayId) {
    router.push(`/replay/${replayId}`)
  }
}

interface InternalGraphPoint {
  index: number
  x: number
  y: number
  mmr: number
  delta: number
  dateStr: string
  hero?: string
  win?: boolean
  map?: string
  isRated: boolean
  isSeed?: boolean
  replayId?: number
}

// Hover state
const hoveredIndex = ref<number | null>(null)

// Format helper
function formatNumber(val: number): string {
  return val.toLocaleString()
}

function formatDate(isoStr: string): string {
  if (!isoStr || isoStr === 'Seed') return isoStr
  try {
    const d = new Date(isoStr)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return isoStr
  }
}

// Dimensions
const SVG_WIDTH = 420
const SVG_HEIGHT = 160
const PAD_TOP = 18
const PAD_BOTTOM = 28
const PAD_LEFT = 38
const PAD_RIGHT = 18
const PLOT_WIDTH = SVG_WIDTH - PAD_LEFT - PAD_RIGHT
const PLOT_HEIGHT = SVG_HEIGHT - PAD_TOP - PAD_BOTTOM

// Data preparation
const fullSequence = computed<PlayerMmrHistoryPoint[]>(() => {
  return props.history || []
})

const stats = computed(() => {
  const points = fullSequence.value
  if (points.length === 0) {
    const fallbackMmr = props.currentMmr
    return {
      peak: fallbackMmr,
      low: fallbackMmr,
      starting: fallbackMmr,
      netChange: 0,
      totalGames: 0,
    }
  }

  let peak = points[0].mmr
  let low = points[0].mmr
  const starting = points[0].preMmr

  for (const pt of points) {
    if (pt.mmr > peak) peak = pt.mmr
    if (pt.mmr < low) low = pt.mmr
  }
  if (starting > peak) peak = starting
  if (starting < low) low = starting

  const latest = points[points.length - 1].mmr
  const netChange = latest - starting

  return {
    peak,
    low,
    starting,
    netChange,
    totalGames: points.length,
  }
})

const yBounds = computed(() => {
  const minVal = stats.value.low
  const maxVal = stats.value.peak
  const span = Math.max(maxVal - minVal, 40)
  const pad = Math.ceil(span * 0.1)
  return {
    min: Math.floor((minVal - pad) / 10) * 10,
    max: Math.ceil((maxVal + pad) / 10) * 10,
  }
})

// Generate mapped SVG coordinates
const plotPoints = computed<InternalGraphPoint[]>(() => {
  const raw = fullSequence.value
  const { min, max } = yBounds.value
  const yRange = Math.max(max - min, 1)

  if (raw.length === 0) return []

  // If only 1 match, synthesize starting point so a line exists
  const pointsToMap: Array<{
    replayId?: number
    mmr: number
    delta: number
    date: string
    hero?: string
    win?: boolean
    map?: string
    isRated: boolean
    isSeed?: boolean
  }> = []

  // Add initial seed point if we have at least 1 match
  pointsToMap.push({
    replayId: undefined,
    mmr: raw[0].preMmr,
    delta: 0,
    date: raw[0].date,
    isRated: false,
    isSeed: true,
  })

  for (const r of raw) {
    pointsToMap.push({
      replayId: r.replayId,
      mmr: r.mmr,
      delta: r.delta,
      date: r.date,
      hero: r.hero,
      win: r.win,
      map: r.map,
      isRated: r.isRated,
    })
  }

  const count = pointsToMap.length
  return pointsToMap.map((p, idx) => {
    const xFraction = count > 1 ? idx / (count - 1) : 0.5
    const x = PAD_LEFT + xFraction * PLOT_WIDTH
    const yFraction = (p.mmr - min) / yRange
    const y = PAD_TOP + (1 - yFraction) * PLOT_HEIGHT

    return {
      index: idx,
      x,
      y,
      mmr: p.mmr,
      delta: p.delta,
      dateStr: p.isSeed ? 'Initial Seed' : formatDate(p.date),
      hero: p.hero,
      win: p.win,
      map: p.map,
      isRated: p.isRated,
      isSeed: p.isSeed,
      replayId: p.replayId,
    }
  })
})

// Smooth Catmull-Rom spline path
const linePath = computed<string>(() => {
  const pts = plotPoints.value
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`

  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2 >= pts.length ? pts.length - 1 : i + 2]

    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }
  return d
})

const areaPath = computed<string>(() => {
  const pts = plotPoints.value
  if (pts.length < 2) return ''
  const bottomY = PAD_TOP + PLOT_HEIGHT
  const lPath = linePath.value
  return `${lPath} L ${pts[pts.length - 1].x.toFixed(1)} ${bottomY} L ${pts[0].x.toFixed(1)} ${bottomY} Z`
})

// Starting seed baseline Y
const seedBaselineY = computed<number | null>(() => {
  const seed = props.baseMmr ?? (plotPoints.value[0]?.mmr ?? null)
  if (seed == null) return null
  const { min, max } = yBounds.value
  const yRange = Math.max(max - min, 1)
  const yFraction = (seed - min) / yRange
  return PAD_TOP + (1 - yFraction) * PLOT_HEIGHT
})

// Active hovered point
const activePoint = computed<InternalGraphPoint | null>(() => {
  const pts = plotPoints.value
  if (pts.length === 0) return null
  if (hoveredIndex.value == null) {
    // Default to the latest point
    return pts[pts.length - 1]
  }
  const idx = Math.max(0, Math.min(hoveredIndex.value, pts.length - 1))
  return pts[idx]
})

function onSvgPointerMove(event: PointerEvent) {
  const pts = plotPoints.value
  if (pts.length === 0) return

  const target = event.currentTarget
  if (!(target instanceof SVGSVGElement)) return

  const rect = target.getBoundingClientRect()
  const mouseX = ((event.clientX - rect.left) / rect.width) * SVG_WIDTH

  const clampedX = Math.max(PAD_LEFT, Math.min(mouseX, PAD_LEFT + PLOT_WIDTH))
  const ratio = (clampedX - PAD_LEFT) / PLOT_WIDTH
  const nearestIdx = Math.round(ratio * (pts.length - 1))

  hoveredIndex.value = nearestIdx
}

function onSvgPointerLeave() {
  hoveredIndex.value = null
}
</script>

<template>
  <div class="mmr-trend-popover" role="tooltip" @click.stop>
    <!-- Header: Quick Summary Stats -->
    <div class="popover-header">
      <div class="header-title-row">
        <span class="header-icon">📈</span>
        <span class="header-title">MMR Progression</span>
        <span class="header-badge">{{ stats.totalGames }} Games</span>
      </div>

      <div class="stat-highlights">
        <div class="highlight-item" title="Current In-House Rating">
          <span class="hl-label">Current</span>
          <span class="hl-val val-gold">{{ formatNumber(currentMmr) }}</span>
        </div>
        <div class="highlight-item" title="Highest MMR Achieved">
          <span class="hl-label">Peak</span>
          <span class="hl-val val-green">{{ formatNumber(stats.peak) }}</span>
        </div>
        <div class="highlight-item" title="Lowest MMR Recorded">
          <span class="hl-label">Low</span>
          <span class="hl-val val-dim">{{ formatNumber(stats.low) }}</span>
        </div>
        <div class="highlight-item" title="Net MMR Change From Seed">
          <span class="hl-label">Net</span>
          <span class="hl-val" :class="stats.netChange >= 0 ? 'val-green' : 'val-red'">
            {{ stats.netChange > 0 ? '+' : '' }}{{ formatNumber(stats.netChange) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="plotPoints.length === 0" class="empty-trend">
      <p class="empty-title">No Rated Custom Games Yet</p>
      <p class="empty-sub">
        Starting Base MMR: <strong>{{ baseMmr ? formatNumber(baseMmr) : formatNumber(currentMmr) }}</strong>
      </p>
      <p class="empty-hint">Play custom 5v5 matches to establish your MMR trend curve!</p>
    </div>

    <!-- Active Graph Section -->
    <div v-else class="graph-stage">
      <svg
        class="mmr-svg"
        :viewBox="`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`"
        preserveAspectRatio="none"
        @pointermove="onSvgPointerMove"
        @pointerleave="onSvgPointerLeave"
      >
        <defs>
          <!-- Gradient Fill for Area Under Curve -->
          <linearGradient id="mmrAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#fbbf24" stop-opacity="0.32" />
            <stop offset="70%" stop-color="#fbbf24" stop-opacity="0.06" />
            <stop offset="100%" stop-color="#fbbf24" stop-opacity="0.0" />
          </linearGradient>
        </defs>

        <!-- Horizontal Guide Lines & Labels -->
        <g class="grid-lines">
          <!-- Max MMR line -->
          <line
            :x1="PAD_LEFT"
            :x2="SVG_WIDTH - PAD_RIGHT"
            :y1="PAD_TOP"
            :y2="PAD_TOP"
            class="grid-line"
          />
          <text :x="PAD_LEFT - 6" :y="PAD_TOP + 3" class="axis-label" text-anchor="end">
            {{ yBounds.max }}
          </text>

          <!-- Mid MMR line -->
          <line
            :x1="PAD_LEFT"
            :x2="SVG_WIDTH - PAD_RIGHT"
            :y1="PAD_TOP + PLOT_HEIGHT / 2"
            :y2="PAD_TOP + PLOT_HEIGHT / 2"
            class="grid-line"
          />
          <text
            :x="PAD_LEFT - 6"
            :y="PAD_TOP + PLOT_HEIGHT / 2 + 3"
            class="axis-label"
            text-anchor="end"
          >
            {{ Math.round((yBounds.min + yBounds.max) / 2) }}
          </text>

          <!-- Min MMR line -->
          <line
            :x1="PAD_LEFT"
            :x2="SVG_WIDTH - PAD_RIGHT"
            :y1="PAD_TOP + PLOT_HEIGHT"
            :y2="PAD_TOP + PLOT_HEIGHT"
            class="grid-line"
          />
          <text
            :x="PAD_LEFT - 6"
            :y="PAD_TOP + PLOT_HEIGHT + 3"
            class="axis-label"
            text-anchor="end"
          >
            {{ yBounds.min }}
          </text>

          <!-- Starting Seed Reference Line (if in range) -->
          <line
            v-if="seedBaselineY !== null && seedBaselineY >= PAD_TOP && seedBaselineY <= PAD_TOP + PLOT_HEIGHT"
            :x1="PAD_LEFT"
            :x2="SVG_WIDTH - PAD_RIGHT"
            :y1="seedBaselineY"
            :y2="seedBaselineY"
            class="seed-baseline"
          />
        </g>

        <!-- Area Fill -->
        <path :d="areaPath" fill="url(#mmrAreaGradient)" />

        <!-- Line Curve -->
        <path
          :d="linePath"
          fill="none"
          stroke="#fbbf24"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          shape-rendering="geometricPrecision"
        />

        <!-- Active Hover Guides & Dot -->
        <g v-if="activePoint" class="interactive-overlay">
          <!-- Vertical Crosshair Line -->
          <line
            :x1="activePoint.x"
            :x2="activePoint.x"
            :y1="PAD_TOP"
            :y2="PAD_TOP + PLOT_HEIGHT"
            class="crosshair-line"
          />

          <!-- Outer Glow Ring -->
          <circle
            :cx="activePoint.x"
            :cy="activePoint.y"
            r="7"
            fill="rgba(251, 191, 36, 0.28)"
          />

          <!-- Inner Dot -->
          <circle
            :cx="activePoint.x"
            :cy="activePoint.y"
            r="3.5"
            fill="#fbbf24"
            stroke="#0f172a"
            stroke-width="1.8"
          />
        </g>
      </svg>

      <!-- Inspection Details Box (60fps responsive detail card) -->
      <div
        v-if="activePoint"
        class="point-inspection-card"
        :class="{ 'is-clickable': Boolean(activePoint.replayId && !activePoint.isSeed) }"
        :title="activePoint.replayId && !activePoint.isSeed ? 'Click to open replay details' : undefined"
        @click="activePoint.replayId && !activePoint.isSeed ? openMatch(activePoint.replayId) : null"
      >
        <div class="inspect-main">
          <span class="inspect-badge" :class="activePoint.isSeed ? 'badge-seed' : (activePoint.win ? 'badge-win' : 'badge-loss')">
            {{ activePoint.isSeed ? 'Seed' : (activePoint.win ? 'Victory' : 'Defeat') }}
          </span>
          <span v-if="activePoint.hero" class="inspect-hero">{{ activePoint.hero }}</span>
          <span v-if="activePoint.delta !== 0" class="inspect-delta" :class="activePoint.delta > 0 ? 'val-green' : 'val-red'">
            {{ activePoint.delta > 0 ? `+${activePoint.delta}` : activePoint.delta }} MMR
          </span>
        </div>

        <div class="inspect-sub">
          <span class="inspect-date">{{ activePoint.dateStr }}</span>
          <span v-if="activePoint.map" class="inspect-dot">•</span>
          <span v-if="activePoint.map" class="inspect-map">{{ activePoint.map }}</span>
          <span class="inspect-rating">Rating: <strong>{{ formatNumber(activePoint.mmr) }}</strong></span>
        </div>
      </div>
    </div>

    <!-- Footer Note -->
    <div class="popover-footer">
      <span>Seeded 5v5 Team Elo • Hover graph to inspect matches</span>
    </div>
  </div>
</template>

<style scoped>
.mmr-trend-popover {
  position: absolute;
  top: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%);
  width: 440px;
  max-width: calc(100vw - 32px);
  background: rgba(15, 23, 42, 0.96);
  backdrop-filter: blur(14px);
  border: 1px solid rgba(251, 191, 36, 0.35);
  box-shadow:
    0 16px 36px rgba(0, 0, 0, 0.8),
    0 0 24px rgba(251, 191, 36, 0.16);
  border-radius: var(--radius-md, 12px);
  padding: 1rem 1.15rem;
  z-index: 9999;
  user-select: none;
  cursor: default;
  text-align: left;
  animation: popoverFadeIn 0.18s ease-out;
}

@keyframes popoverFadeIn {
  from {
    opacity: 0;
    transform: translate(-50%, -6px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0) scale(1);
  }
}

/* Header & Stats Row */
.popover-header {
  margin-bottom: 0.75rem;
}

.header-title-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-bottom: 0.6rem;
}

.header-icon {
  font-size: 1.05rem;
}

.header-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: #fff;
}

.header-badge {
  margin-left: auto;
  font-size: 0.74rem;
  font-family: var(--font-mono, monospace);
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-muted, #94a3b8);
  padding: 0.15rem 0.5rem;
  border-radius: var(--radius-full, 9999px);
}

.stat-highlights {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.45rem;
}

.highlight-item {
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 8px;
  padding: 0.35rem 0.45rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.hl-label {
  font-size: 0.68rem;
  color: var(--text-muted, #94a3b8);
  text-transform: uppercase;
  font-weight: 600;
}

.hl-val {
  font-size: 0.88rem;
  font-weight: 700;
  font-family: var(--font-mono, monospace);
}

.val-gold {
  color: #fbbf24;
}

.val-green {
  color: #34d399;
}

.val-red {
  color: #fb7185;
}

.val-dim {
  color: #94a3b8;
}

/* Empty State */
.empty-trend {
  padding: 1.5rem 1rem;
  text-align: center;
}

.empty-title {
  color: #fff;
  font-weight: 600;
  margin: 0 0 0.25rem 0;
  font-size: 0.95rem;
}

.empty-sub {
  color: var(--text-muted, #94a3b8);
  font-size: 0.85rem;
  margin: 0 0 0.5rem 0;
}

.empty-hint {
  color: #64748b;
  font-size: 0.78rem;
  margin: 0;
}

/* Graph Stage */
.graph-stage {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.mmr-svg {
  width: 100%;
  height: 155px;
  overflow: visible;
  touch-action: none;
}

.grid-line {
  stroke: rgba(255, 255, 255, 0.08);
  stroke-width: 1;
  stroke-dasharray: 2 4;
}

.seed-baseline {
  stroke: rgba(56, 189, 248, 0.35);
  stroke-width: 1.2;
  stroke-dasharray: 3 3;
}

.axis-label {
  fill: #64748b;
  font-size: 9px;
  font-family: var(--font-mono, monospace);
  alignment-baseline: middle;
}

.crosshair-line {
  stroke: rgba(255, 255, 255, 0.3);
  stroke-width: 1.2;
  stroke-dasharray: 2 2;
}

/* Point Details Card */
.point-inspection-card {
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 0.45rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-height: 48px;
  justify-content: center;
  transition: all 0.15s ease;
}

.point-inspection-card.is-clickable:hover {
  border-color: rgba(56, 189, 248, 0.45);
  background: rgba(56, 189, 248, 0.08);
  cursor: pointer;
}

.inspect-main {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.82rem;
}

.inspect-badge {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  text-transform: uppercase;
}

.badge-win {
  background: rgba(16, 185, 129, 0.22);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.4);
}

.badge-loss {
  background: rgba(244, 63, 94, 0.22);
  color: #fb7185;
  border: 1px solid rgba(244, 63, 94, 0.4);
}

.badge-seed {
  background: rgba(56, 189, 248, 0.2);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.4);
}

.inspect-hero {
  color: #fff;
  font-weight: 600;
}

.inspect-delta {
  margin-left: auto;
  font-family: var(--font-mono, monospace);
  font-weight: 700;
}

.inspect-sub {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.74rem;
  color: #94a3b8;
}

.inspect-dot {
  color: #475569;
}

.inspect-map {
  color: #cbd5e1;
}

.inspect-rating {
  margin-left: auto;
  font-family: var(--font-mono, monospace);
}

.inspect-rating strong {
  color: #fbbf24;
}

/* Footer */
.popover-footer {
  margin-top: 0.4rem;
  text-align: center;
  font-size: 0.7rem;
  color: #64748b;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  padding-top: 0.4rem;
}
</style>
