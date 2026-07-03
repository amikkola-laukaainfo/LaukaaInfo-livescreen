$lines = Get-Content index.html
$idx = 0
foreach ($line in $lines) {
    if ($line -match 'intro-section') {
        for ($i = $idx; $i -le $idx + 15; $i++) {
            Write-Host $lines[$i]
        }
        break
    }
    $idx++
}
