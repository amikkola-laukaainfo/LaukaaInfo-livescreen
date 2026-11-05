Add-Type -AssemblyName System.Drawing

$srcDir = "E:\matkalla\kuvia\testi"
$dstDir = "E:\matkalla\Projekteja\MUUTprojektit\LaukaaInfo-livescreen\LaukaaInfo-livescreen\assets\hero_bg"

if (-not (Test-Path $dstDir)) {
    New-Item -ItemType Directory -Path $dstDir -Force | Out-Null
}

$files = Get-ChildItem -Path $srcDir -Filter "*.jpg"
Write-Host "Found $($files.Count) files in $srcDir"

$results = @()

foreach ($file in $files) {
    try {
        $srcImg = [System.Drawing.Image]::FromFile($file.FullName)
        $w = $srcImg.Width
        $h = $srcImg.Height
        $aspect = [math]::Round($w / $h, 2)
        $isLandscape = $w -ge $h

        $results += [PSCustomObject]@{
            Name = $file.Name
            Width = $w
            Height = $h
            Aspect = $aspect
            Orientation = if ($isLandscape) { "Landscape" } else { "Portrait" }
            OrigSizeKB = [math]::Round($file.Length / 1KB)
        }
        $srcImg.Dispose()
    } catch {
        Write-Warning "Could not read $($file.Name): $_"
    }
}

$results | Format-Table -AutoSize
