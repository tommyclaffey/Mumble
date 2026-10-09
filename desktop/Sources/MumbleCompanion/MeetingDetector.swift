import AppKit
import CoreAudio

/// "Is a meeting happening?" — answered by who is using the microphone.
///
/// macOS (14+) lists every process using audio and says which are using
/// INPUT. A meeting app turns the mic on when a call starts and off when it
/// ends, so that's the signal: no window reading, no calendar access.
///
/// Only meeting apps and browsers count (Meet runs in a browser). Anything
/// else using the mic — dictation, Siri, a voice memo — isn't a meeting.
/// It has to stay on for a few seconds, so a blip never lights the icon.
struct MeetingApp: Hashable {
  let bundleID: String
  let name: String
}

@MainActor
final class MeetingDetector {
  /// Called when the meeting app changes (nil = no meeting).
  var onChange: ((MeetingApp?) -> Void)?
  private(set) var current: MeetingApp?
  private var timer: Timer?
  private var seen: [String: Date] = [:]
  private var gone: Date?

  /* Bundle IDs, matched by prefix (Chrome's mic runs in "com.google.Chrome.helper";
     Safari's in WebKit's own process). */
  static let meetingApps: [(prefix: String, name: String)] = [
    ("us.zoom.xos", "Zoom"), ("com.microsoft.teams", "Teams"), ("com.apple.FaceTime", "FaceTime"),
    ("com.tinyspeck.slackmacgap", "Slack"), ("com.hnc.Discord", "Discord"), ("com.cisco.webex", "Webex"),
    ("com.webex", "Webex"), ("com.google.Chrome", "Chrome"), ("com.apple.Safari", "Safari"),
    ("com.apple.WebKit", "Safari"), ("company.thebrowser", "Arc"), ("com.brave.Browser", "Brave"),
    ("org.mozilla.firefox", "Firefox"), ("com.microsoft.edgemac", "Edge"),
  ]
  static let holdOn: TimeInterval = 3   // seconds on before it counts
  static let holdOff: TimeInterval = 5  // seconds off before the meeting is over

  func start() {
    timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
      MainActor.assumeIsolated { self?.poll() }
    }
    poll()
  }

  private func poll() {
    let now = Date()
    let users = Set(AudioProcesses.micUsers(excluding: getpid()).compactMap(Self.meetingApp))
    for app in users where seen[app.bundleID] == nil { seen[app.bundleID] = now }
    seen = seen.filter { id, _ in users.contains { $0.bundleID == id } }
    let steady = users.first { now.timeIntervalSince(seen[$0.bundleID] ?? now) >= Self.holdOn }

    if let steady, steady != current {
      gone = nil
      current = steady
      onChange?(steady)
    } else if current != nil, !users.contains(where: { $0.bundleID == current?.bundleID }) {
      if gone == nil { gone = now }
      if now.timeIntervalSince(gone!) >= Self.holdOff {
        current = nil
        gone = nil
        onChange?(nil)
      }
    } else {
      gone = nil
    }
  }

  /// `--detect-any` (testing): every app using the mic counts as a meeting.
  static let detectAny = CommandLine.arguments.contains("--detect-any")

  static func meetingApp(_ bundleID: String) -> MeetingApp? {
    if detectAny { return MeetingApp(bundleID: bundleID.isEmpty ? "test" : bundleID, name: bundleID.isEmpty ? "Test" : bundleID) }
    guard let m = meetingApps.first(where: { bundleID.hasPrefix($0.prefix) }) else { return nil }
    return MeetingApp(bundleID: m.prefix, name: m.name)
  }
}

/// The Core Audio side: every process using audio, and which use the mic.
enum AudioProcesses {
  static func micUsers(excluding mine: pid_t) -> [String] {
    processObjects().filter { isRunningInput($0) && pid($0) != mine }.map(bundleID)
  }

  private static func addr(_ s: AudioObjectPropertySelector) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress(mSelector: s, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
  }

  private static func processObjects() -> [AudioObjectID] {
    var a = addr(kAudioHardwarePropertyProcessObjectList)
    var size: UInt32 = 0
    let sys = AudioObjectID(kAudioObjectSystemObject)
    guard AudioObjectGetPropertyDataSize(sys, &a, 0, nil, &size) == noErr else { return [] }
    var ids = [AudioObjectID](repeating: 0, count: Int(size) / MemoryLayout<AudioObjectID>.size)
    guard AudioObjectGetPropertyData(sys, &a, 0, nil, &size, &ids) == noErr else { return [] }
    return ids
  }

  private static func isRunningInput(_ id: AudioObjectID) -> Bool {
    var a = addr(kAudioProcessPropertyIsRunningInput)
    var on: UInt32 = 0
    var size = UInt32(MemoryLayout<UInt32>.size)
    return AudioObjectGetPropertyData(id, &a, 0, nil, &size, &on) == noErr && on != 0
  }

  private static func pid(_ id: AudioObjectID) -> pid_t {
    var a = addr(kAudioProcessPropertyPID)
    var p: pid_t = -1
    var size = UInt32(MemoryLayout<pid_t>.size)
    _ = AudioObjectGetPropertyData(id, &a, 0, nil, &size, &p)
    return p
  }

  private static func bundleID(_ id: AudioObjectID) -> String {
    var a = addr(kAudioProcessPropertyBundleID)
    var name: Unmanaged<CFString>?
    var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    guard AudioObjectGetPropertyData(id, &a, 0, nil, &size, &name) == noErr, let n = name else { return "" }
    return n.takeRetainedValue() as String
  }
}
