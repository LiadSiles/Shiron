import AVFoundation

/**
 * A copy of a converted song for sharing out of the app: the same AAC audio, re-wrapped from
 * the .m4a (MPEG-4) container into a plain ADTS stream (.aac), without re-encoding.
 *
 * iOS declares .m4a as MPEG-4 audio, which conforms to public.mpeg-4 — a movie type. WhatsApp's
 * share extension therefore took every shared song for a video: it showed its video trimmer,
 * then said the file isn't supported (owner, 0.13.0). An .aac file is audio and nothing else
 * (public.aac-audio) to every app, and plays on iPhones and Android phones alike.
 */
public enum AacExporter {
  /// ADTS sampling-frequency indexes (ISO 14496-3, 1.6.3.4).
  static let frequencies = [96_000, 88_200, 64_000, 48_000, 44_100, 32_000, 24_000, 22_050, 16_000, 12_000, 11_025, 8_000, 7_350]

  public static func export(input: URL, output: URL) throws {
    let asset = AVURLAsset(url: input)
    guard let track = asset.tracks(withMediaType: .audio).first else { throw AudioProcessingError.noAudio }
    guard let format = track.formatDescriptions.first,
          let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(format as! CMAudioFormatDescription)?.pointee,
          asbd.mFormatID == kAudioFormatMPEG4AAC else {
      throw AudioProcessingError.unsupported("not AAC")
    }
    guard let frequency = frequencies.firstIndex(of: Int(asbd.mSampleRate)) else {
      throw AudioProcessingError.unsupported("AAC at \(Int(asbd.mSampleRate)) Hz")
    }
    // mFormatFlags holds the MPEG-4 object type when the file states one; AudioProcessor writes
    // AAC-LC (2), and 0 means "not stated" — read as LC (0 would make it AAC Main, which no
    // player decodes: the first CI run failed reading the copy). ADTS stores the type minus one.
    let objectType = (1...4).contains(Int(asbd.mFormatFlags)) ? Int(asbd.mFormatFlags) : 2
    let profile = objectType - 1
    let channels = Int(asbd.mChannelsPerFrame)

    let reader = try AVAssetReader(asset: asset)
    let packets = AVAssetReaderTrackOutput(track: track, outputSettings: nil) // as stored: no decoding
    reader.add(packets)
    guard reader.startReading() else {
      throw AudioProcessingError.failed("reading: \(reader.error?.localizedDescription ?? "unknown")")
    }
    var out = Data()
    while let buffer = packets.copyNextSampleBuffer() {
      guard let block = CMSampleBufferGetDataBuffer(buffer) else { continue }
      let count = CMSampleBufferGetNumSamples(buffer)
      var sizes = [Int](repeating: 0, count: count)
      CMSampleBufferGetSampleSizeArray(buffer, entryCount: count, arrayToFill: &sizes, entriesNeededOut: nil)
      var offset = 0
      for size in sizes where size > 0 {
        out.append(contentsOf: header(payload: size, profile: profile, frequency: frequency, channels: channels))
        var packet = [UInt8](repeating: 0, count: size)
        CMBlockBufferCopyDataBytes(block, atOffset: offset, dataLength: size, destination: &packet)
        out.append(contentsOf: packet)
        offset += size
      }
    }
    guard reader.status == .completed, !out.isEmpty else {
      throw AudioProcessingError.failed("reading: \(reader.error?.localizedDescription ?? "no audio packets")")
    }
    try out.write(to: output, options: .atomic)
  }

  /// The 7-byte ADTS header (MPEG-4, no CRC) in front of one AAC packet.
  static func header(payload: Int, profile: Int, frequency: Int, channels: Int) -> [UInt8] {
    let length: Int = payload + 7
    let b2: Int = (profile & 0x3) << 6 | (frequency & 0xF) << 2 | (channels >> 2) & 0x1
    let b3: Int = (channels & 0x3) << 6 | (length >> 11) & 0x3
    let b4: Int = (length >> 3) & 0xFF
    let b5: Int = (length & 0x7) << 5 | 0x1F
    return [0xFF, 0xF1, UInt8(b2), UInt8(b3), UInt8(b4), UInt8(b5), 0xFC]
  }
}
