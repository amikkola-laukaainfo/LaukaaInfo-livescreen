import re, glob

# Fix \u001f in all HTML arrow spans - with encoding fallback
html_files = glob.glob('*.html')
for fname in html_files:
    try:
        with open(fname, 'r', encoding='utf-8') as f:
            html = f.read()
    except UnicodeDecodeError:
        # Skip non-utf8 files
        continue
    
    original = html
    html = html.replace('class="arrow">\x1f</span>', 'class="arrow">▼</span>')
    html = html.replace('\x1f', '▼')
    
    if html != original:
        with open(fname, 'w', encoding='utf-8') as f:
            f.write(html)
        print(f'Fixed \\u001f arrows in {fname}')
