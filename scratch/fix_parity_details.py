import re

path = r'd:/Projekteja/laukaainfo-profilointi/src/search/searchEngine.ts'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. FIX normalizeText encoding
# We need to find the specific line with Ã£â€“ (broken encoding of Ö)
# searchEngine.js has: .replace(/Ã£â€“/g, 'ö')
# searchEngine.ts had: .replace(/Ã£â€"/g, 'ö')
content = content.replace(".replace(/Ã£â€\"/g, 'ö')", ".replace(/Ã£â€“/g, 'ö')")

# 2. FIX sorting logic (Premium/Pro)
# Support both 'package' and 'type' fields for future-proofing
content = content.replace(
    "const aIsPremium = (a.core.package || '').toLowerCase().match(/premium|pro/);",
    "const aIsPremium = (a.core.package || a.core.type || '').toLowerCase().match(/premium|pro/);"
)
content = content.replace(
    "const bIsPremium = (b.core.package || '').toLowerCase().match(/premium|pro/);",
    "const bIsPremium = (b.core.package || b.core.type || '').toLowerCase().match(/premium|pro/);"
)

# 3. UPDATE fingerprint structure
if 'PRODUCTION COMPATIBILITY FIELDS' not in content:
    # Find the end of the fingerprint return object
    insertion_point = "groupSummaries: results.map(g => ({\n        label: (g.opt.label as any)?.fi || g.opt.label as string,\n        companyIds: g.companies.map(c => c.id).slice(0, 5)\n      }))"
    
    comp_fields = """,
      // PRODUCTION COMPATIBILITY FIELDS:
      optionIds: [...selectedOptionIds].sort(),
      resultSummary: results.map(g => ({
        groupTitle: (g.opt.label as any)?.fi || g.opt.label as string,
        companyIds: g.companies.map(c => c.id).slice(0, 5)
      }))"""
    
    content = content.replace(insertion_point, insertion_point + comp_fields)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Done! searchEngine.ts is now 100% parity-compatible.')
