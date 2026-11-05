path = r'd:/Projekteja/laukaainfo-profilointi/src/constants/needsConfig.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

count_ids = content.count('"id": "OPT_')
count_labels = content.count('"fi":')
print(f'OPT_ ids in needsConfig.ts: {count_ids}')
print(f'Finnish labels: {count_labels}')

# Show first 5 id+label combos
import re
matches = re.findall(r'"id": "(OPT_[^"]+)".*?"fi": "([^"]+)"', content[:3000])
print('\nFirst 5 option ID mappings:')
for opt_id, label in matches[:5]:
    print(f'  {opt_id} -> {label}')
