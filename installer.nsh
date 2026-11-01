; Force install under Program Files (per-machine).
!macro preInit
  SetRegView 64
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$PROGRAMFILES64\FLYANS"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$PROGRAMFILES64\FLYANS"
!macroend

; After install: Desktop + Start Menu only from the installer .lnk (keeps AUMID + icon).
; NEVER touch User Pinned\TaskBar — that unpins FLYANS on Win11. See ICON-RULES.md.
!macro customInstall
  File /oname=$PLUGINSDIR\restore-icons.ps1 "${BUILD_RESOURCES_DIR}\restore-icons.ps1"
  CreateDirectory "$INSTDIR\resources\installer"
  CopyFiles /SILENT "$PLUGINSDIR\restore-icons.ps1" "$INSTDIR\resources\installer\restore-icons.ps1"
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\installer\restore-icons.ps1"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\RunOnce" "FLYANSRestoreIcons" 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\installer\restore-icons.ps1"'
!macroend

