package app.shiron.audio

import java.io.File

/**
 * What Android's own decoders can't read (WMA/WMV, some MPEG program streams, AVI…) → a
 * temporary WAV, with the small FFmpeg in libshironffmpeg.so (native/ffmpeg, built by
 * scripts/build-ffmpeg.sh android). Used as a fallback by AudioProcessor. Without the library (a
 * local build that skipped the script) such files stay unsupported.
 */
object FfmpegDecoder {
  private val loaded: Boolean = try {
    System.loadLibrary("shironffmpeg")
    true
  } catch (e: UnsatisfiedLinkError) {
    false
  }

  @JvmStatic private external fun toWav(input: String, output: String): Int

  /** The WAV, or null when FFmpeg can't read it either (or isn't in this build). */
  fun decode(input: File, dir: File): File? {
    if (!loaded) return null
    val wav = File(dir, ".${input.nameWithoutExtension}-${System.nanoTime()}.wav")
    return when (toWav(input.path, wav.path)) {
      0 -> wav
      -6 -> throw AudioProcessingException("TOO_LONG", "Longer than an hour")
      else -> null
    }
  }
}
