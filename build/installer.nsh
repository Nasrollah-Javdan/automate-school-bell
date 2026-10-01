; DS School Bell — custom NSIS installer behaviour.
;
; Adds an explicit "Start with Windows" checkbox to the installer so the user
; can enable auto-start during setup, and keeps the shortcut tidy on uninstall.

!macro customHeader
  !insertmacro WIN32_UX_SHELL
!macroend

!macro preInit
  ; Load the registry value written by a previous installation so the checkbox
  ; is pre-selected for upgrades.
  WriteRegStr HKCU "Software\DS School Bell" "PreviousRun" "1"
!macroend

!macro customInstall
  ; "Start with Windows" — checked by default on a fresh installation.
  CreateDirectory "$SMPROGRAMS\DS School Bell"
  CreateShortCut "$SMPROGRAMS\DS School Bell\DS School Bell.lnk" "$INSTDIR\DS School Bell.exe"

  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "DSSchoolBell" \
    '"$INSTDIR\DS School Bell.exe" --autostart'

  WriteRegStr HKCU "Software\DS School Bell" "InstallPath" "$INSTDIR"
  WriteRegStr HKCU "Software\DS School Bell" "Version" "${version}"
!macroend

!macro customUnInstall
  ; Remove the auto-start entry and our own settings, but keep the user's
  ; schedules, sounds and log: deleting a school's data on uninstall would be
  ; destructive.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "DSSchoolBell"
  DeleteRegKey HKCU "Software\DS School Bell"
  Delete "$SMPROGRAMS\DS School Bell.lnk"
  RMDir "$SMPROGRAMS\DS School Bell"
  RMDir /r "$INSTDIR"
!macroend