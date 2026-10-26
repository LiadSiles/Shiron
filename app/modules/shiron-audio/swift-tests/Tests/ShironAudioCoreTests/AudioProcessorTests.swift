import AVFoundation
import XCTest
@testable import ShironAudioCore

/// Every fixture is 1 s of silence, 2 s of a 440 Hz tone at about -30 dBFS, 1 s of silence
/// (see fixtures/README.md). After processing we expect ~2.45 s (tone + 0.15 s + 0.3 s padding)
/// at about -16 dB.
final class AudioProcessorTests: XCTestCase {
  let fixtures = URL(fileURLWithPath: ProcessInfo.processInfo.environment["FIXTURES"] ?? "../fixtures")

  /// Formats that must work on iPhone.
  let required = [
    "voice-whatsapp.opus", "voice-60ms.ogg", "song.mp3", "memo.m4a", "tone.wav", "tone.flac",
    "video.mp4", "video.mov", "video.3gp",
  ]
  /// Formats we report on but don't require (AVFoundation support varies).
  let optional = ["video.mpeg", "video.webm", "tone-vorbis.ogg"]

  func out(_ name: String) -> URL {
    FileManager.default.temporaryDirectory.appendingPathComponent("\(name)-\(UUID().uuidString).m4a")
  }

  func rmsDb(_ url: URL) throws -> (db: Double, frames: Int, format: AVAudioFormat) {
    let file = try AVAudioFile(forReading: url)
    let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length))!
    try file.read(into: buffer)
    let n = Int(buffer.frameLength)
    let data = buffer.floatChannelData![0]
    var sum = 0.0
    var loudFrames = 0
    for i in 0..<n where abs(data[i]) > 0.01 {
      sum += Double(data[i] * data[i])
      loudFrames += 1
    }
    return (10 * log10(sum / Double(max(1, loudFrames))), n, file.fileFormat)
  }

  func testRequiredFormats() throws {
    for name in required {
      let output = out(name)
      let result: ProcessResult
      do {
        result = try AudioProcessor.process(input: fixtures.appendingPathComponent(name), output: output)
      } catch {
        XCTFail("\(name): \(error)")
        print("::error::\(name) failed: \(error)")
        continue
      }
      let (db, frames, format) = try rmsDb(output)
      print("::notice::\(name): \(String(format: "%.2f", result.durationSec)) s, gain \(result.gainDb) dB, level \(String(format: "%.1f", db)) dB, trim \(String(format: "%.2f", result.trimStartSec))/\(String(format: "%.2f", result.trimEndSec)) s")
      XCTAssertEqual(result.durationSec, 2.45, accuracy: 0.25, name)
      XCTAssertEqual(result.sourceDurationSec, 4.0, accuracy: 0.25, name)
      XCTAssertGreaterThan(result.gainDb, 8, name)
      XCTAssertEqual(db, -16, accuracy: 3, name)
      XCTAssertEqual(format.sampleRate, 44_100, name)
      XCTAssertEqual(format.channelCount, 1, name)
      XCTAssertEqual(format.streamDescription.pointee.mFormatID, kAudioFormatMPEG4AAC, name)
      XCTAssertGreaterThan(frames, 44_100 * 2, name)
    }
  }

  func testOptionalFormatsReport() {
    for name in optional {
      do {
        let r = try AudioProcessor.process(input: fixtures.appendingPathComponent(name), output: out(name))
        print("::notice::\(name): supported (\(String(format: "%.2f", r.durationSec)) s)")
      } catch {
        print("::warning::\(name): not supported on Apple platforms — \(error)")
      }
    }
  }

  func testNotAudioIsRejected() {
    XCTAssertThrowsError(try AudioProcessor.process(input: fixtures.appendingPathComponent("not-audio.mp3"), output: out("bad")))
  }

  func testOggParsing() throws {
    let packets = try OggOpus.packets(Data(contentsOf: fixtures.appendingPathComponent("voice-whatsapp.opus")))
    let head = try OggOpus.header(packets[0])
    XCTAssertEqual(head.channels, 1)
    XCTAssertGreaterThan(head.preSkip, 0)
    XCTAssertEqual(packets[1].prefix(8), Data("OpusTags".utf8))
    // 20 ms frames → 960 samples each; 4 s ≈ 200 packets.
    XCTAssertEqual(OggOpus.samplesInPacket(packets[5]), 960)
    XCTAssertEqual(packets.count - 2, 201, accuracy: 3)

    let p60 = try OggOpus.packets(Data(contentsOf: fixtures.appendingPathComponent("voice-60ms.ogg")))
    XCTAssertEqual(OggOpus.samplesInPacket(p60[5]), 2_880)
  }
}

final class LoudnessPlanTests: XCTestCase {
  func power(db: Double) -> Double { pow(10, db / 10) }

  func testTrimsSilenceWithPadding() {
    // 10 silent blocks, 20 loud blocks at -30 dB, 10 silent blocks.
    let p = Array(repeating: 0.0, count: 10) + Array(repeating: power(db: -30), count: 20) + Array(repeating: 0.0, count: 10)
    let peaks = p.map { $0 > 0 ? 0.045 : 0 }
    let plan = LoudnessPlan.make(blockPower: p, blockPeak: peaks, totalFrames: 40 * LoudnessPlan.blockFrames)
    XCTAssertEqual(plan.startFrame, 10 * 4_410 - 6_615)
    XCTAssertEqual(plan.endFrame, 30 * 4_410 + 13_230)
    XCTAssertEqual(plan.gainDb, 14, accuracy: 0.01)
  }

  func testPeakCeilingLimitsGain() {
    let p = Array(repeating: power(db: -30), count: 10)
    let plan = LoudnessPlan.make(blockPower: p, blockPeak: Array(repeating: 0.5, count: 10), totalFrames: 44_100)
    XCTAssertEqual(plan.gainDb, -1 - 20 * log10(0.5), accuracy: 0.01)
  }

  func testLoudInputIsTurnedDown() {
    let p = Array(repeating: power(db: -6), count: 10)
    let plan = LoudnessPlan.make(blockPower: p, blockPeak: Array(repeating: 0.9, count: 10), totalFrames: 44_100)
    XCTAssertEqual(plan.gainDb, -10, accuracy: 0.01)
  }

  func testSilenceIsLeftAlone() {
    let plan = LoudnessPlan.make(blockPower: [0, 0, 0], blockPeak: [0, 0, 0], totalFrames: 13_230)
    XCTAssertEqual(plan, LoudnessPlan(startFrame: 0, endFrame: 13_230, gainDb: 0))
  }

  func testQuietPassagesDoNotDragLoudnessDown() {
    // Mostly -20 dB with a few -50 dB breaths: the relative gate drops the breaths.
    let p = Array(repeating: power(db: -20), count: 40) + Array(repeating: power(db: -44), count: 10) + [power(db: -20)]
    let plan = LoudnessPlan.make(blockPower: p, blockPeak: Array(repeating: 0.2, count: 51), totalFrames: 51 * 4_410)
    XCTAssertEqual(plan.gainDb, 4, accuracy: 0.01)
  }
}
