$lines = Get-Content index.html -Encoding UTF8
$idx = 0
foreach ($line in $lines) {
    if ($line -match '<section id="search-section"') {
        Write-Host "FOUND AT $idx"
        $start = [Math]::Max(0, $idx - 30)
        $end = $idx + 5
        for ($i = $start; $i -le $end; $i++) {
            Write-Host "$i - $($lines[$i])"
        }
        break
    }
    $idx++
}
