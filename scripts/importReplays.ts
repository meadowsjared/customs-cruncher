import fs from 'fs'
import path from 'path'

process.env.QUIET_REPLAY_PARSER = '1'
process.env.LOGLEVEL = 'silent'
import { isProd, sql } from '../store/db'
import { getImportedReplayFilenames, recordReplayOwnerOverride, saveReplayToDb } from '../store/hotsReplays'
import { getAllImportRules, initImportRulesTable } from '../store/importRules'
import { refreshPlayerStatsView } from '../store/playerStats'
import { relinkAccountSubstitutions } from '../store/substitutions'
import { toReplayRow } from '../types/replay'
import { resolveGlobalReplayImportTarget } from '../utils/importRules'
import {
  collectAccountReplayDirs,
  collectReplayFiles,
  extractAccountToonHandleFromPath,
  REPLAY_DEST_DIR,
  sortReplayFilesNewestFirst,
} from '../utils/replayFiles'
import { processReplaysInPool } from '../utils/replayWorkerPool'

interface ReplayRowToReparse {
  id: number
  file: string | null
  filename: string | null
  guild_id: string | null
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
  importAll: boolean
  newOnly: boolean
} {
  const args = process.argv.slice(2)
  let targetId: number | null = null
  let limit: number | null = null
  let force = false
  let skipOptimize = false
  let importAll = false
  let newOnly = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--help' || arg === '-h') {
      console.log(`
Import & Re-import Replays Tool

Usage:
  bun scripts/importReplays.ts [options] [:dev]
  bun run import:replays [options]
  bun run import:replays:dev [options]

Options:
  :dev, --dev          Target development database (defaults to production)
  :prod, --prod        Target production database (default)
  --id <id>            Reparse a specific existing replay by ID
  --limit <number>     Limit the number of replays to process per phase
  --force              Reparse existing replays even if already up to date
  --all, --import-new  Also scan disk and import all unimported replays (skips already imported)
  --new-only           Skip re-parsing existing DB rows; only import new unimported replays
  --no-optimize        Skip refreshing materialized views and analyzing DB
  --help, -h           Show this help message
`)
      process.exit(0)
    } else if (arg === '--id' && i + 1 < args.length) {
      const parsed = parseInt(args[++i], 10)
      if (!isNaN(parsed)) targetId = parsed
    } else if (arg === '--limit' && i + 1 < args.length) {
      const parsed = parseInt(args[++i], 10)
      if (!isNaN(parsed)) limit = parsed
    } else if (arg === '--force') {
      force = true
    } else if (arg === '--all' || arg === '--import-new') {
      importAll = true
    } else if (arg === '--new-only') {
      newOnly = true
      importAll = true
    } else if (arg === '--no-optimize' || arg === '--skip-optimize') {
      skipOptimize = true
    }
  }

  return { targetId, limit, force, skipOptimize, importAll, newOnly }
}

let diskReplayIndex: Map<string, string> | null = null

function getDiskReplayIndex(ruleDestDirs: string[]): Map<string, string> {
  if (diskReplayIndex) return diskReplayIndex
  const dirs = Array.from(new Set([REPLAY_DEST_DIR, ...ruleDestDirs, ...collectAccountReplayDirs()]))
  const files = collectReplayFiles(dirs)
  const map = new Map<string, string>()
  for (const f of files) {
    const b = path.basename(f)
    if (!map.has(b)) {
      map.set(b, f)
    }
  }
  diskReplayIndex = map
  return map
}

function resolveReplayPath(row: ReplayRowToReparse, ruleDestDirs: string[]): string | null {
  const candidates: string[] = []
  if (row.file) candidates.push(row.file)
  if (row.filename && row.filename !== row.file) candidates.push(row.filename)

  const base = path.basename(row.file || row.filename || '')
  if (base) {
    candidates.push(path.join(REPLAY_DEST_DIR, base))
    for (const dir of ruleDestDirs) {
      candidates.push(path.join(dir, base))
    }
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

  if (base) {
    const indexed = getDiskReplayIndex(ruleDestDirs).get(base)
    if (indexed) {
      return indexed
    }
  }

  return null
}

async function getReplaysToReparse(
  options: {
    targetId: number | null
    limit: number | null
    force: boolean
  },
  rosterPatterns: string[]
): Promise<ReplayRowToReparse[]> {
  if (options.targetId !== null) {
    return sql<ReplayRowToReparse[]>`
      SELECT id, file, filename, guild_id
      FROM replays
      WHERE id = ${options.targetId}
    `
  }

  if (options.force) {
    if (options.limit !== null) {
      return sql<ReplayRowToReparse[]>`
        SELECT id, file, filename, guild_id
        FROM replays
        ORDER BY id DESC
        LIMIT ${options.limit}
      `
    }
    return sql<ReplayRowToReparse[]>`
      SELECT id, file, filename, guild_id
      FROM replays
      ORDER BY id DESC
    `
  }

  if (options.limit !== null) {
    return sql<ReplayRowToReparse[]>`
      SELECT id, file, filename, guild_id
      FROM replays
      WHERE (
        jsonb_typeof(takedowns) = 'string'
        OR (
          jsonb_typeof(takedowns) = 'array'
          AND jsonb_array_length(takedowns) > 0
          AND NOT (takedowns->0->'victim' ? 'killedBy')
        )
        OR (
          guild_id IS NULL
          AND mode IN (-1, 50001, 50031, 50101)
          AND cardinality(${rosterPatterns}::text[]) > 0
          AND LOWER(COALESCE(team0_players, '') || ', ' || COALESCE(team1_players, '')) LIKE ANY(${rosterPatterns}::text[])
        )
      )
      ORDER BY id DESC
      LIMIT ${options.limit}
    `
  }

  return sql<ReplayRowToReparse[]>`
    SELECT id, file, filename, guild_id
    FROM replays
    WHERE (
      jsonb_typeof(takedowns) = 'string'
      OR (
        jsonb_typeof(takedowns) = 'array'
        AND jsonb_array_length(takedowns) > 0
        AND NOT (takedowns->0->'victim' ? 'killedBy')
      )
      OR (
        guild_id IS NULL
        AND mode IN (-1, 50001, 50031, 50101)
        AND cardinality(${rosterPatterns}::text[]) > 0
        AND LOWER(COALESCE(team0_players, '') || ', ' || COALESCE(team1_players, '')) LIKE ANY(${rosterPatterns}::text[])
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

interface ProgressTracker {
  startTime: number
  lastLogTime: number
  lastLogCount: number
}

function logProgress(
  tracker: ProgressTracker,
  processedCount: number,
  totalCount: number,
  successLabel: string,
  successCount: number,
  failedCount: number
) {
  const now = Date.now()
  const isComplete = processedCount === totalCount
  const isTTY = Boolean(process.stdout.isTTY)
  const shouldLog =
    isComplete ||
    (isTTY
      ? now - tracker.lastLogTime >= 80
      : now - tracker.lastLogTime >= 2000 || processedCount - tracker.lastLogCount >= 25)

  if (!shouldLog) return

  tracker.lastLogTime = now
  tracker.lastLogCount = processedCount
  const elapsedMs = Math.max(1, now - tracker.startTime)
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
    `| Speed: ${speedStr} | ${successLabel}: ${successCount}${failStr}`

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

async function reimportExistingReplays(options: {
  targetId: number | null
  limit: number | null
  force: boolean
}): Promise<number> {
  const allRules = await getAllImportRules()
  const rosterPatterns = Array.from(
    new Set(
      allRules
        .flatMap(r => r.rosterBattleTags)
        .map(tag => tag.trim().toLowerCase())
        .filter(Boolean)
        .map(tag => `%${tag}%`)
    )
  )

  const rows = await getReplaysToReparse(options, rosterPatterns)
  console.log(`Found ${rows.length} existing replay(s) to re-parse.`)

  if (rows.length === 0) {
    return 0
  }

  const fileToRow = new Map<string, ReplayRowToReparse>()
  const filesToProcess: string[] = []
  let missingFilesCount = 0

  const ruleDestDirs = Array.from(new Set(allRules.map(r => r.replayDestDir)))

  for (const row of rows) {
    const resolved = resolveReplayPath(row, ruleDestDirs)
    if (resolved) {
      fileToRow.set(resolved, row)
      filesToProcess.push(resolved)
    } else {
      missingFilesCount++
      console.warn(`[Warning] Replay #${row.id} file not found on disk (${row.file || row.filename})`)
    }
  }

  console.log(
    `🚀 Re-parsing ${filesToProcess.length} existing replay files (${missingFilesCount} missing on disk)...`
  )

  let updatedCount = 0
  let assignedCount = 0
  let failedCount = 0
  const tracker: ProgressTracker = { startTime: Date.now(), lastLogTime: 0, lastLogCount: 0 }

  await processReplaysInPool(filesToProcess, {
    onResult: async ({ file, data, processedCount, totalCount }) => {
      const existingRow = fileToRow.get(file)
      if (!existingRow) return
      const replayId = existingRow.id

      if (data && data.replayObj) {
        try {
          let nextGuildId = existingRow.guild_id
          let copyDestDir: string | null = null
          if (!nextGuildId) {
            const target = resolveGlobalReplayImportTarget(data, allRules)
            if (target.guildId) {
              nextGuildId = target.guildId
              assignedCount++
            }
            copyDestDir = target.destDir
          }

          const rowData = toReplayRow(data)
          await sql`
            UPDATE replays SET
              guild_id = ${nextGuildId},
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
          if (copyDestDir) {
            const destPath = path.join(copyDestDir, path.basename(file))
            if (!fs.existsSync(copyDestDir)) {
              fs.mkdirSync(copyDestDir, { recursive: true })
            }
            if (path.resolve(file) !== path.resolve(destPath) && !fs.existsSync(destPath)) {
              fs.copyFileSync(file, destPath)
            }
          }
          const accountToonHandle = extractAccountToonHandleFromPath(file)
          if (accountToonHandle) {
            await recordReplayOwnerOverride(replayId, data, accountToonHandle, 'bandayd#1631', nextGuildId ?? 'global')
          }
          updatedCount++
        } catch (err) {
          failedCount++
          console.error(`Failed to update replay #${replayId}:`, err)
        }
      } else {
        failedCount++
      }

      logProgress(tracker, processedCount, totalCount, 'Updated', updatedCount, failedCount)
    },
  })

  const totalTimeSec = Math.max(1, Math.floor((Date.now() - tracker.startTime) / 1000))
  console.log(
    `✅ Re-import phase finished in ${formatTime(totalTimeSec)}: ${updatedCount} updated (${assignedCount} newly assigned to server rules), ${missingFilesCount} missing, ${failedCount} failed.`
  )
  return updatedCount
}

async function importNewReplays(limit: number | null): Promise<number> {
  const allRules = await getAllImportRules()
  const scanDirs = Array.from(
    new Set([REPLAY_DEST_DIR, ...allRules.map(r => r.replayDestDir), ...collectAccountReplayDirs()])
  )
  const allFiles = collectReplayFiles(scanDirs)
  const sortedFiles = sortReplayFilesNewestFirst(allFiles).map(e => e.file)

  const importedSet = await getImportedReplayFilenames()
  let unimportedFiles = sortedFiles.filter(file => !importedSet.has(path.basename(file)))
  if (limit !== null && unimportedFiles.length > limit) {
    unimportedFiles = unimportedFiles.slice(0, limit)
  }

  console.log(
    `Found ${unimportedFiles.length} new unimported replay(s) across ${scanDirs.length} directories.`
  )
  if (unimportedFiles.length === 0) {
    return 0
  }

  let importedCount = 0
  let copiedCount = 0
  let failedCount = 0
  const tracker: ProgressTracker = { startTime: Date.now(), lastLogTime: 0, lastLogCount: 0 }

  await processReplaysInPool(unimportedFiles, {
    onResult: async ({ file, data, processedCount, totalCount }) => {
      if (data && data.replayObj) {
        try {
          const target = resolveGlobalReplayImportTarget(data, allRules)
          const replayId = await saveReplayToDb(data, target.guildId, {
            refreshStats: false,
            linkSubstitutions: false,
          })
          const accountToonHandle = extractAccountToonHandleFromPath(file)
          if (accountToonHandle) {
            await recordReplayOwnerOverride(replayId, data, accountToonHandle, 'bandayd#1631', target.guildId ?? 'global')
          }
          if (target.destDir) {
            const destPath = path.join(target.destDir, path.basename(file))
            if (!fs.existsSync(target.destDir)) {
              fs.mkdirSync(target.destDir, { recursive: true })
            }
            if (path.resolve(file) !== path.resolve(destPath) && !fs.existsSync(destPath)) {
              fs.copyFileSync(file, destPath)
            }
          }
          importedSet.add(path.basename(file))
          importedCount++
          if (target.destDir) {
            copiedCount++
          }
        } catch (err) {
          failedCount++
          console.error(`Failed to import replay ${path.basename(file)}:`, err)
        }
      } else {
        failedCount++
      }

      logProgress(tracker, processedCount, totalCount, 'Imported', importedCount, failedCount)
    },
  })

  const totalTimeSec = Math.max(1, Math.floor((Date.now() - tracker.startTime) / 1000))
  console.log(
    `✅ Import phase finished in ${formatTime(totalTimeSec)}: ${importedCount} imported (${copiedCount} copied to server dirs), ${failedCount} failed.`
  )
  return importedCount
}

async function main() {
  const options = parseArgs()
  console.log(`🌐 Target Database: ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'}`)
  console.log('🔍 Starting replay import/re-import...', options)

  await initImportRulesTable()

  let changedCount = 0

  if (!options.newOnly) {
    changedCount += await reimportExistingReplays(options)
  }

  if (options.importAll && options.targetId === null) {
    changedCount += await importNewReplays(options.limit)
  }

  if (!options.skipOptimize && changedCount > 0) {
    console.log('\n📊 Optimizing database and refreshing player stats materialized view...')
    await optimizeDb()
  } else if (changedCount === 0) {
    console.log('✅ Everything is already up-to-date.')
  }

  process.exit(0)
}

main().catch(err => {
  console.error('Fatal error during replay import:', err)
  process.exit(1)
})
