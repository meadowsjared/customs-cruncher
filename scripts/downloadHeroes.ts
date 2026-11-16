import fs from 'node:fs'
import path from 'node:path'
import { puppeteerRefreshXsrfTokenAndCookies } from '../store/heroesProfilePuppeteer'

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['.]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

async function run() {
  const targetDir = path.resolve(process.cwd(), 'assets/heroes')
  const webPublicDir = path.resolve(process.cwd(), 'web/public/heroes')

  fs.mkdirSync(targetDir, { recursive: true })
  fs.mkdirSync(webPublicDir, { recursive: true })

  console.log('Connecting via puppeteer-real-browser to https://www.heroesprofile.com/Global/Hero...')
  const { page, browser } = await puppeteerRefreshXsrfTokenAndCookies('https://www.heroesprofile.com/Global/Hero')

  await page.waitForSelector('img', { timeout: 15000 })

  const heroList = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'))
    return imgs
      .filter(img => img.src.includes('/images/heroes/'))
      .map(img => ({
        src: img.src,
        alt: img.alt || '',
      }))
  })

  await browser.close()
  console.log(`Found ${heroList.length} heroes on page!`)

  const mapping: Record<string, string> = {}
  let downloadedCount = 0

  for (const item of heroList) {
    const imgUrl = item.src
    const originalFilename = path.basename(new URL(imgUrl).pathname).toLowerCase()
    const heroName = item.alt.trim()
    const normKey = normalizeName(heroName)

    try {
      const res = await fetch(imgUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Referer': 'https://www.heroesprofile.com/Global/Hero',
        },
      })

      if (!res.ok) {
        console.warn(`Failed to fetch ${imgUrl}: status ${res.status}`)
        continue
      }

      const buffer = Buffer.from(await res.arrayBuffer())

      // Save as original filename (e.g. malganis.png)
      fs.writeFileSync(path.join(targetDir, originalFilename), buffer)
      fs.writeFileSync(path.join(webPublicDir, originalFilename), buffer)

      // Save as normalized name (e.g. mal_ganis.png)
      if (normKey && `${normKey}.png` !== originalFilename) {
        fs.writeFileSync(path.join(targetDir, `${normKey}.png`), buffer)
        fs.writeFileSync(path.join(webPublicDir, `${normKey}.png`), buffer)
      }

      // Also save with spaces stripped if different
      const noSpaces = heroName.toLowerCase().replace(/['.]/g, '').replace(/\s+/g, '')
      if (noSpaces && `${noSpaces}.png` !== originalFilename) {
        fs.writeFileSync(path.join(targetDir, `${noSpaces}.png`), buffer)
        fs.writeFileSync(path.join(webPublicDir, `${noSpaces}.png`), buffer)
      }

      mapping[heroName] = originalFilename
      downloadedCount++
      console.log(`[${downloadedCount}/${heroList.length}] Saved ${heroName} -> ${originalFilename}`)
    } catch (err) {
      console.error(`Error saving ${heroName}:`, err)
    }
  }

  // Save hero mapping JSON for exact client-side lookups
  fs.writeFileSync(path.join(targetDir, 'heroes.json'), JSON.stringify(mapping, null, 2))
  fs.writeFileSync(path.join(webPublicDir, 'heroes.json'), JSON.stringify(mapping, null, 2))

  console.log(`Successfully downloaded ${downloadedCount} heroes into assets/heroes/ and web/public/heroes/!`)
}

void run()
