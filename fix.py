import re

files = ['index.html', 'koko-laukaa.html', 'laukaa.html', 'leppavesi.html', 'lievestuore.html', 'vehnia.html', 'vihtavuori.html', 'kategoria.html']

for fname in files:
    with open(fname, 'r', encoding='utf-8') as f:
        text = f.read()

    original = text
    
    # Fix sidebar star
    text = text.replace('\u008d ', '⭐ ')
    
    # Fix KARTAT & ELÄMYKSET heading
    text = re.sub(r'EL[ÄÃ][MÄÃM]YKSET\s*[\u00AD\u00AC\u00A6-\u00AF][\u0080-\u0099]', 'ELÄMYKSET ⭐', text)
    text = re.sub(r'EL\u00c4MYKSET\s*[\u00AD][\u0090]', 'ELÄMYKSET ⭐', text)
    text = re.sub(r'(KARTAT &amp; EL[^<]{0,15}?)<', lambda m: 'KARTAT &amp; ELÄMYKSET ⭐<', text)
    
    # Fix broken 4-byte emoji
    text = text.replace('\u008f\u00ad', '🏡')
    text = text.replace('\u008f', '')  
    text = text.replace('\u0090', '')  

    # Fix Android link
    text = re.sub(r'href="[^"]*"[^>]*>\s*<img src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg"', 'href="https://play.google.com/store/apps/details?id=org.example.LaukaaLive"><img src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg"', text)
    
    # Fix broken subcategory icons (if any)
    text = text.replace('\x8f\xad', '🏡')
    text = text.replace('\xad\x90', '⭐')
    text = text.replace('\x8d', '⭐')

    # Fix any Ã¤ etc
    text = text.replace('Ã¤', 'ä')
    text = text.replace('Ã„', 'Ä')
    text = text.replace('Ã¶', 'ö')
    text = text.replace('Ã–', 'Ö')
    text = text.replace('Ã¥', 'å')
    text = text.replace('Ã…', 'Å')
    text = text.replace('Ã©', 'é')
    text = text.replace('â€™', '\u2019')
    text = text.replace('â€œ', '\u201C')
    text = text.replace('â€\x9d', '\u201D')
    text = text.replace('â€"', '\u2013')
    text = text.replace('â€"', '\u2014')
    text = text.replace('Â ', '\u00A0')
    text = text.replace('Â»', '»')
    text = text.replace('Â«', '«')

    # Fix nav arrows
    text = text.replace('â¾¼', '▼')
    
    if text != original:
        with open(fname, 'w', encoding='utf-8') as f:
            f.write(text)
        print(f'Fixed {fname}')
