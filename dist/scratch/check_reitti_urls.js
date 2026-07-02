const fs = require('fs');
const content = fs.readFileSync('tarinakartta.html', 'utf8');
const idx = content.indexOf('peltoreitti');
if (idx === -1) {
    console.log('peltoreitti not found in HTML!');
} else {
    console.log('Context around peltoreitti:');
    console.log(content.substring(idx - 50, idx + 120));
}
