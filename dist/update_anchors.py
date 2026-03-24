import os
import glob

# Search for all HTML files
html_files = glob.glob('*.html')

# We want to replace href="ilmoittaudu.html" with href="ilmoittaudu.html#ilm-form"
# specifically in the context of the navigation and business-nav-grid.
# However, we must EXCLUDE ilmoittaudu.html itself (where we want just "#ilm-form").

old_href = 'href="ilmoittaudu.html"'
new_href = 'href="ilmoittaudu.html#ilm-form"'

modified_count = 0

for filepath in html_files:
    if filepath == 'ilmoittaudu.html': continue # Already handled separately
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if old_href in content:
        new_content = content.replace(old_href, new_href)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        modified_count += 1
        print(f"Updated links in {filepath}")

print(f"Total files updated: {modified_count}")
