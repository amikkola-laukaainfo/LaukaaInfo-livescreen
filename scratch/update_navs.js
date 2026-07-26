const fs = require('fs');

const indexHtml = fs.readFileSync('index.html', 'utf8');

// Extract the 3 blocks from index.html
const navMatch = indexHtml.match(/(<nav class="top-nav">[\s\S]*?<\/nav>)/);
const navStr = navMatch ? navMatch[1] : '';

const overlayMatch = indexHtml.match(/(<div class="sidebar-overlay"[^>]*><\/div>)/);
const overlayStr = overlayMatch ? overlayMatch[1] : '';

const asideMatch = indexHtml.match(/(<aside class="sidebar-menu" id="sidebar-menu">[\s\S]*?<\/aside>)/);
const asideStr = asideMatch ? asideMatch[1] : '';

if (!navStr || !overlayStr || !asideStr) {
    console.error('Could not extract blocks from index.html');
    process.exit(1);
}

const injection = `\n    ${navStr}\n\n    <!-- Sidebar Overlay -->\n    ${overlayStr}\n\n    <!-- Sidebar Menu -->\n    ${asideStr}\n`;

const filesToUpdate = [
    'galleria.html',
    'palvelu.html',
    'palvelun-esittely.html',
    'pikahaku.html',
    'verkostokartta.html',
    'ajankohtaista.html'
];

filesToUpdate.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let originalContent = content;

    // Remove existing top-nav
    content = content.replace(/<nav class="top-nav">[\s\S]*?<\/nav>\n*/, '');
    
    // Remove existing sidebar-overlay
    content = content.replace(/<!-- Sidebar Overlay -->\n*\s*<div class="sidebar-overlay"[^>]*><\/div>\n*/, '');
    content = content.replace(/<div class="sidebar-overlay"[^>]*><\/div>\n*/, '');
    
    // Remove existing sidebar-menu
    content = content.replace(/<!-- Sidebar Menu -->\n*\s*<aside class="sidebar-menu"[^>]*>[\s\S]*?<\/aside>\n*/, '');
    content = content.replace(/<aside class="sidebar-menu"[^>]*>[\s\S]*?<\/aside>\n*/, '');

    // Inject right after <body ...>
    content = content.replace(/(<body[^>]*>)/, `$1${injection}`);

    if (content !== originalContent) {
        fs.writeFileSync(file, content, 'utf8');
        console.log(`Updated ${file}`);
    } else {
        console.log(`No changes made to ${file}`);
    }
});
