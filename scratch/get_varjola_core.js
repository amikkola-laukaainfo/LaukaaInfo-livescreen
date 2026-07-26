const fs = require('fs');
let content = fs.readFileSync('company_profiling_data.json', 'utf8');
if (content.charCodeAt(0) === 0xFEFF) {
  content = content.slice(1);
}
const data = JSON.parse(content);
console.log(JSON.stringify(data.profiles['company-263'].core, null, 2));
