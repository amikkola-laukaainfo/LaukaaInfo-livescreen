const fs = require('fs');

const stylePath = 'style.css';
const feedPath = 'feed.css';

// Read style.css and take first 2151 lines (original content)
const styleRaw = fs.readFileSync(stylePath, 'utf8');
const lines = styleRaw.split('\n');
const originalStyle = lines.slice(0, 2151).join('\n');

// Read feed.css again (ensure it's clean)
let feedContent = fs.readFileSync(feedPath, 'utf8');

// Refine feed content: grid-template-columns: 1fr instead of 110px 1fr
// And add the border
feedContent = feedContent.replace('grid-template-columns: 110px 1fr;', 'grid-template-columns: 1fr; /* Pystysuuntainen */');
feedContent = feedContent.replace('border: 1.5px solid transparent;', 'border: 1px solid #e4eaf3; /* Ohut reunaviiva */');

// Add the accordion styles we want
const accordionStyles = `
/* Feed Accordion Styles */
.feed-accordion-section { max-width: 1200px; margin: 0 auto; padding: 0 1rem 2rem; }
.feed-accordion { background: #fff; border-radius: 15px; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05); overflow: hidden; border: 1px solid #eee; }
.feed-accordion-header { width: 100%; padding: 1.2rem 1.5rem; display: flex; justify-content: space-between; align-items: center; background: #fff; border: none; cursor: pointer; font-family: 'Outfit', sans-serif; font-size: 1.2rem; font-weight: 700; color: #0056b3; text-align: left; transition: background 0.2s; }
.feed-accordion-header:hover { background: #f8f9fa; }

.icon-btn {
    background: #e7f1ff;
    color: #0056b3;
    padding: 0.3rem 1rem;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 600;
    transition: all 0.2s;
    border: 1px solid #d0e1f9;
}

.feed-accordion-header:hover .icon-btn {
    background: #0056b3;
    color: #fff;
}

.feed-accordion-content { transition: max-height 0.45s ease-out, padding 0.45s; max-height: 5000px; overflow: hidden; }
.feed-accordion-content.closed { max-height: 0; }
`;

// Combine and clean any remaining null bytes
let finalContent = originalStyle.trimEnd() + '\n\n' + feedContent.trim() + '\n\n' + accordionStyles.trim() + '\n';
finalContent = finalContent.replace(/\u0000/g, ''); // Fix any UTF-16 mess

fs.writeFileSync(stylePath, finalContent, 'utf8');
console.log('Successfully refined style.css and fixed syntax errors.');
