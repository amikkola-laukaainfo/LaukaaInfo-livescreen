# Muunna index.html Windows-1252 -> UTF-8
$file = 'index.html'
$enc1252 = [System.Text.Encoding]::GetEncoding(1252)
$encUtf8 = New-Object System.Text.UTF8Encoding $false  # false = ei BOM

$content = [System.IO.File]::ReadAllText($file, $enc1252)
[System.IO.File]::WriteAllText($file, $content, $encUtf8)

Write-Host "Valmis. Tiedostokoko: $((Get-Item $file).Length) tavua"
Write-Host "Tarkistus - ensimmainen rivi: $($content.Substring(0,50))"
