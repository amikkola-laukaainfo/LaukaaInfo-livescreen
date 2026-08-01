$files = @(
    "ilmoittaudu.html",
    "ilmoitukset.html",
    "palvelu.html",
    "palvelun-esittely.html",
    "pikahaku.html",
    "ajankohtaista.html",
    "kauppa.html",
    "lisaa-yritys.html",
    "kategoria.html"
)

$oldArrow = '<span class="arrow">▼</span>'
$newArrow = '<span class="arrow"><span class="iconify" data-icon="material-symbols-light:keyboard-arrow-down" style="font-size: 1.2em; vertical-align: middle;"></span></span>'

foreach ($f in $files) {
    $path = "d:\Projekteja\MUUTprojektit\LaukaaInfo-livescreen\LaukaaInfo-livescreen\$f"
    $content = Get-Content $path -Raw -Encoding UTF8
    $count = ([regex]::Matches($content, [regex]::Escape($oldArrow))).Count
    if ($count -gt 0) {
        $newContent = $content.Replace($oldArrow, $newArrow)
        Set-Content $path $newContent -Encoding UTF8 -NoNewline
        Write-Output "Replaced $count arrows in: $f"
    } else {
        Write-Output "No arrows found in: $f"
    }
}
