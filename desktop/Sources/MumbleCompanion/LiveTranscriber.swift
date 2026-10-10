import AVFoundation
import Speech

/// Live, on-device transcription: feed it audio as it's recorded, and it
/// reports the words as they're said — first as a guess ("volatile"), then
/// settled ("final"). Apple's SpeechAnalyzer (macOS 26): no network, no
/// permission prompt beyond the mic the audio already came from.
///
/// Used twice: the live transcript while a call records (one per track),
/// and the 🎤 dictation buttons in the Mumble window.
///
/// Times are seconds of audio fed so far. Paused audio is never fed, and is
/// never written to the files either, so live times line up with the saved
/// recording.
final class LiveTranscriber: @unchecked Sendable {
  struct Segment: Sendable { let start: Double; let text: String; let final: Bool }

  /// Everything settled so far, then the guess in progress (if any). On the main thread.
  var onUpdate: (@MainActor ([Segment]) -> Void)?

  private let queue = DispatchQueue(label: "mumble.live")
  private var continuation: AsyncStream<AnalyzerInput>.Continuation?
  private var analyzer: SpeechAnalyzer?
  private var target: AVAudioFormat?
  private var converter: AVAudioConverter?
  private var results: Task<Void, Never>?
  private var finals: [Segment] = []
  private var guess: Segment?

  func start() async throws {
    let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale.current) ?? Locale(identifier: "en-US")
    let transcriber = SpeechTranscriber(locale: locale, transcriptionOptions: [],
                                        reportingOptions: [.volatileResults, .fastResults], attributeOptions: [.audioTimeRange])
    if let install = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
      try await install.downloadAndInstall()
    }
    target = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber])
    let (stream, cont) = AsyncStream<AnalyzerInput>.makeStream()
    continuation = cont
    let analyzer = SpeechAnalyzer(modules: [transcriber])
    self.analyzer = analyzer
    results = Task { [weak self] in
      do {
        for try await r in transcriber.results {
          guard let self else { return }
          let text = String(r.text.characters).trimmingCharacters(in: .whitespacesAndNewlines)
          let start = r.range.start.seconds.isFinite ? r.range.start.seconds : 0
          self.queue.sync {
            if r.isFinal {
              if !text.isEmpty { self.finals.append(Segment(start: start, text: text, final: true)) }
              self.guess = nil
            } else {
              self.guess = text.isEmpty ? nil : Segment(start: start, text: text, final: false)
            }
          }
          self.publish()
        }
      } catch { /* finished or cancelled */ }
    }
    try await analyzer.start(inputSequence: stream)
  }

  /// From any thread (the mic tap, the system-audio tap). Copied, then converted off that thread.
  func feed(_ buffer: AVAudioPCMBuffer) {
    guard continuation != nil, let copy = Self.copy(buffer) else { return }
    queue.async { [weak self] in self?.convertAndSend(copy) }
  }

  /// Settle whatever is still a guess, then stop.
  func finish() async {
    continuation?.finish()
    continuation = nil
    try? await analyzer?.finalizeAndFinishThroughEndOfInput()
    await results?.value
  }

  /// Stop now, dropping anything unsettled.
  func cancel() async {
    continuation?.finish()
    continuation = nil
    await analyzer?.cancelAndFinishNow()
    results?.cancel()
  }

  private func publish() {
    let all = queue.sync { finals + (guess.map { [$0] } ?? []) }
    let cb = onUpdate
    Task { @MainActor in cb?(all) }
  }

  private func convertAndSend(_ buf: AVAudioPCMBuffer) {
    guard let target, let continuation else { return }
    if buf.format == target { continuation.yield(AnalyzerInput(buffer: buf)); return }
    if converter == nil || converter!.inputFormat != buf.format { converter = AVAudioConverter(from: buf.format, to: target) }
    guard let converter else { return }
    let ratio = target.sampleRate / buf.format.sampleRate
    let cap = AVAudioFrameCount(Double(buf.frameLength) * ratio) + 64
    guard let out = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: cap) else { return }
    var fed = false
    var err: NSError?
    converter.convert(to: out, error: &err) { _, status in
      if fed { status.pointee = .noDataNow; return nil }
      fed = true; status.pointee = .haveData; return buf
    }
    if err == nil, out.frameLength > 0 { continuation.yield(AnalyzerInput(buffer: out)) }
  }

  static func copy(_ b: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
    guard b.frameLength > 0, let c = AVAudioPCMBuffer(pcmFormat: b.format, frameCapacity: b.frameLength) else { return nil }
    c.frameLength = b.frameLength
    let src = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: b.audioBufferList))
    let dst = UnsafeMutableAudioBufferListPointer(c.mutableAudioBufferList)
    for i in 0..<min(src.count, dst.count) {
      if let s = src[i].mData, let d = dst[i].mData { memcpy(d, s, Int(min(src[i].mDataByteSize, dst[i].mDataByteSize))) }
    }
    return c
  }

  /// Testing: plays a file through `feed` at real speed, printing what's heard.
  static func selfTest(_ path: String) async {
    let live = LiveTranscriber()
    var last = ""
    live.onUpdate = { segs in
      let line = segs.map { ($0.final ? "" : "~") + $0.text }.joined(separator: " | ")
      if line != last { print(String(format: "%5.1fs  %@", Date().timeIntervalSince1970.truncatingRemainder(dividingBy: 1000), line)); last = line; fflush(stdout) }
    }
    do {
      try await live.start()
      let file = try AVAudioFile(forReading: URL(fileURLWithPath: path))
      let chunk: AVAudioFrameCount = 4800
      while file.framePosition < file.length {
        guard let b = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: chunk) else { break }
        try file.read(into: b, frameCount: chunk)
        live.feed(b)
        try await Task.sleep(for: .milliseconds(Int(Double(b.frameLength) / file.processingFormat.sampleRate * 1000 / 4))) // 4× real speed
      }
      await live.finish()
      print("FINAL:"); for s in queueSnapshot(live) { print(String(format: "  %5.1f  %@", s.start, s.text)) }
    } catch { print("ERROR", error) }
  }
  private static func queueSnapshot(_ l: LiveTranscriber) -> [Segment] { l.queue.sync { l.finals } }
}
