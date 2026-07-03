$content = Get-Content index.html -Raw
# Koodauksen takia emme välttämättä voi käyttää UTF-8 suoraan luettaessa/kirjoitettaessa,
# mutta Get-Content -Raw käyttää PowerShellin oletusta tai BOM:ia.
# Luetaan byteinä ja korvataan? Tai pakotetaan UTF8.
$bytes = [System.IO.File]::ReadAllBytes("index.html")
# Yritetään lukea Latin1 tai default
$encoding = [System.Text.Encoding]::GetEncoding("iso-8859-1")
$text = $encoding.GetString($bytes)

$introBlock = @"
    <main>
        <section class="intro-section bg-full-white" style="padding: 4rem 0; text-align: center; position: relative; z-index: 10;">
            <div class="section-container" style="max-width: 900px; margin: 0 auto; padding: 0 1.5rem;">
                
                <h2 style="font-size: 2.2rem; font-weight: 800; color: #0a2540; margin-bottom: 2rem; font-family: 'Outfit', sans-serif; line-height: 1.3;">
                    LaukaaInfo on Laukaan monipuolisin paikallinen palvelualusta
                </h2>
                
                <p style="font-size: 1.15rem; color: #475569; line-height: 1.8; margin-bottom: 1.5rem;">
                    L&#246;yd&#228;t yhdest&#228; paikasta yritykset, palvelut, yhdistykset, tapahtumat, ajankohtaiset tiedotteet ja paljon muuta &#8211; helposti haettavana sek&#228; verkkopalvelussa ett&#228; <a href="https://play.google.com/store/apps/details?id=com.laukaainfo.app&hl=fi" target="_blank" rel="noopener" style="color: #0056b3; font-weight: 700; text-decoration: underline; text-underline-offset: 4px;">Android-sovelluksessa</a>.
                </p>
                
                <p style="font-size: 1.1rem; color: #475569; line-height: 1.8; margin-bottom: 2.5rem;">
                    Olitpa etsim&#228;ss&#228; luotettavaa paikallista yrityst&#228;, suunnittelemassa juhlia, remonttia tai vapaa-aikaa, seuraamassa Laukaan ajankohtaisia asioita tai haluamassa l&#246;yt&#228;&#228; uusia palveluita, LaukaaInfo auttaa l&#246;yt&#228;m&#228;&#228;n oikeat tekij&#228;t ja ratkaisut.
                </p>
                
                <p class="intro-section__tagline" style="font-size: 1.3rem; font-weight: 700; color: #0a2540; margin-top: 1rem; padding-top: 2rem; border-top: 2px solid #f1f5f9; font-family: 'Outfit', sans-serif;">
                    LaukaaInfo yhdist&#228;&#228; ihmiset, yritykset ja palvelut &#8211; kaikki l&#228;hell&#228;si, yhdess&#228; paikassa.
                </p>
            </div>
        </section>

        <!-- Uutistikkeri / Swiper Slider -->
"@

$targetStr = "    <main>`r`n        <!-- Uutistikkeri / Swiper Slider -->"
$targetStrAlt = "    <main>`n        <!-- Uutistikkeri / Swiper Slider -->"

if ($text.Contains($targetStr)) {
    $text = $text.Replace($targetStr, $introBlock)
    Write-Host "Replaced successfully (CRLF)."
} elseif ($text.Contains($targetStrAlt)) {
    $text = $text.Replace($targetStrAlt, $introBlock)
    Write-Host "Replaced successfully (LF)."
} else {
    Write-Host "Target string not found. Trying regex..."
    $text = [System.Text.RegularExpressions.Regex]::Replace($text, "<\s*main\s*>\s*<!--\s*Uutistikkeri / Swiper Slider\s*-->", $introBlock)
    Write-Host "Replaced with regex."
}

# Tallennetaan alkuperäisessä encodingissa jotta ei rikota mitään.
# Käytetään HTML-entiteettejä varmuuden vuoksi ääkkösille.
[System.IO.File]::WriteAllBytes("index.html", $encoding.GetBytes($text))
Write-Host "Done."
