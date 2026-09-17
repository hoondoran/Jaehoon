<#
  make_icons.ps1 — 앱 아이콘 생성 (PWA 설치 · 안드로이드 런처)

  이 PC에는 이미지 편집 도구가 없으므로 .NET System.Drawing 으로 직접 그린다.
  사용:  powershell -ExecutionPolicy Bypass -File tools\make_icons.ps1
#>
param(
    [string]$OutDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'icons')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

New-Item -ItemType Directory -Force $OutDir | Out-Null

$brandDark  = [System.Drawing.ColorTranslator]::FromHtml('#0d366b')
$brandLight = [System.Drawing.ColorTranslator]::FromHtml('#2a78d6')
$accent     = [System.Drawing.ColorTranslator]::FromHtml('#ffd68a')

<#
  size    : 출력 픽셀
  padRate : 바깥 여백 비율. 안드로이드 maskable 아이콘은 가장자리가 잘리므로
            안전영역(중앙 80%) 안에 내용을 넣어야 한다.
  round   : 모서리 둥글기 비율 (maskable 은 배경을 꽉 채우므로 0)
#>
function New-Icon([int]$size, [double]$padRate, [double]$round, [string]$path) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.TextRenderingHint = 'AntiAliasGridFit'
    $g.Clear([System.Drawing.Color]::Transparent)

    # --- 배경 ---
    $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect, $brandDark, $brandLight, 45.0)

    if ($round -gt 0) {
        $r = [int]($size * $round)
        $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
        $gp.AddArc(0, 0, 2*$r, 2*$r, 180, 90)
        $gp.AddArc($size-2*$r, 0, 2*$r, 2*$r, 270, 90)
        $gp.AddArc($size-2*$r, $size-2*$r, 2*$r, 2*$r, 0, 90)
        $gp.AddArc(0, $size-2*$r, 2*$r, 2*$r, 90, 90)
        $gp.CloseFigure()
        $g.FillPath($brush, $gp)
        $gp.Dispose()
    } else {
        $g.FillRectangle($brush, $rect)
    }

    # --- 내용 영역 (maskable 안전영역) ---
    $pad = [int]($size * $padRate)
    $inner = $size - 2*$pad

    # 지도 핀
    $pinW = $inner * 0.46
    $pinH = $inner * 0.58
    $pinX = $pad + ($inner - $pinW) / 2
    $pinY = $pad + $inner * 0.04

    $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $pin = New-Object System.Drawing.Drawing2D.GraphicsPath
    # 원형 머리 + 아래로 모이는 꼬리
    $pin.AddArc($pinX, $pinY, $pinW, $pinW, 160, 220)
    $pin.AddLine(
        ($pinX + $pinW/2), ($pinY + $pinH),
        ($pinX + $pinW*0.06), ($pinY + $pinW*0.80))
    $pin.CloseFigure()
    $g.FillPath($white, $pin)
    $pin.Dispose()

    # 핀 안쪽 구멍 (원화 기호가 들어갈 자리)
    $holeD = $pinW * 0.50
    $holeX = $pinX + ($pinW - $holeD)/2
    $holeY = $pinY + ($pinW - $holeD)/2
    $holeBrush = New-Object System.Drawing.SolidBrush $brandDark
    $g.FillEllipse($holeBrush, $holeX, $holeY, $holeD, $holeD)

    # 원화 기호
    $wonSize = [float]($holeD * 0.78)
    $font = New-Object System.Drawing.Font('Malgun Gothic', $wonSize, [System.Drawing.FontStyle]::Bold,
             [System.Drawing.GraphicsUnit]::Pixel)
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'
    $holeRect = New-Object System.Drawing.RectangleF($holeX, $holeY, $holeD, $holeD)
    $g.DrawString([char]0x20A9, $font, $white, $holeRect, $fmt)

    # 하단 라벨 "공시지가"
    $labelSize = [float]($inner * 0.155)
    $lf = New-Object System.Drawing.Font('Malgun Gothic', $labelSize, [System.Drawing.FontStyle]::Bold,
           [System.Drawing.GraphicsUnit]::Pixel)
    $lrect = New-Object System.Drawing.RectangleF($pad, ($pad + $inner*0.70), $inner, ($inner*0.30))
    $accentBrush = New-Object System.Drawing.SolidBrush $accent
    $g.DrawString('공시지가', $lf, $accentBrush, $lrect, $fmt)

    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)

    $g.Dispose(); $bmp.Dispose(); $brush.Dispose(); $white.Dispose()
    $holeBrush.Dispose(); $accentBrush.Dispose(); $font.Dispose(); $lf.Dispose()
    Write-Host ("생성: {0}  ({1}x{1}, {2} bytes)" -f $path, $size, (Get-Item $path).Length)
}

# PWA / 런처용 (모서리 둥근 일반 아이콘)
New-Icon 192 0.12 0.22 (Join-Path $OutDir 'icon-192.png')
New-Icon 512 0.12 0.22 (Join-Path $OutDir 'icon-512.png')
# maskable — 배경 꽉 채우고 내용은 안전영역 안으로
New-Icon 512 0.20 0.0  (Join-Path $OutDir 'icon-maskable-512.png')
# 안드로이드 런처 밀도별
New-Icon  48 0.12 0.22 (Join-Path $OutDir 'ic_launcher-mdpi.png')
New-Icon  72 0.12 0.22 (Join-Path $OutDir 'ic_launcher-hdpi.png')
New-Icon  96 0.12 0.22 (Join-Path $OutDir 'ic_launcher-xhdpi.png')
New-Icon 144 0.12 0.22 (Join-Path $OutDir 'ic_launcher-xxhdpi.png')
New-Icon 192 0.12 0.22 (Join-Path $OutDir 'ic_launcher-xxxhdpi.png')

Write-Host "`n완료: $OutDir"
