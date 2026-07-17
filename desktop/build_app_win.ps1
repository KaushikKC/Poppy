# Build dist\Poppys\Poppys.exe with PyInstaller (Windows).
#
# Usage (from the repo root, in PowerShell):
#   .\desktop\build_app_win.ps1
#
# The bundle includes torch + llama.cpp + transformers, so the build needs a lot of
# scratch space (build\ + dist\ can hit ~10 GB combined). Guarded below.
# After it builds, sign the .exe + wrap it in an installer (see DESKTOP_PACKAGING W7/W8).

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

# -- Guard: free disk -----------------------------------------------------------
$drive = (Get-Item $Root).PSDrive.Name
$freeGB = [math]::Floor((Get-PSDrive $drive).Free / 1GB)
if ($freeGB -lt 15) {
    Write-Host "Only $freeGB GB free on drive $drive`: — the build needs ~15 GB of scratch space."
    Write-Host "Free up space and re-run."
    exit 1
}

# -- Install deps (Windows set) + PyInstaller -----------------------------------
python -c "import PyInstaller" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing PyInstaller..."
    python -m pip install pyinstaller
}
Write-Host "Ensuring Windows dependencies are installed..."
python -m pip install -r backend\requirements-win.txt

# -- Icon present? --------------------------------------------------------------
if (-not (Test-Path "desktop\icons\poppys.ico")) {
    Write-Host "Missing desktop\icons\poppys.ico — convert it from frontend\poppys-logo.png first"
    Write-Host "(e.g. an online PNG->ICO converter, or ImageMagick: magick poppys-logo.png -resize 256x256 poppys.ico)."
    exit 1
}

Write-Host "Building Poppys.exe (this takes several minutes)..."
python -m PyInstaller --noconfirm desktop\poppys_win.spec

Write-Host ""
Write-Host "Done -> dist\Poppys\Poppys.exe"
Write-Host "Smoke test:   .\dist\Poppys\Poppys.exe   (logs: %LOCALAPPDATA%\Poppys\Logs)"
Write-Host "Then: Authenticode-sign the .exe + build a signed installer (see DESKTOP_PACKAGING W7/W8)."
