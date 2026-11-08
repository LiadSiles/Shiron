import AVFoundation
import XCTest
@testable import ShironAudioCore

/// The copy shared out of the app (.aac): the same audio, readable, every packet framed.
final class AacExporterTests: XCTestCase {
  let fixtures = URL(fileURLWithPath: ProcessInfo.processInfo.environment["FIXTURES"] ?? "../fixtures")

  func testSharedCopyIsTheSameSongAsPlainAac() throws {
    let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("aac-\(UUID().uuidString)")
    let song = tmp.appendingPathExtension("m4a")
    let shared = tmp.appendingPathExtension("aac")
    let result = try AudioProcessor.process(input: fixtures.appendingPathComponent("song.mp3"), output: song)
    try AacExporter.export(input: song, output: shared)

    let bytes = [UInt8](try Data(contentsOf: shared))
    XCTAssertEqual(Array(bytes.prefix(2)), [0xFF, 0xF1], "starts with an ADTS sync word")
    // Walk the frames: each header's length leads exactly to the next sync word, then to the end.
    var at = 0, frames = 0
    while at < bytes.count {
      XCTAssertEqual(bytes[at], 0xFF); XCTAssertEqual(bytes[at + 1] & 0xF6, 0xF0)
      let length = Int(bytes[at + 3] & 0x3) << 11 | Int(bytes[at + 4]) << 3 | Int(bytes[at + 5]) >> 5
      XCTAssertGreaterThan(length, 7)
      at += length; frames += 1
    }
    XCTAssertEqual(at, bytes.count)

    let file = try AVAudioFile(forReading: shared)
    let seconds = Double(file.length) / file.fileFormat.sampleRate
    print("::notice::shared copy: \(frames) AAC frames, \(String(format: "%.2f", seconds)) s of \(String(format: "%.2f", result.durationSec)) s, \(bytes.count) bytes")
    XCTAssertEqual(file.fileFormat.sampleRate, 44_100)
    XCTAssertEqual(seconds, result.durationSec, accuracy: 0.1)
  }

  func testHeaderEncodesLengthAndFormat() {
    // 100 bytes of AAC-LC, 44.1 kHz, mono → frame length 107.
    let h = AacExporter.header(payload: 100, profile: 1, frequency: 4, channels: 1)
    XCTAssertEqual(h, [0xFF, 0xF1, 0x50, 0x40, 0x0D, 0x7F, 0xFC])
  }
}
