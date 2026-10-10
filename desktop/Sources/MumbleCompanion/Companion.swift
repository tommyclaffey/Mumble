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

  func record() {
    switch phase {
    case .idle, .meeting, .saved, .problem: startRecording()
    default: break
    }
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
    phase = .saving
    DispatchQueue.global(qos: .userInitiated).async {
      let folder = recorder.stop(app: app?.name)
      Task { @MainActor in
        guard let folder else { self.phase = .idle; return }
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
          try self.recorder.start(app: self.meeting?.name)
          self.phase = .recording(app: self.meeting, since: Date())
        } catch {
          self.phase = .problem("Couldn’t open the mic")
        }
      }
    }
  }
}
