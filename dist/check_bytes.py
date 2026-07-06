with open('lievestuore.html', 'rb') as f:
    raw = f.read()
idx = raw.find(b'class="arrow">')
if idx > 0:
    print('Root Raw bytes after class="arrow">:')
    print(raw[idx+14:idx+25])
    print('Root Hex:', raw[idx+14:idx+25].hex())
else:
    print('not found')
