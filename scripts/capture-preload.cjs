
const snapshot = {"state":{"version":1,"settings":{"language":"fa","theme":"light","uiScale":100,"startWithWindows":true,"startMinimized":false,"minimizeToTray":true,"closeToTray":true,"volume":80,"defaultSoundId":"snd1","missedBellPolicy":"ignore","missedGraceMinutes":10,"activeScheduleId":"s1"},"schedules":[{"id":"s1","name":"برنامه عادی","bells":[{"id":"b1","time":"06:22","title":"شروع مدرسه","soundId":null,"enabled":true,"note":""},{"id":"b2","time":"07:07","title":"زنگ اول","soundId":null,"enabled":true,"note":""},{"id":"b3","time":"07:52","title":"زنگ دوم","soundId":"snd2","enabled":true,"note":""},{"id":"b4","time":"08:22","title":"زنگ تفریح","soundId":null,"enabled":true,"note":""},{"id":"b5","time":"09:07","title":"زنگ سوم","soundId":"snd3","enabled":false,"note":"مطالعه"}],"activeWeekdays":[1,2,3,4,5,6]},{"id":"s2","name":"برنامه امتحانات","bells":[{"id":"b1","time":"06:22","title":"شروع مدرسه","soundId":null,"enabled":true,"note":""},{"id":"b2","time":"07:07","title":"زنگ اول","soundId":null,"enabled":true,"note":""},{"id":"b3","time":"07:52","title":"زنگ دوم","soundId":"snd2","enabled":true,"note":""}],"activeWeekdays":[0,1,2,3]}],"activeScheduleId":"s1","sounds":[{"id":"snd1","name":"زنگ پیش‌فرض","source":"library","fileName":"school-bell.mp3","externalPath":null,"volume":100,"durationSec":14,"createdAt":0},{"id":"snd2","name":"زنگ مدرسه","source":"library","fileName":"school.mp3","externalPath":null,"volume":85,"durationSec":4,"createdAt":0},{"id":"snd3","name":"زنگ تفریح","source":"external","fileName":null,"externalPath":"D:\\sounds\\break.wav","volume":70,"durationSec":6,"createdAt":0}],"systemMode":"paused","firedIds":[]},"dayInfo":{"kind":"normal","activeWeekdays":[1,2,3,4,5,6]},"todayBells":[],"effectiveDark":false,"appVersion":"1.0.0","soundsDir":"C:\\Users\\school\\AppData\\Roaming\\DS School Bell\\sounds","dataDir":"C:\\Users\\school\\AppData\\Roaming\\DS School Bell","soundFiles":{"snd1":{"path":"C:/sounds/school-bell.mp3","available":true},"snd2":{"path":"C:/sounds/school.mp3","available":true},"snd3":{"path":"D:/sounds/break.wav","available":false}}}
const logs = [{"id":"l1","at":1790915195455,"level":"success","code":"log.bell.played","params":{"title":"زنگ دوم","time":"09:30"}},{"id":"l2","at":1790915170455,"level":"info","code":"log.system.test","params":{}},{"id":"l3","at":1790915080455,"level":"error","code":"log.bell.playbackFailed","params":{"title":"زنگ اول","error":"دستگاه صوتی در دسترس نیست"}},{"id":"l4","at":1790914900455,"level":"warn","code":"log.bell.missed","params":{"title":"زنگ تفریح","time":"10:15"}},{"id":"l5","at":1790914300455,"level":"info","code":"log.schedule.switched","params":{"name":"برنامه عادی"}}]
const same = () => Promise.resolve(snapshot)
const ok = (data) => Promise.resolve({ ok: true, data: data ?? null })
window.api = {
  getSnapshot: () => Promise.resolve(snapshot),
  getLogs: () => Promise.resolve(logs),
  updateSettings: same,
  setSystemMode: same,
  playTestBell: ok,
  stopAudio: () => Promise.resolve(),
  addBell: same,
  updateBell: same,
  removeBell: same,
  moveBell: same,
  createSchedule: same,
  renameSchedule: same,
  deleteSchedule: same,
  setActiveSchedule: same,
  updateScheduleDays: same,
  pickSoundFile: ok,
  importSound: ok,
  linkExternalSound: ok,
  probeSound: ok,
  playSound: ok,
  relinkSound: ok,
  updateSound: same,
  removeSound: same,
  setDefaultSound: same,
  clearLogs: () => Promise.resolve(),
  backupToFile: ok,
  restoreFromFile: ok,
  resetAll: same,
  revealDataFolder: () => Promise.resolve(),
  window: { minimize: () => Promise.resolve(), hide: () => Promise.resolve(), show: () => Promise.resolve() },
  on: () => () => {}
}
