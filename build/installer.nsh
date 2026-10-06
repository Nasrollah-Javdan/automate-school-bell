; DS School Bell — custom NSIS installer behaviour.
;
; Auto-start is registered with the Windows Run key at install time, and the
; app's own settings screen keeps it in sync afterwards. Uninstalling removes
; the entry and the shortcuts, but deliberately keeps the user's data.

!macro customInstall
  ; "Start with Windows" — enabled on install, toggleable from inside the app.
  ;
  ; The Run value name must stay identical to the one the app itself registers
  ; (AUTOSTART_ENTRY_NAME in src/main/system/autoLaunch.ts, which is
  ; app.getName()). A different name would leave Windows with two auto-start
  ; entries, and switching it off inside the app would not remove this one.
  ; ${PRODUCT_NAME} is electron-builder's productName, so both sides always match.
  CreateDirectory "$SMPROGRAMS\DS School Bell"
  CreateShortCut "$SMPROGRAMS\DS School Bell\DS School Bell.lnk" "$INSTDIR\DS School Bell.exe"

  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCT_NAME}" \
    '"$INSTDIR\DS School Bell.exe" --autostart'

  WriteRegStr HKCU "Software\DS School Bell" "InstallPath" "$INSTDIR"
  ; electron-builder defines constants in upper case (VERSION, not version).
  WriteRegStr HKCU "Software\DS School Bell" "Version" "${VERSION}"
!macroend

!macro customUnInstall
  ; Remove the auto-start entry and our own settings, but keep the user's
  ; schedules, sounds and log: deleting a school's data on uninstall would be
  ; destructive.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCT_NAME}"
  DeleteRegKey HKCU "Software\DS School Bell"
  Delete "$SMPROGRAMS\DS School Bell.lnk"
  RMDir "$SMPROGRAMS\DS School Bell"
  RMDir /r "$INSTDIR"
!macroend