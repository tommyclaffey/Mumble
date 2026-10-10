import AVFoundation
import Foundation

/// The recordings folder as Mumble sees it: each call is a folder in
/// ~/Documents/Mumble with you.m4a + others.m4a (from Recorder), and after
/// `finish` also:
///
///   mix.m4a          both tracks as one — what the player plays
///   transcript.json  what was said on each track, with times
///   imported         written once the Mumble window has saved it as a
///                    meeting. Until then it's "pending", so a call recorded
///                    while the window was closed still arrives next time.
enum Library {
  struct Transcript: Codable {
    let id: String
    /// "note" (just you) or "meeting". Older calls have none: meeting.
    var kind: String? = "meeting"
    let app: String?
    let startedAt: String
    let durationSeconds: Int
    let othersHeard: Bool
    let you: [HeardLine]
    let others: [HeardLine]
  }

  struct Info: Decodable {
    let app: String?
    let startedAt: String
    let durationSeconds: Int
    let othersHeard: Bool?
    let kind: String?
  }

  static var root: URL { Recorder.root }

  static func folders() -> [URL] {
    let items = (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
    return items.filter { $0.hasDirectoryPath }.sorted { $0.lastPathComponent < $1.lastPathComponent }
  }

  static func transcript(in dir: URL) -> Transcript? {
    guard let data = try? Data(contentsOf: dir.appendingPathComponent("transcript.json")) else { return nil }
    return try? JSONDecoder().decode(Transcript.self, from: data)
  }

  static func folder(for id: String) -> URL? {
    folders().first { transcript(in: $0)?.id == id }
  }

  /// Finished calls the window hasn't saved yet.
  static func pending() -> [Transcript] {
    folders().filter { !FileManager.default.fileExists(atPath: $0.appendingPathComponent("imported").path) }
      .compactMap(transcript(in:))
  }

  static func markImported(_ id: String) -> Bool {
    guard let dir = folder(for: id) else { return false }
    return FileManager.default.createFile(atPath: dir.appendingPathComponent("imported").path, contents: Data())
  }

  /// Calls recorded but never finished (the app quit mid-save).
  static func unfinished() -> [URL] {
    folders().filter {
      FileManager.default.fileExists(atPath: $0.appendingPathComponent("meeting.json").path)
        && !FileManager.default.fileExists(atPath: $0.appendingPathComponent("transcript.json").path)
    }
  }

  /// Mixes, transcribes and writes transcript.json. Returns the call's id.
  static func finish(_ dir: URL) async throws -> String {
    let data = try Data(contentsOf: dir.appendingPathComponent("meeting.json"))
    let info = try JSONDecoder().decode(Info.self, from: data)
    let started = ISO8601DateFormatter().date(from: info.startedAt) ?? Date()
    let id = "d\(Int(started.timeIntervalSince1970 * 1000))"
    let you = dir.appendingPathComponent("you.m4a"), others = dir.appendingPathComponent("others.m4a")
    let heard = info.othersHeard ?? true

    try await mix([you] + (heard ? [others] : []), to: dir.appendingPathComponent("mix.m4a"))
    let yourLines = (try? await Transcriber.transcribe(you)) ?? []
    let theirLines = heard ? ((try? await Transcriber.transcribe(others)) ?? []) : []

    let t = Transcript(id: id, kind: info.kind ?? "meeting", app: info.app, startedAt: info.startedAt, durationSeconds: info.durationSeconds,
                       othersHeard: heard, you: yourLines, others: theirLines)
    let enc = JSONEncoder()
    enc.outputFormatting = [.prettyPrinted, .sortedKeys]
    try enc.encode(t).write(to: dir.appendingPathComponent("transcript.json"))
    return id
  }

  /// Both tracks laid over each other, from 0, as one .m4a.
  static func mix(_ inputs: [URL], to out: URL) async throws {
    let existing = inputs.filter { FileManager.default.fileExists(atPath: $0.path) }
    try? FileManager.default.removeItem(at: out)
    if existing.count == 1 { try FileManager.default.copyItem(at: existing[0], to: out); return }
    let comp = AVMutableComposition()
    for url in existing {
      let asset = AVURLAsset(url: url)
      guard let src = try await asset.loadTracks(withMediaType: .audio).first else { continue }
      let range = try await src.load(.timeRange)
      let track = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
      try track?.insertTimeRange(range, of: src, at: .zero)
    }
    guard let export = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetAppleM4A) else {
      throw NSError(domain: "Mumble", code: 1, userInfo: [NSLocalizedDescriptionKey: "Couldn’t mix the tracks"])
    }
    try await export.export(to: out, as: .m4a)
  }
}
