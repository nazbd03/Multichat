Add-Type -AssemblyName System.Drawing

function GenerateAppIcon([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $scale = [float]$size / 256.0

    function CreateRoundedRectPath($rect, [float]$radius) {
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $d = [float]($radius * 2.0)
        $rx = [float]$rect.X
        $ry = [float]$rect.Y
        $rw = [float]$rect.Width
        $rh = [float]$rect.Height
        $path.AddArc($rx, $ry, $d, $d, [float]180, [float]90)
        $path.AddArc($rx + $rw - $d, $ry, $d, $d, [float]270, [float]90)
        $path.AddArc($rx + $rw - $d, $ry + $rh - $d, $d, $d, [float]0, [float]90)
        $path.AddArc($rx, $ry + $rh - $d, $d, $d, [float]90, [float]90)
        $path.CloseFigure()
        return $path
    }

    [float]$sqSize = 236.0 * $scale
    [float]$sqX = ($size - $sqSize) / 2.0
    [float]$sqY = ($size - $sqSize) / 2.0
    $sqRect = New-Object System.Drawing.RectangleF($sqX, $sqY, $sqSize, $sqSize)
    $sqPath = CreateRoundedRectPath $sqRect (56.0 * $scale)

    # Purple/Violet gradient from user's image
    $c1 = [System.Drawing.Color]::FromArgb(255, 0x68, 0x62, 0xF2)
    $c2 = [System.Drawing.Color]::FromArgb(255, 0xA2, 0x57, 0xF7)
    $p1 = New-Object System.Drawing.PointF($sqX, $sqY)
    $p2 = New-Object System.Drawing.PointF([float]($sqX + $sqSize), [float]($sqY + $sqSize))
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($p1, $p2, $c1, $c2)
    $g.FillPath($brush, $sqPath)

    # Chat Bubble dimensions
    [float]$bw = 96.0 * $scale
    [float]$bh = 70.0 * $scale
    [float]$tailH = 22.0 * $scale
    [float]$tailW = 22.0 * $scale
    [float]$bx = $sqX + ($sqSize - $bw) / 2.0
    [float]$by = $sqY + ($sqSize - ($bh + $tailH)) / 2.0 - (2.0 * $scale)
    [float]$right = $bx + $bw
    [float]$bottom = $by + $bh
    [float]$rOut = [Math]::Max(1.0, 12.0 * $scale)

    $outerBubble = New-Object System.Drawing.Drawing2D.GraphicsPath
    $outerBubble.AddArc([float]($right - 2*$rOut), $by, [float](2*$rOut), [float](2*$rOut), [float]270, [float]90)
    $outerBubble.AddArc([float]($right - 2*$rOut), [float]($bottom - 2*$rOut), [float](2*$rOut), [float](2*$rOut), [float]0, [float]90)
    $outerBubble.AddLine([float]($right - $rOut), $bottom, [float]($bx + $tailW), $bottom)
    $outerBubble.AddLine([float]($bx + $tailW), $bottom, $bx, [float]($bottom + $tailH))
    $outerBubble.AddLine($bx, [float]($bottom + $tailH), $bx, [float]($by + $rOut))
    $outerBubble.AddArc($bx, $by, [float](2*$rOut), [float](2*$rOut), [float]180, [float]90)
    $outerBubble.CloseFigure()

    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.FillPath($whiteBrush, $outerBubble)

    # Inner cutout (hole)
    [float]$stroke = [Math]::Max(1.0, 11.0 * $scale)
    [float]$ix = $bx + $stroke
    [float]$iy = $by + $stroke
    [float]$iw = [Math]::Max(1.0, $bw - 2*$stroke)
    [float]$ih = [Math]::Max(1.0, $bh - 2*$stroke)
    [float]$rIn = [Math]::Max(1.0, 5.0 * $scale)
    $innerRect = New-Object System.Drawing.RectangleF($ix, $iy, $iw, $ih)
    $innerPath = CreateRoundedRectPath $innerRect $rIn
    $g.FillPath($brush, $innerPath)

    $g.Dispose()
    return $bmp
}

# 1. Save 256x256 PNG to public/icon.png
$icon256 = GenerateAppIcon 256
$targetPng = Join-Path $PSScriptRoot "..\public\icon.png"
$targetPng = [System.IO.Path]::GetFullPath($targetPng)
$icon256.Save($targetPng, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Saved: $targetPng"

# 2. Build Multi-Resolution ICO (256, 128, 64, 48, 32, 16)
$sizes = @(256, 128, 64, 48, 32, 16)
$pngDataList = @()

foreach ($s in $sizes) {
    $bmp = GenerateAppIcon $s
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngDataList += ,@($s, $ms.ToArray())
    $bmp.Dispose()
    $ms.Dispose()
}

$icoMs = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($icoMs)
$count = $sizes.Count
$bw.Write([UInt16]0)
$bw.Write([UInt16]1)
$bw.Write([UInt16]$count)

$currentOffset = 6 + ($count * 16)

foreach ($item in $pngDataList) {
    $s = $item[0]
    $data = $item[1]
    $wByte = if ($s -ge 256) { [byte]0 } else { [byte]$s }
    $hByte = if ($s -ge 256) { [byte]0 } else { [byte]$s }

    $bw.Write($wByte)
    $bw.Write($hByte)
    $bw.Write([byte]0)
    $bw.Write([byte]0)
    $bw.Write([UInt16]1)
    $bw.Write([UInt16]32)
    $bw.Write([UInt32]$data.Length)
    $bw.Write([UInt32]$currentOffset)

    $currentOffset += $data.Length
}

foreach ($item in $pngDataList) {
    $bw.Write($item[1])
}
$bw.Flush()
$icoBytes = $icoMs.ToArray()

$targetIco1 = Join-Path $PSScriptRoot "..\public\app.ico"
$targetIco1 = [System.IO.Path]::GetFullPath($targetIco1)
[System.IO.File]::WriteAllBytes($targetIco1, $icoBytes)
Write-Host "Saved: $targetIco1"

$targetIco2 = Join-Path $PSScriptRoot "..\Multistream Chat.ico"
$targetIco2 = [System.IO.Path]::GetFullPath($targetIco2)
[System.IO.File]::WriteAllBytes($targetIco2, $icoBytes)
Write-Host "Saved: $targetIco2"

$icoMs.Dispose()
$icon256.Dispose()
Write-Host "All icon files successfully generated!"
