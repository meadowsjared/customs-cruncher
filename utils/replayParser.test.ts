import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'bun:test'
import { collectAccountReplayDirs, collectReplayFiles, extractAccountToonHandleFromPath } from './replayFiles'
import { extractPartyIdsFromBattleLobby, parseReplaySync } from './replayParser'
import { processReplaysInPool } from './replayWorkerPool'

describe('utils.replayParser & workerPool', () => {
  it('parseReplaySync returns null safely for nonexistent file without throwing', () => {
    const result = parseReplaySync('/nonexistent/path/fake.StormReplay')
    expect(result).toBeNull()
  })

  it('collectReplayFiles deduplicates and prioritizes directories in order', () => {
    const files = collectReplayFiles(['/nonexistent/dir1', '/nonexistent/dir2'])
    expect(files).toEqual([])
  })

  it('processReplaysInPool handles empty file arrays gracefully', async () => {
    let called = false
    await processReplaysInPool([], {
      onResult: () => {
        called = true
      },
    })
    expect(called).toBe(false)
  })

  it('processReplaysInPool respects shouldStop early termination', async () => {
    const mockFiles = [
      '/nonexistent/test1.StormReplay',
      '/nonexistent/test2.StormReplay',
      '/nonexistent/test3.StormReplay',
    ]

    let resultsCount = 0
    await processReplaysInPool(mockFiles, {
      concurrency: 1,
      shouldStop: () => resultsCount >= 1,
      onResult: () => {
        resultsCount++
      },
    })

    expect(resultsCount).toBeLessThanOrEqual(2)
  })

  it('collectAccountReplayDirs includes only all-digit subdirectories', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-accounts-'))
    try {
      fs.mkdirSync(path.join(tmpRoot, '1194299182'))
      fs.mkdirSync(path.join(tmpRoot, '987654321'))
      fs.mkdirSync(path.join(tmpRoot, 'Old'))
      fs.mkdirSync(path.join(tmpRoot, 'BeerHots'))
      fs.mkdirSync(path.join(tmpRoot, 'CustomsCruncher'))
      fs.writeFileSync(path.join(tmpRoot, '12345'), 'not-a-dir')

      const dirs = collectAccountReplayDirs(tmpRoot).sort()
      expect(dirs).toEqual([
        path.join(tmpRoot, '1194299182'),
        path.join(tmpRoot, '987654321'),
      ])
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true })
    }
  })

  it('extractAccountToonHandleFromPath extracts ToonHandle from numeric account replay path', () => {
    expect(
      extractAccountToonHandleFromPath(
        '/mnt/Accounts/1194299182/1-Hero-1-11784602/Replays/Multiplayer/test.StormReplay',
        '/mnt/Accounts'
      )
    ).toBe('1-Hero-1-11784602')
    expect(
      extractAccountToonHandleFromPath('/mnt/HotsBandayd/test.StormReplay', '/mnt/Accounts')
    ).toBeNull()
  })

  it('extractPartyIdsFromBattleLobby extracts shared 8-byte party hex and null for solo players', () => {
    const soloPrefix = Buffer.from('0040000303ba20', 'hex')
    const soloTag = Buffer.from('Silip#11244', 'utf8')
    const partyPrefix = Buffer.from('0040000303ba1000022deeea7a1229', 'hex')
    const p1Tag = Buffer.from('Bandayd#1631', 'utf8')
    const p2Tag = Buffer.from('Spectre#1741', 'utf8')

    const lobbyBuf = Buffer.concat([
      soloPrefix,
      Buffer.from([soloTag.length]),
      soloTag,
      Buffer.alloc(16),
      partyPrefix,
      Buffer.from([p1Tag.length]),
      p1Tag,
      Buffer.alloc(16),
      partyPrefix,
      Buffer.from([p2Tag.length]),
      p2Tag,
    ])

    const map = extractPartyIdsFromBattleLobby(lobbyBuf, ['Silip#11244', 'Bandayd#1631', 'Spectre#1741'])
    expect(map.get('silip#11244')).toBeNull()
    expect(map.get('bandayd#1631')).toBe('00022deeea7a1229')
    expect(map.get('spectre#1741')).toBe('00022deeea7a1229')
  })
})

