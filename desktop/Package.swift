// swift-tools-version: 6.0
import PackageDescription

/* Mumble for Mac — the desktop companion (Oct 9 2026).
   Built with the Command Line Tools alone (no Xcode needed): `swift build`. */
let package = Package(
  name: "MumbleDesktop",
  platforms: [.macOS("26.0")],
  targets: [
    .executableTarget(name: "MicWatch", path: "Sources/MicWatch"),
    .executableTarget(name: "SystemTap", path: "Sources/SystemTap"),
    /* The app itself. Swift 5 language mode: audio arrives on Core Audio's
       real-time threads, and the recording state is kept off the main actor
       by hand (see Recorder.swift) rather than fought with Swift 6 checks. */
    .executableTarget(
      name: "MumbleCompanion", path: "Sources/MumbleCompanion",
      swiftSettings: [.swiftLanguageMode(.v5)]
    ),
  ]
)
