import AVFoundation
import Speech

/// One sentence heard in a track, with where it sits in the recording.
struct HeardLine: Codable, Sendable {
  let start: Double
  let end: Double
  let text: String
}

/// Apple's on-device speech recognition (SpeechAnalyzer, macOS 26).
///
/// Why this and not the browser's: it works on a FILE, after the call, with
/// no time limit and no network. The words never leave this Mac. It needs no
/// permission prompt; the first use downloads the English model once.
enum Transcriber {
  static func transcribe(_ url: URL) async throws -> [HeardLine] {
    guard FileManager.default.fileExists(atPath: url.path) else { return [] }
    let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale.current)
      ?? Locale(identifier: "en-US")
    let transcriber = SpeechTranscriber(locale: locale, transcriptionOptions: [], reportingOptions: [], attributeOptions: [.audioTimeRange])
    if let install = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
      try await install.downloadAndInstall()
    }
    let file = try AVAudioFile(forReading: url)
    let analyzer = SpeechAnalyzer(modules: [transcriber])
    let collect = Task { () -> [HeardLine] in
      var lines: [HeardLine] = []
      for try await r in transcriber.results {
        let text = String(r.text.characters).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { continue }
        let s = r.range.start.seconds, e = (r.range.start + r.range.duration).seconds
        lines.append(HeardLine(start: s.isFinite ? s : 0, end: e.isFinite ? e : s, text: text))
      }
      return lines
    }
    if let end = try await analyzer.analyzeSequence(from: file) {
      try await analyzer.finalizeAndFinish(through: end)
    } else {
      await analyzer.cancelAndFinishNow()
    }
    return try await collect.value
  }
}
