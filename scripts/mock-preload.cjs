
const snapshot = {"state":{"version":1,"settings":{"language":"fa","theme":"light","uiScale":100,"startWithWindows":false,"startMinimized":false,"minimizeToTray":true,"closeToTray":true,"volume":80,"defaultSoundId":"snd1","missedBellPolicy":"ignore","missedGraceMinutes":10,"activeScheduleId":"s1"},"schedules":[{"id":"s1","name":"برنامه عادی","bells":[{"id":"b1","time":"08:00","title":"شروع مدرسه","soundId":null,"enabled":true,"note":""},{"id":"b2","time":"08:45","title":"زنگ اول","soundId":null,"enabled":true,"note":""},{"id":"b3","time":"09:30","title":"زنگ دوم","soundId":"snd2","enabled":true,"note":""},{"id":"b4","time":"10:15","title":"زنگ تفریح","soundId":null,"enabled":true,"note":""},{"id":"b5","time":"11:00","title":"زنگ سوم","soundId":null,"enabled":false,"note":"مطالعه"}],"activeWeekdays":[0,1,2,3,4]},{"id":"s2","name":"برنامه امتحانات","bells":[{"id":"b1","time":"08:00","title":"شروع مدرسه","soundId":null,"enabled":true,"note":""},{"id":"b2","time":"08:45","title":"زنگ اول","soundId":null,"enabled":true,"note":""},{"id":"b3","time":"09:30","title":"زنگ دوم","soundId":"snd2","enabled":true,"note":""}],"activeWeekdays":[0,1,2,3]}],"activeScheduleId":"s1","sounds":[{"id":"snd1","name":"زنگ پیش‌فرض","source":"library","fileName":"default-bell.wav","externalPath":null,"volume":100,"durationSec":3,"createdAt":0},{"id":"snd2","name":"زنگ مدرسه","source":"library","fileName":"school.mp3","externalPath":null,"volume":85,"durationSec":4,"createdAt":0},{"id":"snd3","name":"D:\\sounds\\break.wav","source":"external","fileName":null,"externalPath":"D:\\sounds\\break.wav","volume":70,"durationSec":6,"createdAt":0}],"holidays":[{"id":"h1","jalali":{"year":1405,"month":9,"day":2},"title":"تعطیلی مدرسه"},{"id":"h2","jalali":{"year":1404,"month":7,"day":1},"title":"بازگشایی مدارس"}],"systemMode":"active","firedIds":[]},"dayInfo":{"kind":"normal","holidayTitle":null,"activeWeekdays":[0,1,2,3,4]},"todayBells":[],"effectiveDark":false,"appVersion":"1.0.0","soundsDir":"C:\\Users\\school\\AppData\\Roaming\\DS School Bell\\sounds","dataDir":"C:\\Users\\school\\AppData\\Roaming\\DS School Bell","soundFiles":{"snd1":{"path":"C:/sounds/default-bell.wav","available":true},"snd2":{"path":"C:/sounds/school.mp3","available":true},"snd3":{"path":"D:/sounds/break.wav","available":false}}}
const logs = [{"id":"l1","at":1790879755860,"level":"success","code":"log.bell.played","params":{"title":"زنگ دوم","time":"09:30"}},{"id":"l2","at":1790879729860,"level":"info","code":"log.system.test","params":{}},{"id":"l3","at":1790879639860,"level":"error","code":"log.bell.playbackFailed","params":{"title":"زنگ اول","error":"file not found"}},{"id":"l4","at":1790879459860,"level":"warn","code":"log.bell.missed","params":{"title":"زنگ تفریح","time":"10:15"}},{"id":"l5","at":1790878859860,"level":"info","code":"log.schedule.switched","params":{"name":"برنامه عادی"}}]
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
  addHoliday: same,
  removeHoliday: same,
  clearLogs: () => Promise.resolve(),
  backupToFile: ok,
  restoreFromFile: ok,
  resetAll: same,
  revealDataFolder: () => Promise.resolve(),
  window: { minimize: () => Promise.resolve(), hide: () => Promise.resolve(), show: () => Promise.resolve() },
  on: () => () => {}
}
