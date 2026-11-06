import AVFoundation
import XCTest
@testable import ShironAudioCore

/// A converted song is cut into parts that together cover all of it.
final class AudioSplitterTests: XCTestCase {
  let fixtures = URL(fileURLWithPath: ProcessInfo.processInfo.environment["FIXTURES"] ?? "../fixtures")

  func testPartsCoverTheWholeSong() throws {
    let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("split-\(UUID().uuidString)")
    let song = tmp.appendingPathExtension("m4a")
    let result = try AudioProcessor.process(input: fixtures.appendingPathComponent("song.mp3"), output: song)
    let parts = try AudioSplitter.split(input: song, outputDir: tmp, chunkSec: 1.0)
    let lengths = try parts.map { try Double(AVAudioFile(forReading: $0).length) / 44_100 }
    print("::notice::split \(String(format: "%.2f", result.durationSec)) s into \(lengths.map { String(format: "%.2f", $0) })")
    XCTAssertEqual(parts.count, 3)
    XCTAssertEqual(lengths.reduce(0, +), result.durationSec, accuracy: 0.15)
    for l in lengths.dropLast() { XCTAssertEqual(l, 1.0, accuracy: 0.1) }
  }
}
