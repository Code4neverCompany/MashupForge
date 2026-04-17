; MashupForge NSIS installer
; Wraps the portable build into an .exe installer.
;
; Usage (from WSL with nsis installed):
;   makensis -DAPP_DIR=/abs/path/to/portable/MashupForge \
;            -DOUT_EXE=/abs/path/to/MashupForge-setup.exe \
;            -DVERSION=0.1.5 \
;            scripts/installer.nsi
;
; Supports silent install with /S flag.

!ifndef APP_DIR
  !error "APP_DIR must be defined (portable build root)"
!endif
!ifndef OUT_EXE
  !error "OUT_EXE must be defined (output .exe path)"
!endif
!ifndef VERSION
  !define VERSION "0.1.5"
!endif

Unicode true
SetCompressor /SOLID lzma

Name "MashupForge ${VERSION}"
OutFile "${OUT_EXE}"
InstallDir "$LOCALAPPDATA\Programs\MashupForge"
InstallDirRegKey HKCU "Software\MashupForge" "InstallDir"
RequestExecutionLevel user
ShowInstDetails show
ShowUninstDetails show

VIProductVersion "0.1.5.0"
VIAddVersionKey "ProductName" "MashupForge"
VIAddVersionKey "CompanyName" "4neverCompany"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "FileDescription" "MashupForge Desktop Installer"
VIAddVersionKey "LegalCopyright" "Copyright (C) 4neverCompany"

Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Section "MashupForge" SecMain
  SectionIn RO
  SetOutPath "$INSTDIR"

  File /r "${APP_DIR}\*.*"

  ; Start Menu shortcut
  CreateDirectory "$SMPROGRAMS\MashupForge"
  CreateShortcut "$SMPROGRAMS\MashupForge\MashupForge.lnk" "$INSTDIR\start.bat" "" "$INSTDIR\start.bat" 0 SW_SHOWMINIMIZED
  CreateShortcut "$SMPROGRAMS\MashupForge\Uninstall MashupForge.lnk" "$INSTDIR\uninstall.exe"

  ; Desktop shortcut
  CreateShortcut "$DESKTOP\MashupForge.lnk" "$INSTDIR\start.bat" "" "$INSTDIR\start.bat" 0 SW_SHOWMINIMIZED

  ; Registry entries for Add/Remove Programs
  WriteRegStr HKCU "Software\MashupForge" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\MashupForge" "Version" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MashupForge" "DisplayName" "MashupForge"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MashupForge" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MashupForge" "Publisher" "4neverCompany"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MashupForge" "UninstallString" "$INSTDIR\uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MashupForge" "DisplayIcon" "$INSTDIR\start.bat"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MashupForge" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MashupForge" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MashupForge" "NoRepair" 1

  WriteUninstaller "$INSTDIR\uninstall.exe"
SectionEnd

Section "Uninstall"
  ; Kill any running instance
  ExecWait 'taskkill /F /IM node.exe /T'

  Delete "$SMPROGRAMS\MashupForge\MashupForge.lnk"
  Delete "$SMPROGRAMS\MashupForge\Uninstall MashupForge.lnk"
  RMDir "$SMPROGRAMS\MashupForge"
  Delete "$DESKTOP\MashupForge.lnk"

  RMDir /r "$INSTDIR"

  DeleteRegKey HKCU "Software\MashupForge"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MashupForge"
SectionEnd
