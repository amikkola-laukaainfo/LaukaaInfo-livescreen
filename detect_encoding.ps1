# Etsi KARTAT-osio dist/index.html:sta
$content = [System.IO.File]::ReadAllText('dist/index.html', [System.Text.Encoding]::UTF8)

# Etsi KARTAT
$idx = $content.IndexOf('KARTAT')
if ($idx -ge 0) {
    $ctx = $content.Substring($idx, 80)
    Write-Host "KARTAT konteksti: '$ctx'"
    
    # Nayta bytes taltä alueelta
    $bytes = [System.IO.File]::ReadAllBytes('dist/index.html')
    Write-Host ""
    Write-Host "Raakabytejä KARTAT-kohdasta:"
    $byteCtx = $bytes[$idx..($idx+80)]
    Write-Host (($byteCtx | ForEach-Object { '{0:X2}' -f $_ }) -join ' ')
}

# Etsi hajonnut tähti (yksittäinen tavu E2 = ÃÂ²)
Write-Host ""
Write-Host "Kaikki yli 0xE0 alkavat sekvenssit:"
$bytes = [System.IO.File]::ReadAllBytes('dist/index.html')
for ($i = 0; $i -lt $bytes.Length - 3; $i++) {
    if ($bytes[$i] -eq 0xE2 -and ($bytes[$i+1] -ne 0x80 -and $bytes[$i+1] -ne 0x9E -and $bytes[$i+1] -ne 0x80)) {
        Write-Host "Pos $i : $($bytes[$i].ToString('X2')) $($bytes[$i+1].ToString('X2')) $($bytes[$i+2].ToString('X2')) = $([System.Text.Encoding]::UTF8.GetString($bytes, $i, 3))"
    }
}
