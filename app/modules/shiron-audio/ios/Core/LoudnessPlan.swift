import Foundation

/// Decides how to trim and how much to amplify a recording, from per-block statistics.
/// The same algorithm exists in Kotlin (`LoudnessPlan.kt`); keep them identical.
/// Spec: docs/wiki/audio-processing.md.
public struct LoudnessPlan: Equatable {
  public let startFrame: Int
  public let endFrame: Int
  public let gainDb: Double

  public static let sampleRate = 44_100
  /// 100 ms blocks.
  public static let blockFrames = 4_410
  static let silenceDb = -45.0
  static let padStartSec = 0.15
  static let padEndSec = 0.3
  static let absoluteGateDb = -70.0
  static let relativeGateDb = -10.0
  static let targetDb = -16.0
  static let ceilingDb = -1.0
  static let maxGainDb = 24.0
  static let minGainDb = -12.0

  /// - Parameters:
  ///   - blockPower: mean square of the samples in each block (last block may be partial).
  ///   - blockPeak: largest absolute sample in each block.
  ///   - totalFrames: number of mono frames at `sampleRate`.
  public static func make(blockPower: [Double], blockPeak: [Double], totalFrames: Int) -> LoudnessPlan {
    func db(_ power: Double) -> Double { power > 0 ? 10 * log10(power) : -200 }

    let loud = blockPower.indices.filter { db(blockPower[$0]) > silenceDb }
    guard let first = loud.first, let last = loud.last else {
      // Nothing above the silence threshold: keep everything as it is.
      return LoudnessPlan(startFrame: 0, endFrame: totalFrames, gainDb: 0)
    }

    let padStart = Int(padStartSec * Double(sampleRate))
    let padEnd = Int(padEndSec * Double(sampleRate))
    let start = max(0, first * blockFrames - padStart)
    let end = min(totalFrames, (last + 1) * blockFrames + padEnd)

    // Gated mean power over the kept range (EBU R128-like, without K-weighting).
    let kept = Array(blockPower[first...last])
    let aboveAbsolute = kept.filter { db($0) > absoluteGateDb }
    var loudness = silenceDb
    if !aboveAbsolute.isEmpty {
      let mean = aboveAbsolute.reduce(0, +) / Double(aboveAbsolute.count)
      let relativeGate = db(mean) + relativeGateDb
      let gated = aboveAbsolute.filter { db($0) > relativeGate }
      let gatedMean = gated.isEmpty ? mean : gated.reduce(0, +) / Double(gated.count)
      loudness = db(gatedMean)
    }

    let peak = blockPeak[first...last].max() ?? 0
    let peakDb = peak > 0 ? 20 * log10(peak) : -200
    var gain = targetDb - loudness
    gain = min(gain, ceilingDb - peakDb)
    gain = max(minGainDb, min(maxGainDb, gain))
    return LoudnessPlan(startFrame: start, endFrame: end, gainDb: (gain * 100).rounded() / 100)
  }
}
