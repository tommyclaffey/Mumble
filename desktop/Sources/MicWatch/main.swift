import CoreAudio
import Foundation

/// Spike 1 — "is a meeting happening?"
/// A meeting app (Zoom, Teams, Meet in Chrome, FaceTime…) turns the microphone
/// on. macOS 14+ lists every process using audio, and says which are using
/// INPUT — so we can tell that a meeting started, and in which app, without
/// reading any window or calendar.

func prop(_ selector: AudioObjectPropertySelector) -> AudioObjectPropertyAddress {
  AudioObjectPropertyAddress(mSelector: selector, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
}

func processes() -> [AudioObjectID] {
  var addr = prop(kAudioHardwarePropertyProcessObjectList)
  var size: UInt32 = 0
  guard AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size) == noErr else { return [] }
  var ids = [AudioObjectID](repeating: 0, count: Int(size) / MemoryLayout<AudioObjectID>.size)
  guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size, &ids) == noErr else { return [] }
  return ids
}

func isUsingMic(_ id: AudioObjectID) -> Bool {
  var addr = prop(kAudioProcessPropertyIsRunningInput)
  var on: UInt32 = 0
  var size = UInt32(MemoryLayout<UInt32>.size)
  return AudioObjectGetPropertyData(id, &addr, 0, nil, &size, &on) == noErr && on != 0
}

func bundleID(_ id: AudioObjectID) -> String {
  var addr = prop(kAudioProcessPropertyBundleID)
  var name: Unmanaged<CFString>?
  var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
  guard AudioObjectGetPropertyData(id, &addr, 0, nil, &size, &name) == noErr, let n = name else { return "?" }
  return n.takeRetainedValue() as String
}

func pid(_ id: AudioObjectID) -> pid_t {
  var addr = prop(kAudioProcessPropertyPID)
  var p: pid_t = -1
  var size = UInt32(MemoryLayout<pid_t>.size)
  _ = AudioObjectGetPropertyData(id, &addr, 0, nil, &size, &p)
  return p
}

/// A name a person recognises: the app's bundle ID, or — for a command-line
/// tool, which has none — its process name.
func name(_ id: AudioObjectID) -> String {
  let b = bundleID(id)
  if !b.isEmpty && b != "?" { return b }
  var buf = [CChar](repeating: 0, count: 256)
  proc_name(pid(id), &buf, UInt32(buf.count))
  return String(cString: buf).isEmpty ? "pid \(pid(id))" : String(cString: buf)
}

func micUsers() -> Set<String> {
  Set(processes().filter(isUsingMic).map(name))
}

let once = CommandLine.arguments.contains("--once")
var last = Set<String>()
repeat {
  let now = micUsers()
  if now != last || once {
    let stamp = ISO8601DateFormatter().string(from: Date())
    print(now.isEmpty ? "\(stamp)  mic: nobody" : "\(stamp)  mic in use by: \(now.sorted().joined(separator: ", "))")
    fflush(stdout)
    last = now
  }
  if !once { Thread.sleep(forTimeInterval: 1) }
} while !once
