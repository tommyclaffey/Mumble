import AVFoundation

/// The 🎤 beside a text field in the Mumble window, done on this Mac.
///
/// The page asks ('dictate-start'); this listens to the mic and reports the
/// words as they come ('mumble:desktop-dictate' {text, final}). It stops by
/// itself after the first settled phrase — as the browser version does — or
/// when the page says 'dictate-stop'. Same engine as the live transcript, so
/// it needs no speech-recognition permission, only the mic.
@MainActor
final class Dictation {
  var onEvent: (([String: Any]) -> Void)?
  private var engine: AVAudioEngine?
  private var live: LiveTranscriber?
  private var timeout: Task<Void, Never>?

  func start() {
    stop()
    AVCaptureDevice.requestAccess(for: .audio) { ok in
      Task { @MainActor in
        guard ok else { self.onEvent?(["error": "Turn on the mic for Mumble in System Settings › Privacy & Security › Microphone."]); return }
        await self.begin()
      }
    }
  }

  private func begin() async {
    let live = LiveTranscriber()
    live.onUpdate = { [weak self] segs in
      guard let self, self.live === live else { return }
      if let done = segs.first(where: { $0.final }) {
        self.onEvent?(["text": done.text, "final": true])
        self.stop()
      } else {
        self.onEvent?(["text": segs.last?.text ?? "", "final": false])
      }
    }
    self.live = live
    do {
      try await live.start()
      let engine = AVAudioEngine()
      let input = engine.inputNode
      input.installTap(onBus: 0, bufferSize: 2048, format: input.outputFormat(forBus: 0)) { b, _ in live.feed(b) }
      try engine.start()
      self.engine = engine
      /* Never left listening by accident. */
      timeout = Task { [weak self] in
        try? await Task.sleep(for: .seconds(30))
        guard let self, self.live === live else { return }
        self.onEvent?(["text": "", "final": true]); self.stop()
      }
    } catch {
      onEvent?(["error": "Dictation couldn’t start on this Mac."])
      stop()
    }
  }

  func stop() {
    timeout?.cancel(); timeout = nil
    engine?.inputNode.removeTap(onBus: 0)
    engine?.stop()
    engine = nil
    if let l = live { Task { await l.cancel() } }
    live = nil
  }
}
