<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { ReplayDetail, ReplayPlayer, ReplayBanItem, PlayerSearchItem, PlayerCombatBadge } from '../types'
import {
  formatDuration,
  formatDateRelative,
  formatNumber,
  getHeroImageUrl,
  getMapImageUrl,
  isAramMap,
  getTalentInfo,
  getTalentImageUrl,
  formatTalentName,
  getTalentTooltip,
  getTalentBuildCode,
  resolveHeroName,
  formatTalentDescriptionHtml,
  isQuestTalent,
  getCorrelatedQuestStats,
} from '../utils/hots'

const route = useRoute()
const router = useRouter()

const match = ref<ReplayDetail | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

type ActiveTab = 'overview' | 'talents' | 'combat' | 'defense' | 'siege' | 'bm'
const activeTab = ref<ActiveTab>('overview')

// Target player/hero from URL query parameters
const targetAccount = computed(() => {
  const acc = route.query.account
  if (!acc || typeof acc !== 'string') return ''
  return acc.replace(/\(sub\)$/i, '').trim().toLowerCase()
})

const targetHero = computed(() => {
  const h = route.query.hero
  if (!h || typeof h !== 'string') return ''
  return h.replace(/_/g, ' ').trim().toLowerCase()
})

// Helper to sort players in the exact order of the HotS in-game scoreboard (based on player_ids / details.m_playerList, or team_players strings)
function sortPlayersByScoreboard(players: ReplayPlayer[], teamNumber?: number): ReplayPlayer[] {
  const orderList = match.value?.player_ids || []
  const heroList = match.value?.heroes || []
  if (orderList.length > 0 || heroList.length > 0) {
    return [...players].sort((a, b) => {
      let aIdx = a.ToonHandle && orderList.length > 0 ? orderList.indexOf(a.ToonHandle) : -1
      let bIdx = b.ToonHandle && orderList.length > 0 ? orderList.indexOf(b.ToonHandle) : -1
      if (aIdx === -1 && a.hero && heroList.length > 0) {
        aIdx = heroList.findIndex((h) => h.toLowerCase() === a.hero.toLowerCase())
      }
      if (bIdx === -1 && b.hero && heroList.length > 0) {
        bIdx = heroList.findIndex((h) => h.toLowerCase() === b.hero.toLowerCase())
      }
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx
      if (aIdx !== -1) return -1
      if (bIdx !== -1) return 1
      return 0
    })
  }

  // Fallback: parse order from team0_players or team1_players string
  const teamPlayersStr = teamNumber === 0 ? match.value?.team0_players : (teamNumber === 1 ? match.value?.team1_players : undefined)
  if (teamPlayersStr) {
    const parts = teamPlayersStr.split(',').map((s) => s.trim())
    return [...players].sort((a, b) => {
      const aHeroLower = a.hero ? a.hero.toLowerCase() : ''
      const bHeroLower = b.hero ? b.hero.toLowerCase() : ''
      const aNameLower = a.name ? a.name.toLowerCase() : ''
      const bNameLower = b.name ? b.name.toLowerCase() : ''

      const aIdx = parts.findIndex((part) => {
        const pLower = part.toLowerCase()
        return (aHeroLower && pLower.includes(`(${aHeroLower})`)) || (aNameLower && pLower.startsWith(aNameLower))
      })
      const bIdx = parts.findIndex((part) => {
        const pLower = part.toLowerCase()
        return (bHeroLower && pLower.includes(`(${bHeroLower})`)) || (bNameLower && pLower.startsWith(bNameLower))
      })

      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx
      if (aIdx !== -1) return -1
      if (bIdx !== -1) return 1
      return 0
    })
  }

  return players
}

// Match players grouped by team
const team0Players = computed(() => {
  if (!match.value?.players) return []
  const filtered = Object.values(match.value.players).filter((p) => p.team === 0)
  return sortPlayersByScoreboard(filtered, 0)
})

const team1Players = computed(() => {
  if (!match.value?.players) return []
  const filtered = Object.values(match.value.players).filter((p) => p.team === 1)
  return sortPlayersByScoreboard(filtered, 1)
})

// Draft & bans computed data
const team0Bans = computed<ReplayBanItem[]>(() => match.value?.bans?.['0'] || [])
const team1Bans = computed<ReplayBanItem[]>(() => match.value?.bans?.['1'] || [])

const team0Picks = computed<(string | null)[]>(() => {
  const p = match.value?.picks?.['0'] || match.value?.picks?.[0]
  if (Array.isArray(p)) return p
  return []
})

const team1Picks = computed<(string | null)[]>(() => {
  const p = match.value?.picks?.['1'] || match.value?.picks?.[1]
  if (Array.isArray(p)) return p
  return []
})

const firstPickTeam = computed<number | null>(() => {
  if (!match.value) return null
  if (typeof match.value.picks?.first === 'number') {
    return match.value.picks.first
  }
  if (typeof match.value.first_pick_win === 'boolean') {
    return match.value.first_pick_win ? match.value.winner : (match.value.winner === 0 ? 1 : 0)
  }
  return null
})

const hasDraftInfo = computed<boolean>(() => {
  return team0Bans.value.length > 0 || team1Bans.value.length > 0 || team0Picks.value.length > 0 || team1Picks.value.length > 0
})

function getPickNumber(team: number, pickIndex: number): number {
  if (firstPickTeam.value === null) {
    return pickIndex + 1
  }
  const isFirstTeam = firstPickTeam.value === team
  const firstPickOrder = [1, 4, 5, 8, 9]
  const secondPickOrder = [2, 3, 6, 7, 10]
  return isFirstTeam
    ? (firstPickOrder[pickIndex] || pickIndex + 1)
    : (secondPickOrder[pickIndex] || pickIndex + 1)
}

function getPlayerPickOrder(heroName: string | undefined | null, team: number): number | null {
  if (!heroName) return null
  const picks = team === 0 ? team0Picks.value : team1Picks.value
  if (!picks.length) return null

  const cleanHero = resolveHeroName(heroName).toLowerCase()
  let idx = picks.findIndex(p => {
    if (!p) return false
    const pClean = resolveHeroName(p).toLowerCase()
    return pClean === cleanHero || p.toLowerCase() === heroName.toLowerCase()
  })

  // If this hero wasn't directly matched and there is an unassigned (null) slot in picks,
  // check if this player is the single remaining unmatched player on the team
  if (idx === -1) {
    const nullIdx = picks.findIndex(p => !p)
    if (nullIdx !== -1) {
      const players = team === 0 ? team0Players.value : team1Players.value
      const unmatchedPlayers = players.filter(pl => {
        if (!pl.hero) return false
        const plClean = resolveHeroName(pl.hero).toLowerCase()
        return !picks.some(p => {
          if (!p) return false
          const pClean = resolveHeroName(p).toLowerCase()
          return pClean === plClean || p.toLowerCase() === pl.hero.toLowerCase()
        })
      })
      if (unmatchedPlayers.length === 1 && unmatchedPlayers[0]?.hero === heroName) {
        idx = nullIdx
      }
    }
  }

  if (idx === -1) return null
  return getPickNumber(team, idx)
}

// Player combat badges (First Blood & Multikills: Double, Triple, Quad, 5-Kill)
const playerCombatBadgesMap = computed<Map<string, PlayerCombatBadge[]>>(() => {
  const badgesMap = new Map<string, PlayerCombatBadge[]>()
  if (!match.value?.players) return badgesMap

  const allPlayers = Object.values(match.value.players)
  const takedowns = match.value.takedowns

  if (takedowns && takedowns.length > 0) {
    const sortedTds = [...takedowns].sort((a, b) => a.time - b.time)
    const firstTd = sortedTds[0]
    const victimPlayer = firstTd?.victim
      ? allPlayers.find(
          (p) =>
            (firstTd.victim.player && p.ToonHandle === firstTd.victim.player) ||
            (firstTd.victim.hero && p.hero === firstTd.victim.hero)
        )
      : null
    const killerTeam = victimPlayer ? (victimPlayer.team === 0 ? 1 : 0) : null

    // Credit the kill only to the single primary killer who got credit for the kill
    const primaryKiller = firstTd?.victim?.killedBy
      || firstTd?.killer
      || (firstTd?.killers && Array.isArray(firstTd.killers) && firstTd.killers.length > 0
        ? firstTd.killers.find((k) => k.player && k.player !== '0' && k.hero !== 'Nexus Forces') || firstTd.killers[0]
        : null)

    const firstBloodPlayerHandle = primaryKiller?.player || null
    const firstBloodHeroLower = primaryKiller?.hero ? primaryKiller.hero.toLowerCase() : null
    const firstBloodTimeStr = firstTd ? formatDuration(firstTd.time) : ''
    const victimHeroName = firstTd?.victim?.hero
      ? resolveHeroName(firstTd.victim.hero) || firstTd.victim.hero
      : 'Enemy Hero'

    // 2. Multikills (chain takedowns within 5 seconds)
    // A multikill belongs to the team that scored the takedowns and is awarded to at most ONE player:
    // the player who landed the final killing blow (the LAST person to get the kill).
    type MultikillRecord = {
      tier: number
      timeStr: string
      time: number
    }
    const playerMultikillsMap = new Map<string, MultikillRecord[]>()
    for (const p of allPlayers) {
      const pKey = p.ToonHandle || `${p.name}-${p.hero}`
      playerMultikillsMap.set(pKey, [])
    }

    // Check if we have authoritative killers from the parser (victim.killedBy or killer)
    const hasAuthoritativeKillers = sortedTds.some((td) => Boolean(td.victim?.killedBy || td.killer))

    if (hasAuthoritativeKillers) {
      // Standard HotS multikills: consecutive kills scored by the SAME player within 10 seconds
      for (const p of allPlayers) {
        const pHeroLower = p.hero ? p.hero.toLowerCase() : ''
        const myKills = sortedTds.filter((td) => {
          const killerRef = td.victim?.killedBy || td.killer
          if (!killerRef) return false
          if (killerRef.player && p.ToonHandle) return killerRef.player === p.ToonHandle
          if (killerRef.hero && pHeroLower) return killerRef.hero.toLowerCase() === pHeroLower
          return false
        })

        let currentStreak: typeof sortedTds = []
        let lastTime = -999

        for (const td of myKills) {
          if (td.time - lastTime <= 10) {
            currentStreak.push(td)
          } else {
            if (currentStreak.length >= 2) {
              const finalTd = currentStreak[currentStreak.length - 1]
              const tier = currentStreak.length >= 5 ? 5 : currentStreak.length
              const pKey = p.ToonHandle || `${p.name}-${p.hero}`
              const awards = playerMultikillsMap.get(pKey) || []
              awards.push({
                tier,
                time: finalTd.time,
                timeStr: formatDuration(finalTd.time),
              })
              playerMultikillsMap.set(pKey, awards)
            }
            currentStreak = [td]
          }
          lastTime = td.time
        }

        if (currentStreak.length >= 2) {
          const finalTd = currentStreak[currentStreak.length - 1]
          const tier = currentStreak.length >= 5 ? 5 : currentStreak.length
          const pKey = p.ToonHandle || `${p.name}-${p.hero}`
          const awards = playerMultikillsMap.get(pKey) || []
          awards.push({
            tier,
            time: finalTd.time,
            timeStr: formatDuration(finalTd.time),
          })
          playerMultikillsMap.set(pKey, awards)
        }
      }
    } else {
      // Legacy fallback for old replays without killedBy tracking: process team streaks
      for (const kTeam of [0, 1]) {
        const teamTds = sortedTds.filter((td) => {
          const victim = td.victim
            ? allPlayers.find(
                (vp) =>
                  (td.victim.player && vp.ToonHandle === td.victim.player) ||
                  (td.victim.hero && vp.hero === td.victim.hero)
              )
            : null
          return victim ? victim.team !== kTeam : false
        })

        // Group takedowns occurring within 5 seconds into streaks
        let currentStreak: typeof sortedTds = []
        let lastTime = -999
        const teamStreaks: (typeof sortedTds)[] = []

        for (const td of teamTds) {
          if (td.time - lastTime <= 5) {
            currentStreak.push(td)
          } else {
            if (currentStreak.length >= 2) {
              teamStreaks.push(currentStreak)
            }
            currentStreak = [td]
          }
          lastTime = td.time
        }
        if (currentStreak.length >= 2) {
          teamStreaks.push(currentStreak)
        }

        for (const streak of teamStreaks) {
          const finalTd = streak[streak.length - 1]
          const finalTime = finalTd.time
          const tier = streak.length >= 5 ? 5 : streak.length

          // Find the player who landed the final kill in this streak
          let winner: (typeof allPlayers)[0] | null = null

          // 1. Authoritative killer if available (from victim.killedBy or killer)
          const killerRef = finalTd.victim?.killedBy || finalTd.killer
          if (killerRef) {
            winner = allPlayers.find(
              (p) =>
                p.team === kTeam &&
                ((killerRef.player && p.ToonHandle === killerRef.player) ||
                  (killerRef.hero && p.hero && p.hero.toLowerCase() === killerRef.hero.toLowerCase()))
            ) || null
          }

          // 2. Fallback: Determine single best candidate among finalTd participants
          if (!winner && finalTd.killers && Array.isArray(finalTd.killers) && finalTd.killers.length > 0) {
            const candidates = allPlayers.filter((p) => {
              if (p.team !== kTeam) return false
              const pHeroLower = p.hero ? p.hero.toLowerCase() : ''
              const inKill = finalTd.killers.some(
                (k) => (k.player && k.player === p.ToonHandle) || (k.hero && k.hero.toLowerCase() === pHeroLower)
              )
              if (!inKill) return false

              const soloKills = p.gameStats?.SoloKill || 0
              const multikillStat = p.gameStats?.Multikill || 0
              if (soloKills < 2 || multikillStat <= 0) return false

              const pKey = p.ToonHandle || `${p.name}-${p.hero}`
              const currentAwards = playerMultikillsMap.get(pKey) || []
              return currentAwards.length < multikillStat
            })

            if (candidates.length > 0) {
              candidates.sort((a, b) => {
                const aHeroLower = a.hero ? a.hero.toLowerCase() : ''
                const bHeroLower = b.hero ? b.hero.toLowerCase() : ''
                const aStreakParticipation = streak.filter((td) =>
                  td.killers?.some((k) => (k.player && k.player === a.ToonHandle) || (k.hero && k.hero.toLowerCase() === aHeroLower))
                ).length
                const bStreakParticipation = streak.filter((td) =>
                  td.killers?.some((k) => (k.player && k.player === b.ToonHandle) || (k.hero && k.hero.toLowerCase() === bHeroLower))
                ).length
                if (bStreakParticipation !== aStreakParticipation) {
                  return bStreakParticipation - aStreakParticipation
                }

                const aSolo = a.gameStats?.SoloKill || 0
                const bSolo = b.gameStats?.SoloKill || 0
                if (bSolo !== aSolo) return bSolo - aSolo

                const aMulti = a.gameStats?.Multikill || 0
                const bMulti = b.gameStats?.Multikill || 0
                if (bMulti !== aMulti) return bMulti - aMulti

                const aDmg = a.gameStats?.HeroDamage || 0
                const bDmg = b.gameStats?.HeroDamage || 0
                return bDmg - aDmg
              })
              winner = candidates[0]
            }
          }

          // Assign to the single winning player
          if (winner) {
            const wKey = winner.ToonHandle || `${winner.name}-${winner.hero}`
            const awards = playerMultikillsMap.get(wKey) || []
            awards.push({
              tier,
              time: finalTime,
              timeStr: formatDuration(finalTime),
            })
            playerMultikillsMap.set(wKey, awards)
          }
        }
      }
    }

    for (const p of allPlayers) {
      const pKey = p.ToonHandle || `${p.name}-${p.hero}`
      const pBadges: PlayerCombatBadge[] = []

      // 1. First Blood (only the player who got kill credit)
      let isFirstBlood = false
      if (primaryKiller && (killerTeam === null || p.team === killerTeam)) {
        if (firstBloodPlayerHandle && p.ToonHandle === firstBloodPlayerHandle) {
          isFirstBlood = true
        } else if (firstBloodHeroLower && p.hero && p.hero.toLowerCase() === firstBloodHeroLower) {
          isFirstBlood = true
        }
      }
      if (isFirstBlood) {
        pBadges.push({
          id: `${pKey}-first-blood`,
          label: '🩸 First Blood',
          type: 'first-blood',
          tooltip: `Drew First Blood on ${victimHeroName} (${firstBloodTimeStr})`,
        })
      }

      // 2. Multikill Badges
      const awards = playerMultikillsMap.get(pKey) || []
      const quintupleTimes = awards.filter((a) => a.tier >= 5).map((a) => a.timeStr)
      const quadTimes = awards.filter((a) => a.tier === 4).map((a) => a.timeStr)
      const tripleTimes = awards.filter((a) => a.tier === 3).map((a) => a.timeStr)
      const doubleTimes = awards.filter((a) => a.tier === 2).map((a) => a.timeStr)

      if (quintupleTimes.length > 0) {
        const count = quintupleTimes.length
        pBadges.push({
          id: `${pKey}-5kill`,
          label: count > 1 ? `5-Kill x${count}` : '5-Kill',
          type: 'quintuple-kill',
          tooltip: count > 1
            ? `${count}x 5-Hero Multikill (Team Wipe) (${quintupleTimes.join(', ')})`
            : `5-Hero Multikill (Team Wipe) (${quintupleTimes.join(', ')})`,
        })
      }

      if (quadTimes.length > 0) {
        const count = quadTimes.length
        pBadges.push({
          id: `${pKey}-quad`,
          label: count > 1 ? `Quad Kill x${count}` : 'Quad Kill',
          type: 'quad-kill',
          tooltip: count > 1
            ? `${count}x Quad Kill (${quadTimes.join(', ')})`
            : `Quad Kill (${quadTimes.join(', ')})`,
        })
      }

      if (tripleTimes.length > 0) {
        const count = tripleTimes.length
        pBadges.push({
          id: `${pKey}-triple`,
          label: count > 1 ? `Triple Kill x${count}` : 'Triple Kill',
          type: 'triple-kill',
          tooltip: count > 1
            ? `${count}x Triple Kill (${tripleTimes.join(', ')})`
            : `Triple Kill (${tripleTimes.join(', ')})`,
        })
      }

      if (doubleTimes.length > 0) {
        const count = doubleTimes.length
        pBadges.push({
          id: `${pKey}-double`,
          label: count > 1 ? `Double Kill x${count}` : 'Double Kill',
          type: 'double-kill',
          tooltip: count > 1
            ? `${count}x Double Kill (${doubleTimes.join(', ')})`
            : `Double Kill (${doubleTimes.join(', ')})`,
        })
      }

      if (pBadges.length > 0) {
        badgesMap.set(pKey, pBadges)
      }
    }
  } else {
    // Fallback if takedowns timeline wasn't parsed, but gameStats.Multikill is present
    for (const p of allPlayers) {
      const multikillCount = p.gameStats?.Multikill || 0
      const soloKills = p.gameStats?.SoloKill || 0
      // In HotS scoreboard, Multikill is sometimes recorded for team participation streaks,
      // so only credit multikill fallback if the player personally got at least 2 kills.
      if (multikillCount > 0 && soloKills >= 2) {
        const pKey = p.ToonHandle || `${p.name}-${p.hero}`
        badgesMap.set(pKey, [
          {
            id: `${pKey}-multikill-fallback`,
            label: multikillCount > 1 ? `Multikill x${multikillCount}` : 'Multikill',
            type: 'double-kill',
            tooltip: `${multikillCount} Multikill(s) recorded in game score`,
          },
        ])
      }
    }
  }

  return badgesMap
})

function getPlayerCombatBadges(player: ReplayPlayer): PlayerCombatBadge[] {
  const key = player.ToonHandle || `${player.name}-${player.hero}`
  return playerCombatBadgesMap.value.get(key) || []
}

// Copy build code feedback tracker
const copiedPlayerHandle = ref<string | null>(null)
let copyTimeout: ReturnType<typeof setTimeout> | null = null

function getPlayerTalentList(player: ReplayPlayer): (string | undefined)[] {
  return [
    player.talents?.Tier1Choice,
    player.talents?.Tier2Choice,
    player.talents?.Tier3Choice,
    player.talents?.Tier4Choice,
    player.talents?.Tier5Choice,
    player.talents?.Tier6Choice,
    player.talents?.Tier7Choice,
  ]
}

interface ActiveTooltipState {
  visible: boolean
  talentKey?: string
  tierIndex: number
  heroName: string
  player?: ReplayPlayer
  x: number
  y: number
}

const activeTooltip = ref<ActiveTooltipState>({
  visible: false,
  tierIndex: 0,
  heroName: '',
  x: 0,
  y: 0,
})

function showTalentTooltip(event: MouseEvent, talentKey?: string, tierIndex: number = 0, player?: ReplayPlayer) {
  activeTooltip.value = {
    visible: true,
    talentKey,
    tierIndex,
    heroName: player?.hero || '',
    player,
    x: event.clientX,
    y: event.clientY,
  }
}

function updateTooltipPosition(event: MouseEvent) {
  if (!activeTooltip.value.visible) return
  activeTooltip.value.x = event.clientX
  activeTooltip.value.y = event.clientY
}

function hideTalentTooltip() {
  activeTooltip.value.visible = false
}

function getQuestIcon(type: string): string {
  if (type === 'globe') return '🔮'
  if (type === 'takedown') return '⚔️'
  if (type === 'minion') return '🌾'
  return '✦'
}

function getTooltipTalentName(talentKey?: string, tierIndex: number = 0): string {
  if (!talentKey) {
    const lvl = [1, 4, 7, 10, 13, 16, 20][tierIndex] || 1
    return `Level ${lvl} Talent`
  }
  return formatTalentName(talentKey)
}

function getTypeBadgeClass(type?: string): string {
  if (!type) return 'badge-key-passive'
  const t = type.toLowerCase()
  if (t === 'q') return 'badge-key-q'
  if (t === 'w') return 'badge-key-w'
  if (t === 'e') return 'badge-key-e'
  if (t === 'r' || t === 'heroic') return 'badge-key-heroic'
  if (t === 'trait' || t === 'd') return 'badge-key-trait'
  if (t === 'active') return 'badge-key-active'
  return 'badge-key-passive'
}

const tooltipStyle = computed(() => {
  const padding = 16
  const tooltipWidth = 330
  const tooltipHeight = 240
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  let left = activeTooltip.value.x + 16
  let top = activeTooltip.value.y - 20

  if (left + tooltipWidth > viewportWidth - padding) {
    left = activeTooltip.value.x - tooltipWidth - 16
  }
  if (top + tooltipHeight > viewportHeight - padding) {
    top = Math.max(padding, viewportHeight - tooltipHeight - padding)
  }
  if (top < padding) {
    top = padding
  }

  return {
    left: `${left}px`,
    top: `${top}px`,
  }
})

async function copyBuildCode(player: ReplayPlayer) {
  const code = getTalentBuildCode(player)
  if (!code) return
  try {
    await navigator.clipboard.writeText(code)
    copiedPlayerHandle.value = player.ToonHandle
    if (copyTimeout) clearTimeout(copyTimeout)
    copyTimeout = setTimeout(() => {
      copiedPlayerHandle.value = null
    }, 2000)
  } catch (err) {
    console.error('Failed to copy build code:', err)
  }
}

// Max stats across all players for relative progress bars
const maxStats = computed(() => {
  const result = {
    heroDamage: 1,
    siegeDamage: 1,
    healing: 1,
    damageTaken: 1,
    xp: 1,
  }
  if (!match.value?.players) return result

  for (const p of Object.values(match.value.players)) {
    const stats = p.gameStats
    if (!stats) continue
    if ((stats.HeroDamage || 0) > result.heroDamage) result.heroDamage = stats.HeroDamage || 1
    if ((stats.SiegeDamage || 0) > result.siegeDamage) result.siegeDamage = stats.SiegeDamage || 1
    const healTotal = (stats.Healing || 0) + (stats.SelfHealing || 0)
    if (healTotal > result.healing) result.healing = healTotal
    if ((stats.DamageTaken || 0) > result.damageTaken) result.damageTaken = stats.DamageTaken || 1
    if ((stats.ExperienceContribution || 0) > result.xp) result.xp = stats.ExperienceContribution || 1
  }
  return result
})

function isPlayerHighlighted(player: ReplayPlayer): boolean {
  if (!targetAccount.value && !targetHero.value) return false

  if (targetAccount.value && player.name) {
    const normName = player.name.toLowerCase()
    const normTag = `${player.name}-${player.tag || ''}`.toLowerCase()
    const altTag = `${player.name}_${player.tag || ''}`.toLowerCase()
    if (
      targetAccount.value === normName ||
      targetAccount.value === normTag ||
      targetAccount.value === altTag ||
      targetAccount.value.startsWith(normName)
    ) {
      return true
    }
  }

  if (targetHero.value && player.hero && player.hero.toLowerCase() === targetHero.value) {
    return true
  }

  return false
}

function hideBrokenImage(event: Event) {
  const target = event.target
  if (target instanceof HTMLImageElement) {
    target.style.display = 'none'
  }
}

async function fetchMatchDetail() {
  loading.value = true
  error.value = null
  const id = route.params.id

  try {
    const res = await fetch(`/api/replays/${id}`)
    if (!res.ok) {
      if (res.status === 404) error.value = `Match #${id} could not be found.`
      else error.value = `Failed to load match #${id} (${res.status})`
      return
    }
    const text = await res.text()
    const data: ReplayDetail = JSON.parse(text)
    match.value = data

    await nextTick()
    const highlightedEl = document.querySelector('.highlighted-row')
    if (highlightedEl) {
      highlightedEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  } catch (err) {
    console.error('Failed to load replay details:', err)
    error.value = 'Failed to load replay data.'
  } finally {
    loading.value = false
  }
}

// Compute team aggregated totals for any stat key
function computeTeamTotal(players: ReplayPlayer[], key: keyof NonNullable<ReplayPlayer['gameStats']>): number {
  return players.reduce((sum, p) => {
    const val = p.gameStats?.[key]
    if (typeof val === 'number') return sum + val
    return sum
  }, 0)
}

function computeTeamAvgKda(players: ReplayPlayer[]): string {
  if (players.length === 0) return '0.00'
  let totalKda = 0
  let count = 0
  for (const p of players) {
    if (typeof p.gameStats?.KDA === 'number') {
      totalKda += p.gameStats.KDA
      count++
    } else {
      const kills = p.gameStats?.SoloKill ?? 0
      const assists = p.gameStats?.Assists ?? 0
      const deaths = p.gameStats?.Deaths ?? 0
      totalKda += (kills + assists) / Math.max(1, deaths)
      count++
    }
  }
  if (count === 0) return '0.00'
  return (totalKda / count).toFixed(2)
}

async function navigateToPlayer(player: ReplayPlayer) {
  if (player.rowId) {
    router.push(`/player/${player.rowId}`)
    return
  }
  try {
    const fullTag = `${player.name}#${player.tag}`
    const res = await fetch(`/api/players/search?q=${encodeURIComponent(fullTag)}`)
    if (res.ok) {
      const data: { results: PlayerSearchItem[] } = await res.json()
      if (data.results && data.results.length > 0) {
        player.rowId = data.results[0].rowId
        router.push(`/player/${data.results[0].rowId}`)
        return
      }
    }
  } catch {
    // fallback
  }
  router.push(`/player/${encodeURIComponent(`${player.name}-${player.tag}`)}`)
}

async function navigateToPlayerHero(player: ReplayPlayer, hero: string) {
  let targetId = player.rowId ? String(player.rowId) : ''
  if (!targetId) {
    try {
      const fullTag = `${player.name}#${player.tag}`
      const res = await fetch(`/api/players/search?q=${encodeURIComponent(fullTag)}`)
      if (res.ok) {
        const data: { results: PlayerSearchItem[] } = await res.json()
        if (data.results && data.results.length > 0) {
          player.rowId = data.results[0].rowId
          targetId = String(data.results[0].rowId)
        }
      }
    } catch {
      // fallback
    }
  }
  if (!targetId) {
    targetId = `${player.name}-${player.tag}`
  }
  router.push(`/player/${encodeURIComponent(targetId)}/hero/${encodeURIComponent(hero)}`)
}

onMounted(() => {
  fetchMatchDetail()
})
</script>

<template>
  <div class="container">
    <!-- Back Navigation -->
    <div class="back-nav">
      <button class="btn"
              @click="router.push('/matches')">
        ← Back to Matches
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="loading"
         class="loading-state">
      <div class="spinner"></div>
      <p>Analyzing battle data from the Nexus...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error"
         class="card error-card">
      <span class="error-icon">⚠️</span>
      <h2>{{ error }}</h2>
      <p>Please check the match ID or return to match history.</p>
      <button class="btn btn-primary"
              @click="router.push('/matches')">
        Browse Match History
      </button>
    </div>

    <!-- Match Content -->
    <div v-else-if="match"
         class="match-detail-content">
      <!-- Match Header Banner -->
      <div class="match-banner card">
        <div class="banner-bg">
          <img :src="getMapImageUrl(match.map)"
               :alt="match.map"
               class="banner-map-img"
               @error="hideBrokenImage" />
          <div class="banner-gradient"></div>
        </div>

        <div class="banner-content">
          <div class="banner-left">
            <div class="banner-title-row">
              <span class="match-id-pill">MATCH #{{ match.id }}</span>
              <span v-if="isAramMap(match.map)" class="aram-badge">ARAM</span>
            </div>
            <h1 class="banner-map-title">{{ match.map }}</h1>
            <div class="banner-meta-row">
              <span class="meta-item">⏱️ {{ formatDuration(match.length) }}</span>
              <span class="meta-item">📅 {{ formatDateRelative(match.date) }}</span>
              <span class="meta-item">📍 {{ new Date(match.date).toLocaleDateString() }}</span>
            </div>
          </div>

          <div class="banner-badges">
            <div v-if="match.first_pick_win"
                 class="milestone-badge"
                 title="Team with first pick won the match">
              <span>🎯 First Pick Win</span>
            </div>
            <div v-if="match.first_objective !== null && match.first_objective !== undefined"
                 class="milestone-badge">
              <span>⚔️ 1st Obj: Team {{ match.first_objective === 0 ? 'Blue' : 'Red' }}</span>
            </div>
            <div v-if="match.first_fort !== null && match.first_fort !== undefined"
                 class="milestone-badge">
              <span>🏰 1st Fort: Team {{ match.first_fort === 0 ? 'Blue' : 'Red' }}</span>
            </div>
            <div v-if="match.first_keep !== null && match.first_keep !== undefined"
                 class="milestone-badge">
              <span>🏯 1st Keep: Team {{ match.first_keep === 0 ? 'Blue' : 'Red' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Focused Player Alert (if targeted in URL) -->
      <div v-if="targetAccount || targetHero"
           class="highlight-banner card">
        <span class="sparkle-icon">✨</span>
        <div>
          <strong>Focused Match Link:</strong>
          <span v-if="targetAccount"> Viewing stats for account <code>{{ targetAccount }}</code>.</span>
          <span v-if="targetHero"> Hero: <code>{{ targetHero }}</code>.</span>
        </div>
      </div>

      <!-- Category Navigation Tabs -->
      <div class="tabs-nav">
        <button class="tab-btn"
                :class="{ active: activeTab === 'overview' }"
                @click="activeTab = 'overview'">
          <span>📊</span>
          <span>Overview</span>
        </button>
        <button class="tab-btn"
                :class="{ active: activeTab === 'talents' }"
                @click="activeTab = 'talents'">
          <span>🌳</span>
          <span>Talents & Builds</span>
        </button>
        <button class="tab-btn"
                :class="{ active: activeTab === 'combat' }"
                @click="activeTab = 'combat'">
          <span>⚔️</span>
          <span>Combat & Damage</span>
        </button>
        <button class="tab-btn"
                :class="{ active: activeTab === 'defense' }"
                @click="activeTab = 'defense'">
          <span>🛡️</span>
          <span>Defense & CC</span>
        </button>
        <button class="tab-btn"
                :class="{ active: activeTab === 'siege' }"
                @click="activeTab = 'siege'">
          <span>🏰</span>
          <span>Siege & Macro</span>
        </button>
        <button class="tab-btn"
                :class="{ active: activeTab === 'bm' }"
                @click="activeTab = 'bm'">
          <span>🕺</span>
          <span>BM & Flares</span>
        </button>
      </div>

      <!-- ============================================================== -->
      <!-- TAB 1: OVERVIEW & SCORES                                       -->
      <!-- ============================================================== -->
      <div v-if="activeTab === 'overview'"
           class="tab-pane">
        <!-- Integrated Draft Order & Bans Card -->
        <div v-if="hasDraftInfo"
             class="card draft-overview-card">
          <div class="draft-card-header">
            <div class="draft-title-group">
              <span class="draft-header-icon">📜</span>
              <h3>Draft Order & Bans</h3>
            </div>
            <div v-if="firstPickTeam !== null"
                 class="first-pick-pill"
                 :class="firstPickTeam === 0 ? 'pill-blue' : 'pill-red'">
              🎯 Team {{ firstPickTeam === 0 ? 'Blue' : 'Red' }} First Pick
            </div>
          </div>

          <div class="draft-teams-row">
            <!-- Blue Team Draft Side -->
            <div class="draft-team-side blue-side">
              <div class="draft-side-title-row">
                <div class="draft-title-left">
                  <span class="team-color-indicator blue-indicator"></span>
                  <span class="team-label blue-label">Blue Team</span>
                  <span v-if="match.winner === 0"
                        class="badge badge-win">VICTORY 🏆</span>
                  <span v-else-if="match.winner === 1"
                        class="badge badge-loss">DEFEAT</span>
                </div>
                <span v-if="firstPickTeam === 0"
                      class="first-pick-tag">First Pick</span>
              </div>

              <!-- Bans -->
              <div v-if="team0Bans.length"
                   class="draft-items-row">
                <span class="draft-row-label">Bans:</span>
                <div class="draft-chips-wrap">
                  <div v-for="b in team0Bans"
                       :key="b.hero"
                       class="ban-hero-chip"
                       :title="`Banned: ${resolveHeroName(b.hero)} (Round ${b.order})`">
                    <div class="ban-avatar-box">
                      <img :src="getHeroImageUrl(b.hero)"
                           :alt="b.hero"
                           class="ban-hero-img"
                           @error="hideBrokenImage" />
                      <span class="ban-slash">🚫</span>
                    </div>
                    <span class="ban-hero-text">{{ resolveHeroName(b.hero) }}</span>
                  </div>
                </div>
              </div>

              <!-- Picks in order -->
              <div v-if="team0Picks.length"
                   class="draft-items-row">
                <span class="draft-row-label">Picks:</span>
                <div class="draft-chips-wrap">
                  <div v-for="(pick, pIdx) in team0Picks"
                       :key="pick || pIdx"
                       class="pick-hero-chip"
                       :title="`Pick #${getPickNumber(0, pIdx)}: ${resolveHeroName(pick) || 'Unknown'}`">
                    <div class="pick-avatar-box">
                      <img :src="getHeroImageUrl(pick)"
                           :alt="pick || 'Unknown'"
                           class="pick-hero-img"
                           @error="hideBrokenImage" />
                      <span class="pick-num-badge">#{{ getPickNumber(0, pIdx) }}</span>
                    </div>
                    <span class="pick-hero-text">{{ resolveHeroName(pick) || 'Unknown' }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- VS Divider -->
            <div class="draft-mid-divider">
              <span class="vs-badge">VS</span>
            </div>

            <!-- Red Team Draft Side -->
            <div class="draft-team-side red-side">
              <div class="draft-side-title-row">
                <div class="draft-title-left">
                  <span class="team-color-indicator red-indicator"></span>
                  <span class="team-label red-label">Red Team</span>
                  <span v-if="match.winner === 1"
                        class="badge badge-win">VICTORY 🏆</span>
                  <span v-else-if="match.winner === 0"
                        class="badge badge-loss">DEFEAT</span>
                </div>
                <span v-if="firstPickTeam === 1"
                      class="first-pick-tag">First Pick</span>
              </div>

              <!-- Bans -->
              <div v-if="team1Bans.length"
                   class="draft-items-row">
                <span class="draft-row-label">Bans:</span>
                <div class="draft-chips-wrap">
                  <div v-for="b in team1Bans"
                       :key="b.hero"
                       class="ban-hero-chip"
                       :title="`Banned: ${resolveHeroName(b.hero)} (Round ${b.order})`">
                    <div class="ban-avatar-box">
                      <img :src="getHeroImageUrl(b.hero)"
                           :alt="b.hero"
                           class="ban-hero-img"
                           @error="hideBrokenImage" />
                      <span class="ban-slash">🚫</span>
                    </div>
                    <span class="ban-hero-text">{{ resolveHeroName(b.hero) }}</span>
                  </div>
                </div>
              </div>

              <!-- Picks in order -->
              <div v-if="team1Picks.length"
                   class="draft-items-row">
                <span class="draft-row-label">Picks:</span>
                <div class="draft-chips-wrap">
                  <div v-for="(pick, pIdx) in team1Picks"
                       :key="pick || pIdx"
                       class="pick-hero-chip"
                       :title="`Pick #${getPickNumber(1, pIdx)}: ${resolveHeroName(pick) || 'Unknown'}`">
                    <div class="pick-avatar-box">
                      <img :src="getHeroImageUrl(pick)"
                           :alt="pick || 'Unknown'"
                           class="pick-hero-img"
                           @error="hideBrokenImage" />
                      <span class="pick-num-badge">#{{ getPickNumber(1, pIdx) }}</span>
                    </div>
                    <span class="pick-hero-text">{{ resolveHeroName(pick) || 'Unknown' }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Blue Team Table -->
        <div class="team-section team-0-section"
             :class="match.winner === 0 ? 'team-winner' : 'team-loser'">
          <div class="team-section-header"
               :class="match.winner === 0 ? 'header-winner' : 'header-loser'">
            <div class="team-title-group">
              <span class="team-color-indicator blue-indicator"></span>
              <h2 class="team-title-blue">Blue Team</h2>
              <span v-if="match.winner === 0"
                    class="badge badge-win">VICTORY 🏆</span>
              <span v-else
                    class="badge badge-loss">DEFEAT</span>
            </div>
            <div class="team-stats-summary">
              <div v-if="team0Bans.length"
                   class="team-bans-inline">
                <span class="bans-inline-label">Bans:</span>
                <span v-for="b in team0Bans"
                      :key="b.hero"
                      class="ban-inline-pill"
                      :title="`Banned: ${resolveHeroName(b.hero)}`">
                  <img :src="getHeroImageUrl(b.hero)"
                       :alt="b.hero"
                       class="ban-tiny-avatar"
                       @error="hideBrokenImage" />
                  <span>{{ resolveHeroName(b.hero) }}</span>
                </span>
              </div>
              <span class="stat-pill">Level {{ match.teams?.['0']?.level || '?' }}</span>
              <span class="stat-pill">{{ match.team0_takedowns }} Takedowns</span>
            </div>
          </div>

          <div class="table-container">
            <table class="scoreboard-table">
              <thead>
                <tr>
                  <th>Player / Hero</th>
                  <th>K / A / D</th>
                  <th>KAD</th>
                  <th>Talents</th>
                  <th>Hero Dmg</th>
                  <th>Siege Dmg</th>
                  <th>Heal / Shield</th>
                  <th>Dmg Taken</th>
                  <th>XP Contrib</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="p in team0Players"
                          :key="p.ToonHandle">
                  <tr :class="{ 'highlighted-row': isPlayerHighlighted(p), 'has-badges-row': getPlayerCombatBadges(p).length > 0 }">
                    <td class="player-cell">
                      <div class="player-info-wrap">
                        <img :src="getHeroImageUrl(p.hero)"
                             :alt="p.hero"
                             class="hero-avatar clickable-hero-link"
                             :title="`View ${p.name}'s ${p.hero} matches`"
                             @click="navigateToPlayerHero(p, p.hero)" />
                        <div class="name-hero-col">
                          <div class="name-tag-row">
                            <span class="player-name clickable-player-link"
                                  :title="`View player history for ${p.name}`"
                                  @click="navigateToPlayer(p)">
                              {{ p.name }}
                            </span>
                            <span v-if="p.tag"
                                  class="player-tag">#{{ p.tag }}</span>
                            <span v-if="isPlayerHighlighted(p)"
                                  class="badge badge-highlight">★ You</span>
                          </div>
                          <div class="hero-pick-row">
                            <span class="hero-name clickable-hero-link"
                                  :title="`View ${p.name}'s ${p.hero} matches`"
                                  @click="navigateToPlayerHero(p, p.hero)">{{ p.hero }}</span>
                            <span v-if="getPlayerPickOrder(p.hero, p.team)"
                                  class="pick-order-tag"
                                  title="Draft Pick Order">
                              Pick #{{ getPlayerPickOrder(p.hero, p.team) }}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                  <td class="kad-cell">
                    <span class="kad-text">
                      {{ p.gameStats?.SoloKill || 0 }} / {{ p.gameStats?.Assists || 0 }} /
                      <span class="deaths-val">{{ p.gameStats?.Deaths || 0 }}</span>
                    </span>
                  </td>
                  <td class="num-cell">{{ p.gameStats?.KDA !== undefined ? Number(p.gameStats.KDA).toFixed(1) : '-' }}
                  </td>
                  <td class="talents-cell">
                    <div class="player-talents-strip">
                      <div v-for="(tKey, idx) in getPlayerTalentList(p)"
                           :key="idx"
                           class="talent-mini-slot"
                           @mouseenter="showTalentTooltip($event, tKey, idx, p)"
                           @mousemove="updateTooltipPosition($event)"
                           @mouseleave="hideTalentTooltip">
                        <img v-if="tKey"
                             :src="getTalentImageUrl(tKey)"
                             :alt="formatTalentName(tKey)"
                             class="talent-mini-img"
                             @error="hideBrokenImage" />
                        <span v-else
                              class="talent-mini-empty">{{ [1, 4, 7, 10, 13, 16, 20][idx] }}</span>
                      </div>
                    </div>
                  </td>
                  <td class="stat-bar-cell">
                    <div class="stat-bar-container">
                      <span class="stat-bar-value">{{ formatNumber(p.gameStats?.HeroDamage) }}</span>
                      <div class="stat-bar">
                        <div class="stat-bar-fill fill-hero"
                             :style="{ width: `${Math.min(100, ((p.gameStats?.HeroDamage || 0) / maxStats.heroDamage) * 100)}%` }">
                        </div>
                      </div>
                    </div>
                  </td>
                  <td class="stat-bar-cell">
                    <div class="stat-bar-container">
                      <span class="stat-bar-value">{{ formatNumber(p.gameStats?.SiegeDamage) }}</span>
                      <div class="stat-bar">
                        <div class="stat-bar-fill fill-siege"
                             :style="{ width: `${Math.min(100, ((p.gameStats?.SiegeDamage || 0) / maxStats.siegeDamage) * 100)}%` }">
                        </div>
                      </div>
                    </div>
                  </td>
                  <td class="stat-bar-cell">
                    <div class="stat-bar-container">
                      <span class="stat-bar-value">{{ formatNumber((p.gameStats?.Healing || 0) +
                        (p.gameStats?.SelfHealing || 0)) }}</span>
                      <div class="stat-bar">
                        <div class="stat-bar-fill fill-healing"
                             :style="{ width: `${Math.min(100, (((p.gameStats?.Healing || 0) + (p.gameStats?.SelfHealing || 0)) / maxStats.healing) * 100)}%` }">
                        </div>
                      </div>
                    </div>
                  </td>
                  <td class="stat-bar-cell">
                    <div class="stat-bar-container">
                      <span class="stat-bar-value">{{ formatNumber(p.gameStats?.DamageTaken) }}</span>
                      <div class="stat-bar">
                        <div class="stat-bar-fill fill-taken"
                             :style="{ width: `${Math.min(100, ((p.gameStats?.DamageTaken || 0) / maxStats.damageTaken) * 100)}%` }">
                        </div>
                      </div>
                    </div>
                  </td>
                  <td class="stat-bar-cell">
                    <div class="stat-bar-container">
                      <span class="stat-bar-value">{{ formatNumber(p.gameStats?.ExperienceContribution) }}</span>
                      <div class="stat-bar">
                        <div class="stat-bar-fill fill-xp"
                             :style="{ width: `${Math.min(100, ((p.gameStats?.ExperienceContribution || 0) / maxStats.xp) * 100)}%` }">
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
                <tr v-if="getPlayerCombatBadges(p).length"
                    class="player-badges-row"
                    :class="{ 'highlighted-row': isPlayerHighlighted(p) }">
                  <td colspan="9"
                      class="player-badges-cell">
                    <div class="player-combat-badges">
                      <span v-for="b in getPlayerCombatBadges(p)"
                            :key="b.id"
                            class="combat-badge"
                            :class="`badge-${b.type}`"
                            :title="b.tooltip">
                        {{ b.label }}
                      </span>
                    </div>
                  </td>
                </tr>
              </template>
              <tr class="totals-row">
                  <td>Team 1 Totals</td>
                  <td>{{ (match?.team0_takedowns !== undefined && match?.team0_takedowns !== null) ? match.team0_takedowns : computeTeamTotal(team0Players, 'SoloKill') }} / {{ computeTeamTotal(team0Players, 'Assists') }}
                    / {{ computeTeamTotal(team0Players, 'Deaths') }}</td>
                  <td>{{ computeTeamAvgKda(team0Players) }}</td>
                  <td></td>
                  <td>{{ formatNumber(computeTeamTotal(team0Players, 'HeroDamage')) }}</td>
                  <td>{{ formatNumber(computeTeamTotal(team0Players, 'SiegeDamage')) }}</td>
                  <td>{{ formatNumber(computeTeamTotal(team0Players, 'Healing') + computeTeamTotal(team0Players,
                    'SelfHealing')) }}</td>
                  <td>{{ formatNumber(computeTeamTotal(team0Players, 'DamageTaken')) }}</td>
                  <td>{{ formatNumber(computeTeamTotal(team0Players, 'ExperienceContribution')) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Red Team Table -->
        <div class="team-section team-1-section"
             :class="match.winner === 1 ? 'team-winner' : 'team-loser'">
          <div class="team-section-header"
               :class="match.winner === 1 ? 'header-winner' : 'header-loser'">
            <div class="team-title-group">
              <span class="team-color-indicator red-indicator"></span>
              <h2 class="team-title-red">Red Team</h2>
              <span v-if="match.winner === 1"
                    class="badge badge-win">VICTORY 🏆</span>
              <span v-else
                    class="badge badge-loss">DEFEAT</span>
            </div>
            <div class="team-stats-summary">
              <div v-if="team1Bans.length"
                   class="team-bans-inline">
                <span class="bans-inline-label">Bans:</span>
                <span v-for="b in team1Bans"
                      :key="b.hero"
                      class="ban-inline-pill"
                      :title="`Banned: ${resolveHeroName(b.hero)}`">
                  <img :src="getHeroImageUrl(b.hero)"
                       :alt="b.hero"
                       class="ban-tiny-avatar"
                       @error="hideBrokenImage" />
                  <span>{{ resolveHeroName(b.hero) }}</span>
                </span>
              </div>
              <span class="stat-pill">Level {{ match.teams?.['1']?.level || '?' }}</span>
              <span class="stat-pill">{{ match.team1_takedowns }} Takedowns</span>
            </div>
          </div>

          <div class="table-container">
            <table class="scoreboard-table">
              <thead>
                <tr>
                  <th>Player / Hero</th>
                  <th>K / A / D</th>
                  <th>KAD</th>
                  <th>Talents</th>
                  <th>Hero Dmg</th>
                  <th>Siege Dmg</th>
                  <th>Heal / Shield</th>
                  <th>Dmg Taken</th>
                  <th>XP Contrib</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="p in team1Players"
                          :key="p.ToonHandle">
                  <tr :class="{ 'highlighted-row': isPlayerHighlighted(p), 'has-badges-row': getPlayerCombatBadges(p).length > 0 }">
                    <td class="player-cell">
                      <div class="player-info-wrap">
                        <img :src="getHeroImageUrl(p.hero)"
                             :alt="p.hero"
                             class="hero-avatar clickable-hero-link"
                             :title="`View ${p.name}'s ${p.hero} matches`"
                             @click="navigateToPlayerHero(p, p.hero)" />
                        <div class="name-hero-col">
                          <div class="name-tag-row">
                            <span class="player-name clickable-player-link"
                                  :title="`View player history for ${p.name}`"
                                  @click="navigateToPlayer(p)">
                              {{ p.name }}
                            </span>
                            <span v-if="p.tag"
                                  class="player-tag">#{{ p.tag }}</span>
                            <span v-if="isPlayerHighlighted(p)"
                                  class="badge badge-highlight">★ You</span>
                          </div>
                          <div class="hero-pick-row">
                            <span class="hero-name clickable-hero-link"
                                  :title="`View ${p.name}'s ${p.hero} matches`"
                                  @click="navigateToPlayerHero(p, p.hero)">{{ p.hero }}</span>
                            <span v-if="getPlayerPickOrder(p.hero, p.team)"
                                  class="pick-order-tag"
                                  title="Draft Pick Order">
                              Pick #{{ getPlayerPickOrder(p.hero, p.team) }}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                  <td class="kad-cell">
                    <span class="kad-text">
                      {{ p.gameStats?.SoloKill || 0 }} / {{ p.gameStats?.Assists || 0 }} /
                      <span class="deaths-val">{{ p.gameStats?.Deaths || 0 }}</span>
                    </span>
                  </td>
                  <td class="num-cell">{{ p.gameStats?.KDA !== undefined ? Number(p.gameStats.KDA).toFixed(1) : '-' }}
                  </td>
                  <td class="talents-cell">
                    <div class="player-talents-strip">
                      <div v-for="(tKey, idx) in getPlayerTalentList(p)"
                           :key="idx"
                           class="talent-mini-slot"
                           @mouseenter="showTalentTooltip($event, tKey, idx, p)"
                           @mousemove="updateTooltipPosition($event)"
                           @mouseleave="hideTalentTooltip">
                        <img v-if="tKey"
                             :src="getTalentImageUrl(tKey)"
                             :alt="formatTalentName(tKey)"
                             class="talent-mini-img"
                             @error="hideBrokenImage" />
                        <span v-else
                              class="talent-mini-empty">{{ [1, 4, 7, 10, 13, 16, 20][idx] }}</span>
                      </div>
                    </div>
                  </td>
                  <td class="stat-bar-cell">
                    <div class="stat-bar-container">
                      <span class="stat-bar-value">{{ formatNumber(p.gameStats?.HeroDamage) }}</span>
                      <div class="stat-bar">
                        <div class="stat-bar-fill fill-hero"
                             :style="{ width: `${Math.min(100, ((p.gameStats?.HeroDamage || 0) / maxStats.heroDamage) * 100)}%` }">
                        </div>
                      </div>
                    </div>
                  </td>
                  <td class="stat-bar-cell">
                    <div class="stat-bar-container">
                      <span class="stat-bar-value">{{ formatNumber(p.gameStats?.SiegeDamage) }}</span>
                      <div class="stat-bar">
                        <div class="stat-bar-fill fill-siege"
                             :style="{ width: `${Math.min(100, ((p.gameStats?.SiegeDamage || 0) / maxStats.siegeDamage) * 100)}%` }">
                        </div>
                      </div>
                    </div>
                  </td>
                  <td class="stat-bar-cell">
                    <div class="stat-bar-container">
                      <span class="stat-bar-value">{{ formatNumber((p.gameStats?.Healing || 0) +
                        (p.gameStats?.SelfHealing || 0)) }}</span>
                      <div class="stat-bar">
                        <div class="stat-bar-fill fill-healing"
                             :style="{ width: `${Math.min(100, (((p.gameStats?.Healing || 0) + (p.gameStats?.SelfHealing || 0)) / maxStats.healing) * 100)}%` }">
                        </div>
                      </div>
                    </div>
                  </td>
                  <td class="stat-bar-cell">
                    <div class="stat-bar-container">
                      <span class="stat-bar-value">{{ formatNumber(p.gameStats?.DamageTaken) }}</span>
                      <div class="stat-bar">
                        <div class="stat-bar-fill fill-taken"
                             :style="{ width: `${Math.min(100, ((p.gameStats?.DamageTaken || 0) / maxStats.damageTaken) * 100)}%` }">
                        </div>
                      </div>
                    </div>
                  </td>
                  <td class="stat-bar-cell">
                    <div class="stat-bar-container">
                      <span class="stat-bar-value">{{ formatNumber(p.gameStats?.ExperienceContribution) }}</span>
                      <div class="stat-bar">
                        <div class="stat-bar-fill fill-xp"
                             :style="{ width: `${Math.min(100, ((p.gameStats?.ExperienceContribution || 0) / maxStats.xp) * 100)}%` }">
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
                <tr v-if="getPlayerCombatBadges(p).length"
                    class="player-badges-row"
                    :class="{ 'highlighted-row': isPlayerHighlighted(p) }">
                  <td colspan="9"
                      class="player-badges-cell">
                    <div class="player-combat-badges">
                      <span v-for="b in getPlayerCombatBadges(p)"
                            :key="b.id"
                            class="combat-badge"
                            :class="`badge-${b.type}`"
                            :title="b.tooltip">
                        {{ b.label }}
                      </span>
                    </div>
                  </td>
                </tr>
              </template>
              <tr class="totals-row">
                  <td>Team 2 Totals</td>
                  <td>{{ (match?.team1_takedowns !== undefined && match?.team1_takedowns !== null) ? match.team1_takedowns : computeTeamTotal(team1Players, 'SoloKill') }} / {{ computeTeamTotal(team1Players, 'Assists') }}
                    / {{ computeTeamTotal(team1Players, 'Deaths') }}</td>
                  <td>{{ computeTeamAvgKda(team1Players) }}</td>
                  <td></td>
                  <td>{{ formatNumber(computeTeamTotal(team1Players, 'HeroDamage')) }}</td>
                  <td>{{ formatNumber(computeTeamTotal(team1Players, 'SiegeDamage')) }}</td>
                  <td>{{ formatNumber(computeTeamTotal(team1Players, 'Healing') + computeTeamTotal(team1Players,
                    'SelfHealing')) }}</td>
                  <td>{{ formatNumber(computeTeamTotal(team1Players, 'DamageTaken')) }}</td>
                  <td>{{ formatNumber(computeTeamTotal(team1Players, 'ExperienceContribution')) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ============================================================== -->
      <!-- TAB 2: TALENTS & BUILDS                                        -->
      <!-- ============================================================== -->
      <div v-else-if="activeTab === 'talents'"
           class="tab-pane">
        <div class="talents-section-grid">
          <div v-for="p in [...team0Players, ...team1Players]"
               :key="p.ToonHandle"
               class="card talent-player-card"
               :class="[p.team === 0 ? 'talent-card-blue' : 'talent-card-red', { 'highlighted-row': isPlayerHighlighted(p) }]">
            <div class="talent-card-header">
              <div class="player-info-wrap">
                <img :src="getHeroImageUrl(p.hero)"
                     :alt="p.hero"
                     class="hero-avatar clickable-hero-link"
                     :title="`View ${p.name}'s ${p.hero} matches`"
                     @click="navigateToPlayerHero(p, p.hero)" />
                <div class="name-hero-col">
                  <div class="name-tag-row">
                    <span class="player-name clickable-player-link"
                          :title="`View player history for ${p.name}`"
                          @click="navigateToPlayer(p)">
                      {{ p.name }}
                    </span>
                    <span v-if="p.tag"
                          class="player-tag">#{{ p.tag }}</span>
                    <span class="team-pill"
                          :class="p.team === 0 ? 'pill-blue' : 'pill-red'">
                      {{ p.team === 0 ? 'Blue' : 'Red' }}
                    </span>
                  </div>
                  <span class="hero-name clickable-hero-link"
                        :title="`View ${p.name}'s ${p.hero} matches`"
                        @click="navigateToPlayerHero(p, p.hero)">
                    {{ p.hero }}
                  </span>
                </div>
              </div>

              <div class="build-code-action">
                <button class="copy-code-btn"
                        :class="{ copied: copiedPlayerHandle === p.ToonHandle }"
                        @click="copyBuildCode(p)">
                  <span v-if="copiedPlayerHandle === p.ToonHandle">Copied! ✓</span>
                  <span v-else>📋 Copy In-Game Code</span>
                </button>
              </div>
            </div>

            <!-- 7 Talent Tiers Breakdown -->
            <div class="talents-tiers-list">
              <div v-for="(tKey, idx) in getPlayerTalentList(p)"
                   :key="idx"
                   class="talent-tier-item"
                   :class="{ 'talent-unselected': !tKey }">
                <div class="tier-level-badge">Lvl {{ [1, 4, 7, 10, 13, 16, 20][idx] }}</div>
                <div class="talent-icon-box">
                  <img v-if="tKey"
                       :src="getTalentImageUrl(tKey)"
                       :alt="formatTalentName(tKey)"
                       class="talent-detail-icon"
                       @error="hideBrokenImage" />
                  <span v-else
                        class="talent-detail-placeholder">—</span>
                </div>
                <div class="talent-choice-detail">
                  <div class="talent-name-row">
                    <span class="talent-choice-name">{{ formatTalentName(tKey) || 'Not Reached / Selected' }}</span>
                    <span v-if="getTalentInfo(tKey)?.type"
                          class="talent-type-badge"
                          :class="getTypeBadgeClass(getTalentInfo(tKey)?.type)">
                      {{ getTalentInfo(tKey)?.type }}
                    </span>
                  </div>
                  <div v-if="getTalentInfo(tKey)?.description"
                       class="talent-description"
                       v-html="formatTalentDescriptionHtml(getTalentInfo(tKey)?.description)"></div>

                  <!-- Quest Progress / Tracking Stats -->
                  <div v-if="getCorrelatedQuestStats(tKey, p.gameStats).length > 0"
                       class="talent-quest-stats">
                    <div v-for="(stat, sIdx) in getCorrelatedQuestStats(tKey, p.gameStats)"
                         :key="sIdx"
                         class="talent-quest-badge"
                         :class="{ 'quest-completed': stat.completed }">
                      <span class="quest-stat-icon">{{ getQuestIcon(stat.type) }}</span>
                      <span class="quest-stat-text">{{ stat.displayText }}</span>
                    </div>
                  </div>
                  <div v-else-if="isQuestTalent(tKey)"
                       class="talent-quest-stats">
                    <div class="talent-quest-untracked">
                      <span class="untracked-dot">•</span>
                      <span>Quest hits not logged in replay</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ============================================================== -->
      <!-- TAB 3: ADVANCED COMBAT & DAMAGE                                -->
      <!-- ============================================================== -->
      <div v-else-if="activeTab === 'combat'"
           class="tab-pane">
        <div class="table-container card">
          <table class="advanced-stat-table">
            <thead>
              <tr>
                <th>Player / Hero</th>
                <th>Kills</th>
                <th>Assists</th>
                <th>Takedowns</th>
                <th>Deaths</th>
                <th>Hero Dmg</th>
                <th>Physical Dmg</th>
                <th>Spell Dmg</th>
                <th>Teamfight Dmg</th>
                <th>Kill Streak</th>
                <th>Multikills</th>
                <th>Escapes</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in [...team0Players, ...team1Players]"
                  :key="p.ToonHandle"
                  :class="{ 'highlighted-row': isPlayerHighlighted(p) }">
                <td>
                  <div class="player-info-wrap">
                    <img :src="getHeroImageUrl(p.hero)"
                         :alt="p.hero"
                         class="hero-avatar" />
                    <div>
                      <span class="player-name">{{ p.name }}</span>
                      <span class="team-pill"
                            :class="p.team === 0 ? 'pill-blue' : 'pill-red'">{{ p.hero }}</span>
                    </div>
                  </div>
                </td>
                <td class="num-cell">{{ p.gameStats?.SoloKill || 0 }}</td>
                <td class="num-cell">{{ p.gameStats?.Assists || 0 }}</td>
                <td class="num-cell bold-cell">{{ p.gameStats?.Takedowns || 0 }}</td>
                <td class="num-cell deaths-val">{{ p.gameStats?.Deaths || 0 }}</td>
                <td class="num-cell bold-cell">{{ formatNumber(p.gameStats?.HeroDamage) }}</td>
                <td class="num-cell">{{ formatNumber(p.gameStats?.PhysicalDamage) }}</td>
                <td class="num-cell">{{ formatNumber(p.gameStats?.SpellDamage) }}</td>
                <td class="num-cell">{{ formatNumber(p.gameStats?.TeamfightHeroDamage) }}</td>
                <td class="num-cell">{{ p.gameStats?.HighestKillStreak || 0 }}</td>
                <td class="num-cell">{{ p.gameStats?.Multikill || 0 }}</td>
                <td class="num-cell">{{ p.gameStats?.EscapesPerformed || 0 }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ============================================================== -->
      <!-- TAB 4: DEFENSE, HEALING & CC                                   -->
      <!-- ============================================================== -->
      <div v-else-if="activeTab === 'defense'"
           class="tab-pane">
        <div class="table-container card">
          <table class="advanced-stat-table">
            <thead>
              <tr>
                <th>Player / Hero</th>
                <th>Healing</th>
                <th>Self Healing</th>
                <th>Ally Protect</th>
                <th>Damage Taken</th>
                <th>Damage Soaked</th>
                <th>Stun Duration</th>
                <th>Silence Duration</th>
                <th>Root Duration</th>
                <th>Total CC Time</th>
                <th>Time Dead</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in [...team0Players, ...team1Players]"
                  :key="p.ToonHandle"
                  :class="{ 'highlighted-row': isPlayerHighlighted(p) }">
                <td>
                  <div class="player-info-wrap">
                    <img :src="getHeroImageUrl(p.hero)"
                         :alt="p.hero"
                         class="hero-avatar" />
                    <div>
                      <span class="player-name">{{ p.name }}</span>
                      <span class="team-pill"
                            :class="p.team === 0 ? 'pill-blue' : 'pill-red'">{{ p.hero }}</span>
                    </div>
                  </div>
                </td>
                <td class="num-cell bold-cell text-green">{{ formatNumber(p.gameStats?.Healing) }}</td>
                <td class="num-cell">{{ formatNumber(p.gameStats?.SelfHealing) }}</td>
                <td class="num-cell">{{ formatNumber(p.gameStats?.ProtectionGivenToAllies) }}</td>
                <td class="num-cell bold-cell">{{ formatNumber(p.gameStats?.DamageTaken) }}</td>
                <td class="num-cell">{{ formatNumber(p.gameStats?.DamageSoaked) }}</td>
                <td class="num-cell">{{ p.gameStats?.TimeStunningEnemyHeroes || 0 }}s</td>
                <td class="num-cell">{{ p.gameStats?.TimeSilencingEnemyHeroes || 0 }}s</td>
                <td class="num-cell">{{ p.gameStats?.TimeRootingEnemyHeroes || 0 }}s</td>
                <td class="num-cell bold-cell">{{ p.gameStats?.TimeCCdEnemyHeroes || 0 }}s</td>
                <td class="num-cell deaths-val">{{ p.gameStats?.TimeSpentDead || 0 }}s</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ============================================================== -->
      <!-- TAB 5: SIEGE & MACRO                                           -->
      <!-- ============================================================== -->
      <div v-else-if="activeTab === 'siege'"
           class="tab-pane">
        <div class="table-container card">
          <table class="advanced-stat-table">
            <thead>
              <tr>
                <th>Player / Hero</th>
                <th>Siege Dmg</th>
                <th>Structure Dmg</th>
                <th>Minion Dmg</th>
                <th>Creep Dmg</th>
                <th>Summon Dmg</th>
                <th>XP Contrib</th>
                <th>Minion Kills</th>
                <th>Regen Globes</th>
                <th>Merc Camps</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in [...team0Players, ...team1Players]"
                  :key="p.ToonHandle"
                  :class="{ 'highlighted-row': isPlayerHighlighted(p) }">
                <td>
                  <div class="player-info-wrap">
                    <img :src="getHeroImageUrl(p.hero)"
                         :alt="p.hero"
                         class="hero-avatar" />
                    <div>
                      <span class="player-name">{{ p.name }}</span>
                      <span class="team-pill"
                            :class="p.team === 0 ? 'pill-blue' : 'pill-red'">{{ p.hero }}</span>
                    </div>
                  </div>
                </td>
                <td class="num-cell bold-cell">{{ formatNumber(p.gameStats?.SiegeDamage) }}</td>
                <td class="num-cell">{{ formatNumber(p.gameStats?.StructureDamage) }}</td>
                <td class="num-cell">{{ formatNumber(p.gameStats?.MinionDamage) }}</td>
                <td class="num-cell">{{ formatNumber(p.gameStats?.CreepDamage) }}</td>
                <td class="num-cell">{{ formatNumber(p.gameStats?.SummonDamage) }}</td>
                <td class="num-cell bold-cell">{{ formatNumber(p.gameStats?.ExperienceContribution) }}</td>
                <td class="num-cell">{{ p.gameStats?.MinionKills || 0 }}</td>
                <td class="num-cell">{{ p.gameStats?.RegenGlobes || 0 }}</td>
                <td class="num-cell">{{ p.gameStats?.MercCampCaptures || 0 }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ============================================================== -->
      <!-- TAB 6: BM & SOCIAL FLARES                                      -->
      <!-- ============================================================== -->
      <div v-else-if="activeTab === 'bm'"
           class="tab-pane">
        <div class="table-container card">
          <table class="advanced-stat-table">
            <thead>
              <tr>
                <th>Player / Hero</th>
                <th>👟 B-Steps</th>
                <th>🎨 Sprays</th>
                <th>🗣️ Taunts</th>
                <th>💃 Dances</th>
                <th>🎙️ Voice Lines</th>
                <th>Total BM Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in [...team0Players, ...team1Players]"
                  :key="p.ToonHandle"
                  :class="{ 'highlighted-row': isPlayerHighlighted(p) }">
                <td>
                  <div class="player-info-wrap">
                    <img :src="getHeroImageUrl(p.hero)"
                         :alt="p.hero"
                         class="hero-avatar" />
                    <div>
                      <span class="player-name">{{ p.name }}</span>
                      <span class="team-pill"
                            :class="p.team === 0 ? 'pill-blue' : 'pill-red'">{{ p.hero }}</span>
                    </div>
                  </div>
                </td>
                <td class="num-cell bold-cell">👟 {{ p.bsteps?.length || 0 }}</td>
                <td class="num-cell">🎨 {{ p.sprays?.length || 0 }}</td>
                <td class="num-cell">🗣️ {{ p.taunts?.length || 0 }}</td>
                <td class="num-cell">💃 {{ p.dances?.length || 0 }}</td>
                <td class="num-cell">🎙️ {{ (p.gameStats?.bsteps || 0) > 0 ? p.gameStats?.bsteps : '-' }}</td>
                <td class="num-cell bold-cell">
                  {{ (p.bsteps?.length || 0) + (p.sprays?.length || 0) + (p.taunts?.length || 0) + (p.dances?.length ||
                    0) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Custom Floating HotS Talent Tooltip -->
    <Teleport to="body">
      <div v-if="activeTooltip.visible"
           class="hots-talent-tooltip"
           :style="tooltipStyle">
        <div class="tooltip-inner"
             :class="{ 'heroic-tier': [10, 20].includes([1, 4, 7, 10, 13, 16, 20][activeTooltip.tierIndex]) }">
          <div class="tooltip-header">
            <div class="tooltip-icon-wrap">
              <img v-if="activeTooltip.talentKey"
                   :src="getTalentImageUrl(activeTooltip.talentKey)"
                   :alt="getTooltipTalentName(activeTooltip.talentKey, activeTooltip.tierIndex)"
                   class="tooltip-talent-img"
                   @error="hideBrokenImage" />
              <span v-else
                    class="tooltip-empty-lvl">
                {{ [1, 4, 7, 10, 13, 16, 20][activeTooltip.tierIndex] }}
              </span>
            </div>

            <div class="tooltip-header-info">
              <div class="tooltip-badges-row">
                <span class="tooltip-lvl-badge">
                  Level {{ [1, 4, 7, 10, 13, 16, 20][activeTooltip.tierIndex] }}
                </span>
                <span v-if="getTalentInfo(activeTooltip.talentKey)?.type"
                      class="tooltip-type-badge"
                      :class="getTypeBadgeClass(getTalentInfo(activeTooltip.talentKey)?.type)">
                  {{ getTalentInfo(activeTooltip.talentKey)?.type }}
                </span>
              </div>
              <h4 class="tooltip-title">
                {{ getTooltipTalentName(activeTooltip.talentKey, activeTooltip.tierIndex) }}
              </h4>
            </div>
          </div>

          <div class="tooltip-body">
            <div v-if="getTalentInfo(activeTooltip.talentKey)?.description"
                 class="tooltip-desc"
                 v-html="formatTalentDescriptionHtml(getTalentInfo(activeTooltip.talentKey)?.description)"></div>
            <div v-else-if="activeTooltip.talentKey"
                 class="tooltip-desc fallback-desc">
              {{ formatTalentName(activeTooltip.talentKey) }}
            </div>
            <div v-else
                 class="tooltip-desc empty-desc">
              Level {{ [1, 4, 7, 10, 13, 16, 20][activeTooltip.tierIndex] }} talent was not reached or selected in this
              match.
            </div>

            <!-- Quest Progress / Tracking Stats -->
            <div v-if="activeTooltip.player && getCorrelatedQuestStats(activeTooltip.talentKey, activeTooltip.player.gameStats).length > 0"
                 class="tooltip-quest-section">
              <div v-for="(stat, sIdx) in getCorrelatedQuestStats(activeTooltip.talentKey, activeTooltip.player.gameStats)"
                   :key="sIdx"
                   class="tooltip-quest-badge"
                   :class="{ 'quest-completed': stat.completed }">
                <span class="quest-stat-icon">{{ getQuestIcon(stat.type) }}</span>
                <span class="quest-stat-text">{{ stat.displayText }}</span>
              </div>
            </div>
            <div v-else-if="activeTooltip.player && isQuestTalent(activeTooltip.talentKey)"
                 class="tooltip-quest-section">
              <div class="tooltip-quest-untracked">
                <span class="untracked-dot">•</span>
                <span>Quest hits not logged in replay</span>
              </div>
            </div>
          </div>

          <div class="tooltip-footer">
            <span class="tooltip-footer-tier">Tier {{ activeTooltip.tierIndex + 1 }}</span>
            <span v-if="getTalentInfo(activeTooltip.talentKey)?.hero || activeTooltip.heroName"
                  class="tooltip-footer-hero">
              {{ getTalentInfo(activeTooltip.talentKey)?.hero || activeTooltip.heroName }}
            </span>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.back-nav {
  margin-bottom: 1.5rem;
}

.match-detail-content {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}

.match-banner {
  position: relative;
  overflow: hidden;
  padding: 2rem;
  border-radius: var(--radius-lg);
  min-height: 180px;
  display: flex;
  align-items: center;
}

.banner-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.banner-map-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: brightness(0.4) saturate(1.2);
}

.banner-gradient {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(10, 14, 23, 0.95) 20%, rgba(17, 23, 38, 0.6) 100%);
}

.banner-content {
  position: relative;
  z-index: 1;
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 1.5rem;
}

.match-id-pill {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--accent-cyan);
  background: rgba(56, 189, 248, 0.15);
  padding: 0.2rem 0.6rem;
  border-radius: var(--radius-full);
}

.banner-title-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.aram-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: rgba(245, 158, 11, 0.18);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.4);
  box-shadow: 0 0 10px rgba(245, 158, 11, 0.2);
}

.banner-map-title {
  font-size: 2.25rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0.25rem 0;
  color: #fff;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
}

.banner-meta-row {
  display: flex;
  gap: 1.25rem;
  color: var(--text-muted);
  font-size: 0.9rem;
  font-weight: 500;
}

.banner-badges {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.milestone-badge {
  background: rgba(17, 23, 38, 0.8);
  border: 1px solid var(--border-subtle);
  backdrop-filter: blur(8px);
  padding: 0.4rem 0.8rem;
  border-radius: var(--radius-full);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-main);
}

.highlight-banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.1), rgba(245, 158, 11, 0.05));
  border: 1px solid rgba(251, 191, 36, 0.4);
  color: var(--accent-gold);
  padding: 1rem 1.25rem;
}

.sparkle-icon {
  font-size: 1.5rem;
  animation: float 3s ease-in-out infinite;
}

/* Unified Team Card Container */
.team-section {
  display: flex;
  flex-direction: column;
  margin-bottom: 2.25rem;
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.55);
  border: 1px solid var(--border-subtle);
  transition: all 0.2s ease;
}

/* Outer borders matching winning or losing color */
.team-section.team-winner {
  border: 1px solid rgba(16, 185, 129, 0.55);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.55), 0 0 24px rgba(16, 185, 129, 0.16);
}

.team-section.team-loser {
  border: 1px solid rgba(239, 68, 68, 0.45);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.55), 0 0 20px rgba(220, 38, 38, 0.12);
}

/* Team Header integrated into the top bar of the card */
.team-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.85rem 1.25rem;
  background: var(--bg-surface-elevated);
  border-bottom: 1px solid var(--border-subtle);
  position: relative;
}

/* Nice emerald green top-accent and subtle victory wash for winner */
.team-section-header.header-winner {
  border-top: 3px solid #10b981;
  background: linear-gradient(90deg, rgba(16, 185, 129, 0.14) 0%, rgba(5, 150, 105, 0.05) 50%, transparent 100%);
  border-bottom: 1px solid rgba(16, 185, 129, 0.25);
}

.team-section-header.header-winner .badge-win {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
  border: 1px solid #10b981;
  box-shadow: 0 0 10px rgba(16, 185, 129, 0.3);
  font-weight: 800;
  letter-spacing: 0.04em;
  padding: 0.25rem 0.65rem;
  border-radius: var(--radius-full);
}

.team-section-header.header-winner .stat-pill {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(52, 211, 153, 0.28);
  color: #ecfdf5;
}

.team-section-header.header-winner .ban-inline-pill {
  background: rgba(16, 185, 129, 0.08);
  border-color: rgba(52, 211, 153, 0.22);
  color: #a7f3d0;
}

.team-section-header.header-winner .bans-inline-label {
  color: #34d399;
}

/* Sad red top-accent and subtle defeat wash for loser */
.team-section-header.header-loser {
  border-top: 3px solid rgba(220, 38, 38, 0.8);
  background: linear-gradient(90deg, rgba(185, 28, 28, 0.12) 0%, rgba(127, 29, 29, 0.04) 50%, transparent 100%);
  border-bottom: 1px solid rgba(239, 68, 68, 0.2);
}

.team-section-header.header-loser .badge-loss {
  background: rgba(185, 28, 28, 0.16);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.32);
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 0.25rem 0.65rem;
  border-radius: var(--radius-full);
  opacity: 0.9;
}

.team-section-header.header-loser .stat-pill {
  background: rgba(185, 28, 28, 0.08);
  border-color: rgba(239, 68, 68, 0.18);
  color: #fecaca;
  opacity: 0.85;
}

.team-section-header.header-loser .ban-inline-pill {
  background: rgba(185, 28, 28, 0.06);
  border-color: rgba(239, 68, 68, 0.18);
  color: #fca5a5;
  opacity: 0.85;
}

.team-section-header.header-loser .bans-inline-label {
  color: #f87171;
  opacity: 0.8;
}

/* Respective colors for team titles matching their dots */
.team-title-blue {
  color: var(--team-0) !important;
  font-weight: 800;
  font-size: 1.35rem;
  letter-spacing: -0.01em;
  text-shadow: 0 0 12px rgba(56, 189, 248, 0.4);
}

.team-title-red {
  color: var(--team-1) !important;
  font-weight: 800;
  font-size: 1.35rem;
  letter-spacing: -0.01em;
  text-shadow: 0 0 12px rgba(244, 63, 94, 0.4);
}

/* Table inside the unified team card */
.team-section .table-container {
  border: none;
  border-radius: 0;
  box-shadow: none;
}

/* Blue Team Themed Table */
.team-0-section .table-container {
  background: rgba(10, 18, 34, 0.98);
}

.team-0-section th {
  background: rgba(14, 25, 48, 0.98);
  color: #93c5fd;
  border-bottom: 1px solid rgba(56, 189, 248, 0.18);
  font-size: 0.73rem;
  letter-spacing: 0.05em;
}

.team-0-section tbody tr {
  border-bottom: 1px solid rgba(56, 189, 248, 0.08);
}

.team-0-section tbody tr:hover {
  background: rgba(56, 189, 248, 0.08) !important;
}

.team-0-section tfoot tr,
.team-0-section tr.team-totals-row {
  background: rgba(13, 23, 44, 0.98);
  border-top: 2px solid rgba(56, 189, 248, 0.28);
  color: #e0f2fe;
}

/* Red Team Themed Table */
.team-1-section .table-container {
  background: rgba(24, 11, 16, 0.98);
}

.team-1-section th {
  background: rgba(33, 15, 23, 0.98);
  color: #fda4af;
  border-bottom: 1px solid rgba(244, 63, 94, 0.18);
  font-size: 0.73rem;
  letter-spacing: 0.05em;
}

.team-1-section tbody tr {
  border-bottom: 1px solid rgba(244, 63, 94, 0.08);
}

.team-1-section tbody tr:hover {
  background: rgba(244, 63, 94, 0.08) !important;
}

.team-1-section tfoot tr,
.team-1-section tr.team-totals-row {
  background: rgba(29, 13, 20, 0.98);
  border-top: 2px solid rgba(244, 63, 94, 0.28);
  color: #ffe4e6;
}

.team-title-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.team-color-indicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.blue-indicator {
  background: var(--team-0);
  box-shadow: 0 0 10px var(--team-0);
}

.red-indicator {
  background: var(--team-1);
  box-shadow: 0 0 10px var(--team-1);
}

.team-stats-summary {
  display: flex;
  gap: 0.75rem;
}

.stat-pill {
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  padding: 0.25rem 0.75rem;
  border-radius: var(--radius-full);
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 600;
}

.player-info-wrap {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.name-hero-col {
  display: flex;
  flex-direction: column;
}

.name-tag-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.player-name {
  font-weight: 700;
  color: var(--text-main);
}

.clickable-player-link {
  cursor: pointer;
  transition: color 0.15s ease, text-decoration 0.15s ease;
}

.clickable-player-link:hover {
  color: var(--accent-cyan);
  text-decoration: underline;
}

.player-tag {
  color: var(--text-dim);
  font-size: 0.75rem;
  font-family: var(--font-mono);
}

.hero-name {
  font-size: 0.8rem;
  color: var(--text-muted);
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

.kad-text {
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: 0.85rem;
  white-space: nowrap;
}

.deaths-val {
  color: var(--accent-red);
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
}

/* Overview Table Talents Strip */
.talents-cell {
  padding: 0.5rem 0.6rem;
  width: 1%;
  white-space: nowrap;
}

.player-talents-strip {
  display: flex;
  align-items: center;
  gap: 4px;
}

.talent-mini-slot {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  flex-shrink: 0;
  cursor: pointer;
}

.talent-mini-slot:hover {
  transform: scale(1.25);
  border-color: var(--accent-cyan);
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.5);
  z-index: 10;
}

.talent-mini-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.talent-mini-empty {
  font-size: 0.65rem;
  font-family: var(--font-mono);
  color: var(--text-dim);
  font-weight: 600;
}

/* Talents Grid View */
.talents-section-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 1.25rem;
}

.talent-player-card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.talent-player-card.talent-card-blue {
  background: linear-gradient(180deg, rgba(14, 34, 61, 0.65) 0%, var(--bg-surface) 100%);
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.talent-player-card.talent-card-red {
  background: linear-gradient(180deg, rgba(55, 14, 25, 0.65) 0%, var(--bg-surface) 100%);
  border: 1px solid rgba(244, 63, 94, 0.3);
}

.talent-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-subtle);
  padding-bottom: 0.75rem;
}

.talents-tiers-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.talent-tier-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  background: var(--bg-surface-elevated);
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  font-size: 0.85rem;
  transition: border-color 0.15s ease;
}

.talent-tier-item:hover {
  border-color: rgba(56, 189, 248, 0.4);
}

.talent-tier-item.talent-unselected {
  opacity: 0.5;
}

.talent-icon-box {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--border-subtle);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.talent-detail-icon {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.talent-detail-placeholder {
  color: var(--text-dim);
  font-size: 0.85rem;
}

.talent-name-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.talent-type-badge {
  font-size: 0.65rem;
  font-family: var(--font-mono);
  font-weight: 700;
  padding: 0.05rem 0.35rem;
  border-radius: 4px;
  background: rgba(59, 130, 246, 0.15);
  color: var(--accent-cyan);
  border: 1px solid rgba(59, 130, 246, 0.3);
  text-transform: uppercase;
}

.talent-description {
  font-size: 0.78rem;
  color: var(--text-muted);
  line-height: 1.35;
  margin: 0.2rem 0 0 0;
}

.tier-level-badge {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.75rem;
  color: var(--accent-cyan);
  min-width: 44px;
  margin-top: 0.2rem;
}

.talent-choice-detail {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.talent-choice-name {
  color: var(--text-main);
  font-weight: 600;
}

/* Integrated Draft & Bans Card */
.draft-overview-card {
  margin-bottom: 2rem;
  padding: 1.25rem 1.5rem;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
}

.draft-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--border-subtle);
}

.draft-title-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.draft-title-group h3 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-main);
}

.draft-header-icon {
  font-size: 1.25rem;
}

.first-pick-pill {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.25rem 0.75rem;
  border-radius: var(--radius-full);
}

.draft-teams-row {
  display: flex;
  align-items: stretch;
  gap: 1.5rem;
}

.draft-team-side {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.draft-team-side.blue-side {
  background: linear-gradient(180deg, rgba(14, 34, 61, 0.45) 0%, rgba(10, 20, 38, 0.25) 100%);
  border: 1px solid rgba(56, 189, 248, 0.25);
  border-radius: var(--radius-lg);
  padding: 1rem;
}

.draft-team-side.red-side {
  background: linear-gradient(180deg, rgba(55, 14, 25, 0.45) 0%, rgba(32, 10, 18, 0.25) 100%);
  border: 1px solid rgba(244, 63, 94, 0.25);
  border-radius: var(--radius-lg);
  padding: 1rem;
}

.draft-side-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.draft-title-left {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.draft-title-left .badge-win {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
  border: 1px solid #10b981;
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.25);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.03em;
  padding: 0.15rem 0.55rem;
  border-radius: var(--radius-full);
}

.draft-title-left .badge-loss {
  background: rgba(185, 28, 28, 0.16);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.35);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  padding: 0.15rem 0.55rem;
  border-radius: var(--radius-full);
  opacity: 0.9;
}

.team-label {
  font-weight: 700;
  font-size: 0.95rem;
}

.blue-label {
  color: var(--team-0);
}

.red-label {
  color: var(--team-1);
}

.first-pick-tag {
  font-size: 0.7rem;
  font-family: var(--font-mono);
  font-weight: 700;
  color: var(--accent-gold);
  background: rgba(251, 191, 36, 0.12);
  border: 1px solid rgba(251, 191, 36, 0.3);
  padding: 0.1rem 0.45rem;
  border-radius: var(--radius-sm);
}

.draft-items-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.draft-row-label {
  font-size: 0.75rem;
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--text-dim);
  min-width: 44px;
}

.draft-chips-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.ban-hero-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.25);
  padding: 0.15rem 0.5rem;
  border-radius: var(--radius-full);
  font-size: 0.78rem;
}

.ban-avatar-box {
  position: relative;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
}

.ban-hero-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: grayscale(85%) brightness(0.7);
}

.ban-slash {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  opacity: 0.9;
}

.ban-hero-text {
  color: var(--accent-red);
  font-weight: 600;
  font-size: 0.78rem;
}

.pick-hero-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  padding: 0.15rem 0.55rem;
  border-radius: var(--radius-full);
  font-size: 0.78rem;
}

.pick-avatar-box {
  position: relative;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  overflow: visible;
  flex-shrink: 0;
}

.pick-hero-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  display: block;
}

.pick-num-badge {
  position: absolute;
  bottom: -2px;
  right: -4px;
  background: rgba(0, 0, 0, 0.85);
  font-size: 0.65rem;
  font-family: var(--font-mono);
  color: #fff;
  padding: 0 2px;
  border-radius: 2px;
  line-height: 1;
  z-index: 2;
  white-space: nowrap;
}

.pick-hero-text {
  color: var(--text-main);
  font-weight: 500;
  font-size: 0.78rem;
}

.draft-mid-divider {
  display: flex;
  align-items: center;
  justify-content: center;
}

.vs-badge {
  font-size: 0.75rem;
  font-family: var(--font-mono);
  font-weight: 800;
  color: var(--text-dim);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle);
  padding: 0.35rem 0.55rem;
  border-radius: var(--radius-full);
}

/* Inline Bans in Team Header */
.team-bans-inline {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-right: 0.5rem;
  flex-wrap: wrap;
}

.bans-inline-label {
  font-size: 0.75rem;
  font-family: var(--font-mono);
  color: var(--text-dim);
  font-weight: 700;
}

.ban-inline-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.25);
  padding: 0.1rem 0.45rem;
  border-radius: var(--radius-sm);
  font-size: 0.72rem;
  color: var(--accent-red);
}

.ban-tiny-avatar {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  object-fit: cover;
  filter: grayscale(80%);
}

/* Pick Order Pill in Table Row */
.hero-pick-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.pick-order-tag {
  font-size: 0.65rem;
  font-family: var(--font-mono);
  font-weight: 700;
  padding: 0.05rem 0.35rem;
  border-radius: 3px;
  background: rgba(56, 189, 248, 0.12);
  color: var(--accent-cyan);
  border: 1px solid rgba(56, 189, 248, 0.25);
}

@media (max-width: 900px) {
  .draft-teams-row {
    flex-direction: column;
  }
}

/* Highlighted Player Row Flair */
.highlighted-row {
  background: rgba(251, 191, 36, 0.08) !important;
  animation: highlight-glow 2.5s infinite ease-in-out;
}

.highlighted-row td {
  border-top: 1px solid rgba(251, 191, 36, 0.5);
  border-bottom: 1px solid rgba(251, 191, 36, 0.5);
}

.error-card {
  text-align: center;
  padding: 3rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.clickable-hero-link {
  cursor: pointer;
  transition: color 0.15s ease, opacity 0.15s ease, transform 0.15s ease;
}

.clickable-hero-link:hover {
  color: var(--primary-accent);
  opacity: 0.95;
  text-decoration: underline;
}

img.clickable-hero-link:hover {
  transform: scale(1.1);
  text-decoration: none;
}

.error-icon {
  font-size: 2.5rem;
}

/* Player Combat Badges (Full-Row Subrow) */
.team-0-section tbody tr.has-badges-row,
.team-1-section tbody tr.has-badges-row {
  border-bottom: none !important;
}

.team-0-section tbody tr.has-badges-row td,
.team-1-section tbody tr.has-badges-row td {
  border-bottom: none !important;
  padding-bottom: 0.2rem !important;
}

.team-0-section tbody tr.player-badges-row,
.team-1-section tbody tr.player-badges-row {
  border-top: none !important;
}

.player-badges-cell {
  border-top: none !important;
  padding: 0 0.8rem 0.55rem 3.6rem !important;
}

@media (max-width: 768px) {
  .player-badges-cell {
    padding-left: 0.8rem !important;
  }
}

.team-0-section tbody tr.has-badges-row:hover,
.team-0-section tbody tr.has-badges-row:hover + tr.player-badges-row,
.team-0-section tbody tr.player-badges-row:hover {
  background: rgba(56, 189, 248, 0.08) !important;
}

.team-1-section tbody tr.has-badges-row:hover,
.team-1-section tbody tr.has-badges-row:hover + tr.player-badges-row,
.team-1-section tbody tr.player-badges-row:hover {
  background: rgba(244, 63, 94, 0.08) !important;
}

.highlighted-row.has-badges-row td {
  border-bottom: none !important;
}

.highlighted-row.player-badges-row td {
  border-top: none !important;
  border-bottom: 1px solid rgba(251, 191, 36, 0.5) !important;
}

.player-combat-badges {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
  width: 100%;
}

.combat-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1.2;
  padding: 0.2rem 0.6rem;
  border-radius: var(--radius-full);
  letter-spacing: 0.02em;
  white-space: nowrap;
  cursor: default;
  user-select: none;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  transition: transform 0.15s ease, filter 0.15s ease;
}

.combat-badge:hover {
  transform: translateY(-1px);
  filter: brightness(1.15);
}

.badge-first-blood {
  background: #991b1b;
  color: #fee2e2;
  border: 1px solid #ef4444;
}

.badge-double-kill {
  background: #e11d48;
  color: #ffffff;
  border: 1px solid #fb7185;
}

.badge-triple-kill {
  background: #d97706;
  color: #ffffff;
  border: 1px solid #fbbf24;
}

.badge-quad-kill {
  background: #7c3aed;
  color: #ffffff;
  border: 1px solid #a78bfa;
}

.badge-quintuple-kill {
  background: linear-gradient(135deg, #ef4444 0%, #a855f7 100%);
  color: #ffffff;
  border: 1px solid #f43f5e;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}
</style>
