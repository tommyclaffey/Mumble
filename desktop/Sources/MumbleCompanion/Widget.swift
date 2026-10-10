import AppKit
import SwiftUI

/// The floating icon, the Wispr Flow idea: always on top, on every desktop,
/// never steals focus from the meeting, and out of the way until it matters.
/// Drag it anywhere; it remembers where.
final class WidgetPanel: NSPanel {
  static let size = NSSize(width: 380, height: 60)

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
    acceptsMouseMovedEvents = true
    contentView = FirstClickHostingView(rootView: WidgetView(companion: companion, panel: self))
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

/// The panel never becomes the active window (it mustn't pull focus from the
/// call), so its buttons have to answer the FIRST click, not the second.
final class FirstClickHostingView<V: View>: NSHostingView<V> {
  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

struct WidgetView: View {
  @ObservedObject var companion: Companion
  weak var panel: WidgetPanel?
  @State private var dragFrom: NSPoint?
  @State private var pulse = false
  @State private var hovering = false

  var body: some View {
    HStack {
      Spacer(minLength: 0) // the pill grows leftwards from the corner
      TimelineView(.periodic(from: .now, by: 1)) { _ in pill }
    }
    .frame(width: WidgetPanel.size.width, height: WidgetPanel.size.height)
  }

  private var pill: some View {
    HStack(spacing: 10) { content }
      .padding(.leading, leadingPad)
      .padding(.trailing, trailingPad)
      .frame(minWidth: 40, minHeight: 40)
      .background(Capsule().fill(background))
      .overlay(Capsule().strokeBorder(.white.opacity(0.14), lineWidth: 1))
      .shadow(color: .black.opacity(0.28), radius: 10, y: 4)
      .contentShape(Capsule())
      .gesture(drag)
      .onHover { hovering = $0 }
      .animation(.spring(duration: 0.3), value: companion.phase)
      .animation(.easeOut(duration: 0.15), value: hovering)
  }

  private var leadingPad: CGFloat { if case .idle = companion.phase, !hovering { return 0 }; return 12 }
  private var trailingPad: CGFloat {
    switch companion.phase {
    case .idle: return hovering ? 14 : 0
    case .saving: return 14
    default: return 6
    }
  }

  @ViewBuilder private var content: some View {
    switch companion.phase {
    case .idle:
      /* Quiet until it matters: a mic. Hover says what a click does. */
      Button { companion.record() } label: {
        HStack(spacing: 8) {
          Image(systemName: "mic.fill").font(.system(size: 14, weight: .semibold))
            .foregroundStyle(hovering ? .white : Brand.muted)
            .frame(width: hovering ? nil : 40, height: 40)
          if hovering { label("Start recording") }
        }
      }
      .buttonStyle(.plain)
      .help("Start recording: your mic and your Mac’s sound")
      .accessibilityLabel("Start recording")

    case .meeting(let app):
      Image(systemName: "video.fill").font(.system(size: 12, weight: .semibold)).foregroundStyle(.white.opacity(0.85))
      label("\(app.name) meeting")
      PillButton(title: "Record", dot: true) { companion.record() }
        .help("Record this meeting")
      RoundButton(symbol: "xmark", label: "Not this one", style: .quiet, size: 24) { companion.dismissMeeting() }

    case .recording(_, let since):
      Circle().fill(Brand.live).frame(width: 9, height: 9).opacity(pulse ? 0.35 : 1)
        .animation(.easeInOut(duration: 0.8).repeatForever(), value: pulse)
        .onAppear { pulse = true }.onDisappear { pulse = false }
        .accessibilityHidden(true)
      label(Self.clock(Date().timeIntervalSince(since))).monospacedDigit()
        .accessibilityLabel("Recording, \(Self.clock(Date().timeIntervalSince(since)))")
      LevelMeter(level: { companion.micLevel })
      divider
      RoundButton(symbol: "pause.fill", label: "Pause", style: .quiet) { companion.pause() }
      RoundButton(symbol: "stop.fill", label: "Stop and save", style: .solid) { companion.stop() }

    case .paused(_, let elapsed):
      Image(systemName: "pause.fill").font(.system(size: 11, weight: .bold)).foregroundStyle(.white.opacity(0.85))
      label("Paused · \(Self.clock(elapsed))").monospacedDigit()
      divider
      RoundButton(symbol: "mic.fill", label: "Resume recording", style: .solid) { companion.resume() }
      RoundButton(symbol: "stop.fill", label: "Stop and save", style: .quiet) { companion.stop() }

    case .saving:
      Circle().trim(from: 0, to: 0.7).stroke(.white, style: StrokeStyle(lineWidth: 2, lineCap: .round))
        .frame(width: 12, height: 12)
        .rotationEffect(.degrees(pulse ? 360 : 0))
        .animation(.linear(duration: 0.9).repeatForever(autoreverses: false), value: pulse)
        .onAppear { pulse = true }.onDisappear { pulse = false }
      label("Transcribing on this Mac…")

    case .saved(let id):
      Image(systemName: "checkmark").font(.system(size: 12, weight: .bold)).foregroundStyle(.white)
      label("Saved")
      PillButton(title: "Open") { companion.open(id) }
        .help("Open the meeting in Mumble")
      RoundButton(symbol: "xmark", label: "Dismiss", style: .quiet, size: 24) { companion.dismissSaved() }

    case .problem(let why):
      Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 12, weight: .semibold)).foregroundStyle(.white)
      label(why)
      PillButton(title: "Fix") { companion.fixProblem() }
    }
  }

  private func label(_ s: String) -> Text {
    Text(s).font(.system(size: 13, weight: .semibold)).foregroundColor(.white)
  }

  private var divider: some View {
    Rectangle().fill(.white.opacity(0.22)).frame(width: 1, height: 18).accessibilityHidden(true)
  }

  /* Navy when it matters, near-black when it's just sitting there. */
  private var background: Color {
    switch companion.phase {
    case .idle: return Brand.ink.opacity(hovering ? 0.96 : 0.88)
    case .problem: return Brand.accentStrong
    case .paused: return Brand.accentStrong
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
    let t = Int(max(0, s))
    return t >= 3600 ? String(format: "%d:%02d:%02d", t / 3600, (t / 60) % 60, t % 60) : String(format: "%d:%02d", t / 60, t % 60)
  }
}

/// A round icon button with its name as the tooltip and for VoiceOver.
///   solid  white with a navy glyph — the step you're most likely to take
///   quiet  see-through white — the other one
struct RoundButton: View {
  enum Style { case solid, quiet }
  let symbol: String
  let label: String
  var style: Style = .quiet
  var size: CGFloat = 28
  let action: () -> Void
  @State private var hover = false

  var body: some View {
    Button(action: action) {
      Image(systemName: symbol)
        .font(.system(size: size * 0.4, weight: .bold))
        .foregroundStyle(style == .solid ? Brand.accentStrong : .white)
        .frame(width: size, height: size)
        .background(Circle().fill(style == .solid ? Color.white.opacity(hover ? 0.88 : 1) : Color.white.opacity(hover ? 0.28 : 0.16)))
        /* The see-through button gets an edge you can see (3:1 on the navy). */
        .overlay(Circle().strokeBorder(.white.opacity(style == .quiet ? 0.6 : 0), lineWidth: 1))
        .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .onHover { hover = $0 }
    .help(label)
    .accessibilityLabel(label)
  }
}

/// A short labelled action: Record, Open, Fix.
struct PillButton: View {
  let title: String
  var dot = false
  let action: () -> Void
  @State private var hover = false

  var body: some View {
    Button(action: action) {
      HStack(spacing: 6) {
        if dot { Circle().fill(Brand.live).frame(width: 7, height: 7) }
        Text(title).font(.system(size: 12.5, weight: .bold)).foregroundColor(Brand.accentStrong).lineLimit(1).fixedSize()
      }
      .padding(.horizontal, 12).frame(height: 28)
      .background(Capsule().fill(Color.white.opacity(hover ? 0.88 : 1)))
      .contentShape(Capsule())
    }
    .buttonStyle(.plain)
    .onHover { hover = $0 }
    .accessibilityLabel(title)
  }
}

/// Five bars that move with your voice: proof it's hearing you.
struct LevelMeter: View {
  let level: () -> Float
  private let shape: [Float] = [0.55, 0.85, 1, 0.75, 0.5]

  var body: some View {
    TimelineView(.animation(minimumInterval: 0.08)) { _ in
      let l = CGFloat(level())
      HStack(alignment: .center, spacing: 2) {
        ForEach(0..<shape.count, id: \.self) { i in
          Capsule().fill(.white.opacity(0.9))
            .frame(width: 3, height: 3 + 13 * min(1, l * CGFloat(shape[i])))
        }
      }
      .frame(height: 16)
      .animation(.easeOut(duration: 0.08), value: l)
    }
    .accessibilityHidden(true)
  }
}
