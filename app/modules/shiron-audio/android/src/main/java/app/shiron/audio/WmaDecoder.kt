package app.shiron.audio

import java.io.File

/**
 * WMA, or a WMV's sound, → a temporary WAV, with the minimal FFmpeg in libshironwma.so
 * (native/wma, built by scripts/build-wma-decoder.sh android): Android doesn't decode Windows
 * Media. Without the library (a local build that skipped the script) such files are unsupported.
 */
object WmaDecoder {
  private val loaded: Boolean = try {
    System.loadLibrary("shironwma")
    true
  } catch (e: UnsatisfiedLinkError) {
    false
  }

  @JvmStatic private external fun toWav(input: String, output: String): Int

  fun handles(file: File): Boolean = file.extension.lowercase() in setOf("wma", "wmv", "asf")

  fun decode(input: File, dir: File): File {
    if (!loaded) throw AudioProcessingException("UNSUPPORTED", "Windows Media decoder not in this build")
    val wav = File(dir, "${input.nameWithoutExtension}-${System.nanoTime()}.wav")
    when (val code = toWav(input.path, wav.path)) {
      0 -> return wav
      -6 -> throw AudioProcessingException("TOO_LONG", "Longer than an hour")
      else -> throw AudioProcessingException("UNSUPPORTED", "Windows Media (decoder $code)")
    }
  }
}
