import re

path = r'd:/Projekteja/laukaainfo-profilointi/src/search/searchEngine.ts'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

print("Original length:", len(content))

# 1. FIX normalizeText - remove the 3 lines that incorrectly strip Finnish chars to ASCII
# These lines break fuzzy matching (e.g. 'haavideo' instead of 'häävideo')
lines = content.split('\n')
new_lines = []
for i, line in enumerate(lines):
    stripped = line.strip()
    # Remove lines like: .replace(/[äÄàáâãäå]/g, 'a')
    #                    .replace(/[öÖòóôõöø]/g, 'o')
    #                    .replace(/[åÅ]/g, 'a')
    if '.replace(/[' in stripped and ("]/g, 'a')" in stripped or "]/g, 'o')" in stripped):
        print(f'  Removing strip line {i+1}: {line.strip()[:60]}')
        continue
    new_lines.append(line)

content = '\n'.join(new_lines)

# 2. ADD require_fits_for check before catering exclusion
old_marker = '  // 1. Catering exclusion\n  if (noCateringSelected) {'
new_marker = (
    '  // 1. require_fits_for gate (matches production searchEngine.js)\n'
    '  if ((opt as any).require_fits_for) {\n'
    '    const rfKey = (opt as any).require_fits_for.key;\n'
    '    const rfMin = (opt as any).require_fits_for.min || 20;\n'
    '    const rfScore = getFitsForScore(c, rfKey);\n'
    '    if (rfScore < rfMin) return false;\n'
    '  }\n'
    '\n'
    '  // 2. Catering exclusion\n'
    '  if (noCateringSelected) {'
)

if old_marker in content:
    content = content.replace(old_marker, new_marker)
    print('  Added require_fits_for check OK')
else:
    print('  WARNING: catering marker not found! Check manually.')

# 3. Version bump
content = content.replace(
    '// Search Engine Parity Module v1.0.5 - Unified Matching Logic',
    '// Search Engine Parity Module v1.1.0 - Parity Fix (normalizeText + require_fits_for + fingerprint)'
)

# 4. ADD generateSearchFingerprint at the end
fingerprint_code = '''
/**
 * Deterministic search fingerprint for cross-environment parity validation.
 * Identical inputs MUST produce identical fingerprints in palvelu.html and this simulator.
 */
export interface SearchFingerprint {
  needId: string;
  profilingKey: string;
  selectedOptionIds: string[];
  subContexts: string[];
  resultFingerprint: {
    companyCount: number;
    groupCount: number;
    topResultId: string | null;
    groupSummaries: Array<{ label: string; companyIds: string[] }>;
  };
}

export function generateSearchFingerprint(
  needId: string,
  profilingKey: string,
  selections: Record<string, any>,
  results: SearchResultGroup[]
): SearchFingerprint {
  const selectedOptionIds: string[] = [];
  const subContexts: string[] = [];

  Object.values(selections).forEach(val => {
    const opts = Array.isArray(val) ? val : [val];
    opts.forEach((opt: any) => {
      if (!opt || !opt.label) return;
      const id = opt.id || (opt.label?.fi || opt.label);
      selectedOptionIds.push(id);
      if (opt.sub_context) subContexts.push(opt.sub_context);
    });
  });

  const allCompanyIds = results.flatMap(g => g.companies.map(c => c.id));
  const uniqueCompanyIds = [...new Set(allCompanyIds)];

  return {
    needId,
    profilingKey,
    selectedOptionIds: [...selectedOptionIds].sort(),
    subContexts: [...new Set(subContexts)].sort(),
    resultFingerprint: {
      companyCount: uniqueCompanyIds.length,
      groupCount: results.length,
      topResultId: results[0]?.companies[0]?.id || null,
      groupSummaries: results.map(g => ({
        label: (g.opt.label as any)?.fi || g.opt.label as string,
        companyIds: g.companies.map(c => c.id).slice(0, 5)
      }))
    }
  };
}
'''

if 'generateSearchFingerprint' not in content:
    content = content.rstrip() + '\n' + fingerprint_code
    print('  Added generateSearchFingerprint OK')
else:
    print('  generateSearchFingerprint already exists, skipping')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("\nDone! New file length:", len(content))

# Verify
with open(path, 'r', encoding='utf-8') as f:
    verify = f.read()

checks = {
    'require_fits_for': 'require_fits_for' in verify,
    'generateSearchFingerprint': 'generateSearchFingerprint' in verify,
    'no ascii strip (a)': ".replace(/[\u00e4\u00c4" not in verify and "]/g, 'a')" not in verify,
    'version 1.1.0': 'v1.1.0' in verify,
}
for check, result in checks.items():
    print(f"  {'OK' if result else 'FAIL'}: {check}")
