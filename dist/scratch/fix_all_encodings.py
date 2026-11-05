import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

root_dir = r"e:\matkalla\Projekteja\MUUTprojektit\LaukaaInfo-livescreen\LaukaaInfo-livescreen"

# Specific file title updates for region pages
title_fixes = {
    "koko-laukaa.html": '<title id="page-title">Koko Laukaa – LaukaaInfo: Laukaa taskussasi – tiedä, löydä ja osallistu.</title>',
    "laukaa.html": '<title id="page-title">Laukaa kk – LaukaaInfo: Laukaa taskussasi – tiedä, löydä ja osallistu.</title>',
    "leppavesi.html": '<title id="page-title">Leppävesi – LaukaaInfo: Laukaa taskussasi – tiedä, löydä ja osallistu.</title>',
    "lievestuore.html": '<title id="page-title">Lievestuore – LaukaaInfo: Laukaa taskussasi – tiedä, löydä ja osallistu.</title>',
    "vehnia.html": '<title id="page-title">Vehniä – LaukaaInfo: Laukaa taskussasi – tiedä, löydä ja osallistu.</title>',
    "vihtavuori.html": '<title id="page-title">Vihtavuori – LaukaaInfo: Laukaa taskussasi – tiedä, löydä ja osallistu.</title>',
    "index.html": '<title>Laukaan palvelut ja yritykset – Kaikki paikalliset kootusti | LaukaaInfo</title>',
}

replacements = [
    ("L&auml;hellÃ¤ tÃ¤tÃ¤ aluetta â€“ myÃ¶s nÃ¤mÃ¤ toimijat palvelevat sinua", "Lähellä tätä aluetta – myös nämä toimijat palvelevat sinua"),
    ("L&auml;hellÃ¤ tÃ¤tÃ¤ aluetta", "Lähellä tätä aluetta"),
    ("myÃ¶s nÃ¤mÃ¤ toimijat palvelevat sinua", "myös nämä toimijat palvelevat sinua"),
    ("KARTAT &amp; ELÄMYKSET â­", "KARTAT &amp; ELÄMYKSET ⭐"),
    ("KARTAT &amp; ELÄMYKSET â­ ", "KARTAT &amp; ELÄMYKSET ⭐"),
    ("KARTAT &amp; ELï¿½ MYKSET Ã¢Â­Â ", "KARTAT &amp; ELÄMYKSET ⭐"),
    ("KARTAT &amp; ELÄMYKSET â\xad", "KARTAT &amp; ELÄMYKSET ⭐"),
    ("© 2026 LaukaaInfo â€“ Palvelua ylläpitää Mediazoo.fi", "© 2026 LaukaaInfo – Palvelua ylläpitää Mediazoo.fi"),
    ("Alk. 15 â‚¬/kk.", "Alk. 15 €/kk."),
    ("yrityksille â€” kaikki taskussasi.", "yrityksille — kaikki taskussasi."),
    ("Suunnittele häät Â»", "Suunnittele häät »"),
    ("content: 'âœ“';", "content: '✓';"),
    ("Alue Â– LaukaaInfo: Laukaa taskussasi Â– tiedä, löydä ja osallistu.", "LaukaaInfo: Laukaa taskussasi – tiedä, löydä ja osallistu."),
    ("Alue â€“ LaukaaInfo", "LaukaaInfo"),
]

fixed_count = 0

for dirpath, dirnames, filenames in os.walk(root_dir):
    if 'node_modules' in dirpath or '.git' in dirpath or 'scratch' in dirpath:
        continue
    for f in filenames:
        if f.endswith(('.html', '.js', '.json', '.css')):
            filepath = os.path.join(dirpath, f)
            try:
                with open(filepath, 'r', encoding='utf-8') as file:
                    content = file.read()

                new_content = content
                
                # Check for file-specific title fixes
                filename_only = os.path.basename(f)
                if filename_only in title_fixes:
                    # Replace existing <title...></title>
                    import re
                    new_content = re.sub(r'<title[^>]*>.*?</title>', title_fixes[filename_only], new_content, flags=re.DOTALL | re.IGNORECASE)

                for old_str, new_str in replacements:
                    if old_str in new_content:
                        new_content = new_content.replace(old_str, new_str)

                if new_content != content:
                    with open(filepath, 'w', encoding='utf-8') as file:
                        file.write(new_content)
                    fixed_count += 1
                    rel_path = os.path.relpath(filepath, root_dir)
                    print(f"Fixed encoding in: {rel_path}")
            except Exception as e:
                print(f"Error processing {filepath}: {e}")

print(f"Completed! Total files updated: {fixed_count}")
