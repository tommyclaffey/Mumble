import AVFoundation
import CoreAudio

/// Where the tapped audio goes. Lives outside main.swift on purpose: Swift 6
/// treats top-level code as main-thread-only, and the audio arrives on Core
/// Audio's real-time thread — touching main-thread state from there traps.
final class Sink: @unchecked Sendable {
  let file: AVAudioFile
  let format: AVAudioFormat
  private(set) var peak: Float = 0
  private(set) var frames: Int64 = 0

  init(file: AVAudioFile, format: AVAudioFormat) { self.file = file; self.format = format }

  func block() -> AudioDeviceIOBlock {
    { [self] _, input, _, _, _ in
      guard let buf = AVAudioPCMBuffer(pcmFormat: format, bufferListNoCopy: input, deallocator: nil) else { return }
      try? file.write(from: buf)
      frames += Int64(buf.frameLength)
      if let ch = buf.floatChannelData { for i in 0..<Int(buf.frameLength) { peak = max(peak, abs(ch[0][i])) } }
    }
  }
}
