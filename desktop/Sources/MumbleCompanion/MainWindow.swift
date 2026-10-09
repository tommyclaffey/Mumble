import AppKit
import WebKit

/// The Mumble window: the same screens as the website (Recent, Tasks,
/// Meetings…), served from inside the app by LocalServer.
///
/// The page and the app talk through one small bridge:
///   page → app   window.webkit.messageHandlers.mumble.postMessage({ type })
///                  'record'  start recording (the floating icon's click)
///                  'stop'    stop and save
///   app → page   window.dispatchEvent(new CustomEvent('mumble:desktop', …))
///                  "a call finished: save it as a meeting" (+ open it)
/// `window.mumbleDesktop` is set before the page loads, so the web app knows
/// it's inside the Mac app.
@MainActor
final class MainWindow: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, NSWindowDelegate {
  let window: NSWindow
  let web: WKWebView
  var onMessage: ((String) -> Void)?
  private var loaded = false
  private var queued: [String] = []

  static let testStore = UUID(uuidString: "6D0F6B1E-6D75-4D62-9C1E-7E5753540000")!

  override init() {
    let config = WKWebViewConfiguration()
    /* Testing (MUMBLE_ROOT set): a separate store of its own, so a test never
       lands in your Mumble. (Not WebKit's private store: that one can't keep
       audio in IndexedDB, so it would test something the app never does.) */
    let testing = ProcessInfo.processInfo.environment["MUMBLE_ROOT"] != nil
    config.websiteDataStore = testing ? WKWebsiteDataStore(forIdentifier: Self.testStore) : .default()
    let bridge = "window.mumbleDesktop = Object.freeze({ version: '\(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "dev")' });"
    config.userContentController.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    web = WKWebView(frame: .zero, configuration: config)
    web.isInspectable = true
    web.allowsBackForwardNavigationGestures = false

    window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1440, height: 920),
                      styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
    window.title = "Mumble"
    window.minSize = NSSize(width: 900, height: 620)
    window.contentView = web
    window.isReleasedWhenClosed = false
    window.setFrameAutosaveName("MumbleMain")
    if !window.setFrameUsingName("MumbleMain") { window.center() }
    super.init()
    config.userContentController.add(self, name: "mumble")
    web.navigationDelegate = self
    web.uiDelegate = self
    window.delegate = self
    web.load(URLRequest(url: LocalServer.origin))
  }

  /// Testing: MUMBLE_SNAPSHOTS=<dir> writes what the window shows every few seconds.
  func snapshotEvery(_ seconds: Double, to dir: String) {
    try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    var n = 0
    Timer.scheduledTimer(withTimeInterval: seconds, repeats: true) { [weak self] _ in
      MainActor.assumeIsolated {
        guard let self else { return }
        n += 1
        let i = n
        self.web.takeSnapshot(with: nil) { img, _ in
          guard let img, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
                let png = rep.representation(using: .png, properties: [:]) else { return }
          try? png.write(to: URL(fileURLWithPath: dir).appendingPathComponent(String(format: "w%03d.png", i)))
        }
      }
    }
  }

  func show() {
    NSApp.activate(ignoringOtherApps: true)
    window.makeKeyAndOrderFront(nil)
  }

  /// The recorder's state, for the page's header timer and New recording screen.
  private var lastState = "{\"phase\":\"idle\"}"
  func pushState(_ state: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: state), let json = String(data: data, encoding: .utf8) else { return }
    lastState = json
    if loaded { web.evaluateJavaScript(stateJS) }
  }
  private var stateJS: String {
    "window.__mumbleMacState = \(lastState); window.dispatchEvent(new CustomEvent('mumble:desktop-state', { detail: window.__mumbleMacState }))"
  }

  /// Is the window in front, so a finished call should open in it?
  var isInFront: Bool { NSApp.isActive && window.isVisible && window.isKeyWindow }

  /// Tell the page a call is ready. `open` = go to it once it's saved.
  func callFinished(id: String, open: Bool) {
    let js = "window.dispatchEvent(new CustomEvent('mumble:desktop', { detail: { open: \(open ? "'\(id)'" : "null") } }))"
    if loaded { web.evaluateJavaScript(js) } else { queued.append(js) }
  }

  // MARK: page → app
  nonisolated func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
    MainActor.assumeIsolated {
      if let body = message.body as? [String: Any], let type = body["type"] as? String { onMessage?(type) }
    }
  }

  // MARK: navigation — the app's own pages stay here; any other link opens in the browser.
  func webView(_ w: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
    if let url = action.request.url, url.host != "127.0.0.1", url.scheme == "http" || url.scheme == "https" {
      if action.targetFrame?.isMainFrame ?? true { NSWorkspace.shared.open(url); return decisionHandler(.cancel) }
    }
    decisionHandler(.allow)
  }

  func webView(_ w: WKWebView, didFinish navigation: WKNavigation!) {
    loaded = true
    w.evaluateJavaScript(stateJS)
    for js in queued { w.evaluateJavaScript(js) }
    queued = []
  }

  /* target="_blank" links */
  func webView(_ w: WKWebView, createWebViewWith c: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
    if let url = action.request.url { NSWorkspace.shared.open(url) }
    return nil
  }

  /* The web app asks "Discard this recording?" with confirm(): without this, WebKit silently answers No. */
  func webView(_ w: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor (Bool) -> Void) {
    let a = NSAlert(); a.messageText = message; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel")
    completionHandler(a.runModal() == .alertFirstButtonReturn)
  }

  func webView(_ w: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor () -> Void) {
    let a = NSAlert(); a.messageText = message; a.runModal(); completionHandler()
  }

  /* The mic for dictation buttons: the app already asked macOS once. */
  func webView(_ w: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping @MainActor (WKPermissionDecision) -> Void) {
    decisionHandler(origin.host == "127.0.0.1" ? .grant : .deny)
  }

  func webViewWebContentProcessDidTerminate(_ w: WKWebView) { w.reload() }
}

/// File, Edit, View, Window: without an Edit menu, ⌘C / ⌘V / ⌘A do nothing
/// in the window's text fields.
@MainActor func mainMenu(reload: Selector, newRecording: Selector, target: AnyObject) -> NSMenu {
  let bar = NSMenu()
  func sub(_ title: String, _ items: [NSMenuItem]) {
    let top = NSMenuItem(); let m = NSMenu(title: title); items.forEach(m.addItem); top.submenu = m; bar.addItem(top)
  }
  func it(_ t: String, _ a: Selector?, _ k: String = "", _ mods: NSEvent.ModifierFlags = .command, target tg: AnyObject? = nil) -> NSMenuItem {
    let i = NSMenuItem(title: t, action: a, keyEquivalent: k); i.keyEquivalentModifierMask = mods; i.target = tg; return i
  }
  sub("Mumble", [
    it("About Mumble", #selector(NSApplication.orderFrontStandardAboutPanel(_:))), .separator(),
    it("Hide Mumble", #selector(NSApplication.hide(_:)), "h"),
    it("Hide Others", #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option]), .separator(),
    it("Quit Mumble", #selector(NSApplication.terminate(_:)), "q"),
  ])
  sub("File", [it("New Recording", newRecording, "n", target: target)])
  sub("Edit", [
    it("Undo", Selector(("undo:")), "z"), it("Redo", Selector(("redo:")), "z", [.command, .shift]), .separator(),
    it("Cut", #selector(NSText.cut(_:)), "x"), it("Copy", #selector(NSText.copy(_:)), "c"),
    it("Paste", #selector(NSText.paste(_:)), "v"), it("Select All", #selector(NSText.selectAll(_:)), "a"),
  ])
  sub("View", [it("Reload", reload, "r", target: target)])
  sub("Window", [
    it("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m"),
    it("Close", #selector(NSWindow.performClose(_:)), "w"),
  ])
  return bar
}
