$banner = @"
        <!-- KILPAILUTUS BANNER -->
        <section class="bg-full-white" style="padding: 1.5rem 0; margin-bottom: 2rem;">
            <div style="max-width: 1200px; margin: 0 auto; text-align: center; padding: 0 1rem;">
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
        </section>

"@

$files1 = @(
    "koko-laukaa.html",
    "laukaa.html",
    "leppavesi.html",
    "lievestuore.html",
    "vehnia.html",
    "vihtavuori.html"
)

foreach ($f in $files1) {
    if (Test-Path $f) {
        $content = Get-Content -Raw $f
        if ($content -notmatch "KILPAILUTUS BANNER") {
            $content = $content -replace '<section id="region-map-section"', "$banner<section id=`"region-map-section`""
            Set-Content -Path $f -Value $content -Encoding UTF8
            Write-Host "Updated $f"
        } else {
            Write-Host "$f already has banner."
        }
    }
}

if (Test-Path "kategoria.html") {
    $content = Get-Content -Raw "kategoria.html"
    if ($content -notmatch "KILPAILUTUS BANNER") {
        $content = $content -replace '<section class="featured-carousel-section"', "$banner<section class=`"featured-carousel-section`""
        Set-Content -Path "kategoria.html" -Value $content -Encoding UTF8
        Write-Host "Updated kategoria.html"
    } else {
        Write-Host "kategoria.html already has banner."
    }
}
