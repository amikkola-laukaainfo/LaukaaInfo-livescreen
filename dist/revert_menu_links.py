import os
import glob

# Search for all HTML files
html_files = glob.glob('*.html')

# We want to change href="ilmoittaudu.html#ilm-form" back to href="ilmoittaudu.html"
# ONLY in the dropdown menus.
# Dropdown menu items look like: <li><a href="ilmoittaudu.html#ilm-form">Ilmoittaudu julkaisijaksi</a></li>

old_menu_link = '>Ilmoittaudu julkaisijaksi</a>'
# We'll use a regex or string replacement that targets the href specifically in the menu structure

modified_count = 0

for filepath in html_files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    
    # 1. Update the top navigation dropdown (nav-item)
    # Target: <li><a href="ilmoittaudu.html#ilm-form">Ilmoittaudu julkaisijaksi</a></li>
    content = content.replace('<li><a href="ilmoittaudu.html#ilm-form">Ilmoittaudu julkaisijaksi</a></li>', 
                              '<li><a href="ilmoittaudu.html">Ilmoittaudu julkaisijaksi</a></li>')
    
    # 2. Update the sidebar menu
    # Target: <li class="menu-item"><a href="ilmoittaudu.html#ilm-form" class="sidebar-link">Ilmoittaudu julkaisijaksi</a></li>
    content = content.replace('<li class="menu-item"><a href="ilmoittaudu.html#ilm-form" class="sidebar-link">Ilmoittaudu julkaisijaksi</a></li>',
                              '<li class="menu-item"><a href="ilmoittaudu.html" class="sidebar-link">Ilmoittaudu julkaisijaksi</a></li>')

    # Special case for ilmoittaudu.html itself where the link was just href="#ilm-form"
    if filepath == 'ilmoittaudu.html':
        content = content.replace('<li><a href="#ilm-form">Ilmoittaudu julkaisijaksi</a></li>',
                                  '<li><a href="ilmoittaudu.html">Ilmoittaudu julkaisijaksi</a></li>')
        content = content.replace('<li class="menu-item"><a href="#ilm-form" class="sidebar-link">Ilmoittaudu julkaisijaksi</a></li>',
                                  '<li class="menu-item"><a href="ilmoittaudu.html" class="sidebar-link">Ilmoittaudu julkaisijaksi</a></li>')
        
        # Remove the nav-cta-btn if it exists
        content = content.replace('<li class="nav-item">\n                        <a href="#ilm-form" class="nav-cta-btn">✍️ Ilmoittaudu</a>\n                    </li>', '')
        
        # Remove Header CTA Styles (very simplified)
        import re
        content = re.sub(r'/\* HEADER CTA \*/.*?\@media \(max-width: 768px\) \{.*?\}', '', content, flags=re.DOTALL)

    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        modified_count += 1
        print(f"Reverted menu links in {filepath}")

print(f"Total files updated: {modified_count}")
