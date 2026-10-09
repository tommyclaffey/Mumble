import AVFoundation
import CoreAudio
import Foundation

/// Spike 2 — "can we hear the other people?"
/// In a call, the other side comes out of the speakers. macOS 14.2+ can "tap"
/// that output (Core Audio process taps) — the sound the Mac plays, before it
/// reaches the speakers or headphones. Recording the mic gets YOU; this gets
/// THEM. Two separate tracks is also the easiest way to tell voices apart.
///
///   SystemTap <seconds> <out.wav>

let seconds = Double(CommandLine.arguments.dropFirst().first ?? "5") ?? 5
let outPath = CommandLine.arguments.dropFirst(2).first ?? "/tmp/system-tap.wav"

func check(_ s: OSStatus, _ what: String) {
  if s != noErr { FileHandle.standardError.write("\(what) failed: \(s)\n".data(using: .utf8)!); exit(1) }
}
func addr(_ sel: AudioObjectPropertySelector) -> AudioObjectPropertyAddress {
  AudioObjectPropertyAddress(mSelector: sel, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
}

/* 1 · A tap on everything the Mac plays (excluding nobody), private to us. */
let desc = CATapDescription(stereoGlobalTapButExcludeProcesses: [])
desc.uuid = UUID()
desc.isPrivate = true
desc.muteBehavior = .unmuted
var tap = AudioObjectID(kAudioObjectUnknown)
check(AudioHardwareCreateProcessTap(desc, &tap), "create tap")

var fmtAddr = addr(kAudioTapPropertyFormat)
var asbd = AudioStreamBasicDescription()
var size = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
check(AudioObjectGetPropertyData(tap, &fmtAddr, 0, nil, &size, &asbd), "tap format")

/* 2 · An aggregate device wrapping the tap, so we can read from it. Its
   clock comes from the current output device (speakers or headphones). */
var outAddr = addr(kAudioHardwarePropertyDefaultSystemOutputDevice)
var outDev = AudioObjectID(kAudioObjectUnknown)
size = UInt32(MemoryLayout<AudioObjectID>.size)
check(AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &outAddr, 0, nil, &size, &outDev), "default output")
var uidAddr = addr(kAudioDevicePropertyDeviceUID)
var outUID: Unmanaged<CFString>?
size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
check(AudioObjectGetPropertyData(outDev, &uidAddr, 0, nil, &size, &outUID), "output UID")
let outputUID = outUID!.takeRetainedValue() as String

let agg: [String: Any] = [
  kAudioAggregateDeviceMainSubDeviceKey: outputUID,
  kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: outputUID]],
  kAudioAggregateDeviceNameKey: "Mumble tap",
  kAudioAggregateDeviceUIDKey: UUID().uuidString,
  kAudioAggregateDeviceIsPrivateKey: true,
  kAudioAggregateDeviceIsStackedKey: false,
  kAudioAggregateDeviceTapAutoStartKey: true,
  kAudioAggregateDeviceTapListKey: [[kAudioSubTapUIDKey: desc.uuid.uuidString, kAudioSubTapDriftCompensationKey: true]],
]
var device = AudioObjectID(kAudioObjectUnknown)
check(AudioHardwareCreateAggregateDevice(agg as CFDictionary, &device), "create aggregate device")

/* 3 · Read buffers into a WAV file. */
let format = AVAudioFormat(streamDescription: &asbd)!
let file = try AVAudioFile(forWriting: URL(fileURLWithPath: outPath), settings: format.settings, commonFormat: .pcmFormatFloat32, interleaved: format.isInterleaved)
let sink = Sink(file: file, format: format)
var proc: AudioDeviceIOProcID?
check(AudioDeviceCreateIOProcIDWithBlock(&proc, device, nil, sink.block()), "io proc")
check(AudioDeviceStart(device, proc), "start")
print("tapping system audio for \(seconds)s at \(Int(asbd.mSampleRate)) Hz, \(asbd.mChannelsPerFrame) ch → \(outPath)")
Thread.sleep(forTimeInterval: seconds)
AudioDeviceStop(device, proc)
AudioDeviceDestroyIOProcID(device, proc!)
AudioHardwareDestroyAggregateDevice(device)
AudioHardwareDestroyProcessTap(tap)
print(String(format: "captured %.1fs, loudest sample %.3f %@", Double(sink.frames) / asbd.mSampleRate, sink.peak, sink.peak > 0.001 ? "(heard sound)" : "(silence — no permission, or nothing playing)"))
