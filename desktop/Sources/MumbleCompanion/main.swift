import AppKit
import Combine
import ServiceManagement
import SwiftUI

/// Mumble for Mac. One app, three faces:
///   · the Mumble window (Dock icon) — the same screens as the website
///   · the floating icon — spots meetings, one click records them
///   · the menu bar mic — the same controls, out of the way
/// A recorded call is transcribed on this Mac and arrives in the window as a
/// meeting. Closing the window keeps the icon watching for meetings.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
  let companion = Companion()
  var panel: WidgetPanel?
  var status: NSStatusItem?
  var watch: AnyCancellable?
  var server: LocalServer?
  var main: MainWindow?
  let dictation = Dictation()
  var liveWatch: AnyCancellable?

  func applicationDidFinishLaunching(_ note: Notification) {
    let web = Bundle.main.resourceURL!.appendingPathComponent("web")
    server = LocalServer(web: web)
    do { try server?.start() } catch { NSLog("Mumble: local server failed: \(error)") }
    NSApp.mainMenu = mainMenu(reload: #selector(reload), newRecording: #selector(toggle), target: self)
    let main = MainWindow()
    main.onMessage = { [weak self] type, body in
      guard let self else { return }
      switch type {
      case "record": self.companion.record(kind: body["kind"] as? String ?? "meeting")
      case "pause": self.companion.pause()
      case "resume": self.companion.resume()
      case "stop": self.companion.stop()
      case "discard": self.companion.discard()
      case "dictate-start": self.dictation.start()
      case "dictate-stop": self.dictation.stop()
      default: break
      }
    }
    dictation.onEvent = { [weak self] e in self?.main?.send("mumble:desktop-dictate", e) }
    /* The live transcript, to the New recording screen. */
    liveWatch = companion.$live.sink { [weak self] lines in
      self?.main?.send("mumble:desktop-live", lines.map { ["who": $0.who, "start": $0.start, "text": $0.text, "final": $0.final] })
    }
    self.main = main
    /* A call recorded from the window opens when it's ready; one recorded
       while you were in Zoom waits in Recent until you look. */
    companion.onFinished = { [weak self] id in
      guard let main = self?.main else { return }
      main.callFinished(id: id, open: main.isInFront || ProcessInfo.processInfo.environment["MUMBLE_ROOT"] != nil)
    }
    companion.onShow = { [weak self] id in self?.main?.show(); self?.main?.callFinished(id: id, open: true) }
    main.show()
    if let dir = ProcessInfo.processInfo.environment["MUMBLE_SNAPSHOTS"] { main.snapshotEvery(3, to: dir) }

    panel = WidgetPanel(companion: companion)
    panel?.orderFrontRegardless()

    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    item.button?.image = NSImage(systemSymbolName: "mic", accessibilityDescription: "Mumble")
    let menu = NSMenu()
    menu.delegate = self
    item.menu = menu
    status = item

    /* The menu bar glyph follows the state too: filled while recording. */
    watch = companion.$phase.combineLatest(companion.$kind, companion.$savingStep).sink { [weak self] phase, kind, step in
      var state: [String: Any] = ["phase": "idle"]
      switch phase {
      case .idle, .saved: break
      case .meeting(let app): state = ["phase": "meeting", "app": app.name]
      case .recording(let app, let since): state = ["phase": "recording", "app": app?.name ?? NSNull(), "since": Int(since.timeIntervalSince1970 * 1000)]
      case .paused(let app, let elapsed): state = ["phase": "paused", "app": app?.name ?? NSNull(), "elapsed": elapsed]
      case .saving: state = ["phase": "saving"]
      case .problem(let why): state = ["phase": "problem", "message": why]
      }
      state["kind"] = kind
      state["step"] = step
      self?.main?.pushState(state)
      let name: String
      switch phase {
      case .recording: name = "mic.fill"
      case .paused: name = "pause.circle"
      case .meeting: name = "mic.badge.plus"
      default: name = "mic"
      }
      self?.status?.button?.image = NSImage(systemSymbolName: name, accessibilityDescription: "Mumble")
    }
    companion.start()
  }

  /* Rebuilt every time it opens, so it always says what's true. */
  func menuNeedsUpdate(_ menu: NSMenu) {
    menu.removeAllItems()
    let line: String
    switch companion.phase {
    case .idle: line = "No meeting right now"
    case .meeting(let app): line = "\(app.name) meeting in progress"
    case .recording(_, let since): line = "Recording · \(WidgetView.clock(Date().timeIntervalSince(since)))"
    case .paused(_, let elapsed): line = "Paused · \(WidgetView.clock(elapsed))"
    case .saving: line = "Saving…"
    case .saved: line = "Saved"
    case .problem(let why): line = why
    }
    menu.addItem(withTitle: line, action: nil, keyEquivalent: "").isEnabled = false
    menu.addItem(.separator())
    switch companion.phase {
    case .recording:
      menu.addItem(item("Pause", #selector(pauseRec)))
      menu.addItem(item("Stop and save", #selector(toggle)))
    case .paused:
      menu.addItem(item("Resume", #selector(resumeRec)))
      menu.addItem(item("Stop and save", #selector(toggle)))
    case .saving:
      menu.addItem(withTitle: "Start recording", action: nil, keyEquivalent: "").isEnabled = false
    default:
      menu.addItem(item("Start recording", #selector(toggle)))
    }
    let auto = item("Record meetings automatically", #selector(toggleAuto))
    auto.state = companion.autoRecord ? .on : .off
    menu.addItem(auto)
    let show = item("Show floating icon", #selector(toggleWidget))
    show.state = panel?.isVisible == true ? .on : .off
    menu.addItem(show)
    menu.addItem(.separator())
    menu.addItem(item("Open Mumble", #selector(openMain)))
    menu.addItem(item("Open recordings folder", #selector(openFolder)))
    let login = item("Open at login", #selector(toggleLogin))
    login.state = SMAppService.mainApp.status == .enabled ? .on : .off
    menu.addItem(login)
    menu.addItem(.separator())
    menu.addItem(item("Quit Mumble", #selector(quit), key: "q"))
  }

  private func item(_ title: String, _ action: Selector, key: String = "") -> NSMenuItem {
    let i = NSMenuItem(title: title, action: action, keyEquivalent: key)
    i.target = self
    return i
  }

  @objc func toggle() { companion.tap() }
  @objc func toggleAuto() { companion.autoRecord.toggle() }
  @objc func toggleWidget() { if panel?.isVisible == true { panel?.orderOut(nil) } else { panel?.orderFrontRegardless() } }
  @objc func openFolder() {
    try? FileManager.default.createDirectory(at: Recorder.root, withIntermediateDirectories: true)
    NSWorkspace.shared.open(Recorder.root)
  }
  @objc func quit() { NSApp.terminate(nil) }
  @objc func openMain() { main?.show() }
  @objc func pauseRec() { companion.pause() }
  @objc func resumeRec() { companion.resume() }
  /* Starts with your Mac, so the icon is there when a meeting starts. */
  @objc func toggleLogin() {
    do {
      if SMAppService.mainApp.status == .enabled { try SMAppService.mainApp.unregister() } else { try SMAppService.mainApp.register() }
    } catch { NSLog("Mumble: open at login: \(error)") }
  }
  @objc func reload() { main?.web.reload() }

  /* Dock icon clicked with the window closed: bring it back. */
  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool {
    if !hasVisibleWindows { main?.show() }
    return true
  }
  /* Closing the window doesn't quit: the icon keeps watching for meetings. */
  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
}

/// `Mumble --snapshots <dir>`: draws the floating icon in every state to PNGs
/// and quits — how the look is checked without a screen to capture.
@MainActor func snapshots(to dir: String) {
  let zoom = MeetingApp(bundleID: "us.zoom.xos", name: "Zoom")
  let states: [(String, Phase)] = [
    ("1-idle", .idle), ("2-meeting", .meeting(zoom)),
    ("3-recording", .recording(app: zoom, since: Date().addingTimeInterval(-754))),
    ("4-paused", .paused(app: zoom, elapsed: 754)),
    ("5-saving", .saving), ("6-saved", .saved("d0")), ("7-problem", .problem("Turn on the mic for Mumble")),
  ]
  try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
  for (name, phase) in states {
    let c = Companion()
    c.preview(phase)
    c.previewLevel = 0.6
    let view = ZStack { Color(white: 0.93); WidgetView(companion: c, panel: nil) }.frame(width: 400, height: 76)
    let r = ImageRenderer(content: view)
    r.scale = 2
    if let img = r.nsImage, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) {
      try? png.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name).png"))
    }
  }
}

MainActor.assumeIsolated {
  /* `--to-m4a <in> <out>` (testing): the conversion every recording ends with. */
  if let i = CommandLine.arguments.firstIndex(of: "--to-m4a"), CommandLine.arguments.count > i + 2 {
    do { try Recorder.toM4A(URL(fileURLWithPath: CommandLine.arguments[i + 1]), URL(fileURLWithPath: CommandLine.arguments[i + 2])); exit(0) } catch { print(error); exit(1) }
  }
  /* `--live-test <audio>` (testing): live transcription of a file, fed as if it were the mic. */
  if let i = CommandLine.arguments.firstIndex(of: "--live-test"), CommandLine.arguments.count > i + 1 {
    let path = CommandLine.arguments[i + 1]
    Task { await LiveTranscriber.selfTest(path); exit(0) }
    RunLoop.main.run()
  }
  if let i = CommandLine.arguments.firstIndex(of: "--snapshots") {
    snapshots(to: CommandLine.arguments.dropFirst(i + 1).first ?? "/tmp/mumble-widget")
    exit(0)
  }
  let app = NSApplication.shared
  let delegate = AppDelegate()
  app.delegate = delegate
  app.setActivationPolicy(.regular)
  app.run()
}
