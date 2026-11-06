package app.shiron.audio

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.DataInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

class AudioProcessingException(val code: String, message: String) : Exception(message)

data class ProcessResult(
  val durationSec: Double,
  val sourceDurationSec: Double,
  val gainDb: Double,
  val trimStartSec: Double,
  val trimEndSec: Double,
) {
  fun toMap() = mapOf(
    "durationSec" to durationSec, "sourceDurationSec" to sourceDurationSec, "gainDb" to gainDb,
    "trimStartSec" to trimStartSec, "trimEndSec" to trimEndSec,
  )
}

/**
 * Turns any recording the teacher may share — WhatsApp Opus, mp3, m4a, wav, flac, amr, video —
 * into a trimmed, loudness-normalised mono AAC .m4a at 44.1 kHz.
 * Pass 1 decodes to a temporary Float32 file while collecting block statistics; pass 2 applies
 * the [LoudnessPlan] and encodes. Memory stays constant.
 */
object AudioProcessor {
  private const val RATE = LoudnessPlan.SAMPLE_RATE
  private const val MAX_FRAMES = 60 * 60 * RATE
  private const val TIMEOUT_US = 10_000L
  /** A codec that stops producing output after end of input (~10 s of empty polls) is broken. */
  private const val MAX_IDLE_POLLS = 1_000

  fun process(input: File, output: File): ProcessResult {
    val tmp = File(output.parentFile, ".${System.nanoTime()}.f32")
    // Windows Media: decoded to WAV first by our FFmpeg build (WmaDecoder).
    val source = if (WmaDecoder.handles(input)) WmaDecoder.decode(input, output.parentFile!!) else input
    try {
      val sink = PcmSink(tmp)
      sink.use { decode(source, it) }
      if (sink.totalFrames == 0) throw AudioProcessingException("NO_AUDIO", "The file has no audio")
      val plan = LoudnessPlan.make(sink.blockPower(), sink.blockPeak(), sink.totalFrames)
      val written = encode(tmp, plan, output)
      return ProcessResult(
        durationSec = written.toDouble() / RATE,
        sourceDurationSec = sink.totalFrames.toDouble() / RATE,
        gainDb = plan.gainDb,
        trimStartSec = plan.startFrame.toDouble() / RATE,
        trimEndSec = (sink.totalFrames - plan.endFrame).toDouble() / RATE,
      )
    } finally {
      tmp.delete()
      if (source != input) source.delete()
    }
  }

  // ---------------------------------------------------------------- decode

  private fun decode(input: File, sink: PcmSink) {
    val extractor = MediaExtractor()
    try {
      try {
        extractor.setDataSource(input.absolutePath)
      } catch (e: Exception) {
        throw AudioProcessingException("UNSUPPORTED", "Cannot open ${input.extension}: ${e.message}")
      }
      val track = (0 until extractor.trackCount).firstOrNull {
        extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
      } ?: throw AudioProcessingException("NO_AUDIO", "The file has no audio track")
      extractor.selectTrack(track)
      val format = extractor.getTrackFormat(track)
      val mime = format.getString(MediaFormat.KEY_MIME)!!
      val codec = try {
        MediaCodec.createDecoderByType(mime)
      } catch (e: Exception) {
        throw AudioProcessingException("UNSUPPORTED", "No decoder for $mime")
      }
      try {
        codec.configure(format, null, null, 0)
        codec.start()
      } catch (e: Exception) {
        codec.release()
        throw AudioProcessingException("UNSUPPORTED", "Decoder for $mime refused the file: ${e.message}")
      }
      try {
        var channels = format.getIntegerOrNull(MediaFormat.KEY_CHANNEL_COUNT) ?: 1
        var resampler = Resampler(format.getIntegerOrNull(MediaFormat.KEY_SAMPLE_RATE) ?: RATE, RATE)
        var pcmFloat = false
        val info = MediaCodec.BufferInfo()
        var inputDone = false
        var idle = 0
        while (true) {
          if (!inputDone) {
            val i = codec.dequeueInputBuffer(TIMEOUT_US)
            if (i >= 0) {
              val buf = codec.getInputBuffer(i)!!
              val n = extractor.readSampleData(buf, 0)
              if (n < 0) {
                codec.queueInputBuffer(i, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                inputDone = true
              } else {
                codec.queueInputBuffer(i, 0, n, extractor.sampleTime, 0)
                extractor.advance()
              }
            }
          }
          val o = codec.dequeueOutputBuffer(info, TIMEOUT_US)
          if (o == MediaCodec.INFO_TRY_AGAIN_LATER && inputDone && ++idle > MAX_IDLE_POLLS) {
            throw AudioProcessingException("CORRUPT", "Decoder stopped before the end of the file")
          }
          when {
            o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
              val f = codec.outputFormat
              channels = f.getIntegerOrNull(MediaFormat.KEY_CHANNEL_COUNT) ?: channels
              resampler = Resampler(f.getIntegerOrNull(MediaFormat.KEY_SAMPLE_RATE) ?: RATE, RATE)
              pcmFloat = f.getIntegerOrNull(MediaFormat.KEY_PCM_ENCODING) == android.media.AudioFormat.ENCODING_PCM_FLOAT
            }
            o >= 0 -> {
              idle = 0
              val buf = codec.getOutputBuffer(o)!!
              buf.position(info.offset).limit(info.offset + info.size)
              val mono = toMono(buf.order(ByteOrder.nativeOrder()), channels, pcmFloat)
              codec.releaseOutputBuffer(o, false)
              sink.append(resampler.push(mono))
              if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) break
            }
          }
        }
      } catch (e: IllegalStateException) {
        throw AudioProcessingException("CORRUPT", "Decoding failed: ${e.message}")
      } finally {
        // stop() throws on a codec in the error state; release() must still run.
        runCatching { codec.stop() }
        codec.release()
      }
    } finally {
      extractor.release()
    }
  }

  private fun toMono(buf: ByteBuffer, channels: Int, float: Boolean): FloatArray {
    val samples = if (float) buf.remaining() / 4 else buf.remaining() / 2
    val frames = samples / max(1, channels)
    val out = FloatArray(frames)
    if (float) {
      val fb = buf.asFloatBuffer()
      for (f in 0 until frames) {
        var s = 0f
        for (c in 0 until channels) s += fb.get(f * channels + c)
        out[f] = s / channels
      }
    } else {
      val sb = buf.asShortBuffer()
      for (f in 0 until frames) {
        var s = 0f
        for (c in 0 until channels) s += sb.get(f * channels + c) / 32768f
        out[f] = s / channels
      }
    }
    return out
  }

  // ---------------------------------------------------------------- encode

  private fun encode(pcm: File, plan: LoudnessPlan, output: File): Int {
    output.delete()
    val format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, RATE, 1).apply {
      setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
      setInteger(MediaFormat.KEY_BIT_RATE, 96_000)
      setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16_384)
    }
    val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
    val muxer: MediaMuxer
    try {
      codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
      codec.start()
      muxer = MediaMuxer(output.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    } catch (e: Exception) {
      codec.release()
      throw AudioProcessingException("FAILED", "AAC encoder: ${e.message}")
    }
    var muxTrack = -1
    var written = 0
    var ok = false
    val gain = 10.0.pow(plan.gainDb / 20).toFloat()
    val input = DataInputStream(BufferedInputStream(FileInputStream(pcm), 1 shl 16))
    try {
      var toSkip = plan.startFrame.toLong() * 4
      while (toSkip > 0) {
        val n = input.skip(toSkip)
        if (n <= 0) break
        toSkip -= n
      }
      var remaining = plan.endFrame - plan.startFrame
      val info = MediaCodec.BufferInfo()
      var inputDone = false
      var idle = 0
      val raw = ByteArray(4 * 4096)
      while (true) {
        if (!inputDone) {
          val i = codec.dequeueInputBuffer(TIMEOUT_US)
          if (i >= 0) {
            val buf = codec.getInputBuffer(i)!!
            buf.clear()
            val frames = min(remaining, min(buf.capacity() / 2, 4096))
            if (frames <= 0) {
              codec.queueInputBuffer(i, 0, 0, presentationUs(written), MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputDone = true
            } else {
              input.readFully(raw, 0, frames * 4)
              val floats = ByteBuffer.wrap(raw, 0, frames * 4).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer()
              val shorts = buf.order(ByteOrder.nativeOrder())
              for (k in 0 until frames) {
                val v = max(-1f, min(1f, floats.get(k) * gain))
                shorts.putShort((v * 32767f).toInt().toShort())
              }
              codec.queueInputBuffer(i, 0, frames * 2, presentationUs(written), 0)
              written += frames
              remaining -= frames
            }
          }
        }
        val o = codec.dequeueOutputBuffer(info, TIMEOUT_US)
        if (o == MediaCodec.INFO_TRY_AGAIN_LATER && inputDone && ++idle > MAX_IDLE_POLLS) {
          throw AudioProcessingException("FAILED", "AAC encoder stopped before the end")
        }
        when {
          o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            muxTrack = muxer.addTrack(codec.outputFormat)
            muxer.start()
          }
          o >= 0 -> {
            idle = 0
            val buf = codec.getOutputBuffer(o)!!
            val isConfig = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
            if (!isConfig && info.size > 0 && muxTrack >= 0) {
              buf.position(info.offset).limit(info.offset + info.size)
              muxer.writeSampleData(muxTrack, buf, info)
            }
            codec.releaseOutputBuffer(o, false)
            if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) break
          }
        }
      }
      if (muxTrack < 0) throw AudioProcessingException("FAILED", "AAC encoder produced no output")
      muxer.stop()
      muxTrack = -1 // stopped: nothing left for the cleanup below
      ok = true
    } catch (e: AudioProcessingException) {
      throw e
    } catch (e: Exception) {
      throw AudioProcessingException("FAILED", "AAC encoder: ${e.message}")
    } finally {
      // Cleanup must not throw over the real error, and a half-written .m4a must not stay.
      runCatching { input.close() }
      runCatching { codec.stop() }
      codec.release()
      if (muxTrack >= 0) runCatching { muxer.stop() }
      muxer.release()
      if (!ok) output.delete()
    }
    return written
  }

  private fun presentationUs(frames: Int) = frames.toLong() * 1_000_000L / RATE

  // ---------------------------------------------------------------- helpers

  private fun MediaFormat.getIntegerOrNull(key: String): Int? =
    if (containsKey(key)) getInteger(key) else null

  /** Writes mono Float32 (little-endian) to a file and collects 100 ms block statistics. */
  private class PcmSink(file: File) : AutoCloseable {
    private val out = BufferedOutputStream(FileOutputStream(file), 1 shl 16)
    private val power = ArrayList<Double>()
    private val peaks = ArrayList<Double>()
    private var sumSquares = 0.0
    private var peak = 0.0
    private var inBlock = 0
    var totalFrames = 0
      private set
    private val bytes = ByteBuffer.allocate(4 * 8192).order(ByteOrder.LITTLE_ENDIAN)

    fun append(samples: FloatArray) {
      if (totalFrames + samples.size > MAX_FRAMES) throw AudioProcessingException("TOO_LONG", "The recording is longer than an hour")
      for (s in samples) {
        val v = s.toDouble()
        sumSquares += v * v
        peak = max(peak, abs(v))
        if (++inBlock == LoudnessPlan.BLOCK_FRAMES) closeBlock()
        if (!bytes.hasRemaining()) flushBytes()
        bytes.putFloat(s)
      }
      totalFrames += samples.size
    }

    private fun flushBytes() {
      out.write(bytes.array(), 0, bytes.position())
      bytes.clear()
    }

    private fun closeBlock() {
      power.add(sumSquares / inBlock)
      peaks.add(peak)
      sumSquares = 0.0
      peak = 0.0
      inBlock = 0
    }

    fun blockPower() = power.toDoubleArray()
    fun blockPeak() = peaks.toDoubleArray()

    override fun close() {
      if (inBlock > 0) closeBlock()
      flushBytes()
      out.close()
    }
  }

  /** Streaming linear-interpolation resampler (mono). Good enough for voice and kids' songs. */
  private class Resampler(private val from: Int, private val to: Int) {
    private val step = from.toDouble() / to
    private var pos = 0.0
    private var last = 0f
    private var hasLast = false

    fun push(input: FloatArray): FloatArray {
      if (from == to) return input
      if (input.isEmpty()) return input
      // Virtual signal: [last] + input, indices -1 … n-1 when a previous sample exists.
      val offset = if (hasLast) 1 else 0
      fun at(i: Int): Float = if (i < offset) last else input[i - offset]
      val n = input.size + offset
      // Primitive array (no boxing): an hour of audio is ~160 M samples.
      val out = FloatArray(((n - pos) / step).toInt() + 2)
      var count = 0
      while (pos + 1 < n) {
        val i = pos.toInt()
        val frac = (pos - i).toFloat()
        out[count++] = at(i) * (1 - frac) + at(i + 1) * frac
        pos += step
      }
      pos -= (n - 1)
      last = input.last()
      hasLast = true
      return out.copyOf(count)
    }
  }
}
