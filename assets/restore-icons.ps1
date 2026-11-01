# Restore FLYANS Desktop + Start Menu shortcuts from the installer .lnk (keeps AUMID).
# Safe after Setup. Never rewrites .lnk with WScript.Shell. Never rcedits the EXE.
# NEVER touch User Pinned\TaskBar — that UNPINS FLYANS on Windows 11.
#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$exe = Join-Path $env:ProgramFiles 'FLYANS\FLYANS.exe'
$pd = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\FLYANS.lnk'
if (-not (Test-Path -LiteralPath $exe)) { throw "FLYANS.exe missing — install Setup first." }
if (-not (Test-Path -LiteralPath $pd)) { throw "Installer Start Menu shortcut missing at $pd" }

$sm = Join-Path $env:AppData 'Microsoft\Windows\Start Menu\Programs\FLYANS.lnk'
$desk = Join-Path $env:UserProfile 'Desktop\FLYANS.lnk'

Copy-Item -LiteralPath $pd -Destination $sm -Force
Copy-Item -LiteralPath $pd -Destination $desk -Force

# Soft icon refresh — do NOT kill explorer (that also drops pins).
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class FlyansShellNotify {
  [DllImport("shell32.dll")] public static extern void SHChangeNotify(int eventId, uint flags, IntPtr item1, IntPtr item2);
}
"@
[FlyansShellNotify]::SHChangeNotify(0x08000000, 0x1000, [IntPtr]::Zero, [IntPtr]::Zero)

$shell2 = New-Object -ComObject Shell.Application
$folder2 = $shell2.NameSpace((Split-Path $pd -Parent))
$item2 = $folder2.ParseName((Split-Path $pd -Leaf))
$aumid = $null
try { $aumid = $item2.ExtendedProperty('System.AppUserModel.ID') } catch {}
Write-Host "FLYANS Desktop + Start Menu restored."
Write-Host "  EXE   $exe"
Write-Host "  AUMID $aumid"
Write-Host "  Start $sm"
Write-Host "  Desk  $desk"
Write-Host "Taskbar pin not touched."
