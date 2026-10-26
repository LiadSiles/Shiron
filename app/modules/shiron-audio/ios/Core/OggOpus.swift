import AVFoundation

/// WhatsApp voice notes are Opus in an Ogg container. Apple's frameworks decode Opus but don't
/// read Ogg, so this splits the Ogg stream into Opus packets (RFC 3533 / RFC 7845) and decodes
/// each packet with AVAudioConverter.
enum OggOpus {
  struct Header {
    let channels: Int
    let preSkip: Int
  }

  static func isOgg(_ url: URL) -> Bool {
    guard let h = try? FileHandle(forReadingFrom: url) else { return false }
    defer { try? h.close() }
    return (try? h.read(upToCount: 4)) == Data("OggS".utf8)
  }

  /// Packets of the first logical stream, in order.
  static func packets(_ data: Data) throws -> [Data] {
    var packets: [Data] = []
    var partial = Data()
    var serial: UInt32?
    var pos = data.startIndex
    while pos + 27 <= data.endIndex {
      guard data[pos..<pos + 4] == Data("OggS".utf8) else { throw AudioProcessingError.corrupt("Ogg page sync lost") }
      let pageSerial = data[pos + 14..<pos + 18].withUnsafeBytes { $0.loadUnaligned(as: UInt32.self) }
      let segments = Int(data[pos + 26])
      let tableStart = pos + 27
      guard tableStart + segments <= data.endIndex else { throw AudioProcessingError.corrupt("truncated Ogg page") }
      let lacing = data[tableStart..<tableStart + segments]
      var body = tableStart + segments
      let pageEnd = body + lacing.reduce(0) { $0 + Int($1) }
      guard pageEnd <= data.endIndex else { throw AudioProcessingError.corrupt("truncated Ogg page") }
      if serial == nil { serial = pageSerial }
      if pageSerial == serial {
        for len in lacing {
          partial.append(data[body..<body + Int(len)])
          body += Int(len)
          // A segment shorter than 255 bytes ends a packet; 255 means it continues.
          if len < 255 {
            packets.append(partial)
            partial = Data()
          }
        }
      }
      pos = pageEnd
    }
    return packets
  }

  static func header(_ packet: Data) throws -> Header {
    guard packet.count >= 19, packet.prefix(8) == Data("OpusHead".utf8) else {
      throw AudioProcessingError.unsupported("Ogg stream is not Opus")
    }
    let b = Array(packet)
    let channels = Int(b[9])
    let preSkip = Int(UInt16(b[10]) | UInt16(b[11]) << 8)
    guard channels == 1 || channels == 2 else { throw AudioProcessingError.unsupported("\(channels)-channel Opus") }
    return Header(channels: channels, preSkip: preSkip)
  }

  /// Samples per channel at 48 kHz in one Opus packet, from its TOC byte (RFC 6716 §3.1).
  static func samplesInPacket(_ packet: Data) -> Int {
    guard let toc = packet.first else { return 0 }
    let config = Int(toc >> 3)
    let frameSamples: Int
    switch config {
    case 0...11: frameSamples = [480, 960, 1920, 2880][config % 4]   // SILK 10/20/40/60 ms
    case 12...15: frameSamples = [480, 960][config % 2]              // Hybrid 10/20 ms
    default: frameSamples = [120, 240, 480, 960][config % 4]         // CELT 2.5/5/10/20 ms
    }
    let frames: Int
    switch toc & 0x3 {
    case 0: frames = 1
    case 1, 2: frames = 2
    default: frames = packet.count > 1 ? Int(packet[packet.startIndex + 1] & 0x3F) : 0
    }
    return frameSamples * frames
  }

  /// Decodes the whole stream to 48 kHz Float32 and hands it on in buffers.
  static func decode(url: URL, emit: (AVAudioPCMBuffer) throws -> Void) throws {
    let all = try packets(Data(contentsOf: url, options: .mappedIfSafe))
    guard all.count >= 2 else { throw AudioProcessingError.noAudio }
    let head = try header(all[0])
    // all[1] is OpusTags.
    let outFormat = AVAudioFormat(
      commonFormat: .pcmFormatFloat32, sampleRate: 48_000,
      channels: AVAudioChannelCount(head.channels), interleaved: false)!

    var converters: [Int: (AVAudioConverter, AVAudioFormat)] = [:]
    var toSkip = head.preSkip

    for packet in all.dropFirst(2) where !packet.isEmpty {
      let samples = samplesInPacket(packet)
      guard samples > 0 else { continue }
      if converters[samples] == nil {
        var asbd = AudioStreamBasicDescription(
          mSampleRate: 48_000, mFormatID: kAudioFormatOpus, mFormatFlags: 0,
          mBytesPerPacket: 0, mFramesPerPacket: UInt32(samples), mBytesPerFrame: 0,
          mChannelsPerFrame: UInt32(head.channels), mBitsPerChannel: 0, mReserved: 0)
        guard let inFormat = AVAudioFormat(streamDescription: &asbd),
              let converter = AVAudioConverter(from: inFormat, to: outFormat) else {
          throw AudioProcessingError.unsupported("Opus decoder unavailable")
        }
        converters[samples] = (converter, inFormat)
      }
      let (converter, inFormat) = converters[samples]!

      let compressed = AVAudioCompressedBuffer(format: inFormat, packetCapacity: 1, maximumPacketSize: packet.count)
      packet.withUnsafeBytes { compressed.data.copyMemory(from: $0.baseAddress!, byteCount: packet.count) }
      compressed.packetDescriptions?.pointee = AudioStreamPacketDescription(
        mStartOffset: 0, mVariableFramesInPacket: 0, mDataByteSize: UInt32(packet.count))
      compressed.packetCount = 1
      compressed.byteLength = UInt32(packet.count)

      guard let pcm = AVAudioPCMBuffer(pcmFormat: outFormat, frameCapacity: AVAudioFrameCount(samples)) else { continue }
      var fed = false
      var error: NSError?
      let status = converter.convert(to: pcm, error: &error) { _, outStatus in
        if fed {
          outStatus.pointee = .noDataNow
          return nil
        }
        fed = true
        outStatus.pointee = .haveData
        return compressed
      }
      if status == .error { throw AudioProcessingError.corrupt("Opus packet: \(error?.localizedDescription ?? "decode failed")") }
      guard pcm.frameLength > 0 else { continue }

      if toSkip > 0 {
        let skip = min(toSkip, Int(pcm.frameLength))
        toSkip -= skip
        if skip == Int(pcm.frameLength) { continue }
        let rest = AVAudioPCMBuffer(pcmFormat: outFormat, frameCapacity: pcm.frameLength - AVAudioFrameCount(skip))!
        rest.frameLength = rest.frameCapacity
        for ch in 0..<head.channels {
          rest.floatChannelData![ch].update(from: pcm.floatChannelData![ch] + skip, count: Int(rest.frameLength))
        }
        try emit(rest)
      } else {
        try emit(pcm)
      }
    }
  }
}
