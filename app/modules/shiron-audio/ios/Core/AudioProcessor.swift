import AVFoundation

public enum AudioProcessingError: Error, LocalizedError, Equatable {
  case unsupported(String)
  case noAudio
  case tooLong
  case corrupt(String)
  case failed(String)

  public var code: String {
    switch self {
    case .unsupported: return "UNSUPPORTED"
    case .noAudio: return "NO_AUDIO"
    case .tooLong: return "TOO_LONG"
    case .corrupt: return "CORRUPT"
    case .failed: return "FAILED"
    }
  }

  public var errorDescription: String? {
    switch self {
    case .unsupported(let what): return "Unsupported format: \(what)"
    case .noAudio: return "The file has no audio"
    case .tooLong: return "The recording is longer than an hour"
    case .corrupt(let what): return "Damaged file: \(what)"
    case .failed(let what): return what
    }
  }
}

public struct ProcessResult: Equatable {
  public let durationSec: Double
  public let sourceDurationSec: Double
  public let gainDb: Double
  public let trimStartSec: Double
  public let trimEndSec: Double

  public var dictionary: [String: Any] {
    [
      "durationSec": durationSec, "sourceDurationSec": sourceDurationSec, "gainDb": gainDb,
      "trimStartSec": trimStartSec, "trimEndSec": trimEndSec,
    ]
  }
}

/// Turns any recording the teacher may share — WhatsApp Opus, mp3, m4a, wav, flac, video — into
/// a trimmed, loudness-normalised mono AAC .m4a at 44.1 kHz that every player handles.
public enum AudioProcessor {
  static let rate = Double(LoudnessPlan.sampleRate)
  static let mono44 = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: rate, channels: 1, interleaved: false)!

  public static func process(input: URL, output: URL) throws -> ProcessResult {
    let tmp = output.deletingLastPathComponent().appendingPathComponent(".\(UUID().uuidString).f32")
    defer { try? FileManager.default.removeItem(at: tmp) }

    let sink = try PcmSink(url: tmp)
    if OggOpus.isOgg(input) {
      let resampler = Resampler(to: mono44)
      try OggOpus.decode(url: input) { try resampler.push($0, into: sink) }
      try resampler.finish(into: sink)
    } else {
      try decodeAsset(input, into: sink)
    }
    try sink.finish()
    guard sink.totalFrames > 0 else { throw AudioProcessingError.noAudio }

    let plan = LoudnessPlan.make(blockPower: sink.blockPower, blockPeak: sink.blockPeak, totalFrames: sink.totalFrames)
    let written = try encode(pcm: tmp, plan: plan, to: output)
    return ProcessResult(
      durationSec: Double(written) / rate,
      sourceDurationSec: Double(sink.totalFrames) / rate,
      gainDb: plan.gainDb,
      trimStartSec: Double(plan.startFrame) / rate,
      trimEndSec: Double(sink.totalFrames - plan.endFrame) / rate)
  }

  /// Everything AVFoundation reads (mp3, aac/m4a, wav, aiff, caf, flac, amr, mp4/mov/3gp video…),
  /// mixed to mono and resampled to 44.1 kHz by AVAssetReader itself.
  static func decodeAsset(_ url: URL, into sink: PcmSink) throws {
    let asset = AVURLAsset(url: url)
    let tracks = asset.tracks(withMediaType: .audio)
    guard !tracks.isEmpty else {
      throw asset.isReadable || !asset.tracks.isEmpty ? AudioProcessingError.noAudio
        : AudioProcessingError.unsupported(url.pathExtension)
    }
    let reader: AVAssetReader
    do { reader = try AVAssetReader(asset: asset) } catch { throw AudioProcessingError.unsupported(url.pathExtension) }
    let output = AVAssetReaderAudioMixOutput(audioTracks: tracks, audioSettings: [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: rate,
      AVNumberOfChannelsKey: 1,
      AVLinearPCMBitDepthKey: 32,
      AVLinearPCMIsFloatKey: true,
      AVLinearPCMIsNonInterleaved: false,
      AVLinearPCMIsBigEndianKey: false,
    ])
    output.alwaysCopiesSampleData = false
    guard reader.canAdd(output) else { throw AudioProcessingError.unsupported(url.pathExtension) }
    reader.add(output)
    guard reader.startReading() else {
      throw AudioProcessingError.unsupported("\(url.pathExtension): \(reader.error?.localizedDescription ?? "cannot read")")
    }
    // Sample buffers are Core Foundation objects handed out autoreleased: drain them per buffer,
    // or an hour-long recording holds every decoded buffer in memory until the end.
    while try autoreleasepool(invoking: { () throws -> Bool in
      guard let sample = output.copyNextSampleBuffer() else { return false }
      try append(sample, to: sink)
      return true
    }) {}
    if reader.status == .failed {
      throw AudioProcessingError.corrupt(reader.error?.localizedDescription ?? "read failed")
    }
  }

  /// Float32 mono samples of one buffer into the sink (contiguous or not).
  private static func append(_ sample: CMSampleBuffer, to sink: PcmSink) throws {
    guard let block = CMSampleBufferGetDataBuffer(sample) else { return }
    var length = 0
    var pointer: UnsafeMutablePointer<Int8>?
    guard CMBlockBufferGetDataPointer(block, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &length,
                                      dataPointerOut: &pointer) == kCMBlockBufferNoErr, let pointer else {
      // Non-contiguous buffer: copy it out.
      var data = Data(count: CMBlockBufferGetDataLength(block))
      _ = data.withUnsafeMutableBytes { CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: $0.count, destination: $0.baseAddress!) }
      try data.withUnsafeBytes { try sink.append($0.bindMemory(to: Float.self)) }
      return
    }
    try pointer.withMemoryRebound(to: Float.self, capacity: length / 4) {
      try sink.append(UnsafeBufferPointer(start: $0, count: length / 4))
    }
  }

  /// Applies the plan (trim + gain) and encodes AAC into an .m4a. Returns frames written.
  static func encode(pcm: URL, plan: LoudnessPlan, to output: URL) throws -> Int {
    try? FileManager.default.removeItem(at: output)
    let file: AVAudioFile
    do {
      file = try AVAudioFile(forWriting: output, settings: [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVSampleRateKey: rate,
        AVNumberOfChannelsKey: 1,
        AVEncoderBitRateKey: 96_000,
      ], commonFormat: .pcmFormatFloat32, interleaved: false)
    } catch {
      throw AudioProcessingError.failed("AAC encoder: \(error.localizedDescription)")
    }

    let gain = Float(pow(10, plan.gainDb / 20))
    let reader = try FileHandle(forReadingFrom: pcm)
    defer { try? reader.close() }
    try reader.seek(toOffset: UInt64(plan.startFrame * 4))
    var remaining = plan.endFrame - plan.startFrame
    let chunk = LoudnessPlan.sampleRate
    let buffer = AVAudioPCMBuffer(pcmFormat: mono44, frameCapacity: AVAudioFrameCount(chunk))!
    var written = 0
    while remaining > 0 {
      let want = min(chunk, remaining)
      guard let data = try reader.read(upToCount: want * 4), !data.isEmpty else { break }
      let frames = data.count / 4
      data.withUnsafeBytes { raw in
        let src = raw.bindMemory(to: Float.self)
        let dst = buffer.floatChannelData![0]
        for i in 0..<frames { dst[i] = max(-1, min(1, src[i] * gain)) }
      }
      buffer.frameLength = AVAudioFrameCount(frames)
      do { try file.write(from: buffer) } catch { throw AudioProcessingError.failed("AAC encoder: \(error.localizedDescription)") }
      written += frames
      remaining -= frames
    }
    return written
  }
}

/// Streams PCM in any format to mono Float32 at 44.1 kHz.
final class Resampler {
  private let target: AVAudioFormat
  private var converter: AVAudioConverter?
  private var pending: AVAudioPCMBuffer?

  init(to target: AVAudioFormat) { self.target = target }

  func push(_ buffer: AVAudioPCMBuffer, into sink: PcmSink) throws {
    if converter == nil {
      converter = AVAudioConverter(from: buffer.format, to: target)
      guard converter != nil else { throw AudioProcessingError.failed("no resampler for \(buffer.format)") }
    }
    pending = buffer
    try drain(into: sink, endOfStream: false)
  }

  func finish(into sink: PcmSink) throws {
    guard converter != nil else { return }
    try drain(into: sink, endOfStream: true)
  }

  private func drain(into sink: PcmSink, endOfStream: Bool) throws {
    guard let converter else { return }
    let capacity = AVAudioFrameCount(max(4_096, Int(Double(pending?.frameLength ?? 0) * target.sampleRate / converter.inputFormat.sampleRate) + 64))
    while true {
      let out = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity)!
      var error: NSError?
      let status = converter.convert(to: out, error: &error) { _, outStatus in
        if let p = self.pending {
          self.pending = nil
          outStatus.pointee = .haveData
          return p
        }
        outStatus.pointee = endOfStream ? .endOfStream : .noDataNow
        return nil
      }
      if status == .error { throw AudioProcessingError.failed("resample: \(error?.localizedDescription ?? "")") }
      if out.frameLength > 0 {
        try sink.append(UnsafeBufferPointer(start: out.floatChannelData![0], count: Int(out.frameLength)))
      }
      if status != .haveData { return }
    }
  }
}
