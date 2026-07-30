$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$iconPath = Join-Path $root "sherry-ielts.ico"
$previewPath = Join-Path $root "output\desktop-icon-preview.png"
$previewDirectory = Split-Path -Parent $previewPath
New-Item -ItemType Directory -Force -Path $previewDirectory | Out-Null

$size = 256
$bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.Clear([System.Drawing.Color]::Transparent)

$teal = [System.Drawing.ColorTranslator]::FromHtml("#2c5e5a")
$mint = [System.Drawing.ColorTranslator]::FromHtml("#b7ddd7")
$white = [System.Drawing.Color]::White
$badge = New-Object System.Drawing.Rectangle(12, 12, 232, 232)
$graphics.FillEllipse((New-Object System.Drawing.SolidBrush($teal)), $badge)

$headsetPen = New-Object System.Drawing.Pen($white, 13)
$headsetPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$headsetPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawArc($headsetPen, 60, 45, 136, 145, 205, 130)
$graphics.FillRectangle((New-Object System.Drawing.SolidBrush($white)), (New-Object System.Drawing.Rectangle(47, 135, 26, 58)))
$graphics.FillRectangle((New-Object System.Drawing.SolidBrush($white)), (New-Object System.Drawing.Rectangle(183, 135, 26, 58)))

$wavePen = New-Object System.Drawing.Pen($mint, 8)
$wavePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$wavePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$waveBars = @(
  @{ X = 92; Top = 131; Bottom = 179 },
  @{ X = 108; Top = 119; Bottom = 191 },
  @{ X = 124; Top = 141; Bottom = 169 },
  @{ X = 140; Top = 112; Bottom = 198 },
  @{ X = 156; Top = 130; Bottom = 180 }
)
foreach ($bar in $waveBars) {
  $graphics.DrawLine($wavePen, $bar.X, $bar.Top, $bar.X, $bar.Bottom)
}

$font = New-Object System.Drawing.Font("Arial", 25, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$graphics.DrawString("IELTS", $font, (New-Object System.Drawing.SolidBrush($white)), (New-Object System.Drawing.RectangleF(32, 195, 192, 38)), $format)

$bitmap.Save($previewPath, [System.Drawing.Imaging.ImageFormat]::Png)
$icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
$stream = [System.IO.File]::Create($iconPath)
$icon.Save($stream)
$stream.Dispose()
$icon.Dispose()
$font.Dispose()
$format.Dispose()
$wavePen.Dispose()
$headsetPen.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Output "Created $iconPath"
Write-Output "Preview $previewPath"
