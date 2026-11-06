import AVFoundation

/**
 * Cuts a converted song (.m4a) into consecutive parts for transcription, without re-encoding.
 * Speech-to-text models drop the rest of a song after a long instrumental stretch, or stop
 * early on long audio; part by part, every stretch is listened to (owner: lyrics must be
 * transcribed to the end). The last part absorbs a short tail rather than leaving a sliver.
 */
public enum AudioSplitter {
  public static func split(input: URL, outputDir: URL, chunkSec: Double) throws -> [URL] {
    guard chunkSec > 0 else { throw AudioProcessingError.failed("chunk length must be positive") }
    let asset = AVURLAsset(url: input)
    let duration = CMTimeGetSeconds(asset.duration)
    guard duration.isFinite, duration > 0 else { throw AudioProcessingError.noAudio }
    try FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)
    let tail = min(5, chunkSec / 4)
    var parts: [URL] = []
    var start = 0.0
    while start < duration - 0.05 {
      var end = min(duration, start + chunkSec)
      if duration - end < tail { end = duration }
      let out = outputDir.appendingPathComponent("part-\(parts.count).m4a")
      try? FileManager.default.removeItem(at: out)
      guard let export = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetPassthrough) else {
        throw AudioProcessingError.failed("no export session")
      }
      export.outputURL = out
      export.outputFileType = .m4a
      export.timeRange = CMTimeRange(
        start: CMTime(seconds: start, preferredTimescale: 44_100),
        end: CMTime(seconds: end, preferredTimescale: 44_100))
      let done = DispatchSemaphore(value: 0)
      export.exportAsynchronously { done.signal() }
      done.wait()
      guard export.status == .completed else {
        throw AudioProcessingError.failed("split part \(parts.count): \(export.error?.localizedDescription ?? "export failed")")
      }
      parts.append(out)
      start = end
    }
    return parts
  }
}
