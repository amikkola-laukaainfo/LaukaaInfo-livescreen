const { execSync } = require('child_process');
const t = execSync('git show 099d9bb:index.html').toString('utf8');
const m = [...t.matchAll(/class="need-icon">([^<]+)</g)];
m.forEach(x => console.log(JSON.stringify(x[1])));
