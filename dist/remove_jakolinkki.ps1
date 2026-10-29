
# Poistaa "Luo jakolinkki" -linkin kaikista HTML-tiedostoista paitsi index.html
# Poistetaan desktop-nav (4 riviä + edeltava tyhjä rivi) ja sidebar TYOKALUT-div

$rootDir = Get-Location
$files = Get-ChildItem -Path "." -Filter "*.html" -Recurse |
    Where-Object { $_.FullName -notlike "*\dist\*" -and $_.Name -ne "index.html" }

$totalChanged = 0

foreach ($f in $files) {
    $lines = [System.IO.File]::ReadAllLines($f.FullName, [System.Text.Encoding]::UTF8)
    $hasJako = ($lines | Where-Object { $_ -match "Luo jakolinkki" }).Count -gt 0
    if (-not $hasJako) { continue }

    $result = [System.Collections.Generic.List[string]]::new()
    $i = 0
    $changed = $false

    while ($i -lt $lines.Length) {
        $line = $lines[$i]

        # Desktop nav: Tunnisteena kommentti "7. Luo jakolinkki"
        if ($line -match '<!--\s*7\.\s*Luo jakolinkki\s*-->') {
            # Poista kommenttirivi
            # Poista seuraava <li class="nav-item">
            # Poista seuraava <a ... > rivi
            # Poista seuraava </li>
            $skip = 4
            # Poista myös mahdollinen edellinen tyhjä rivi
            if ($result.Count -gt 0 -and $result[$result.Count - 1].Trim() -eq "") {
                $result.RemoveAt($result.Count - 1)
            }
            $i += $skip
            $changed = $true
            continue
        }

        # Sidebar TYOKALUT div - tunnistuu h3-otsikosta
        if ($line -match '<h3 class="section-title"[^>]*>TYOKALUT</h3>' -or
            $line -match '<h3 class="section-title"[^>]*>TY\u00d6KALUT</h3>') {
            # Etsi alkava div taaksepain result-listasta ja poista kaikki siihen asti
            $divIdx = -1
            for ($j = $result.Count - 1; $j -ge 0; $j--) {
                if ($result[$j] -match '<div class="menu-section"') {
                    $divIdx = $j
                    break
                }
            }
            if ($divIdx -ge 0) {
                $result.RemoveRange($divIdx, $result.Count - $divIdx)
            }
            # Etsi sulkeva </div> eteenpain
            $i++
            while ($i -lt $lines.Length) {
                if ($lines[$i] -match '^\s*</div>\s*$') {
                    $i++
                    break
                }
                $i++
            }
            $changed = $true
            continue
        }

        $result.Add($line)
        $i++
    }

    if ($changed) {
        [System.IO.File]::WriteAllLines($f.FullName, $result.ToArray(), (New-Object System.Text.UTF8Encoding $false))
        Write-Host "OK: $($f.Name)"
        $totalChanged++
    }
}

Write-Host ""
Write-Host "Valmis - muokattu $totalChanged tiedostoa."
