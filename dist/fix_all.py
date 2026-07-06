import os
import glob

# Mappings of hex string (double-encoded cp1252) to correct hex string (utf-8)
replacements = {
    b'\xc3\xa2\xe2\x80\x93\xc2\xbc': b'\xe2\x96\xbc', # ▼
    b'\xc3\xb0\xc5\xb8\xc5\xa1\xe2\x84\xa2': b'\xf0\x9f\x9a\x99', # 🚙
    b'\xc3\xa2\xcb\x9c\xe2\x80\xa2': b'\xe2\x98\x95', # ☕
    b'\xc3\xb0\xc5\xb8\xc5\x92\xc2\xb2': b'\xf0\x9f\x8c\xb2', # 🌲
    b'\xc3\xb0\xc5\xb8\xf0\x9f\x8f\xa1': b'\xf0\x9f\x8f\xad', # 🏭 (I corrupted this earlier by replacing 8fad with house, so it became c3b0c5b8 + f09f8fa1)
    b'\xc3\xa2\xe2\x80\xba\xc2\xb5': b'\xe2\x9b\xb5', # ⛵
    b'\xc3\xb0\xc5\xb8\xc5\xbd\xc2\xa1': b'\xf0\x9f\x8e\xa1', # 🎡
    b'\xc3\xb0\xc5\xb8\xc5\x92\xe2\x80\xb0': b'\xf0\x9f\x8c\x89', # 🌉 (Night with Stars) - wait, let me just add it if it exists
}

# Add standard double-encoded text chars just in case any were missed
# e.g. Ã¤ -> ä
text_replacements = {
    b'\xc3\x83\xc2\xa4': b'\xc3\xa4', # Ã¤ -> ä
    b'\xc3\x83\xe2\x80\x9e': b'\xc3\x84', # Ã„ -> Ä
    b'\xc3\x83\xc2\xb6': b'\xc3\xb6', # Ã¶ -> ö
    b'\xc3\x83\xe2\x80\x93': b'\xc3\x96', # Ã– -> Ö
}
replacements.update(text_replacements)

# Files in root
html_files = glob.glob('*.html') + glob.glob('dist/*.html')

count_total = 0
for fname in html_files:
    with open(fname, 'rb') as f:
        raw = f.read()
    
    orig = raw
    
    for bad, good in replacements.items():
        if bad in raw:
            count = raw.count(bad)
            count_total += count
            raw = raw.replace(bad, good)
            print(f'Fixed {count} occurrences of {bad.hex()} in {fname}')
    
    # Also search for any remaining class="icon"> with double-encoded emoji
    idx = raw.find(b'class="icon">')
    while idx > 0:
        icon_bytes = raw[idx+13:idx+25]
        if b'</' in icon_bytes:
            icon_bytes = icon_bytes[:icon_bytes.find(b'</')]
        if len(icon_bytes) > 4 and icon_bytes not in replacements.values():
            print(f'Warning: unhandled suspicious icon bytes in {fname}: {icon_bytes.hex()}')
        idx = raw.find(b'class="icon">', idx+1)
            
    if raw != orig:
        with open(fname, 'wb') as f:
            f.write(raw)

if count_total > 0:
    print(f'Done! Fixed {count_total} total instances.')
else:
    print('No broken bytes found.')
