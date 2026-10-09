import AppKit
import Combine
import SwiftUI

/// Mumble for Mac — the companion. Lives in the menu bar (no Dock icon) and
/// as a small floating icon; spots meetings and records them.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
  let companion = Companion()
  var panel: WidgetPanel?
  var status: NSStatusItem?
  var watch: AnyCancellable?

  func applicationDidFinishLaunching(_ note: Notification) {
    panel = WidgetPanel(companion: companion)
    panel?.orderFrontRegardless()

    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    item.button?.image = NSImage(systemSymbolName: "mic", accessibilityDescription: "Mumble")
    let menu = NSMenu()
    menu.delegate = self
    item.menu = menu
    status = item

    /* The menu bar glyph follows the state too: filled while recording. */
    watch = companion.$phase.sink { [weak self] phase in
      let name: String
      if case .recording = phase { name = "mic.fill" } else if case .meeting = phase { name = "mic.badge.plus" } else { name = "mic" }
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
    case .saving: line = "Saving…"
    case .saved: line = "Saved"
    case .problem(let why): line = why
    }
    menu.addItem(withTitle: line, action: nil, keyEquivalent: "").isEnabled = false
    menu.addItem(.separator())
    let recording: Bool = { if case .recording = companion.phase { return true }; return false }()
    menu.addItem(item(recording ? "Stop recording" : "Start recording", #selector(toggle)))
    let auto = item("Record meetings automatically", #selector(toggleAuto))
    auto.state = companion.autoRecord ? .on : .off
    menu.addItem(auto)
    let show = item("Show floating icon", #selector(toggleWidget))
    show.state = panel?.isVisible == true ? .on : .off
    menu.addItem(show)
    menu.addItem(.separator())
    menu.addItem(item("Open recordings folder", #selector(openFolder)))
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
}

/// `Mumble --snapshots <dir>`: draws the floating icon in every state to PNGs
/// and quits — how the look is checked without a screen to capture.
@MainActor func snapshots(to dir: String) {
  let zoom = MeetingApp(bundleID: "us.zoom.xos", name: "Zoom")
  let states: [(String, Phase)] = [
    ("1-idle", .idle), ("2-meeting", .meeting(zoom)),
    ("3-recording", .recording(app: zoom, since: Date().addingTimeInterval(-754))),
    ("4-saving", .saving), ("5-saved", .saved(Recorder.root)), ("6-problem", .problem("Turn on the mic for Mumble")),
  ]
  try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
  for (name, phase) in states {
    let c = Companion()
    c.preview(phase)
    let view = ZStack { Color(white: 0.93); WidgetView(companion: c, panel: nil) }.frame(width: 300, height: 76)
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
  if let i = CommandLine.arguments.firstIndex(of: "--snapshots") {
    snapshots(to: CommandLine.arguments.dropFirst(i + 1).first ?? "/tmp/mumble-widget")
    exit(0)
  }
  let app = NSApplication.shared
  let delegate = AppDelegate()
  app.delegate = delegate
  app.setActivationPolicy(.accessory)
  app.run()
}
