
$companies = @("Ohjelmatoimisto Ja - He", "Multamäki", "Multamäen leirikeskus")
$json = Get-Content "company_profiling_data.json" -Raw | ConvertFrom-Json
$results = @()

foreach ($compId in $json.profiles.psobject.Properties.Name) {
    $profile = $json.profiles.$compId
    foreach ($search in $companies) {
        if ($profile.name -like "*$search*") {
            $results += [PSCustomObject]@{
                ID = $compId
                Name = $profile.name
            }
        }
    }
}

$results | ConvertTo-Json | Set-Content "scratch/extra_company_ids.json" -Encoding utf8
