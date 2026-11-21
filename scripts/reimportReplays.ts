import fs from 'fs'
import path from 'path'
import { sql } from '../store/db'
import { refreshPlayerStatsView } from '../store/playerStats'
import { relinkAccountSubstitutions } from '../store/substitutions'
import { toReplayRow } from '../types/replay'
import { processReplaysInPool } from '../utils/replayWorkerPool'

interface ReplayRowToReparse {
  id: number
  file: string | null
  filename: string | null
}

function formatTime(totalSeconds: number): string {
  if (totalSeconds < 0 || isNaN(totalSeconds) || !isFinite(totalSeconds)) {
    return 'estimating...'
  }
  const min = Math.floor(totalSeconds / 60)
  const sec = Math.floor(totalSeconds % 60)
  if (min === 0) {
    return `${sec}s`
  }
  return `${min}m ${sec.toString().padStart(2, '0')}s`
}

function renderProgressBar(ratio: number, width = 20): string {
  const clamped = Math.min(1, Math.max(0, ratio))
  const filled = Math.round(clamped * width)
  const empty = width - filled
  return '█'.repeat(filled) + '░'.repeat(empty)
}

function parseArgs(): {
  targetId: number | null
  limit: number | null
  force: boolean
  skipOptimize: boolean
} {
  const args = process.argv.slice(2)
  let targetId: number | null = null
  let limit: number | null = null
  let force = false
  let skipOptimize = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--id' && i + 1 < args.length) {
      const parsed = parseInt(args[++i], 10)
      if (!isNaN(parsed)) targetId = parsed
    } else if (arg === '--limit' && i + 1 < args.length) {
      const parsed = parseInt(args[++i], 10)
      if (!isNaN(parsed)) limit = parsed
    } else if (arg === '--force') {
      force = true
    } else if (arg === '--no-optimize' || arg === '--skip-optimize') {
      skipOptimize = true
    }
  }

  return { targetId, limit, force, skipOptimize }
}

function resolveReplayPath(row: ReplayRowToReparse): string | null {
  const candidates: string[] = []
  if (row.file) candidates.push(row.file)
  if (row.filename && row.filename !== row.file) candidates.push(row.filename)

  const base = path.basename(row.file || row.filename || '')
  if (base) {
    candidates.push(path.join('/mnt/CustomsCruncher', base))
    candidates.push(path.join('/mnt/HotsBandayd', base))
  }

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate
      }
    } catch {
      // Ignore filesystem access errors
    }
  }

  return null
}

async function getReplaysToReparse(options: {
  targetId: number | null
  limit: number | null
  force: boolean
}): Promise<ReplayRowToReparse[]> {
  if (options.targetId !== null) {
    return sql<ReplayRowToReparse[]>`
      SELECT id, file, filename
      FROM replays
      WHERE id = ${options.targetId}
    `
  }

  if (options.force) {
    if (options.limit !== null) {
      return sql<ReplayRowToReparse[]>`
        SELECT id, file, filename
        FROM replays
        ORDER BY id DESC
        LIMIT ${options.limit}
      `
    }
    return sql<ReplayRowToReparse[]>`
      SELECT id, file, filename
      FROM replays
      ORDER BY id DESC
    `
  }

  if (options.limit !== null) {
    return sql<ReplayRowToReparse[]>`
      SELECT id, file, filename
      FROM replays
      WHERE (
        jsonb_typeof(takedowns) = 'string'
        OR (
          jsonb_typeof(takedowns) = 'array'
          AND jsonb_array_length(takedowns) > 0
          AND NOT (takedowns->0->'victim' ? 'killedBy')
        )
      )
      ORDER BY id DESC
      LIMIT ${options.limit}
    `
  }

  return sql<ReplayRowToReparse[]>`
    SELECT id, file, filename
    FROM replays
    WHERE (
      jsonb_typeof(takedowns) = 'string'
      OR (
        jsonb_typeof(takedowns) = 'array'
        AND jsonb_array_length(takedowns) > 0
        AND NOT (takedowns->0->'victim' ? 'killedBy')
      )
    )
    ORDER BY id DESC
  `
}

async function optimizeDb(): Promise<void> {
  try {
    console.log('Re-linking any orphaned account substitutions...')
    await relinkAccountSubstitutions()
    console.log('Refreshing mv_replay_player_stats and analyzing replays table...')
    await refreshPlayerStatsView()
    await sql`ANALYZE replays`
    console.log('Database optimization complete!')
  } catch (error) {
    console.error('Error optimizing database:', error)
  }
}

async function main() {
  const options = parseArgs()
  console.log('🔍 Searching for replays to re-import...', options)

  const rows = await getReplaysToReparse(options)
  console.log(`Found ${rows.length} replay(s) to process.`)

  if (rows.length === 0) {
    console.log('✅ All matching replays are already up-to-date.')
    process.exit(0)
  }

  const fileToReplayId = new Map<string, number>()
  const filesToProcess: string[] = []
  let missingFilesCount = 0

  for (const row of rows) {
    const resolved = resolveReplayPath(row)
    if (resolved) {
      fileToReplayId.set(resolved, row.id)
      filesToProcess.push(resolved)
    } else {
      missingFilesCount++
      console.warn(`[Warning] Replay #${row.id} file not found on disk (${row.file || row.filename})`)
    }
  }

  console.log(
    `🚀 Starting parser pool for ${filesToProcess.length} replay files (${missingFilesCount} missing on disk)...`
  )

  let updatedCount = 0
  let failedCount = 0
  const startTime = Date.now()
  let lastLogTime = 0
  let lastLogCount = 0

  await processReplaysInPool(filesToProcess, {
    onResult: async ({ file, data, processedCount, totalCount }) => {
      const replayId = fileToReplayId.get(file)
      if (!replayId) return

      if (data && data.replayObj) {
        try {
          const rowData = toReplayRow(data)
          await sql`
            UPDATE replays SET
              raw_date = ${rowData.raw_date},
              type = ${rowData.type},
              mode = ${rowData.mode},
              map = ${rowData.map},
              length = ${rowData.length},
              loop_length = ${rowData.loop_length},
              loop_game_start = ${rowData.loop_game_start},
              region = ${rowData.region},
              winner = ${rowData.winner},
              team0_takedowns = ${rowData.team0_takedowns},
              team1_takedowns = ${rowData.team1_takedowns},
              team0_players = ${rowData.team0_players},
              team1_players = ${rowData.team1_players},
              status = ${rowData.status},
              first_pick_win = ${rowData.first_pick_win},
              first_objective = ${rowData.first_objective},
              first_objective_win = ${rowData.first_objective_win},
              first_fort = ${rowData.first_fort},
              first_keep = ${rowData.first_keep},
              first_fort_win = ${rowData.first_fort_win},
              first_keep_win = ${rowData.first_keep_win},
              version = ${sql.json(rowData.version)},
              player_ids = ${rowData.player_ids},
              heroes = ${rowData.heroes},
              winning_players = ${rowData.winning_players},
              level_times = ${sql.json(rowData.level_times)},
              bans = ${rowData.bans ? sql.json(rowData.bans) : null},
              picks = ${rowData.picks ? sql.json(rowData.picks) : null},
              xp_breakdown = ${sql.json(rowData.xp_breakdown)},
              takedowns = ${sql.json(rowData.takedowns)},
              mercs = ${sql.json(rowData.mercs)},
              structures = ${sql.json(rowData.structures)},
              objective = ${sql.json(rowData.objective)},
              teams = ${sql.json(rowData.teams)},
              messages = ${sql.json(rowData.messages)},
              level_adv_timeline = ${sql.json(rowData.level_adv_timeline)},
              players = ${sql.json(rowData.players)}
            WHERE id = ${replayId}
          `
          updatedCount++
        } catch (err) {
          failedCount++
          console.error(`Failed to update replay #${replayId}:`, err)
        }
      } else {
        failedCount++
      }

      const now = Date.now()
      const isComplete = processedCount === totalCount
      const isTTY = Boolean(process.stdout.isTTY)
      const shouldLog =
        isComplete ||
        (isTTY ? now - lastLogTime >= 80 : now - lastLogTime >= 2000 || processedCount - lastLogCount >= 25)

      if (shouldLog) {
        lastLogTime = now
        lastLogCount = processedCount
        const elapsedMs = Math.max(1, now - startTime)
        const elapsedSec = Math.floor(elapsedMs / 1000)
        const replaysPerSec = processedCount > 0 ? processedCount / (elapsedMs / 1000) : 0
        const remainingCount = totalCount - processedCount
        const remainingSec = replaysPerSec > 0 ? Math.ceil(remainingCount / replaysPerSec) : 0

        const pct = Math.round((processedCount / totalCount) * 100)
        const cols = process.stdout.columns || 100
        const barWidth = Math.max(8, Math.min(20, cols - 85))
        const bar = renderProgressBar(processedCount / totalCount, barWidth)
        const elapsedStr = formatTime(elapsedSec)
        const etaStr = isComplete ? '0s' : formatTime(remainingSec)
        const speedStr = `${replaysPerSec.toFixed(1)}/s`
        const failStr = failedCount > 0 ? ` | Failed: ${failedCount}` : ''

        let line =
          `⏳ [${bar}] ${pct}% (${processedCount}/${totalCount}) ` +
          `| Elapsed: ${elapsedStr} | Remaining: ~${etaStr} ` +
          `| Speed: ${speedStr} | Updated: ${updatedCount}${failStr}`

        if (isTTY) {
          if (cols && line.length >= cols) {
            line = line.slice(0, cols - 1)
          }
          process.stdout.write(`\r\x1b[K${line}`)
          if (isComplete) {
            process.stdout.write('\n')
          }
        } else {
          console.log(line)
        }
      }
    },
  })

  const totalTimeSec = Math.max(1, Math.floor((Date.now() - startTime) / 1000))
  console.log(`\n🎉 Re-import complete in ${formatTime(totalTimeSec)}!`)
  console.log(`   - Successfully updated: ${updatedCount}`)
  console.log(`   - Missing on disk: ${missingFilesCount}`)
  console.log(`   - Failed or incomplete: ${failedCount}`)

  if (!options.skipOptimize && updatedCount > 0) {
    console.log('\n📊 Optimizing database and refreshing player stats materialized view...')
    await optimizeDb()
  }

  process.exit(0)
}

main().catch(err => {
  console.error('Fatal error during re-import:', err)
  process.exit(1)
})
