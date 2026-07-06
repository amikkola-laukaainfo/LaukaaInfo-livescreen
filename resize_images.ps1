Add-Type -AssemblyName System.Drawing

function Resize-Image {
    param (
        [string]$SourcePath,
        [string]$DestinationPath,
        [int]$MaxWidth = 1920,
        [int]$Quality = 80
    )
    $img = [System.Drawing.Image]::FromFile($SourcePath)
    if ($img.Width -gt $MaxWidth) {
        $ratio = $MaxWidth / $img.Width
        $newHeight = [math]::Round($img.Height * $ratio)
        $newImg = New-Object System.Drawing.Bitmap($MaxWidth, $newHeight)
        $graph = [System.Drawing.Graphics]::FromImage($newImg)
        $graph.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graph.DrawImage($img, 0, 0, $MaxWidth, $newHeight)
        
        $codecs = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders()
        $jpegCodec = $codecs | Where-Object { $_.MimeType -eq 'image/jpeg' }
        $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
        $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$Quality)
        
        $newImg.Save($DestinationPath, $jpegCodec, $encoderParams)
        $graph.Dispose()
        $newImg.Dispose()
        Write-Host "Resized and saved $DestinationPath"
    } else {
        $img.Dispose()
        Copy-Item $SourcePath -Destination $DestinationPath
        Write-Host "Copied $DestinationPath (was smaller than $MaxWidth)"
    }
    
    # Must dispose before removing
    if ($img) { $img.Dispose() }
}

$files = @("_1070914.jpg", "_1070909.jpg", "hero-1.jpg", "_1070628.jpg", "_1070617.jpg", "hero-4.jpg", "_1070396.jpg", "_1070387.jpg", "_1070319-Edit-Edit.jpg")

$i = 1
foreach ($f in $files) {
    $src = "kuvia\$f"
    $dest = "kuvia\hero_new_$i.jpg"
    
    # Check if file exists
    if (Test-Path $src) {
        Resize-Image -SourcePath $src -DestinationPath $dest
        Remove-Item $src
    }
    $i++
}
