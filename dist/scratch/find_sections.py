"""
Järjestelee index.html-lohkot halutussa järjestyksessä.

Lohkojen alku- ja loppurivit (0-indeksoidut):
  A = search-section     (riville 488..554)   → tarkempi haku
  B = ticker-section     (riville 278..438)   → swiper-mainos
  C = community-section  (riville 440..487)   → osallistu ja pysy ajan tasalla
  D = palveluverkosto    (riville 555..580)   → löydä ihmisiä
  E = need-based-section (riville 581..806)   → palveluverkoston suositukset
  F = feed-section       (riville 809..836)   → syöte
  G = share-generator    (riville 839..894)   → poistetaan / pidetään
  H = gate-section       (riville 896..924)   → kauppa-mainokset

Haluttu järjestys: [before_sections] + A + B + D+E + C + F + H + [after_main]
"""
with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')
total = len(lines)
print(f"Total lines: {total}")

# Etsi lohkojen alku- ja loppurivit (0-indeksoidut)
def find_section(start_pattern, end_pattern, start_from=0):
    start = None
    for i in range(start_from, len(lines)):
        if start is None and start_pattern in lines[i]:
            start = i
        elif start is not None and end_pattern in lines[i]:
            return start, i
    return None, None

# Etsitään lohkot
# Hero päättyy ennen swiperia
# Swiper alkaa: ticker-section
swiper_start, swiper_end = find_section('ticker-section', '</section>', 0)
print(f"Swiper: {swiper_start}-{swiper_end}")

# community-section
comm_start, comm_end = find_section('community-section bg-full-white', '</section>', swiper_end)
print(f"Community: {comm_start}-{comm_end}")

# search-section
search_start, search_end = find_section('id="search-section"', '</section>', comm_end)
print(f"Search: {search_start}-{search_end}")

# palveluverkosto-section
palv_start, palv_end = find_section('id="palveluverkosto-section"', '</section>', search_end)
print(f"Palveluverkosto: {palv_start}-{palv_end}")

# need-based-section
need_start, need_end = find_section('need-based-section bg-full-white', '<!-- End section-container -->', palv_end)
# need-section ends with the next </section> after "End section-container"
for i in range(need_start, len(lines)):
    if '</section>' in lines[i] and i > need_end:
        need_end = i
        break
print(f"Need-based: {need_start}-{need_end}")

# feed-section  
feed_start, feed_end = find_section('id="feed-section"', '</section>', need_end)
print(f"Feed: {feed_start}-{feed_end}")

# share-generator-section
share_start, share_end = find_section('share-generator-section', '</section>', feed_end)
print(f"Share: {share_start}-{share_end}")

# gate-section
gate_start, gate_end = find_section('gate-section bg-full-white', '</section>', share_end)
print(f"Gate: {gate_start}-{gate_end}")
