package app.shiron.audio

import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToLong

/**
 * Decides how to trim and how much to amplify a recording, from per-block statistics.
 * The same algorithm exists in Swift (`LoudnessPlan.swift`); keep them identical.
 * Spec: docs/wiki/audio-processing.md.
 */
data class LoudnessPlan(val startFrame: Int, val endFrame: Int, val gainDb: Double) {
  companion object {
    const val SAMPLE_RATE = 44_100
    /** 100 ms blocks. */
    const val BLOCK_FRAMES = 4_410
    private const val SILENCE_DB = -45.0
    private const val PAD_START_SEC = 0.15
    private const val PAD_END_SEC = 0.3
    private const val ABSOLUTE_GATE_DB = -70.0
    private const val RELATIVE_GATE_DB = -10.0
    private const val TARGET_DB = -16.0
    private const val CEILING_DB = -1.0
    private const val MAX_GAIN_DB = 24.0
    private const val MIN_GAIN_DB = -12.0

    private fun db(power: Double) = if (power > 0) 10 * log10(power) else -200.0

    fun make(blockPower: DoubleArray, blockPeak: DoubleArray, totalFrames: Int): LoudnessPlan {
      val loud = blockPower.indices.filter { db(blockPower[it]) > SILENCE_DB }
      if (loud.isEmpty()) return LoudnessPlan(0, totalFrames, 0.0)
      val first = loud.first()
      val last = loud.last()

      val padStart = (PAD_START_SEC * SAMPLE_RATE).toInt()
      val padEnd = (PAD_END_SEC * SAMPLE_RATE).toInt()
      val start = max(0, first * BLOCK_FRAMES - padStart)
      val end = min(totalFrames, (last + 1) * BLOCK_FRAMES + padEnd)

      val kept = blockPower.sliceArray(first..last)
      val aboveAbsolute = kept.filter { db(it) > ABSOLUTE_GATE_DB }
      var loudness = SILENCE_DB
      if (aboveAbsolute.isNotEmpty()) {
        val mean = aboveAbsolute.average()
        val relativeGate = db(mean) + RELATIVE_GATE_DB
        val gated = aboveAbsolute.filter { db(it) > relativeGate }
        loudness = db(if (gated.isEmpty()) mean else gated.average())
      }

      val peak = blockPeak.sliceArray(first..last).maxOrNull() ?: 0.0
      val peakDb = if (peak > 0) 20 * log10(peak) else -200.0
      var gain = TARGET_DB - loudness
      gain = min(gain, CEILING_DB - peakDb)
      gain = max(MIN_GAIN_DB, min(MAX_GAIN_DB, gain))
      return LoudnessPlan(start, end, (gain * 100).roundToLong() / 100.0)
    }
  }
}
