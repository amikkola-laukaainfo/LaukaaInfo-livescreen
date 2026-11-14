const fs = require('fs');
const path = require('path');

function replaceInDir(dir) {
    const items = fs.readdirSync(dir);
    
    items.forEach(item => {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        // We only care about .html files in the root and dist
        if (stat.isFile() && item.endsWith('.html')) {
            try {
                let content = fs.readFileSync(fullPath, 'utf8');
                if (content.includes('Epävirallinen yhteisösovellus')) {
                    content = content.split('Epävirallinen yhteisösovellus').join('Palvelua ylläpitää Mediazoo.fi');
                    fs.writeFileSync(fullPath, content, 'utf8');
                    console.log('Updated ' + fullPath);
                }
            } catch (err) {
                console.error('Error reading ' + fullPath, err);
            }
        }
    });
}

replaceInDir('.');
replaceInDir('./dist');
