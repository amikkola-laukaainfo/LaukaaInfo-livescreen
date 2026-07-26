
$ids = @('company-267', 'company-269', 'company-285', 'company-284', 'company-283', 'company-286', 'company-131', 'company-176', 'company-124', 'company-73', 'company-144', 'company-74', 'company-23', 'company-53', 'company-101', 'company-116', 'company-300', 'company-287', 'company-187', 'company-304', 'company-291', 'company-2', 'company-166', 'company-139')
$json = Get-Content 'company_profiling_data.json' -Raw | ConvertFrom-Json
$subset = @{}
foreach ($id in $ids) {
    if ($json.profiles.$id) {
        $subset[$id] = $json.profiles.$id
    }
}
$subset | ConvertTo-Json -Depth 5 | Set-Content 'scratch/company_profiles_to_edit.json' -Encoding utf8
