import AppKit
import SwiftUI

/// The floating icon, the Wispr Flow idea: always on top, on every desktop,
/// never steals focus from the meeting, and out of the way until it matters.
/// Drag it anywhere; it remembers where.
final class WidgetPanel: NSPanel {
  static let size = NSSize(width: 280, height: 56)

  init(companion: Companion) {
    super.init(contentRect: NSRect(origin: .zero, size: Self.size), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
    isFloatingPanel = true
    level = .statusBar
    collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
    backgroundColor = .clear
    isOpaque = false
    hasShadow = false
    hidesOnDeactivate = false
    /* Transparent pixels let clicks through, so only the pill itself is "there". */
    contentView = NSHostingView(rootView: WidgetView(companion: companion, panel: self))
    setFrameOrigin(Self.savedOrigin() ?? Self.cornerOrigin())
  }

  override var canBecomeKey: Bool { false }

  /// Top-right, under the menu bar — where a status light belongs.
  static func cornerOrigin() -> NSPoint {
    let f = NSScreen.main?.visibleFrame ?? .zero
    return NSPoint(x: f.maxX - size.width - 12, y: f.maxY - size.height - 8)
  }

  static func savedOrigin() -> NSPoint? {
    guard let s = UserDefaults.standard.string(forKey: "widgetOrigin") else { return nil }
    let p = NSPointFromString(s)
    return NSScreen.screens.contains { $0.frame.insetBy(dx: -20, dy: -20).contains(p) } ? p : nil
  }

  func remember() { UserDefaults.standard.set(NSStringFromPoint(frame.origin), forKey: "widgetOrigin") }
}

struct WidgetView: View {
  @ObservedObject var companion: Companion
  weak var panel: WidgetPanel?
  @State private var dragFrom: NSPoint?
  @State private var pulse = false

  var body: some View {
    HStack {
      Spacer(minLength: 0) // the pill grows leftwards from the corner
      TimelineView(.periodic(from: .now, by: 1)) { _ in pill }
    }
    .frame(width: WidgetPanel.size.width, height: WidgetPanel.size.height)
  }

  private var pill: some View {
    HStack(spacing: 8) {
      icon
      if let label { Text(label).font(.system(size: 12.5, weight: .semibold)).foregroundStyle(.white).lineLimit(1).fixedSize() }
    }
    .padding(.horizontal, label == nil ? 0 : 12)
    .frame(minWidth: 36, minHeight: 36)
    .background(Capsule().fill(background))
    .overlay(Capsule().strokeBorder(.white.opacity(0.14), lineWidth: 1))
    .shadow(color: .black.opacity(0.25), radius: 8, y: 3)
    .contentShape(Capsule())
    .onTapGesture { companion.tap() }
    .gesture(drag)
    .help(help)
    .accessibilityElement(children: .ignore)
    .accessibilityAddTraits(.isButton)
    .accessibilityLabel(help)
    .animation(.spring(duration: 0.28), value: companion.phase)
  }

  @ViewBuilder private var icon: some View {
    switch companion.phase {
    case .recording:
      Circle().fill(.white).frame(width: 8, height: 8).opacity(pulse ? 0.35 : 1)
        .animation(.easeInOut(duration: 0.8).repeatForever(), value: pulse)
        .onAppear { pulse = true }.onDisappear { pulse = false }
        .padding(.leading, 2)
    case .saving:
      Circle().trim(from: 0, to: 0.7).stroke(.white, style: StrokeStyle(lineWidth: 2, lineCap: .round))
        .frame(width: 12, height: 12)
        .rotationEffect(.degrees(pulse ? 360 : 0))
        .animation(.linear(duration: 0.9).repeatForever(autoreverses: false), value: pulse)
        .onAppear { pulse = true }.onDisappear { pulse = false }
    case .saved:
      Image(systemName: "checkmark").font(.system(size: 13, weight: .bold)).foregroundStyle(.white)
    case .problem:
      Image(systemName: "exclamationmark").font(.system(size: 13, weight: .bold)).foregroundStyle(.white)
    case .meeting:
      Image(systemName: "mic.fill").font(.system(size: 14, weight: .semibold)).foregroundStyle(.white)
    case .idle:
      Image(systemName: "mic.fill").font(.system(size: 14, weight: .semibold)).foregroundStyle(Brand.muted)
    }
  }

  private var label: String? {
    switch companion.phase {
    case .idle: return nil
    case .meeting(let app): return "\(app.name) meeting · Record"
    case .recording(_, let since): return "Recording · \(Self.clock(Date().timeIntervalSince(since)))"
    case .saving: return "Saving…"
    case .saved: return "Saved · Show"
    case .problem(let why): return why
    }
  }

  private var help: String {
    switch companion.phase {
    case .idle: return "Mumble · click to record"
    case .meeting(let app): return "A \(app.name) meeting started. Click to record it."
    case .recording: return "Recording your mic and the meeting. Click to stop."
    case .saving: return "Saving the recording…"
    case .saved: return "Saved in Documents › Mumble. Click to show it."
    case .problem(let why): return why
    }
  }

  /* Navy when it matters, near-black when it's just sitting there. */
  private var background: Color {
    switch companion.phase {
    case .idle: return Brand.ink.opacity(0.88)
    case .problem: return Brand.accentStrong
    default: return Brand.accent
    }
  }

  private var drag: some Gesture {
    DragGesture(minimumDistance: 4, coordinateSpace: .global)
      .onChanged { v in
        guard let panel else { return }
        if dragFrom == nil { dragFrom = panel.frame.origin }
        panel.setFrameOrigin(NSPoint(x: dragFrom!.x + v.translation.width, y: dragFrom!.y - v.translation.height))
      }
      .onEnded { _ in dragFrom = nil; panel?.remember() }
  }

  static func clock(_ s: TimeInterval) -> String {
    let t = Int(s)
    return t >= 3600 ? String(format: "%d:%02d:%02d", t / 3600, (t / 60) % 60, t % 60) : String(format: "%d:%02d", t / 60, t % 60)
  }
}
