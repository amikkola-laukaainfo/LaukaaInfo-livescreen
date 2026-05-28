const fs = require('fs');

const indexHtml = fs.readFileSync('index.html', 'utf8');

const navMatch = indexHtml.match(/(<nav class="top-nav">[\s\S]*?<\/nav>)/);
const overlayMatch = indexHtml.match(/(<div class="sidebar-overlay"[^>]*><\/div>)/);
const asideMatch = indexHtml.match(/(<aside class="sidebar-menu" id="sidebar-menu">[\s\S]*?<\/aside>)/);

const navStr = navMatch ? navMatch[1] : '';
const overlayStr = overlayMatch ? overlayMatch[1] : '';
const asideStr = asideMatch ? asideMatch[1] : '';
const injection = `\n    ${navStr}\n\n    <!-- Sidebar Overlay -->\n    ${overlayStr}\n\n    <!-- Sidebar Menu -->\n    ${asideStr}\n`;

const skipFiles = ['index.html', 'feed-demo.html', 'latauslinkki-tyokalu.html', 'og-viikkonostot-template.html', 'upload.html', 'pikkuilmot.html'];

const files = fs.readdirSync('.').filter(f => f.endsWith('.html') && !skipFiles.includes(f));

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let originalContent = content;

    content = content.replace(/<nav class="top-nav">[\s\S]*?<\/nav>\n*/, '');
    content = content.replace(/<!-- Sidebar Overlay -->\n*\s*<div class="sidebar-overlay"[^>]*><\/div>\n*/, '');
    content = content.replace(/<div class="sidebar-overlay"[^>]*><\/div>\n*/, '');
    content = content.replace(/<!-- Sidebar Menu -->\n*\s*<aside class="sidebar-menu"[^>]*>[\s\S]*?<\/aside>\n*/, '');
    content = content.replace(/<aside class="sidebar-menu"[^>]*>[\s\S]*?<\/aside>\n*/, '');

    content = content.replace(/(<body[^>]*>)/, `$1${injection}`);

    if (content !== originalContent) {
        fs.writeFileSync(file, content, 'utf8');
        console.log('Updated ' + file);
    }
});
