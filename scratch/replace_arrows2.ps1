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

$newArrow = '<span class="arrow"><span class="iconify" data-icon="material-symbols-light:keyboard-arrow-down" style="font-size: 1.2em; vertical-align: middle;"></span></span>'

# Match <span class="arrow">ANY_CHAR(S)</span> — robust regardless of what char is inside
$pattern = '<span class="arrow">[^<]*</span>'

foreach ($f in $files) {
    $path = "d:\Projekteja\MUUTprojektit\LaukaaInfo-livescreen\LaukaaInfo-livescreen\$f"
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $content = [System.Text.Encoding]::UTF8.GetString($bytes)
    
    $matches = [regex]::Matches($content, $pattern)
    $count = $matches.Count
    
    if ($count -gt 0) {
        $newContent = [regex]::Replace($content, $pattern, $newArrow)
        $outBytes = [System.Text.Encoding]::UTF8.GetBytes($newContent)
        [System.IO.File]::WriteAllBytes($path, $outBytes)
        Write-Output "Replaced $count arrow spans in: $f"
    } else {
        Write-Output "No arrow spans found in: $f"
    }
}
