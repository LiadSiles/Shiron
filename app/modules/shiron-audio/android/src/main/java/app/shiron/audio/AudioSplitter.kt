package app.shiron.audio

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import java.io.File
import java.nio.ByteBuffer

/**
 * Cuts a converted song (.m4a) into consecutive parts for transcription, without re-encoding
 * (same rules as ios/Core/AudioSplitter.swift): speech-to-text models drop the rest of a song
 * after a long instrumental stretch, so every stretch is sent on its own. The last part absorbs
 * a short tail rather than leaving a sliver.
 */
object AudioSplitter {
  fun split(input: File, outputDir: File, chunkSec: Double): List<File> {
    require(chunkSec > 0) { "chunk length must be positive" }
    outputDir.mkdirs()
    val extractor = MediaExtractor()
    try {
      extractor.setDataSource(input.path)
      val track = (0 until extractor.trackCount).firstOrNull {
        extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
      } ?: throw AudioProcessingException("NO_AUDIO", "No audio track")
      extractor.selectTrack(track)
      val format = extractor.getTrackFormat(track)
      val durationUs = format.getLong(MediaFormat.KEY_DURATION)
      val chunkUs = (chunkSec * 1_000_000).toLong()
      val tailUs = minOf(5_000_000L, chunkUs / 4)
      val buffer = ByteBuffer.allocate(1 shl 20)
      val info = MediaCodec.BufferInfo()
      val parts = mutableListOf<File>()
      var start = 0L
      // Read straight through: a sample at a boundary starts the next part.
      var size = extractor.readSampleData(buffer, 0)
      while (start < durationUs - 50_000 && size >= 0) {
        var end = minOf(durationUs, start + chunkUs)
        if (durationUs - end < tailUs) end = durationUs
        val out = File(outputDir, "part-${parts.size}.m4a").apply { delete() }
        val muxer = MediaMuxer(out.path, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        val outTrack = muxer.addTrack(format)
        muxer.start()
        var wrote = false
        while (size >= 0 && (extractor.sampleTime < end || end == durationUs)) {
          val flags = if (extractor.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC != 0) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0
          info.set(0, size, maxOf(0L, extractor.sampleTime - start), flags)
          muxer.writeSampleData(outTrack, buffer, info)
          wrote = true
          extractor.advance()
          size = extractor.readSampleData(buffer, 0)
        }
        if (wrote) muxer.stop()
        muxer.release()
        if (wrote) parts.add(out) else out.delete()
        start = end
      }
      return parts
    } finally {
      extractor.release()
    }
  }
}
