"""
Patch needsConfig.ts: Add stable 'id' fields to all options that are missing them.
Source of truth: needs_config.js (production) which has IDs like OPT_WED_VENUE_LARGE, etc.
"""

import json, re

react_path = r'd:/Projekteja/laukaainfo-profilointi/src/constants/needsConfig.ts'
prod_path = r'd:/Projekteja/MUUTprojektit/LaukaaInfo-livescreen/LaukaaInfo-livescreen/needs_config.js'

# ---- Parse production needs_config.js to extract id->label mappings ----
with open(prod_path, 'r', encoding='utf-8') as f:
    prod_content = f.read()

# Extract all { "id": "OPT_XXX", "label": { "fi": "...", ... } } pairs
id_pattern = re.compile(r'"id":\s*"(OPT_[A-Z_0-9]+)".*?"fi":\s*"([^"]+)"', re.DOTALL)
prod_ids = {}
for m in id_pattern.finditer(prod_content):
    opt_id = m.group(1)
    label_fi = m.group(2)
    prod_ids[label_fi] = opt_id

print(f"Found {len(prod_ids)} option IDs in production config")

# ---- Read React needsConfig.ts ----
with open(react_path, 'r', encoding='utf-8') as f:
    react_content = f.read()

# Check how many options already have IDs
has_id = react_content.count('"id": "OPT_')
print(f"React config already has {has_id} OPT_ ids")

# ---- Inject missing IDs into React config ----
# Pattern: options that have "label": { "fi": "XYZ" } but no "id" right before label
# We insert "id": "OPT_XXX", before the label field

def inject_id(match):
    full = match.group(0)
    label_fi = match.group(1)
    
    # Already has an id?
    if '"id"' in full[:full.find('"label"')]:
        return full
    
    opt_id = prod_ids.get(label_fi)
    if not opt_id:
        return full  # No mapping found, leave as-is
    
    # Insert id before "label"
    return full.replace('{ "label"', f'{{ "id": "{opt_id}", "label"', 1)

# Match option objects: { "label": { "fi": "...", ...
option_pattern = re.compile(r'\{ "label": \{ "fi": "([^"]+)"')

# Count how many we'll patch
matches = option_pattern.findall(react_content)
patchable = [m for m in matches if m in prod_ids]
print(f"Options to patch with IDs: {len(patchable)}")
for label in patchable[:10]:
    print(f"  '{label}' -> {prod_ids[label]}")

new_content = option_pattern.sub(inject_id, react_content)

# Verify improvement
new_has_id = new_content.count('"id": "OPT_')
print(f"\nAfter patch: {new_has_id} OPT_ ids (was {has_id})")

if new_has_id > has_id:
    with open(react_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("SUCCESS: needsConfig.ts updated with stable option IDs")
else:
    print("No changes made (already up to date or no matches found)")
