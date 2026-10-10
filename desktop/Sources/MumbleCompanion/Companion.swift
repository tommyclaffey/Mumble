import AppKit
import AVFoundation
import SwiftUI

/// What the companion is doing — one place, so the floating icon and the
/// menu bar always say the same thing.
///
///   idle       a quiet mic in the corner. Click = record anyway.
///   meeting    a meeting app turned the mic on → the icon lights up and
///              says which app, with a Record button and a × for "not this
///              one". (Or it starts by itself,
///              if "Record meetings automatically" is on.)
///   recording  a live dot, the time and your mic level, with Pause and
///              Stop buttons. It also stops by itself a few seconds after the
///              meeting app lets go of the mic.
///   paused     nothing is being recorded; Resume or Stop.
///   saving     turning the two tracks into files, mixing them and
///              transcribing both on this Mac (seconds, not minutes).
///   saved      "Saved · Show": click opens the meeting in the Mumble
///              window. Fades back to idle.
///   problem    something needs you (the mic is off in Settings…). Click fixes it.
enum Phase: Equatable {
  case idle
  case meeting(MeetingApp)
  /// `since` is when it would have started had it never paused, so the
  /// time shown is always now − since.
  case recording(app: MeetingApp?, since: Date)
  case paused(app: MeetingApp?, elapsed: TimeInterval)
  case saving
  case saved(String)
  case problem(String)
}

@MainActor
final class Companion: ObservableObject {
  @Published private(set) var phase: Phase = .idle {
    didSet { if MeetingDetector.detectAny { print("phase:", phase); fflush(stdout) } }
  }
  @Published var autoRecord: Bool = UserDefaults.standard.bool(forKey: "autoRecord") {
    didSet { UserDefaults.standard.set(autoRecord, forKey: "autoRecord") }
  }
  private let detector = MeetingDetector()
  private let recorder = Recorder()
  private var meeting: MeetingApp?
  /// The meeting you said "not this one" to — quiet until it ends.
  private var dismissed: MeetingApp?
  /// A call is transcribed and ready for the window to save as a meeting.
  var onFinished: ((String) -> Void)?
  /// "Open" was clicked on a saved call.
  var onShow: ((String) -> Void)?
  /// For `--snapshots`: a fixed mic level instead of the real one.
  var previewLevel: Float?

  /// One line of the live transcript: who (your mic, or the call), when, what.
  struct LiveLine: Equatable { let who: String; let start: Double; let text: String; let final: Bool }
  /// What's being said, as it's said — both tracks, in time order.
  @Published private(set) var live: [LiveLine] = []
  /// "note" (just you) or "meeting" (you + the call) — for the recording in progress.
  @Published private(set) var kind = "meeting"
  /// While saving: "tracks" → "transcribe". The window shows these as steps.
  @Published private(set) var savingStep = "tracks"
  private var liveYou: [LiveLine] = [], liveThem: [LiveLine] = []
  private var transcribers: [LiveTranscriber] = []

  var isRecording: Bool { if case .recording = phase { return true }; return false }
  var isActive: Bool {
    switch phase { case .recording, .paused: return true; default: return false }
  }
  /// Your mic's loudness now, 0–1, for the level meter.
  var micLevel: Float { previewLevel ?? recorder.micLevel }

  /// For `--snapshots` only: show a state without it really happening.
  func preview(_ p: Phase) { phase = p }

  func start() {
    detector.onChange = { [weak self] app in self?.meetingChanged(app) }
    detector.start()
    /* A call whose saving was cut short (the app quit) is finished now. */
    Task {
      for dir in Library.unfinished() {
        if let id = try? await Library.finish(dir) { onFinished?(id) }
      }
    }
  }

  // MARK: the actions — one per button, so nothing has to guess

  /// Record. From the widget it's always a meeting (it's for calls); the
  /// window can ask for a note — just you, no call audio.
  func record(kind: String = "meeting") {
    switch phase {
    case .idle, .meeting, .saved, .problem: self.kind = kind == "note" ? "note" : "meeting"; startRecording()
    default: break
    }
  }

  /// Throw the recording away. Nothing is saved.
  func discard() {
    switch phase {
    case .recording, .paused: break
    default: return
    }
    stopLive()
    recorder.discard()
    live = []
    settle()
  }

  private func startLive() {
    liveYou = []; liveThem = []; live = []
    let you = LiveTranscriber()
    you.onUpdate = { [weak self] segs in self?.liveYou = segs.map { LiveLine(who: "you", start: $0.start, text: $0.text, final: $0.final) }; self?.mergeLive() }
    recorder.liveYou = you
    transcribers = [you]
    if kind == "meeting" {
      let them = LiveTranscriber()
      them.onUpdate = { [weak self] segs in self?.liveThem = segs.map { LiveLine(who: "them", start: $0.start, text: $0.text, final: $0.final) }; self?.mergeLive() }
      recorder.liveOthers = them
      transcribers.append(them)
    }
    /* If the live engine can't start, the recording still works: the full
       transcript is made from the files after Stop either way. */
    for t in transcribers { Task { try? await t.start() } }
  }

  private func stopLive() {
    recorder.liveYou = nil; recorder.liveOthers = nil
    let ts = transcribers; transcribers = []
    Task { for t in ts { await t.cancel() } }
  }

  private func mergeLive() {
    live = (liveYou + liveThem).sorted { $0.start < $1.start }
  }

  func pause() {
    guard case .recording(let app, let since) = phase else { return }
    recorder.pause()
    phase = .paused(app: app, elapsed: Date().timeIntervalSince(since))
  }

  func resume() {
    guard case .paused(let app, let elapsed) = phase else { return }
    recorder.resume()
    phase = .recording(app: app, since: Date().addingTimeInterval(-elapsed))
  }

  func stop() {
    let app: MeetingApp?
    switch phase {
    case .recording(let a, _), .paused(let a, _): app = a
    default: return
    }
    let recorder = self.recorder
    stopLive()
    savingStep = "tracks"
    phase = .saving
    DispatchQueue.global(qos: .userInitiated).async {
      let folder = recorder.stop(app: app?.name)
      Task { @MainActor in
        guard let folder else { self.phase = .idle; return }
        self.savingStep = "transcribe"
        guard let id = try? await Library.finish(folder) else {
          self.phase = .problem("Saved, but not transcribed")
          return
        }
        self.onFinished?(id)
        self.phase = .saved(id)
        /* "Saved" for a little while, then back to whatever is true now. */
        try? await Task.sleep(for: .seconds(10))
        if case .saved = self.phase { self.settle() }
      }
    }
  }

  func open(_ id: String) { onShow?(id); settle() }

  /// "Not this one": the meeting prompt goes away until that meeting ends.
  func dismissMeeting() {
    guard case .meeting(let app) = phase else { return }
    dismissed = app
    phase = .idle
  }

  func dismissSaved() { if case .saved = phase { settle() } }

  /// A mic problem opens the mic setting; anything else shows the files.
  func fixProblem() {
    guard case .problem(let why) = phase else { return }
    if why.localizedCaseInsensitiveContains("mic") {
      NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")!)
    } else {
      NSWorkspace.shared.open(Recorder.root)
    }
    settle()
  }

  /// The menu bar's single item: start, or stop and save.
  func tap() { isActive ? stop() : record() }

  /// Back to whatever is true now.
  private func settle() {
    if let m = meeting, m != dismissed { phase = .meeting(m) } else { phase = .idle }
  }

  private func meetingChanged(_ app: MeetingApp?) {
    meeting = app
    if app == nil { dismissed = nil }
    switch phase {
    case .recording(let recording, _), .paused(let recording, _):
      /* The meeting we're recording ended → stop and save by itself. */
      if app == nil, recording != nil { stop() }
    case .saving, .problem, .saved:
      break
    case .idle, .meeting:
      if let app, app != dismissed {
        phase = .meeting(app)
        if autoRecord { startRecording() }
      } else if case .meeting = phase {
        phase = .idle
      }
    }
  }

  private func startRecording() {
    AVCaptureDevice.requestAccess(for: .audio) { ok in
      Task { @MainActor in
        guard ok else { self.phase = .problem("Turn on the mic for Mumble"); return }
        do {
          try self.recorder.start(app: self.meeting?.name, kind: self.kind)
          self.startLive()
          self.phase = .recording(app: self.meeting, since: Date())
        } catch {
          self.phase = .problem("Couldn’t open the mic")
        }
      }
    }
  }
}
