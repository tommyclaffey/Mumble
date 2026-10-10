import AVFoundation
import CoreAudio
import Foundation

/// Records a meeting as TWO tracks:
///
///   you.m4a     your microphone
///   others.m4a  what the Mac plays: everyone else in the call
///
/// Two tracks is the point. "Who said what" is easy when your voice and
/// theirs never share a file: every line in you.m4a is You, and only the
/// other side needs its voices told apart. (With speakers instead of
/// headphones, their voices leak into your mic a little; the tracks are
/// still mostly separate.)
///
/// Both record to raw audio (.caf) while the meeting runs, then become
/// .m4a when it stops. Saved to ~/Documents/Mumble/<date> <app>/, with a
/// meeting.json saying what it was.
final class Recorder: @unchecked Sendable {
  private(set) var folder: URL?
  private(set) var startedAt: Date?
  private var engine: AVAudioEngine?
  private var micFile: AVAudioFile?
  private var tap: SystemAudioTap?
  /// Paused: both tracks stop being written, together, so they stay in step
  /// and the transcript's times still line up. Read on the audio threads.
  private(set) var paused = false
  private var pausedAt: Date?
  private var pausedTotal: TimeInterval = 0
  /// Your mic's loudness right now, 0–1 — the widget's level meter.
  private(set) var micLevel: Float = 0

  func pause() {
    guard !paused, folder != nil else { return }
    paused = true; tap?.paused = true; pausedAt = Date(); micLevel = 0
  }

  func resume() {
    guard paused else { return }
    if let at = pausedAt { pausedTotal += Date().timeIntervalSince(at) }
    pausedAt = nil; paused = false; tap?.paused = false
  }

  static var root: URL {
    /* Testing: MUMBLE_ROOT points it at a scratch folder, never your real recordings. */
    if let test = ProcessInfo.processInfo.environment["MUMBLE_ROOT"] { return URL(fileURLWithPath: test, isDirectory: true) }
    return FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("Mumble", isDirectory: true)
  }

  /// Starts both tracks. Throws if the mic can't be opened; the system track
  /// is best-effort (without permission it records silence, and says so).
  func start(app: String?) throws {
    let stamp = DateFormatter()
    stamp.dateFormat = "yyyy-MM-dd HHmm"
    let dir = Self.root.appendingPathComponent("\(stamp.string(from: Date())) \(app ?? "Recording")", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

    let engine = AVAudioEngine()
    let input = engine.inputNode
    let format = input.outputFormat(forBus: 0)
    let mic = try AVAudioFile(forWriting: dir.appendingPathComponent("you.caf"), settings: format.settings)
    input.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, _ in
      guard let self, !self.paused else { return }
      try? mic.write(from: buffer)
      if let ch = buffer.floatChannelData, buffer.frameLength > 0 {
        var sum: Float = 0
        for i in 0..<Int(buffer.frameLength) { sum += ch[0][i] * ch[0][i] }
        let rms = (sum / Float(buffer.frameLength)).squareRoot()
        self.micLevel = min(1, rms * 9)
      }
    }
    try engine.start()

    tap = try? SystemAudioTap(writingTo: dir.appendingPathComponent("others.caf"))
    try? tap?.start()

    self.engine = engine
    micFile = mic
    folder = dir
    startedAt = Date()
    paused = false; pausedAt = nil; pausedTotal = 0
  }

  /// Stops, turns both tracks into .m4a, writes meeting.json. Returns the folder.
  func stop(app: String?) -> URL? {
    engine?.inputNode.removeTap(onBus: 0)
    engine?.stop()
    tap?.stop()
    let heardOthers = tap?.heardSound ?? false
    engine = nil
    micFile = nil
    tap = nil
    resume() // a pause running when Stop is pressed ends here, and isn't counted
    micLevel = 0
    guard let dir = folder, let started = startedAt else { return nil }
    folder = nil
    startedAt = nil

    for name in ["you", "others"] {
      let caf = dir.appendingPathComponent("\(name).caf")
      if (try? Self.toM4A(caf, dir.appendingPathComponent("\(name).m4a"))) != nil { try? FileManager.default.removeItem(at: caf) }
    }
    let info: [String: Any] = [
      "app": app ?? NSNull(),
      "startedAt": ISO8601DateFormatter().string(from: started),
      /* Time actually recorded: pauses aren't in the files, so not in the length. */
      "durationSeconds": Int(Date().timeIntervalSince(started) - pausedTotal),
      "tracks": ["you": "you.m4a", "others": "others.m4a"],
      /* false = the system track is silence: no permission, or nobody spoke. */
      "othersHeard": heardOthers,
    ]
    if let data = try? JSONSerialization.data(withJSONObject: info, options: [.prettyPrinted, .sortedKeys]) {
      try? data.write(to: dir.appendingPathComponent("meeting.json"))
    }
    return dir
  }

  /// Raw audio → AAC in an .m4a, mono, 48 kbps (~0.4 MB a minute, as the demo files).
  static func toM4A(_ from: URL, _ to: URL) throws {
    let src = try AVAudioFile(forReading: from)
    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: src.processingFormat.sampleRate,
      AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 48_000,
    ]
    let mono = AVAudioFormat(standardFormatWithSampleRate: src.processingFormat.sampleRate, channels: 1)!
    let dst = try AVAudioFile(forWriting: to, settings: settings, commonFormat: .pcmFormatFloat32, interleaved: false)
    let converter = AVAudioConverter(from: src.processingFormat, to: mono)!
    let chunk: AVAudioFrameCount = 16_384
    while src.framePosition < src.length {
      let inBuf = AVAudioPCMBuffer(pcmFormat: src.processingFormat, frameCapacity: chunk)!
      try src.read(into: inBuf, frameCount: chunk)
      let outBuf = AVAudioPCMBuffer(pcmFormat: mono, frameCapacity: chunk)!
      var fed = false
      try converter.convert(to: outBuf, error: nil) { _, status in
        if fed { status.pointee = .noDataNow; return nil }
        fed = true
        status.pointee = .haveData
        return inBuf
      }
      try dst.write(from: outBuf)
    }
  }
}

/// Everything the Mac plays, via a Core Audio process tap (macOS 14.2+).
/// Needs "System Audio Recording" permission; without it the tap delivers
/// silence, which `heardSound` reports.
final class SystemAudioTap: @unchecked Sendable {
  private var tapID = AudioObjectID(kAudioObjectUnknown)
  private var device = AudioObjectID(kAudioObjectUnknown)
  private var proc: AudioDeviceIOProcID?
  private let file: AVAudioFile
  private let format: AVAudioFormat
  private(set) var heardSound = false
  /// Set by Recorder.pause(): drop what arrives instead of writing it.
  var paused = false

  init(writingTo url: URL) throws {
    let desc = CATapDescription(stereoGlobalTapButExcludeProcesses: [])
    desc.uuid = UUID()
    desc.isPrivate = true
    desc.muteBehavior = .unmuted
    guard AudioHardwareCreateProcessTap(desc, &tapID) == noErr else { throw CocoaError(.featureUnsupported) }

    var asbd = AudioStreamBasicDescription()
    var size = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
    var a = Self.addr(kAudioTapPropertyFormat)
    AudioObjectGetPropertyData(tapID, &a, 0, nil, &size, &asbd)
    format = AVAudioFormat(streamDescription: &asbd)!
    file = try AVAudioFile(forWriting: url, settings: format.settings, commonFormat: .pcmFormatFloat32, interleaved: format.isInterleaved)

    /* The tap is read through a private aggregate device, clocked by the
       current output (speakers or headphones). */
    let output = Self.defaultOutputUID()
    let agg: [String: Any] = [
      kAudioAggregateDeviceNameKey: "Mumble",
      kAudioAggregateDeviceUIDKey: UUID().uuidString,
      kAudioAggregateDeviceMainSubDeviceKey: output,
      kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: output]],
      kAudioAggregateDeviceIsPrivateKey: true,
      kAudioAggregateDeviceIsStackedKey: false,
      kAudioAggregateDeviceTapAutoStartKey: true,
      kAudioAggregateDeviceTapListKey: [[kAudioSubTapUIDKey: desc.uuid.uuidString, kAudioSubTapDriftCompensationKey: true]],
    ]
    guard AudioHardwareCreateAggregateDevice(agg as CFDictionary, &device) == noErr else {
      AudioHardwareDestroyProcessTap(tapID)
      throw CocoaError(.featureUnsupported)
    }
  }

  func start() throws {
    let status = AudioDeviceCreateIOProcIDWithBlock(&proc, device, nil) { [self] _, input, _, _, _ in
      guard !paused, let buf = AVAudioPCMBuffer(pcmFormat: format, bufferListNoCopy: input, deallocator: nil) else { return }
      try? file.write(from: buf)
      if !heardSound, let ch = buf.floatChannelData {
        for i in 0..<Int(buf.frameLength) where abs(ch[0][i]) > 0.001 { heardSound = true; break }
      }
    }
    guard status == noErr, AudioDeviceStart(device, proc) == noErr else { throw CocoaError(.featureUnsupported) }
  }

  func stop() {
    if let proc { AudioDeviceStop(device, proc); AudioDeviceDestroyIOProcID(device, proc) }
    AudioHardwareDestroyAggregateDevice(device)
    AudioHardwareDestroyProcessTap(tapID)
    proc = nil
  }

  private static func addr(_ s: AudioObjectPropertySelector) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress(mSelector: s, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
  }

  private static func defaultOutputUID() -> String {
    var a = addr(kAudioHardwarePropertyDefaultSystemOutputDevice)
    var dev = AudioObjectID(kAudioObjectUnknown)
    var size = UInt32(MemoryLayout<AudioObjectID>.size)
    AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &a, 0, nil, &size, &dev)
    var u = addr(kAudioDevicePropertyDeviceUID)
    var uid: Unmanaged<CFString>?
    size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    AudioObjectGetPropertyData(dev, &u, 0, nil, &size, &uid)
    return (uid?.takeRetainedValue() as String?) ?? ""
  }
}
