# Generate README images for FightWorld (ASCII-only script; Chinese text comes from UTF-8 JSON)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = 'F:/Cocos Dashboard/projects/FightWorld'
$res  = "$root/assets/resources"
$out  = "$root/docs/images"
$jsonPath = 'F:/WorkBuddy/2026-09-01-22-49-13/fightworld_balance/banner_text.json'
$t = [IO.File]::ReadAllText($jsonPath, [Text.Encoding]::UTF8) | ConvertFrom-Json

if (-not (Test-Path $out)) { New-Item -ItemType Directory -Path $out | Out-Null }

function New-Graphics([System.Drawing.Bitmap]$b) {
    $g = [System.Drawing.Graphics]::FromImage($b)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    return $g
}

function Draw-Cover([System.Drawing.Graphics]$g, [System.Drawing.Image]$img, [int]$W, [int]$H) {
    $scale = [Math]::Max($W / $img.Width, $H / $img.Height)
    $dw = [int]([Math]::Round($img.Width * $scale))
    $dh = [int]([Math]::Round($img.Height * $scale))
    $x = [int]([Math]::Round(($W - $dw) / 2))
    $y = [int]([Math]::Round(($H - $dh) / 2))
    $g.DrawImage($img, $x, $y, $dw, $dh)
}

function Draw-Icon([System.Drawing.Graphics]$g, [string]$path, [int]$x, [int]$y, [int]$size) {
    $img = [System.Drawing.Image]::FromFile($path)
    try { $g.DrawImage($img, $x, $y, $size, $size) } finally { $img.Dispose() }
}

function Draw-ShadowText([System.Drawing.Graphics]$g, [string]$s, [System.Drawing.Font]$f, [System.Drawing.Brush]$b, [float]$x, [float]$y) {
    $shadow = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(160, 0, 0, 0))
    $g.DrawString($s, $f, $shadow, $x + 3, $y + 3)
    $g.DrawString($s, $f, $b, $x, $y)
    $shadow.Dispose()
}

# ---------- 1. banner.png (1200x630) ----------
$W = 1200; $H = 630
$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = New-Graphics $bmp

$bgPath = "$res/level_bg/level08_720x1280.png"
if (-not (Test-Path $bgPath)) { $bgPath = "$res/level_bg/level01_720x1280.png" }
$bg = [System.Drawing.Image]::FromFile($bgPath)
Draw-Cover $g $bg $W $H
$bg.Dispose()

$overlay = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(115, 0, 0, 0))
$g.FillRectangle($overlay, 0, 0, $W, $H)
$overlay.Dispose()

# monsters on the right
Draw-Icon $g "$res/monsters/m02_boss.png" 770 100 150
Draw-Icon $g "$res/monsters/m05_boss.png" 920 170 195
Draw-Icon $g "$res/monsters/m08_boss.png" 850 370 235

# text
$fTitle = New-Object System.Drawing.Font('Microsoft YaHei', 78, [System.Drawing.FontStyle]::Bold)
$fSub   = New-Object System.Drawing.Font('Microsoft YaHei', 40, [System.Drawing.FontStyle]::Bold)
$fTag   = New-Object System.Drawing.Font('Microsoft YaHei', 21)
$fTag2  = New-Object System.Drawing.Font('Microsoft YaHei', 20)
$gold   = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 214, 102))
$gray   = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(222, 222, 222))
$gray2  = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(190, 190, 190))

$whiteBrush = [System.Drawing.Brushes]::White
Draw-ShadowText $g $t.title $fTitle $whiteBrush 58 150
Draw-ShadowText $g $t.sub   $fSub   $gold 62 285
Draw-ShadowText $g $t.tag   $fTag   $gray 64 365
Draw-ShadowText $g $t.tag2  $fTag2  $gray2 64 400

# legendary equipment row
for ($i = 0; $i -lt 6; $i++) {
    $p = $t.partFiles[$i]
    $path = "$res/equip_icons/${p}_legendary.png"
    if (Test-Path $path) { Draw-Icon $g $path (60 + $i * 108) 465 96 }
}

$fTitle.Dispose(); $fSub.Dispose(); $fTag.Dispose(); $fTag2.Dispose()
$gold.Dispose(); $gray.Dispose(); $gray2.Dispose()
$g.Dispose()
$bmp.Save("$out/banner.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host 'banner.png OK'

# ---------- 2. equips.png (6 parts x 5 qualities) ----------
$icon = 120; $gap = 10; $m = 20; $labelW = 96; $labelH = 44
$gw = $m + $labelW + 6 * ($icon + $gap) + $m
$gh = $m + $labelH + 5 * ($icon + $gap) + $m
$bmp = New-Object System.Drawing.Bitmap($gw, $gh)
$g = New-Graphics $bmp
$clear = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 24, 24, 28))
$g.FillRectangle($clear, 0, 0, $gw, $gh)
$clear.Dispose()

$fLabel = New-Object System.Drawing.Font('Microsoft YaHei', 16, [System.Drawing.FontStyle]::Bold)
$qColors = @(
    ([System.Drawing.Color]::FromArgb(165,165,165)),
    ([System.Drawing.Color]::FromArgb( 80,200, 90)),
    ([System.Drawing.Color]::FromArgb( 80,130,235)),
    ([System.Drawing.Color]::FromArgb(185, 80,230)),
    ([System.Drawing.Color]::FromArgb(250,160, 40))
)

# column headers (parts)
for ($c = 0; $c -lt 6; $c++) {
    $x = $m + $labelW + $c * ($icon + $gap)
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = [System.Drawing.StringAlignment]::Center
    $whiteBrush2 = [System.Drawing.Brushes]::White
    $g.DrawString($t.parts[$c], $fLabel, $whiteBrush2, $x, $m + 8, $fmt)
    $fmt.Dispose()
}
# rows
for ($r = 0; $r -lt 5; $r++) {
    $y = $m + $labelH + $r * ($icon + $gap)
    $brush = New-Object System.Drawing.SolidBrush ($qColors[$r])
    $g.DrawString($t.qualities[$r], $fLabel, $brush, $m, $y + $icon / 2 - 14)
    $brush.Dispose()
    for ($c = 0; $c -lt 6; $c++) {
        $p = $t.partFiles[$c]; $q = $t.qualityFiles[$r]
        $path = "$res/equip_icons/${p}_${q}.png"
        if (Test-Path $path) { Draw-Icon $g $path ($m + $labelW + $c * ($icon + $gap)) $y $icon }
    }
}
$fLabel.Dispose(); $g.Dispose()
$bmp.Save("$out/equips.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host 'equips.png OK'

# ---------- 3. monsters.png (8 stages x minion/boss) ----------
$icon = 150; $gap = 10; $m = 20
$gw = $m + 8 * ($icon + $gap) + $m
$gh = $m + 2 * ($icon + $gap) + $m
$bmp = New-Object System.Drawing.Bitmap($gw, $gh)
$g = New-Graphics $bmp
$clear = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 24, 24, 28))
$g.FillRectangle($clear, 0, 0, $gw, $gh)
$clear.Dispose()
for ($i = 0; $i -lt 8; $i++) {
    $id = 'm{0:d2}' -f ($i + 1)
    Draw-Icon $g "$res/monsters/${id}_minion.png" ($m + $i * ($icon + $gap)) $m $icon
    Draw-Icon $g "$res/monsters/${id}_boss.png"   ($m + $i * ($icon + $gap)) ($m + $icon + $gap) $icon
}
$g.Dispose()
$bmp.Save("$out/monsters.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host 'monsters.png OK'

# ---------- 4. home page (use home bg as-is) ----------
Copy-Item "$res/game_home/game_home_bg.png" "$out/home.png" -Force
Write-Host 'home.png OK'

Write-Host 'ALL DONE'
