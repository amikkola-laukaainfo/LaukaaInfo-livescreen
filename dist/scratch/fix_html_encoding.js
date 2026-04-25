const fs = require('fs');
const path = require('path');

const rootDir = "d:/Projekteja/MUUTprojektit/LaukaaInfo-livescreen/LaukaaInfo-livescreen";
const files = fs.readdirSync(rootDir).filter(f => f.endsWith('.html') || f.endsWith('.php') || f.endsWith('.js'));

files.forEach(file => {
    const fullPath = path.join(rootDir, file);
    if (!fs.statSync(fullPath).isFile()) return;
    const buf = fs.readFileSync(fullPath);
    const utf8Str = buf.toString('utf8');
    
    if (utf8Str.includes('\uFFFD')) { 
        console.log(`Fixing ${file} (contains replacement character)`);
        const latinStr = buf.toString('latin1');
        fs.writeFileSync(fullPath, latinStr, 'utf8');
    } else if (utf8Str.includes('Ã¤') || utf8Str.includes('Ã¶')) {
        console.log(`Fixing double UTF8 in ${file}`);
        // this happens when a UTF-8 file is read as ANSI and saved as UTF-8
        const latinStr = buf.toString('latin1'); 
        fs.writeFileSync(fullPath, latinStr, 'utf8');
    }
});
console.log("Done checking files.");
