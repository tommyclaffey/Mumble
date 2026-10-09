import AppKit
import AVFoundation
import SwiftUI

/// What the companion is doing — one place, so the floating icon and the
/// menu bar always say the same thing.
///
///   idle       a quiet mic in the corner. Click = record anyway.
///   meeting    a meeting app turned the mic on → the icon lights up and
///              says which app. Click = record it. (Or it starts by itself,
///              if "Record meetings automatically" is on.)
///   recording  a live dot and the time. Click = stop. It also stops by
///              itself a few seconds after the meeting app lets go of the mic.
///   saving     turning the two tracks into files (a second or two).
///   saved      "Saved · Show": click opens the folder. Fades back to idle.
///   problem    something needs you (the mic is off in Settings…). Click fixes it.
enum Phase: Equatable {
  case idle
  case meeting(MeetingApp)
  case recording(app: MeetingApp?, since: Date)
  case saving
  case saved(URL)
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

  /// For `--snapshots` only: show a state without it really happening.
  func preview(_ p: Phase) { phase = p }

  func start() {
    detector.onChange = { [weak self] app in self?.meetingChanged(app) }
    detector.start()
  }

  /// The one action: whatever the icon is showing, clicking does the obvious thing.
  func tap() {
    switch phase {
    case .idle, .meeting: startRecording()
    case .recording: stopRecording()
    case .saving: break
    case .saved(let url): NSWorkspace.shared.open(url); phase = meeting.map(Phase.meeting) ?? .idle
    case .problem: NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")!)
    }
  }

  private func meetingChanged(_ app: MeetingApp?) {
    meeting = app
    switch phase {
    case .recording(let recording, _):
      /* The meeting we're recording ended → stop and save by itself. */
      if app == nil, recording != nil { stopRecording() }
    case .saving:
      break
    case .idle, .meeting, .saved:
      if let app {
        phase = .meeting(app)
        if autoRecord { startRecording() }
      } else if case .meeting = phase {
        phase = .idle
      }
    case .problem:
      break
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

  private func stopRecording() {
    guard case .recording(let app, _) = phase else { return }
    let recorder = self.recorder
    phase = .saving
    DispatchQueue.global(qos: .userInitiated).async {
      let folder = recorder.stop(app: app?.name)
      Task { @MainActor in
        guard let folder else { self.phase = .idle; return }
        self.phase = .saved(folder)
        /* "Saved" for a few seconds, then back to whatever is true now. */
        try? await Task.sleep(for: .seconds(6))
        if case .saved = self.phase { self.phase = self.meeting.map(Phase.meeting) ?? .idle }
      }
    }
  }
}
