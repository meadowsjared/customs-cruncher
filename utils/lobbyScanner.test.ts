import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import sharp from 'sharp'
import { saveScannedLobbyImage } from './lobbyScanner'

describe('utils.lobbyScanner.saveScannedLobbyImage', () => {
  let tempDir: string

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lobby-test-'))
  })

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('saves an image buffer to the destination directory with timestamped filename', async () => {
    const testImage = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer()

    const savedPath = await saveScannedLobbyImage(testImage, 'my_custom_lobby.png', tempDir)
    expect(savedPath).not.toBeNull()
    if (!savedPath) throw new Error('Expected savedPath to be defined')

    const fileExists = await fs
      .stat(savedPath)
      .then(() => true)
      .catch(() => false)
    expect(fileExists).toBe(true)

    const basename = path.basename(savedPath)
    expect(basename.startsWith('my_custom_lobby_')).toBe(true)
    expect(basename.endsWith('.png')).toBe(true)

    const savedBuffer = await fs.readFile(savedPath)
    expect(savedBuffer.equals(testImage)).toBe(true)
  })

  it('uses default "lobby" prefix when original filename is generic or omitted', async () => {
    const testImage = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 0, g: 255, b: 0 },
      },
    })
      .jpeg()
      .toBuffer()

    const savedPathOmitted = await saveScannedLobbyImage(testImage, undefined, tempDir)
    expect(savedPathOmitted).not.toBeNull()
    if (!savedPathOmitted) throw new Error('Expected savedPath to be defined')

    const basenameOmitted = path.basename(savedPathOmitted)
    expect(basenameOmitted.startsWith('lobby_')).toBe(true)
    expect(basenameOmitted.endsWith('.jpg')).toBe(true)

    const savedPathGeneric = await saveScannedLobbyImage(testImage, 'image.png', tempDir)
    expect(savedPathGeneric).not.toBeNull()
    if (!savedPathGeneric) throw new Error('Expected savedPath to be defined')

    const basenameGeneric = path.basename(savedPathGeneric)
    expect(basenameGeneric.startsWith('lobby_')).toBe(true)
    expect(basenameGeneric.endsWith('.jpg')).toBe(true)
  })
})
