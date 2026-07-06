with open('kategoria.html', 'r', encoding='utf-8') as f:
    content = f.read()

tender_block = '''
    <div style="max-width: 900px; margin: 2rem auto; padding: 0 1.5rem; text-align: center;">
        <div style="background: #eef2ff; border: 2px solid #c7d2fe; border-radius: 12px; padding: 1.5rem; display: inline-block; width: 100%; box-sizing: border-box;">
            <h3 style="color: #4338ca; font-size: 1.3rem; margin-top: 0; margin-bottom: 0.5rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                <span class="iconify" data-icon="material-symbols-light:mail-outline" style="font-size: 1.5em;"></span> Tarjouspyyntö alueen yrityksille
            </h3>
            <p style="color: #4f46e5; font-size: 1.05rem; margin-bottom: 1rem; font-weight: 500;">
                Tavoita yhdellä viestillä palveluun sähköpostinsa lisänneet yritykset.
            </p>
            <a href="https://mediazoo.fi/laukaainfo-web/tarjouspyynto/ohjeet.html" target="_blank" style="display: inline-flex; align-items: center; gap: 0.5rem; background: #4f46e5; color: white; padding: 0.6rem 1.5rem; border-radius: 8px; text-decoration: none; font-weight: 600; transition: background 0.2s;">
                Aloita tarjouspyyntö &raquo;
            </a>
        </div>
    </div>
'''

# Insert before </main>
if '</main>' in content:
    content = content.replace('</main>', tender_block + '</main>', 1)
    print('Inserted before </main>')
else:
    # Insert before footer
    idx = content.find('<footer')
    if idx > 0:
        content = content[:idx] + tender_block + content[idx:]
        print('Inserted before <footer>')
    else:
        print('No suitable location found!')

with open('kategoria.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')
