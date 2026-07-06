import os
import re

files = ['koko-laukaa.html', 'kategoria.html', 'laukaa.html', 'leppavesi.html', 'lievestuore.html', 'vehnia.html', 'vihtavuori.html']

for f in files:
    if not os.path.exists(f):
        continue
    with open(f, 'rb') as fh:
        raw = fh.read()
    # Find invalid UTF-8 sequences - try to decode and pinpoint
    pos = 0
    errors = []
    while pos < len(raw):
        b = raw[pos]
        if b < 0x80:
            pos += 1  # ASCII - OK
        elif b < 0xC0:
            # This is a continuation byte out of sequence - error!
            errors.append((pos, raw[max(0,pos-20):pos+20]))
            pos += 1
        elif b < 0xE0:
            # 2-byte sequence
            if pos+1 < len(raw) and (raw[pos+1] & 0xC0) == 0x80:
                pos += 2
            else:
                errors.append((pos, raw[max(0,pos-20):pos+20]))
                pos += 1
        elif b < 0xF0:
            # 3-byte sequence
            if pos+2 < len(raw) and (raw[pos+1] & 0xC0) == 0x80 and (raw[pos+2] & 0xC0) == 0x80:
                pos += 3
            else:
                errors.append((pos, raw[max(0,pos-20):pos+20]))
                pos += 1
        else:
            errors.append((pos, raw[max(0,pos-20):pos+20]))
            pos += 1

    if errors:
        print(f'\n{f}: {len(errors)} encoding errors found!')
        for err_pos, ctx in errors[:5]:
            print(f'  at byte {err_pos}: {ctx}')
    else:
        print(f'{f}: OK (valid UTF-8)')
