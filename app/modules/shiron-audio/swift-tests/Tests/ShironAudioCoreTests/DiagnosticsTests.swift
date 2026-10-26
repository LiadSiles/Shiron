import AVFoundation
import XCTest
@testable import ShironAudioCore

/// Prints what the decoders actually deliver (format, levels per block) as CI annotations.
/// Kept because the CI log is the only window onto Apple's frameworks from the dev sandbox.
final class DiagnosticsTests: XCTestCase {
  let fixtures = URL(fileURLWithPath: ProcessInfo.processInfo.environment["FIXTURES"] ?? "../fixtures")

  func describe(_ name: String, _ sink: PcmSink) {
    let dbs = sink.blockPower.map { $0 > 0 ? 10 * log10($0) : -200 }
    let shown = dbs.enumerated().filter { $0.offset % 5 == 0 }.map { String(format: "%.0f", $0.element) }
    print("::notice::\(name): frames \(sink.totalFrames), blocks \(dbs.count), max block \(String(format: "%.1f", dbs.max() ?? -200)) dB, peak \(String(format: "%.4f", sink.blockPeak.max() ?? 0)), every 5th block dB: \(shown.joined(separator: " "))")
  }

  func testAssetReaderFormatAndLevels() throws {
    for name in ["tone.wav", "memo.m4a"] {
      let url = fixtures.appendingPathComponent(name)
      let asset = AVURLAsset(url: url)
      let reader = try AVAssetReader(asset: asset)
      let output = AVAssetReaderAudioMixOutput(audioTracks: asset.tracks(withMediaType: .audio), audioSettings: [
        AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 44_100.0, AVNumberOfChannelsKey: 1,
        AVLinearPCMBitDepthKey: 32, AVLinearPCMIsFloatKey: true, AVLinearPCMIsNonInterleaved: false,
        AVLinearPCMIsBigEndianKey: false,
      ])
      reader.add(output)
      reader.startReading()
      if let first = output.copyNextSampleBuffer(), let fd = CMSampleBufferGetFormatDescription(first),
         let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(fd)?.pointee {
        print("::notice::\(name) reader ASBD: rate \(asbd.mSampleRate) flags \(asbd.mFormatFlags) bits \(asbd.mBitsPerChannel) bytes/frame \(asbd.mBytesPerFrame) ch \(asbd.mChannelsPerFrame) frames \(CMSampleBufferGetNumSamples(first))")
      }
      reader.cancelReading()

      let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("\(name).f32")
      let sink = try PcmSink(url: tmp)
      try AudioProcessor.decodeAsset(url, into: sink)
      try sink.finish()
      describe(name, sink)
    }
  }

  func testOpusLevels() throws {
    let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("opus.f32")
    let sink = try PcmSink(url: tmp)
    let resampler = Resampler(to: AudioProcessor.mono44)
    var firstFormat = ""
    try OggOpus.decode(url: fixtures.appendingPathComponent("voice-whatsapp.opus")) { buffer in
      if firstFormat.isEmpty {
        let d = buffer.floatChannelData![0]
        firstFormat = "\(buffer.format) len \(buffer.frameLength) first samples \((0..<5).map { String(format: "%.4f", d[$0 * 100]) })"
      }
      try resampler.push(buffer, into: sink)
    }
    try resampler.finish(into: sink)
    try sink.finish()
    print("::notice::opus decoder output: \(firstFormat)")
    describe("voice-whatsapp.opus", sink)
  }
}
