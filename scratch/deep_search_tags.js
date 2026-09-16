const fs = require('fs');
const path = require('path');

function searchInFiles(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(f => {
        const full = path.join(dir, f);
        const stat = fs.statSync(full);
        if (stat.isDirectory() && f !== 'node_modules' && f !== '.git' && f !== 'dist') {
            searchInFiles(full);
        } else if (f.endsWith('.js') || f.endsWith('.json') || f.endsWith('.html')) {
            try {
                const text = fs.readFileSync(full, 'utf8');
                const lines = text.split('\n');
                lines.forEach((line, idx) => {
                    if (/biz_catering|intent-BIZ|OPT_BIZ|catering/i.test(line)) {
                        console.log(`${full}:${idx + 1}: ${line.trim()}`);
                    }
                });
            } catch(e) {}
        }
    });
}

searchInFiles('.');
