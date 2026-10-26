// swift-tools-version:5.9
// Tests the module's AVFoundation core on macOS (same frameworks as iOS) without Expo.
// Sources/ is filled from ../ios/Core by run.sh; it is git-ignored.
import PackageDescription

let package = Package(
  name: "ShironAudioCore",
  platforms: [.macOS(.v13)],
  targets: [
    .target(name: "ShironAudioCore", path: "Sources/ShironAudioCore"),
    .testTarget(
      name: "ShironAudioCoreTests",
      dependencies: ["ShironAudioCore"],
      path: "Tests/ShironAudioCoreTests"
    ),
  ]
)
