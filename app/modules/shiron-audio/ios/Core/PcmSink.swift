import Foundation

/// Receives decoded mono Float32 samples at 44.1 kHz, writes them to a temporary file and keeps
/// per-block statistics. Memory stays constant however long the recording is.
final class PcmSink {
  let url: URL
  private let handle: FileHandle
  private(set) var totalFrames = 0
  private(set) var blockPower: [Double] = []
  private(set) var blockPeak: [Double] = []
  private var sumSquares = 0.0
  private var peak = 0.0
  private var inBlock = 0

  static let maxFrames = 60 * 60 * LoudnessPlan.sampleRate  // one hour

  init(url: URL) throws {
    self.url = url
    FileManager.default.createFile(atPath: url.path, contents: nil)
    handle = try FileHandle(forWritingTo: url)
  }

  func append(_ samples: UnsafeBufferPointer<Float>) throws {
    guard !samples.isEmpty else { return }
    if totalFrames + samples.count > PcmSink.maxFrames { throw AudioProcessingError.tooLong }
    for s in samples {
      let v = Double(s)
      sumSquares += v * v
      peak = max(peak, abs(v))
      inBlock += 1
      if inBlock == LoudnessPlan.blockFrames { closeBlock() }
    }
    totalFrames += samples.count
    try handle.write(contentsOf: Data(buffer: samples))
  }

  func finish() throws {
    if inBlock > 0 { closeBlock() }
    try handle.close()
  }

  private func closeBlock() {
    blockPower.append(sumSquares / Double(inBlock))
    blockPeak.append(peak)
    sumSquares = 0
    peak = 0
    inBlock = 0
  }
}
