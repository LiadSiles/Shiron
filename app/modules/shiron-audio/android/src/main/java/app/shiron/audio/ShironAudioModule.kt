package app.shiron.audio

import android.net.Uri
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class ShironAudioModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ShironAudio")

    // Async functions run off the JS thread; a few seconds for a typical song.
    AsyncFunction("processAsync") { inputUri: String, outputUri: String ->
      val input = fileOf(inputUri)
      val output = fileOf(outputUri)
      try {
        AudioProcessor.process(input, output).toMap()
      } catch (e: AudioProcessingException) {
        output.delete()
        throw CodedException("ERR_AUDIO_${e.code}", e.message ?: "Processing failed", e)
      } catch (e: Exception) {
        // Anything unexpected (I/O, out of memory in a codec) still reports a code the app knows.
        output.delete()
        throw CodedException("ERR_AUDIO_FAILED", e.message ?: e.toString(), e)
      }
    }

    // Keep saving/processing alive in the background (WorkService); the JS side calls these when
    // the processing queue starts and when it is empty again.
    Function("startBackgroundWork") { text: String ->
      appContext.reactContext?.let { WorkService.start(it, text) }
      Unit
    }
    Function("stopBackgroundWork") {
      appContext.reactContext?.let { WorkService.stop(it) }
      Unit
    }
  }

  private fun fileOf(uri: String): File {
    val parsed = Uri.parse(uri)
    if (parsed.scheme != "file" || parsed.path == null) {
      throw CodedException("ERR_AUDIO_BAD_URI", "Expected a file:// URI, got $uri", null)
    }
    return File(parsed.path!!)
  }
}
