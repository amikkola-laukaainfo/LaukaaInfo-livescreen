import os

files = ['index.html', 'koko-laukaa.html', 'laukaa.html', 'leppavesi.html', 'lievestuore.html', 'vehnia.html', 'vihtavuori.html', 'kategoria.html']

for fname in files:
    with open(fname, 'rb') as f:
        raw = f.read()

    original = raw
    
    # \xc3\xa2\xe2\x80\x93\xc2\xbc is the broken "▼"
    raw = raw.replace(b'\xc3\xa2\xe2\x80\x93\xc2\xbc', b'\xe2\x96\xbc')
    
    # Replace the broken äŸŠ° icon
    # the user said äŸŠ⁰ in the map. Let's find it.
    # What are the bytes for äŸŠ° ?
    # ä = \xc3\xa4
    # Ÿ = \xc5\xb8
    # Š = \xc5\xa0
    # ° = \xc2\xb0
    
    # Actually, the user screenshot showed 🚙 as broken: äŸš™ or similar?
    # Let's replace any double encoded emoji!
    # But wait, earlier I replaced \x8f\xad with 🏡 which worked for some.
    
    if raw != original:
        with open(fname, 'wb') as f:
            f.write(raw)
        print(f'Fixed arrow in {fname}')
        
    # Let's also print out any suspicious bytes near class="icon">
    idx = raw.find(b'class="icon">')
    while idx > 0:
        icon_bytes = raw[idx+13:idx+25]
        if b'</' in icon_bytes:
            icon_bytes = icon_bytes[:icon_bytes.find(b'</')]
        
        # If it's more than 4 bytes, it might be double encoded
        if len(icon_bytes) > 4:
            print(f'{fname} suspicious icon bytes: {icon_bytes} (hex: {icon_bytes.hex()})')
            
        idx = raw.find(b'class="icon">', idx+1)
