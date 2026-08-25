Add-Type -AssemblyName System.Drawing

$srcDir = "E:\matkalla\kuvia\testi"
$dstDir = "E:\matkalla\Projekteja\MUUTprojektit\LaukaaInfo-livescreen\LaukaaInfo-livescreen\assets\hero_bg"

if (-not (Test-Path $dstDir)) {
    New-Item -ItemType Directory -Path $dstDir -Force | Out-Null
}

# Haetaan JPEG codec
$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]82)

# Vain vaakakuvat (landscape) sopivat parhaiten heroon
$files = Get-ChildItem -Path $srcDir -Filter "*.jpg" | Where-Object { $_.Name -ne "kuva-7738.jpg" }

$maxWidth = 1920
$maxHeight = 1080

$count = 1
$processed = @()

foreach ($file in $files) {
    try {
        $srcImg = [System.Drawing.Image]::FromFile($file.FullName)
        $origW = $srcImg.Width
        $origH = $srcImg.Height

        # Laske uudet mitat säilyttäen kuvasuhde
        $ratioW = $maxWidth / $origW
        $ratioH = $maxHeight / $origH
        $scale = [math]::Min($ratioW, 1.0) # Älä suurenna jos kuva on pienempi kuin 1920

        $newW = [int]($origW * $scale)
        $newH = [int]($origH * $scale)

        $destBitmap = New-Object System.Drawing.Bitmap($newW, $newH, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
        $graphics = [System.Drawing.Graphics]::FromImage($destBitmap)

        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

        $graphics.DrawImage($srcImg, 0, 0, $newW, $newH)

        $cleanName = ("hero-" + $count.ToString("D2") + ".jpg")
        $targetPath = Join-Path $dstDir $cleanName

        $destBitmap.Save($targetPath, $jpegCodec, $encoderParams)

        $graphics.Dispose()
        $destBitmap.Dispose()
        $srcImg.Dispose()

        $savedSize = (Get-Item $targetPath).Length

        $processed += [PSCustomObject]@{
            FileName = $cleanName
            Original = $file.Name
            Dimensions = "${newW}x${newH}"
            OrigSizeKB = [math]::Round($file.Length / 1KB)
            NewSizeKB = [math]::Round($savedSize / 1KB)
            Reduction = [math]::Round((1 - ($savedSize / $file.Length)) * 100, 1).ToString() + "%"
        }

        $count++
    } catch {
        Write-Warning "Virhe käsiteltäessä $($file.Name): $_"
    }
}

Write-Host "Käsitelty $($processed.Count) kuvaa kansioon: $dstDir"
$processed | Format-Table -AutoSize
