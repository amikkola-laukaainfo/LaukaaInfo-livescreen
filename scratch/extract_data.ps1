$data = Invoke-RestMethod -Uri "https://www.mediazoo.fi/laukaainfo-web/get_companies.php"
$cats = $data | ForEach-Object { $_.kategoria } | Select-Object -Unique | Sort-Object
$tags = $data | ForEach-Object { if ($_.tags) { $_.tags.Split(',') } } | ForEach-Object { $_.Trim() } | Where-Object { $_ } | Select-Object -Unique | Sort-Object
$ptapa = $data | ForEach-Object { if ($_.palvelutapa) { $_.palvelutapa.Split(',') } } | ForEach-Object { $_.Trim() } | Where-Object { $_ } | Select-Object -Unique | Sort-Object

Write-Host "### CATEGORIES ###"
$cats -join ", "
Write-Host "`n### TAGS ###"
$tags -join ", "
Write-Host "`n### PALVELUTAVAT ###"
$ptapa -join ", "
