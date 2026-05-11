$json = Invoke-WebRequest -Uri "https://www.mediazoo.fi/laukaainfo-web/get_companies.php" -UseBasicParsing
$data = $json.Content | ConvertFrom-Json

# If the API returns { results: [...] }
if ($data.results) { $data = $data.results }

$cats = $data | ForEach-Object { $_.kategoria } | Select-Object -Unique | Sort-Object
$tags = $data | ForEach-Object { if ($_.tags) { $_.tags.Split(',') } } | ForEach-Object { $_.Trim() } | Where-Object { $_ } | Select-Object -Unique | Sort-Object
$ptapa = $data | ForEach-Object { if ($_.palvelutapa) { $_.palvelutapa.Split(',') } } | ForEach-Object { $_.Trim() } | Where-Object { $_ } | Select-Object -Unique | Sort-Object

Write-Host "CATEGORIES:"
$cats -join ", "
Write-Host "`nTAGS:"
$tags -join ", "
Write-Host "`nPALVELUTAVAT:"
$ptapa -join ", "
