import SwiftUI

/// Mumble's colours, from src/styles/tokens.css — the same values, so the
/// companion looks like the app it belongs to.
enum Brand {
  static let accent = Color(hex: 0x3D5A99)      // --blue-600, accent-base
  static let accentStrong = Color(hex: 0x24365E) // --blue-800
  static let accentTint = Color(hex: 0xE3E8F4)  // --blue-100
  static let ink = Color(hex: 0x1E1E26)         // --neutral-900, surface-inverse
  static let muted = Color(hex: 0xA6A6AD)       // --neutral-400
}

extension Color {
  init(hex: UInt32) {
    self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
  }
}
