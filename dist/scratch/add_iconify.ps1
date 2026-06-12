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

$iconifyLine = '    <script src="https://code.iconify.design/3/3.1.0/iconify.min.js"></script>'

foreach ($f in $files) {
    $path = "d:\Projekteja\MUUTprojektit\LaukaaInfo-livescreen\LaukaaInfo-livescreen\$f"
    $content = Get-Content $path -Raw -Encoding UTF8
    if ($content -match "iconify") {
        Write-Output "Already has Iconify: $f"
        continue
    }
    $newContent = $content -replace "(\s*</head>)", "`n$iconifyLine`$1"
    Set-Content $path $newContent -Encoding UTF8 -NoNewline
    Write-Output "Added Iconify to: $f"
}
