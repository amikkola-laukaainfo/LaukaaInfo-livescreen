const fs = require('fs');
const path = require('path');

const nc = fs.readFileSync(path.join(__dirname, '..', 'needs_config.js'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'company_profiling_data.json'), 'utf8'));
const profiles = data.profiles;

// Extract all profilointi_filter blocks
const matches = [...nc.matchAll(/"profilointi_filter":\s*\{[^}]+\}/g)];
const seen = new Set();

function checkFilter(section, field, value) {
  if (value === true || value === false) {
    return Object.values(profiles).filter(p => p[section] && p[section][field] === value).length;
  }
  return Object.values(profiles).filter(p => {
    const sec = p[section];
    if (!sec) return false;
    const fval = sec[field];
    if (Array.isArray(fval)) return fval.includes(value);
    return fval === value;
  }).length;
}

const results = [];
matches.forEach(m => {
  const s = m[0];
  const section = (s.match(/"section":\s*"([^"]+)"/) || ['',''])[1];
  const field = (s.match(/"field":\s*"([^"]+)"/) || ['',''])[1];
  const valueMatch = s.match(/"value":\s*("([^"]+)"|true|false)/);
  let value = '';
  if (valueMatch) {
    if (valueMatch[2]) value = valueMatch[2];
    else value = valueMatch[1] === 'true' ? true : false;
  }
  const key = section + '.' + field + ':' + value;
  if (seen.has(key)) return;
  seen.add(key);
  const count = checkFilter(section, field, value);
  results.push({ section, field, value, count });
});

results.sort((a, b) => a.count - b.count);

console.log('All profilointi_filter values vs actual data:\n');
results.forEach(r => {
  const flag = r.count === 0 ? 'MISS' : r.count < 3 ? 'FEW ' + r.count : 'OK  ' + r.count;
  console.log(`[${flag}]  ${r.section}.${r.field} = "${r.value}"`);
});
