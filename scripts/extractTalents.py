import tarfile
import os
import json
import shutil

tarball = "temp_heroes_talents.tar.gz"
dest_dir = "web/src/assets/talents"
temp_extract = "/tmp/ht_extract"

if os.path.exists(temp_extract):
    shutil.rmtree(temp_extract)
os.makedirs(temp_extract, exist_ok=True)
os.makedirs(dest_dir, exist_ok=True)

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
            t_data = {
                "name": t.get("name", ""),
                "description": t.get("description", ""),
                "icon": icon,
                "tier": tier,
                "type": t.get("type", ""),
                "hero": hero_name
            }
            talents_map[t_id] = t_data
            tooltip_id = t.get("tooltipId")
            if tooltip_id and tooltip_id != t_id:
                talents_map[tooltip_id] = t_data
            
            # Create alias image by talent ID e.g. HanzoSimpleGeometry.png
            if icon and os.path.exists(os.path.join(dest_dir, icon)):
                alias_name = f"{t_id}.png"
                alias_path = os.path.join(dest_dir, alias_name)
                if not os.path.exists(alias_path):
                    shutil.copy2(os.path.join(dest_dir, icon), alias_path)
                    alias_count += 1
                
                if tooltip_id and tooltip_id != t_id:
                    tip_alias = os.path.join(dest_dir, f"{tooltip_id}.png")
                    if not os.path.exists(tip_alias):
                        shutil.copy2(os.path.join(dest_dir, icon), tip_alias)
                        alias_count += 1

with open(os.path.join(dest_dir, "talents.json"), "w", encoding="utf-8") as f:
    json.dump(talents_map, f, indent=2)

print(f"Created talents.json with {len(talents_map)} talent mappings and {alias_count} alias images.")
shutil.rmtree(temp_extract)
if os.path.exists(tarball):
    os.remove(tarball)
print("Done!")

