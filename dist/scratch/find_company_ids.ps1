
$companies = @("Hevosklinikka", "Raitio", "Häkkinen", "Ylä-Saarikon", "Pitkäniemen", "Vehviläinen", "Untenonnela", "Module", "Monitoimi", "OneFit", "Peni", "Atsound", "Ja-He", "Lapin Mies", "Tarvaalan", "Hokkeri", "Rissanen", "Keijo Penttinen", "Mediazoo", "Jussi Pöysä", "Kimmon Kulma", "Ranch", "Varjola", "Peurunka", "Revontuli", "Bellingham", "Multamäki")
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

$results | ConvertTo-Json | Set-Content "scratch/company_ids_full.json" -Encoding utf8
