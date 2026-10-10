// Mac app icon on Apple's standard grid: a rounded square ("squircle")
// 824 px wide inside a 1024 canvas, a transparent margin and a soft shadow,
// so Mumble sits the same size as every other icon in the Dock.
// The artwork is the web app's icon (public/icons/icon-512.png), unchanged.
//   swift make-icon.swift <icon-512.png> <out-1024.png>
import AppKit

let args = CommandLine.arguments
guard args.count == 3, let src = NSImage(contentsOfFile: args[1]),
      let cg = src.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
  print("usage: make-icon.swift <in.png> <out.png>"); exit(1)
}
let S: CGFloat = 1024, body: CGFloat = 824, inset = (S - body) / 2

/* Apple's corners are continuous, not circular: a superellipse (n ≈ 5)
   is the usual stand-in. */
func squircle(_ r: CGRect, n: CGFloat = 5) -> CGPath {
  let p = CGMutablePath(), a = r.width / 2, b = r.height / 2
  for i in 0...720 {
    let t = CGFloat(i) / 720 * 2 * .pi
    let c = cos(t), s = sin(t)
    let x = a * copysign(pow(abs(c), 2 / n), c), y = b * copysign(pow(abs(s), 2 / n), s)
    let pt = CGPoint(x: r.midX + x, y: r.midY + y)
    i == 0 ? p.move(to: pt) : p.addLine(to: pt)
  }
  p.closeSubpath()
  return p
}

let ctx = CGContext(data: nil, width: Int(S), height: Int(S), bitsPerComponent: 8, bytesPerRow: 0,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
let rect = CGRect(x: inset, y: inset + 10, width: body, height: body) // sits a touch high, as Apple's do
let shape = squircle(rect)
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -10), blur: 24, color: CGColor(gray: 0, alpha: 0.32))
ctx.addPath(shape); ctx.setFillColor(CGColor(red: 0.12, green: 0.12, blue: 0.15, alpha: 1)); ctx.fillPath()
ctx.restoreGState()
ctx.addPath(shape); ctx.clip()
ctx.interpolationQuality = .high
ctx.draw(cg, in: rect)
/* A hairline rim, so the edge holds on a dark Dock. */
ctx.resetClip()
ctx.addPath(squircle(rect.insetBy(dx: 1, dy: 1))); ctx.setStrokeColor(CGColor(gray: 1, alpha: 0.12)); ctx.setLineWidth(2); ctx.strokePath()

let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: args[2]))
