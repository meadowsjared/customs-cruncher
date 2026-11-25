import fs from 'fs'
import path from 'path'

export const REPLAY_DEST_DIR = process.env.REPLAY_DEST_DIR || '/mnt/Accounts/CustomsCruncher'
export const ACCOUNTS_SOURCE_DIR = process.env.ACCOUNTS_DIR || '/mnt/Accounts'

/**
 * Returns immediate subdirectories under `accountsDir` whose names are strictly digits (e.g. `1194299182`),
 * ignoring non-numeric folders such as `Old`, `BeerHots`, and `CustomsCruncher`.
 */
export function collectAccountReplayDirs(accountsDir: string = ACCOUNTS_SOURCE_DIR): string[] {
  try {
    if (!fs.existsSync(accountsDir)) return []
    const entries = fs.readdirSync(accountsDir, { withFileTypes: true })
    return entries
      .filter(entry => entry.isDirectory() && /^\d+$/.test(entry.name))
      .map(entry => path.join(accountsDir, entry.name))
  } catch (error) {
    console.error(`Error scanning ${accountsDir} for account directories:`, error)
    return []
  }
}

/**
 * Extracts the HotS ToonHandle (e.g. `1-Hero-1-11784602`) from an account replay path such as
 * `/mnt/Accounts/1194299182/1-Hero-1-11784602/Replays/...`.
 */
export function extractAccountToonHandleFromPath(
  filePath: string,
  accountsDir: string = ACCOUNTS_SOURCE_DIR
): string | null {
  const normalizedFile = path.resolve(filePath).replace(/\\/g, '/')
  const normalizedBase = path.resolve(accountsDir).replace(/\\/g, '/').replace(/\/+$/, '')
  if (!normalizedFile.startsWith(`${normalizedBase}/`)) {
    return null
  }
  const rel = normalizedFile.slice(normalizedBase.length + 1)
  const match = rel.match(/^\d+\/(\d+-Hero-\d+-\d+)(?:\/|$)/i)
  return match ? match[1] : null
}

export function findStormReplays(dir: string): string[] {
  let files: string[] = []
  try {
    if (!fs.existsSync(dir)) return []
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        files = files.concat(findStormReplays(fullPath))
      } else if (entry.isFile() && entry.name.endsWith('.StormReplay')) {
        files.push(fullPath)
      }
    }
  } catch (error) {
    console.error(`Error scanning ${dir} for replays:`, error)
  }
  return files
}

/**
 * Scans directories and returns all unique .StormReplay files (deduplicating by filename).
 * Directories earlier in the array take precedence.
 */
export function collectReplayFiles(dirs: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const dir of dirs) {
    const found = findStormReplays(dir)
    for (const f of found) {
      const base = path.basename(f)
      if (!seen.has(base)) {
        seen.add(base)
        result.push(f)
      }
    }
  }
  return result
}

/**
 * Sorts replay file paths newest-first while calling `fs.statSync` only once per file (`O(N)` instead of `O(N log N)`).
 */
export function sortReplayFilesNewestFirst(files: string[]): Array<{ file: string; mtime: number }> {
  const withStats = files.map(file => {
    try {
      return { file, mtime: fs.statSync(file).mtime.getTime() }
    } catch {
      return { file, mtime: 0 }
    }
  })
  withStats.sort((a, b) => b.mtime - a.mtime)
  return withStats
}
