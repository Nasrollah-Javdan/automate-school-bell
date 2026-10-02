/**
 * Test-only entry point: re-exports the real main-process modules so the
 * end-to-end test can drive them directly. Not part of the application.
 */
export { AppStore } from '../src/main/storage/appStore.js'
export { LogStore } from '../src/main/storage/logStore.js'
export { getDataDir, getLogFile, getSoundsDir, getStateFile } from '../src/main/storage/paths.js'
export { readJsonFile, writeJsonFileAtomic, fileExists, errorMessage } from '../src/main/storage/jsonFile.js'
export { isSoundAvailable, soundFilePath, isSupportedSoundFile } from '../src/main/storage/soundLibrary.js'
export { buildBackup, parseBackup, writeBackupFile, readBackupSafe } from '../src/main/storage/backupService.js'

export { SchedulerEngine } from '../src/main/scheduler/schedulerEngine.js'
export { AudioService } from '../src/main/audio/audioService.js'
export { registerAudioProtocol, registerAudioSchemePrivileges } from '../src/main/audio/audioProtocol.js'
export { AudioError, combinedVolume } from '../src/shared/audioPlayer.js'

export { StateService } from '../src/main/services/stateService.js'
export { SystemService } from '../src/main/services/systemService.js'
export { buildSnapshot } from '../src/main/services/snapshot.js'

export { WindowManager } from '../src/main/window/mainWindow.js'
export { TrayService } from '../src/main/tray/trayService.js'
export { ThemeService } from '../src/main/system/themeService.js'
export { setAutoLaunch, isAutoLaunchEnabled, launchedAtStartup } from '../src/main/system/autoLaunch.js'

export { parseAppState, sanitizeBell, sanitizeSettings, parseLogEntries } from '../src/shared/validate.js'
export { createDefaultState } from '../src/shared/defaults.js'
export { buildTodayView, resolveDayPlan } from '../src/shared/today.js'
export { translate, MESSAGES, directionOf, logEntryText } from '../src/i18n/index.js'
export { toJalali, toGregorian, formatJalali, jalaliKey } from '../src/utils/jalali.js'
export { bellOccurrenceId, formatClockTime, formatCountdown } from '../src/utils/time.js'