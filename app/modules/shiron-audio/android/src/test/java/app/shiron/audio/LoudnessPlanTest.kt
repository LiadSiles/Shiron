package app.shiron.audio

import org.junit.Assert.assertEquals
import org.junit.Test
import kotlin.math.log10
import kotlin.math.pow

/** Mirrors LoudnessPlanTests.swift — both implementations must give the same plans. */
class LoudnessPlanTest {
  private fun power(db: Double) = 10.0.pow(db / 10)

  @Test fun trimsSilenceWithPadding() {
    val p = DoubleArray(10) + DoubleArray(20) { power(-30.0) } + DoubleArray(10)
    val peaks = DoubleArray(p.size) { if (p[it] > 0) 0.045 else 0.0 }
    val plan = LoudnessPlan.make(p, peaks, 40 * LoudnessPlan.BLOCK_FRAMES)
    assertEquals(10 * 4_410 - 6_615, plan.startFrame)
    assertEquals(30 * 4_410 + 13_230, plan.endFrame)
    assertEquals(14.0, plan.gainDb, 0.01)
  }

  @Test fun peakCeilingLimitsGain() {
    val plan = LoudnessPlan.make(DoubleArray(10) { power(-30.0) }, DoubleArray(10) { 0.5 }, 44_100)
    assertEquals(-1 - 20 * log10(0.5), plan.gainDb, 0.01)
  }

  @Test fun loudInputIsTurnedDown() {
    val plan = LoudnessPlan.make(DoubleArray(10) { power(-6.0) }, DoubleArray(10) { 0.9 }, 44_100)
    assertEquals(-10.0, plan.gainDb, 0.01)
  }

  @Test fun silenceIsLeftAlone() {
    assertEquals(LoudnessPlan(0, 13_230, 0.0), LoudnessPlan.make(DoubleArray(3), DoubleArray(3), 13_230))
  }

  @Test fun quietPassagesDoNotDragLoudnessDown() {
    val p = DoubleArray(40) { power(-20.0) } + DoubleArray(10) { power(-44.0) } + doubleArrayOf(power(-20.0))
    val plan = LoudnessPlan.make(p, DoubleArray(51) { 0.2 }, 51 * 4_410)
    assertEquals(4.0, plan.gainDb, 0.01)
  }
}
