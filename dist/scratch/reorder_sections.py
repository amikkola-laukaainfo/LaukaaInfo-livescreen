"""
Järjestelee index.html-lohkot haluttuun järjestykseen.

Nykyinen järjestys (0-indeksoidut rivit, inklusiiviset):
  Swiper:          278-437
  Community:       440-486  (Osallistu ja pysy ajan tasalla)
  Search:          488-553  (Tarkempi haku)
  Palveluverkosto: 555-579  (Löydä ihmisiä)
  Need-based:      581-805  (Palveluverkoston suositukset)
  Feed:            809-835  (Syöte)
  Share:           840-893  (Jakolinkki-generaattori – poistetaan pois järjestyksestä, pidetään paikallaan tai siirretään loppuun)
  Gate:            896-923  (Kauppa-mainokset)

Haluttu järjestys:
  1. Hero (before swiper, lines 0-277)
  2. Search (Tarkempi haku)
  3. Swiper (mainos)
  4. Palveluverkosto + Need-based (Löydä ihmisiä)
  5. Community (Osallistu ja pysy ajan tasalla)
  6. Feed (Syöte)
  7. Gate (Kauppa-mainokset)
  8. Share (Jakolinkki-generaattori) → poistetaan tai lisätään loppuun ennen </main>
  9. After gate (lines 924+)
"""

with open('index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Lohkojen rajat (0-indeksoidut, inklusiiviset)
def block(start, end):
    return lines[start:end+1]

hero        = lines[0:278]          # Hero + kaikki ennen swiperia
swiper      = block(278, 437)       # Swiper-mainos
# line 438-439 = whitespace after swiper
community   = block(440, 486)       # Osallistu ja pysy ajan tasalla + 1 blank after
search      = block(488, 553)       # Tarkempi haku
palv        = block(555, 579)       # Löydä ihmisiä / sanapilvi
need        = block(581, 805)       # Palveluverkoston suositukset
# 806-808 blanks
feed        = block(809, 835)       # Syöte
# 836-839 blanks
share       = block(840, 893)       # Jakolinkki – pidetään
gate        = block(896, 923)       # Kauppa-mainokset / gate-section
after       = lines[924:]           # </main> + footer + scripts

sep = ['\n']  # Tyhjä rivi lohkojen välissä

new_content = (
    hero
    + sep + search
    + sep + swiper
    + sep + palv
    + sep + need
    + sep + community
    + sep + feed
    + sep + gate
    + sep + share
    + after
)

with open('index.html', 'w', encoding='utf-8') as f:
    f.writelines(new_content)

print(f"Valmis! Uusi tiedosto: {len(new_content)} riviä")
