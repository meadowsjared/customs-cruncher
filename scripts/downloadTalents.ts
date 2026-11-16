import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

interface TalentDef {
  tooltipId: string
  talentTreeId: string
  name: string
  description: string
  icon: string
  type: string
  sort: number
  abilityId?: string
}

interface HeroJson {
  name: string
  shortName: string
  attributeId: string
  talents: Record<string, TalentDef[]>
}

async function run() {
  const talentsDir = path.resolve(process.cwd(), 'web/src/assets/talents')
  fs.mkdirSync(talentsDir, { recursive: true })

  const tarballPath = path.resolve(process.cwd(), 'temp_heroes_talents.tar.gz')

  // If archive not downloaded, download it
  if (!fs.existsSync(tarballPath)) {
    console.log('Downloading heroes-talents archive...')
    const res = await fetch('https://codeload.github.com/heroespatchnotes/heroes-talents/tar.gz/master')
    if (!res.ok) throw new Error(`Download failed: ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    fs.writeFileSync(tarballPath, buf)
  }

  console.log('Extracting archive via python tarfile...')
  const extractScript = `
import tarfile, os, json, shutil

tarball = "temp_heroes_talents.tar.gz"
dest_dir = "web/src/assets/talents"
temp_extract = "/tmp/ht_extract"

if os.path.exists(temp_extract):
    shutil.rmtree(temp_extract)
os.makedirs(temp_extract, exist_ok=True)

with tarfile.open(tarball, "r:gz") as tar:
    tar.extractall(temp_extract)

extracted_root = None
for root, dirs, files in os.walk(temp_extract):
    if "images" in dirs and "hero" in dirs:
        extracted_root = root
        break

if not extracted_root:
    print("Could not find extracted root")
    exit(1)

# Copy all talent images
img_src_dir = os.path.join(extracted_root, "images", "talents")
copied_imgs = 0
for f in os.listdir(img_src_dir):
    if f.endswith(".png"):
        shutil.copy2(os.path.join(img_src_dir, f), os.path.join(dest_dir, f))
        copied_imgs += 1
print(f"Extracted {copied_imgs} base talent images")

# Parse all hero JSONs
hero_dir = os.path.join(extracted_root, "hero")
talents_map = {}
alias_count = 0

for hfile in os.listdir(hero_dir):
    if not hfile.endswith(".json"):
        continue
    hpath = os.path.join(hero_dir, hfile)
    with open(hpath, "r", encoding="utf-8") as f:
        hdata = json.load(f)
    
    hero_name = hdata.get("name", "")
    for tier, tlist in hdata.get("talents", {}).items():
        for t in tlist:
            t_id = t.get("talentTreeId") or t.get("tooltipId")
            if not t_id:
                continue
            
            icon = t.get("icon", "")
            talents_map[t_id] = {
                "name": t.get("name", ""),
                "description": t.get("description", ""),
                "icon": icon,
                "tier": tier,
                "type": t.get("type", ""),
                "hero": hero_name
            }
            if t.get("tooltipId") and t.get("tooltipId") != t_id:
                talents_map[t.get("tooltipId")] = talents_map[t_id]
            
            # Create alias image by talent ID e.g. HanzoSimpleGeometry.png
            if icon and os.path.exists(os.path.join(dest_dir, icon)):
                alias_name = f"{t_id}.png"
                alias_path = os.path.join(dest_dir, alias_name)
                if not os.path.exists(alias_path):
                    shutil.copy2(os.path.join(dest_dir, icon), alias_path)
                    alias_count += 1
                
                if t.get("tooltipId") and t.get("tooltipId") != t_id:
                    tip_alias = os.path.join(dest_dir, f"{t.get('tooltipId')}.png")
                    if not os.path.exists(tip_alias):
                        shutil.copy2(os.path.join(dest_dir, icon), tip_alias)
                        alias_count += 1

with open(os.path.join(dest_dir, "talents.json"), "w", encoding="utf-8") as f:
    json.dump(talents_map, f, indent=2)

print(f"Created talents.json with {len(talents_map)} talent mappings and {alias_count} alias images.")
shutil.rmtree(temp_extract)
`

  execSync(`python3 -c '${extractScript}'`, { stdio: 'inherit' })

  // Clean up tarball
  if (fs.existsSync(tarballPath)) {
    fs.unlinkSync(tarballPath)
  }

  console.log('Talent download and processing completed successfully!')
}

void run()
