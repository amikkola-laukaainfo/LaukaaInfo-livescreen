# fix_aluesivut.ps1 – Aluesivujen selkeytysskripti
# Aja: pwsh -File scratch/fix_aluesivut.ps1

$files = @(
    "laukaa.html",
    "lievestuore.html",
    "leppavesi.html",
    "vehnia.html",
    "vihtavuori.html",
    "koko-laukaa.html"
)

$basePath = "d:\Projekteja\MUUTprojektit\LaukaaInfo-livescreen\LaukaaInfo-livescreen"

foreach ($f in $files) {
    $path = Join-Path $basePath $f
    if (!(Test-Path $path)) { Write-Host "Ei loytynyt: $f"; continue }

    $c = Get-Content $path -Raw -Encoding UTF8

    # -----------------------------------------------------------------------
    # 1. KILPAILUTUS: siirretään banneri alemmaksi.
    #    Irroitetaan kilpailutus-osio (section) ja lisätään se uutisosion jälkeen.
    # -----------------------------------------------------------------------

    # Kilpailutus-bannerin osio (alkaa kommentista, loppuu </section>)
    $kilpPattern = '(?s)(\s*<!--\s*KILPAILUTUS BANNER\s*-->\s*<section[^>]*>.*?</section>)'

    # Kohde: lisätään heti region-dashboard-sectionin sulkevan tagin jälkeen
    $dashboardEnd = '</section>' # Etsitään region-dashboardin jälkeen
    
    # Poimitaan kilpailutus-lohko
    if ($c -match $kilpPattern) {
        $kilpBlock = $Matches[1]
        # Poistetaan kilpailutus alkuperäiseltä paikalta
        $c = $c -replace [regex]::Escape($kilpBlock), ''
        
        # Lisätään kilpailutus region-dashboard-sectionin jälkeen
        # Etsitään nearby-section:n alkua edeltävä kohta
        $insertAfter = '<section id="nearby-section"'
        $c = $c -replace [regex]::Escape($insertAfter), ($kilpBlock + "`r`n" + $insertAfter)
        Write-Host "  [OK] Kilpailutus siirretty alemmaksi: $f"
    } else {
        Write-Host "  [SKIP] Kilpailutus-banneria ei loydy: $f"
    }

    # -----------------------------------------------------------------------
    # 2. KATEGORIAT-OSIO: Selkeämpi otsikko + ohjekuvaus
    # -----------------------------------------------------------------------
    $c = $c -replace '(<h2 id="categories-title"[^>]*>)Kategoriat alueella(</h2>)', 
        '$1Selaa toimialoittain$2'

    # Lisätään kuvausteksti categories-grid:n yläpuolelle jos ei ole
    if ($c -notmatch 'Valitse toimiala') {
        $c = $c -replace '(<div id="region-categories")',
            '<p style="text-align:center; color:#64748b; margin:-0.5rem auto 1.5rem; max-width:600px; font-size:0.95rem;">Valitse toimiala n&auml;hd&auml;ksesi kaikki alueen palveluntarjoajat kyseiselt&auml; alalta.</p>' + "`r`n" + '$1'
        Write-Host "  [OK] Kategoriat-kuvaus lisatty: $f"
    }

    # -----------------------------------------------------------------------
    # 3. SUOSITELLUT YRITYKSET: Lisätään kuvausteksti
    # -----------------------------------------------------------------------
    if ($c -notmatch 'Seuraavat yritykset') {
        $c = $c -replace '(<div id="catalog-list")',
            '<p style="text-align:center; color:#e0f2fe; margin:-0.5rem auto 1.5rem; max-width:600px; font-size:0.95rem; opacity:0.9;">Seuraavat yritykset tarjoavat palveluja t&auml;ll&auml; alueella. Klikkaa korttia n&auml;hd&auml;ksesi yhteys- ja lis&auml;tiedot.</p>' + "`r`n" + '$1'
        Write-Host "  [OK] Suositellut-kuvaus lisatty: $f"
    }

    # -----------------------------------------------------------------------
    # 4. LÄHELLÄ-OSIO: Selkeämpi otsikko
    # -----------------------------------------------------------------------
    $c = $c -replace '(<h2 data-i18n="title_nearby_area">)L.hell. t.t. aluetta(</h2>)',
        '$1L&auml;hellä tätä aluetta – myös nämä toimijat palvelevat sinua$2'

    # -----------------------------------------------------------------------
    # Tallenna tiedosto
    # -----------------------------------------------------------------------
    Set-Content $path -Value $c -Encoding UTF8 -NoNewline
    Write-Host "Paivitetty: $f"
}

Write-Host "`nValmis!"
