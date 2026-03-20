const fs = require('fs');
const path = require('path');

const stylePath = 'style.css';
const feedPath = 'feed.css';

// Read style.css and take first 2152 lines (original content)
const styleLines = fs.readFileSync(stylePath, 'utf8').split('\n').slice(0, 2152).join('\n');

// Read feed.css
const feedContent = fs.readFileSync(feedPath, 'utf8');

// Accordion styles
const accordionStyles = `
/* Feed Accordion Styles */
.feed-accordion-section { max-width: 1200px; margin: 0 auto; padding: 0 1rem 2rem; }
.feed-accordion { background: #fff; border-radius: 15px; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05); overflow: hidden; border: 1px solid #eee; }
.feed-accordion-header { width: 100%; padding: 1.2rem 1.5rem; display: flex; justify-content: space-between; align-items: center; background: #fff; border: none; cursor: pointer; font-family: 'Outfit', sans-serif; font-size: 1.2rem; font-weight: 700; color: #0056b3; text-align: left; transition: background 0.2s; }
.feed-accordion-header:hover { background: #f8f9fa; }
.feed-accordion-header .icon { font-size: 0.8rem; transition: transform 0.33s ease; }
.feed-accordion-header.closed .icon { transform: rotate(180deg); }
.feed-accordion-content { transition: max-height 0.45s ease-out, padding 0.45s; max-height: 5000px; overflow: hidden; }
.feed-accordion-content.closed { max-height: 0; }
`;

// Combine all (ensuring double newline between sections)
const finalContent = styleLines.trimEnd() + '\n\n' + feedContent.trim() + '\n\n' + accordionStyles.trim() + '\n';

// Write back with UTF8
fs.writeFileSync(stylePath, finalContent, 'utf8');
console.log('Successfully fixed style.css with UTF-8 encoding.');
