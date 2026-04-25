const fs = require('fs');
const path = require('path');

const rootDir = "d:/Projekteja/MUUTprojektit/LaukaaInfo-livescreen/LaukaaInfo-livescreen";
const targetFiles = [
    'koko-laukaa.html', 'laukaa.html', 'leppavesi.html', 
    'lievestuore.html', 'vehnia.html', 'vihtavuori.html'
];

targetFiles.forEach(file => {
    const fullPath = path.join(rootDir, file);
    if (!fs.existsSync(fullPath)) return;
    
    let content = fs.readFileSync(fullPath, 'utf8');
    
    // Replace arrow ? with ▼
    content = content.replace(/<span class="arrow">\?<\/span>/g, '<span class="arrow">▼</span>');
    
    // Replace KARTAT & ELÄMYKSET ? with ⭐
    content = content.replace(/KARTAT &amp; ELÄMYKSET \?/g, 'KARTAT &amp; ELÄMYKSET ⭐');
    
    // Replace ?? Palvelee alueella -> 🚙 Palvelee alueella
    content = content.replace(/<span class="icon">\?\?<\/span> Palvelee alueella/g, '<span class="icon">🚙</span> Palvelee alueella');
    
    // Replace ? Näkyy kartalla -> 📍 Näkyy kartalla
    content = content.replace(/div class="sidebar-sub-label">\? Näkyy kartalla/g, 'div class="sidebar-sub-label">📍 Näkyy kartalla');
    
    // Replace ?? Ei näy kartalla -> 🌐 Ei näy kartalla
    content = content.replace(/div class="sidebar-sub-label">\?\? Ei näy kartalla/g, 'div class="sidebar-sub-label">🌐 Ei näy kartalla');
    
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`Fixed emojis in ${file}`);
});
