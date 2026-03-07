import os
import glob

# Etsitään kaikki HTML-tiedostot
html_files = glob.glob('*.html') + glob.glob('dist/*.html')

new_desktop_kauppa = """<li class="nav-item">
                        <a href="index.html" class="nav-link">Kauppa <span class="arrow">▼</span></a>
                        <ul class="dropdown-menu">
                            <li><a href="lisaa-yritys.html">Lisää yritys</a></li>
                            <li class="has-arrow">
                                <a href="#">Kategoriat</a>
                                <ul class="nested-menu" id="nav-categories">
                                </ul>
                            </li>
                            <li class="has-arrow">
                                <a href="#">Taajamat</a>
                                <ul class="nested-menu">
                                    <li><a href="laukaa.html">Laukaa kk</a></li>
                                    <li><a href="leppavesi.html">Leppävesi</a></li>
                                    <li><a href="lievestuore.html">Lievestuore</a></li>
                                    <li><a href="vehnia.html">Vehniä</a></li>
                                    <li><a href="vihtavuori.html">Vihtavuori</a></li>
                                </ul>
                            </li>
                        </ul>
                    </li>"""

new_desktop_ajankohtaista = """<li class="nav-item">
                        <a href="ajankohtaista.html" class="nav-link">Ajankohtaista <span class="arrow">▼</span></a>
                        <ul class="dropdown-menu">
                            <li><a href="ajankohtaista.html#events-card">Tapahtumat</a></li>
                            <li><a href="ajankohtaista.html#news-card">Tiedotteet</a></li>
                            <li><a href="ajankohtaista.html#decisions-card">Päätöksenteko</a></li>
                            <li><a href="ajankohtaista.html#feedback-card">Palautteet</a></li>
                        </ul>
                    </li>"""


new_mobile_kauppa = """<div class="menu-section">
                <h3 class="section-title">KAUPPA</h3>
                <ul class="menu-list">
                    <li class="menu-item"><a href="lisaa-yritys.html" class="sidebar-link">Lisää yritys</a></li>
                    <li class="menu-item has-submenu">
                        <a href="#" class="submenu-toggle">Kategoriat <span class="arrow">▼</span></a>
                        <ul class="submenu" id="sidebar-categories">
                        </ul>
                    </li>
                    <li class="menu-item has-submenu">
                        <a href="#" class="submenu-toggle">Taajamat <span class="arrow">▼</span></a>
                        <ul class="submenu">
                            <li><a href="laukaa.html" class="sidebar-link">Laukaa kk</a></li>
                            <li><a href="leppavesi.html" class="sidebar-link">Leppävesi</a></li>
                            <li><a href="lievestuore.html" class="sidebar-link">Lievestuore</a></li>
                            <li><a href="vehnia.html" class="sidebar-link">Vehniä</a></li>
                            <li><a href="vihtavuori.html" class="sidebar-link">Vihtavuori</a></li>
                        </ul>
                    </li>
                </ul>
            </div>"""

new_mobile_ajankohtaista = """<div class="menu-section">
                <h3 class="section-title">AJANKOHTAISTA</h3>
                <ul class="menu-list">
                    <li class="menu-item"><a href="ajankohtaista.html#events-card" class="sidebar-link">Tapahtumat</a>
                    </li>
                    <li class="menu-item"><a href="ajankohtaista.html#news-card" class="sidebar-link">Tiedotteet</a>
                    </li>
                    <li class="menu-item"><a href="ajankohtaista.html#decisions-card"
                            class="sidebar-link">Päätöksenteko</a></li>
                    <li class="menu-item"><a href="ajankohtaista.html#feedback-card" class="sidebar-link">Palautteet</a>
                    </li>
                </ul>
            </div>"""

import re

def replace_between(content, start_marker, end_marker, replacement):
    pattern = re.compile(re.escape(start_marker) + r'.*?' + re.escape(end_marker), re.DOTALL | re.IGNORECASE)
    if pattern.search(content):
        return pattern.sub(replacement, content)
    return content

files_modified = []

for filepath in html_files:
    if not os.path.isfile(filepath): continue
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content
    
    # Keksitään selkeät boundary-merkit:
    
    # 1. Desktop Kauppa
    k_start = '<li class="nav-item">\n                        <a href="index.html" class="nav-link">Kauppa'
    if k_start not in content:
        k_start = '<li class="nav-item"><a href="index.html" class="nav-link">Kauppa'
        
    k_end = '<!-- Kategoriat ladataan dynaamisesti JS:llä -->\n                        </ul>\n                    </li>'
    if k_end not in content:
        # Ehkäpä kategoria HTML kommentti puuttuu
        content = replace_between(content, '<li class="nav-item">\n                        <a href="index.html" class="nav-link">Kauppa', '</ul>\n                    </li>', new_desktop_kauppa)
    else:
        content = replace_between(content, k_start, k_end, new_desktop_kauppa)

    # 2. Desktop Ajankohtaista
    a_start = '<li class="nav-item">\n                        <a href="ajankohtaista.html" class="nav-link">Ajankohtaista'
    content = replace_between(content, a_start, '</ul>\n                            </li>\n                        </ul>\n                    </li>', new_desktop_ajankohtaista)
    # yritä uudelleen jos epäonnistuu
    if a_start in content and len(replace_between(content, a_start, '</ul>\n                            </li>\n                        </ul>\n                    </li>', new_desktop_ajankohtaista)) == len(content):
        # Vaihtoehtoinen end marker
        alt_pattern = re.compile(r'(<li class="nav-item">\s*<a href="ajankohtaista\.html" class="nav-link">Ajankohtaista.*?</ul>\s*</li>\s*</ul>\s*</li>)', re.DOTALL | re.IGNORECASE)
        content = alt_pattern.sub(new_desktop_ajankohtaista, content)


    # 3. Mobile Kauppa
    m_k_start = '<div class="menu-section">\n                <h3 class="section-title">KAUPPA</h3>'
    if m_k_start not in content:
        m_k_start = '<div class="menu-section"><h3 class="section-title">KAUPPA</h3>'
        
    m_k_end = '</ul>\n            </div>'
    
    # Helpommin, etsi <h3 class="section-title">KAUPPA</h3> .... </div> (ensimmäinen sulkeva div)
    pattern_mobile_k = re.compile(r'<div class="menu-section">\s*<h3 class="section-title">KAUPPA</h3>\s*<ul class="menu-list">.*?</ul>\s*</div>', re.DOTALL | re.IGNORECASE)
    content = pattern_mobile_k.sub(new_mobile_kauppa, content)
    
    # 4. Mobile Ajankohtaista
    pattern_mobile_a = re.compile(r'<div class="menu-section">\s*<h3 class="section-title">AJANKOHTAISTA</h3>\s*<ul class="menu-list">.*?</ul>\s*</div>', re.DOTALL | re.IGNORECASE)
    content = pattern_mobile_a.sub(new_mobile_ajankohtaista, content)

    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        files_modified.append(filepath)

print(f"Päivitettiin valikot {len(files_modified)} tiedostoon.")
