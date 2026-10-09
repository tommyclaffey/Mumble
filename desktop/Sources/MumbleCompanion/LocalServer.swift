import Foundation
import Network

/// Serves the Mumble window, on this Mac only.
///
/// The window shows the SAME web app as the website — the built files ship
/// inside Mumble.app (Contents/Resources/web). They're served from
/// http://127.0.0.1:<port>, not opened as files, because 127.0.0.1 counts as
/// a secure address: saved recordings (IndexedDB), Meeting mode's worker and
/// its model cache all need one. The port never changes, because the app's
/// saved data belongs to the address it was saved under.
///
/// It listens on the loopback address only — nothing on the network can
/// reach it. Besides the app's files it answers three requests:
///   GET  /desktop/pending          finished calls the window hasn't saved
///   GET  /desktop/rec/<id>/<file>  a call's audio (mix.m4a, others.m4a)
///   POST /desktop/imported/<id>    the window saved it as a meeting
final class LocalServer: @unchecked Sendable {
  static let port: UInt16 = 47821
  static var origin: URL { URL(string: "http://127.0.0.1:\(port)/")! }

  private let web: URL
  private var listener: NWListener?
  private let queue = DispatchQueue(label: "mumble.server")

  init(web: URL) { self.web = web }

  func start() throws {
    let params = NWParameters.tcp
    params.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: Self.port)!)
    params.allowLocalEndpointReuse = true
    let l = try NWListener(using: params)
    l.newConnectionHandler = { [weak self] c in self?.serve(c) }
    l.start(queue: queue)
    listener = l
  }

  private func serve(_ c: NWConnection) {
    c.start(queue: queue)
    read(c, Data())
  }

  private func read(_ c: NWConnection, _ buffer: Data) {
    c.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, done, error in
      guard let self else { return }
      var buf = buffer
      if let data { buf.append(data) }
      if let end = buf.range(of: Data("\r\n\r\n".utf8)) {
        let head = String(decoding: buf[..<end.lowerBound], as: UTF8.self)
        self.respond(c, head)
      } else if done || error != nil || buf.count > 1_000_000 {
        c.cancel()
      } else {
        self.read(c, buf)
      }
    }
  }

  private func respond(_ c: NWConnection, _ head: String) {
    let lines = head.components(separatedBy: "\r\n")
    let parts = (lines.first ?? "").split(separator: " ")
    guard parts.count >= 2 else { return send(c, 400, "text/plain", Data("Bad request".utf8)) }
    let method = String(parts[0])
    let rawPath = String(parts[1]).split(separator: "?").first.map(String.init) ?? "/"
    let path = rawPath.removingPercentEncoding ?? rawPath
    var headers: [String: String] = [:]
    for l in lines.dropFirst() {
      if let i = l.firstIndex(of: ":") { headers[l[..<i].lowercased()] = l[l.index(after: i)...].trimmingCharacters(in: .whitespaces) }
    }
    let seg = path.split(separator: "/").map(String.init)

    if seg.first == "desktop" {
      if method == "GET", seg.count == 2, seg[1] == "pending" {
        let body = (try? JSONEncoder().encode(Library.pending())) ?? Data("[]".utf8)
        return send(c, 200, "application/json", body, extra: ["Cache-Control": "no-store"])
      }
      if method == "GET", seg.count == 4, seg[1] == "rec", ["mix.m4a", "others.m4a", "you.m4a"].contains(seg[3]),
         let dir = Library.folder(for: seg[2]) {
        return file(c, dir.appendingPathComponent(seg[3]), headers["range"])
      }
      if method == "POST", seg.count == 3, seg[1] == "imported" {
        return Library.markImported(seg[2]) ? send(c, 204, "text/plain", Data()) : send(c, 404, "text/plain", Data("Not found".utf8))
      }
      return send(c, 404, "text/plain", Data("Not found".utf8))
    }
    guard method == "GET" || method == "HEAD" else { return send(c, 405, "text/plain", Data()) }

    /* The app's own files. Never anything outside the web folder. */
    var target = web.appendingPathComponent(path == "/" ? "index.html" : String(path.dropFirst())).standardizedFileURL
    guard target.path.hasPrefix(web.standardizedFileURL.path) else { return send(c, 403, "text/plain", Data()) }
    var isDir: ObjCBool = false
    if FileManager.default.fileExists(atPath: target.path, isDirectory: &isDir), isDir.boolValue {
      target = target.appendingPathComponent("index.html")
    }
    file(c, target, headers["range"])
  }

  /// A file, with byte ranges: WebKit plays audio by asking for it in pieces.
  private func file(_ c: NWConnection, _ url: URL, _ range: String?) {
    guard let data = try? Data(contentsOf: url, options: .mappedIfSafe) else {
      return send(c, 404, "text/plain", Data("Not found".utf8))
    }
    let type = Self.mime[url.pathExtension.lowercased()] ?? "application/octet-stream"
    let noCache = ["Cache-Control": "no-cache", "Accept-Ranges": "bytes"]
    if let range, range.hasPrefix("bytes="), !data.isEmpty {
      let spec = range.dropFirst(6).split(separator: ",").first.map(String.init) ?? ""
      let ends = spec.split(separator: "-", omittingEmptySubsequences: false).map { Int($0) }
      var lo = 0, hi = data.count - 1
      if ends.count == 2 {
        if let a = ends[0] { lo = a; if let b = ends[1] { hi = min(b, data.count - 1) } }
        else if let b = ends[1] { lo = max(0, data.count - b) }
      }
      guard lo <= hi, lo < data.count else {
        return send(c, 416, "text/plain", Data(), extra: ["Content-Range": "bytes */\(data.count)"])
      }
      var extra = noCache
      extra["Content-Range"] = "bytes \(lo)-\(hi)/\(data.count)"
      return send(c, 206, type, data.subdata(in: lo..<(hi + 1)), extra: extra)
    }
    send(c, 200, type, data, extra: noCache)
  }

  private func send(_ c: NWConnection, _ status: Int, _ type: String, _ body: Data, extra: [String: String] = [:]) {
    let reason = [200: "OK", 204: "No Content", 206: "Partial Content", 400: "Bad Request", 403: "Forbidden",
                  404: "Not Found", 405: "Method Not Allowed", 416: "Range Not Satisfiable"][status] ?? "OK"
    var head = "HTTP/1.1 \(status) \(reason)\r\nContent-Type: \(type)\r\nContent-Length: \(body.count)\r\nConnection: close\r\n"
    for (k, v) in extra { head += "\(k): \(v)\r\n" }
    var out = Data((head + "\r\n").utf8)
    out.append(body)
    c.send(content: out, completion: .contentProcessed { _ in c.cancel() })
  }

  static let mime: [String: String] = [
    "html": "text/html; charset=utf-8", "js": "text/javascript", "mjs": "text/javascript", "css": "text/css",
    "json": "application/json", "webmanifest": "application/manifest+json", "png": "image/png", "jpg": "image/jpeg",
    "jpeg": "image/jpeg", "svg": "image/svg+xml", "ico": "image/x-icon", "m4a": "audio/mp4", "mp3": "audio/mpeg",
    "wav": "audio/wav", "wasm": "application/wasm", "woff2": "font/woff2", "txt": "text/plain", "md": "text/plain",
  ]
}
