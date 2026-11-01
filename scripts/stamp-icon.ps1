# Embed assets\icon.ico into win-unpacked\FLYANS.exe (electron-builder skips this when signAndEditExecutable=false).
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$exe = Join-Path $root 'dist\win-unpacked\FLYANS.exe'
$ico = Join-Path $root 'assets\icon.ico'
$rcedit = Join-Path $env:TEMP 'rcedit-x64.exe'
if (-not (Test-Path $exe)) { throw "Missing $exe — run electron-builder --dir first" }
if (-not (Test-Path $ico)) { throw "Missing $ico" }
if (-not (Test-Path $rcedit)) {
  Invoke-WebRequest -Uri 'https://github.com/electron/rcedit/releases/download/v2.0.0/rcedit-x64.exe' -OutFile $rcedit -UseBasicParsing
}
& $rcedit $exe --set-icon $ico
if ($LASTEXITCODE -ne 0) { throw "rcedit failed exit $LASTEXITCODE" }
Write-Host "Stamped icon into $exe"
