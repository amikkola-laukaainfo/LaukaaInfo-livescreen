
$json = Get-Content 'company_profiling_data.json' -Raw | ConvertFrom-Json

function Add-NotSuitable($id, $tags) {
    if ($json.profiles.$id) {
        if (-not $json.profiles.$id.core.not_suitable_for) {
            $json.profiles.$id.core.not_suitable_for = @()
        }
        foreach ($tag in $tags) {
            if ($json.profiles.$id.core.not_suitable_for -notcontains $tag) {
                $json.profiles.$id.core.not_suitable_for += $tag
            }
        }
    }
}

function Add-SubContext($id, $tags) {
    if ($json.profiles.$id) {
        if (-not $json.profiles.$id.core.sub_contexts) {
            $json.profiles.$id.core.sub_contexts = @()
        }
        foreach ($tag in $tags) {
            if ($json.profiles.$id.core.sub_contexts -notcontains $tag) {
                $json.profiles.$id.core.sub_contexts += $tag
            }
        }
    }
}

function Remove-Tag($id, $tag) {
    if ($json.profiles.$id) {
        if ($json.profiles.$id.core.sub_contexts) {
            $json.profiles.$id.core.sub_contexts = $json.profiles.$id.core.sub_contexts | Where-Object { $_ -ne $tag }
        }
        if ($json.profiles.$id.core.node_links) {
            $json.profiles.$id.core.node_links = $json.profiles.$id.core.node_links | Where-Object { $_ -ne $tag.ToUpper() }
        }
    }
}

# 1. Hevosklinikka
Add-SubContext 'company-267' @('hevonen')

# 2. Riina Raitio
Add-SubContext 'company-269' @('terveyspalvelut')

# 3. Exclusions
Add-NotSuitable 'company-285' @('LVI', 'putkipÃ¤ivystys', 'polttopuut')
Add-NotSuitable 'company-284' @('LVI', 'putkipÃ¤ivystys', 'polttopuut')
Add-NotSuitable 'company-283' @('LVI', 'putkipÃ¤ivystys', 'polttopuut', 'laituritarvikkeet')

# 4. MultamÃ¤ki
Remove-Tag 'company-286' 'kartano'

# 5. VehvilÃ¤inen
Add-SubContext 'company-131' @('hautauspalvelu')

# 6. VÃ¤entupa
Add-NotSuitable 'company-176' @('kuljetus')

# 7. UntenOnnela
Add-NotSuitable 'company-124' @('musiikki', 'dj')

# 8. Jukka HÃ¤kkinen
Add-NotSuitable 'company-73' @('majoitus', 'pieni pintaremontti', 'keittiÃ¶remontti', 'maalaus', 'laituritarvikkeet')

# 9. Module KeittiÃ¶
Add-NotSuitable 'company-144' @('majoitus')

# 10. Monitoimi Kiiski
Add-NotSuitable 'company-74' @('yrityshyvinvointi', 'luennot')

# 11. OneFit
Add-SubContext 'company-23' @('ohjattu liikunta', 'jooga')

# 12. K&K Peni
Add-NotSuitable 'company-53' @('majoitus')

# 13. Atsound & Ja-He
Add-NotSuitable 'company-101' @('luontoelÃ¤mykset', 'erÃ¤opas', 'lounas', 'kahvitus')
Add-NotSuitable 'company-116' @('luontoelÃ¤mykset', 'erÃ¤opas', 'lounas', 'kahvitus', 'liikeidea', 'suunnittelu', 'yritysneuvonta')

# 15. Nuohous Lapin Mies
Add-NotSuitable 'company-300' @('talvivalvonta', 'huolenpito')

# 17. Tarvaalan Kalamaja
Add-NotSuitable 'company-287' @('laituritarvikkeet')

# 18. Irja Hokkeri
Add-NotSuitable 'company-187' @('liikeidea', 'suunnittelu', 'yritysneuvonta', 'liikkeenjohdon konsultointi')

# 19. SÃ¤hkÃ¶tyÃ¶t Rissanen
Add-NotSuitable 'company-304' @('verkkosivut', 'markkinointi', 'verkkokauppa')

# 20. Keijo Penttinen
Add-NotSuitable 'company-291' @('henkilÃ¶stÃ¶n koulutus', 'pÃ¤ivÃ¤hoito')

# 21. Mediazoo
Add-SubContext 'company-2' @('markkinointikumppani')

# 22. Baby supplies exclusions
Add-NotSuitable 'company-166' @('lastentarvikkeet')
Add-NotSuitable 'company-139' @('lastentarvikkeet')

$json | ConvertTo-Json -Depth 20 | Set-Content 'company_profiling_data.json' -Encoding utf8
