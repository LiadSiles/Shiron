package app.shiron.audio

import android.media.MediaExtractor
import android.media.MediaFormat
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Runs the real decoder/encoder on the emulator against ../fixtures (same files as the Swift tests).
 * Every fixture: 1 s silence, 2 s tone at about -30 dBFS, 1 s silence → expect ~2.45 s out.
 */
@RunWith(AndroidJUnit4::class)
class AudioProcessorTest {
  private val ctx = InstrumentationRegistry.getInstrumentation().context
  private val dir = InstrumentationRegistry.getInstrumentation().targetContext.cacheDir

  private val required = listOf(
    "voice-whatsapp.opus", "voice-60ms.ogg", "song.mp3", "memo.m4a", "tone.wav", "tone.flac",
    "tone-vorbis.ogg", "video.mp4", "video.mov", "video.3gp", "video.webm",
  )

  private fun copy(name: String): File {
    val f = File(dir, name)
    ctx.assets.open(name).use { input -> f.outputStream().use { input.copyTo(it) } }
    return f
  }

  @Test fun requiredFormats() {
    val failures = mutableListOf<String>()
    for (name in required) {
      val out = File(dir, "$name.m4a")
      try {
        val r = AudioProcessor.process(copy(name), out)
        Log.i("ShironAudioTest", "$name: ${r.durationSec} s, gain ${r.gainDb} dB")
        if (kotlin.math.abs(r.durationSec - 2.45) > 0.25) failures += "$name: duration ${r.durationSec}"
        if (r.gainDb <= 8) failures += "$name: gain ${r.gainDb}"
        val ex = MediaExtractor().apply { setDataSource(out.absolutePath) }
        val fmt = ex.getTrackFormat(0)
        if (fmt.getString(MediaFormat.KEY_MIME) != MediaFormat.MIMETYPE_AUDIO_AAC) failures += "$name: not AAC"
        if (fmt.getInteger(MediaFormat.KEY_SAMPLE_RATE) != 44_100) failures += "$name: rate"
        if (fmt.getInteger(MediaFormat.KEY_CHANNEL_COUNT) != 1) failures += "$name: channels"
        ex.release()
      } catch (e: Exception) {
        failures += "$name: ${e.javaClass.simpleName}: ${e.message}"
      }
    }
    if (failures.isNotEmpty()) fail(failures.joinToString("\n"))
  }

  @Test fun mpegVideoIsReported() {
    // MPEG-PS with MP2 audio: supported by some Android builds only. Report, don't fail.
    try {
      val r = AudioProcessor.process(copy("video.mpeg"), File(dir, "mpeg.m4a"))
      Log.i("ShironAudioTest", "video.mpeg supported: ${r.durationSec} s")
    } catch (e: AudioProcessingException) {
      Log.w("ShironAudioTest", "video.mpeg not supported: ${e.message}")
    }
  }

  @Test fun notAudioIsRejected() {
    try {
      AudioProcessor.process(copy("not-audio.mp3"), File(dir, "bad.m4a"))
      fail("expected an exception")
    } catch (e: AudioProcessingException) {
      assertTrue(e.code in setOf("UNSUPPORTED", "NO_AUDIO", "CORRUPT"))
    }
  }

  @Test fun outputIsSmallerThanWav() {
    val out = File(dir, "wav.m4a")
    AudioProcessor.process(copy("tone.wav"), out)
    assertTrue(out.length() in 1_000 until 128_078)
    assertEquals(true, out.exists())
  }

  @Test fun splitPartsCoverTheWholeSong() {
    val song = File(dir, "split-song.m4a")
    val r = AudioProcessor.process(copy("song.mp3"), song)
    val parts = AudioSplitter.split(song, File(dir, "split-parts"), 1.0)
    val lengths = parts.map { part ->
      MediaExtractor().run {
        setDataSource(part.path)
        val us = getTrackFormat(0).getLong(MediaFormat.KEY_DURATION)
        release()
        us / 1_000_000.0
      }
    }
    Log.i("ShironAudioTest", "split ${r.durationSec} s into $lengths")
    assertEquals(3, parts.size)
    assertEquals(r.durationSec, lengths.sum(), 0.15)
  }
}
