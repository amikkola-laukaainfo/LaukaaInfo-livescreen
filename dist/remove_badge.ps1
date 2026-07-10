$bytes = [System.IO.File]::ReadAllBytes("index.html")
$encoding = [System.Text.Encoding]::GetEncoding("iso-8859-1")
$text = $encoding.GetString($bytes)

# Remove the span element
$text = $text -replace '<span style="display:inline-block; background: #e0f2fe; color: #0369a1; padding: 6px 16px; border-radius: 50px; font-weight: 700; font-size: 0.85rem; margin-bottom: 1.5rem; letter-spacing: 0.05em;">LAUKAAN MONIPUOLISIN PALVELUALUSTA</span>\s*', ''

# Tallenna takaisin
[System.IO.File]::WriteAllBytes("index.html", $encoding.GetBytes($text))
Write-Host "Badge removed."
