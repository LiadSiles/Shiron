# Audio processing on the phone

_Last verified: 2026-10-26 (0.2.0). Apple: every required fixture passes on macOS in CI.
Android: compiles, LoudnessPlan unit tests pass; decoding not yet run (emulator or device)._

Every shared file becomes a **mono AAC `.m4a` at 44.1 kHz, trimmed and loudness-normalised**,
on the phone, with no network. Local Expo module `app/modules/shiron-audio` (autolinked from
`app/modules/`), one function: `processAudio(inputUri, outputUri) → { durationSec,
sourceDurationSec, gainDb, trimStartSec, trimEndSec }`; errors carry codes `ERR_AUDIO_*`
(`UNSUPPORTED`, `NO_AUDIO`, `TOO_LONG`, `CORRUPT`, `FAILED`, `BAD_URI`).

## Pipeline (both platforms)

1. **Decode** to mono Float32 at 44.1 kHz, streamed to a temporary `.f32` file (constant memory;
   max one hour). Per 100 ms block: mean square and peak.
2. **Plan** (`LoudnessPlan`, identical in Swift and Kotlin, unit-tested on both):
   - trim: first/last block above −45 dB, keep 0.15 s before and 0.3 s after;
   - loudness: mean block power over the kept range, absolute gate −70 dB, relative gate
     −10 dB (EBU R128-like, without K-weighting);
   - gain = −16 − loudness, capped so the peak stays ≤ −1 dBFS, clamped to [−12, +24] dB;
   - nothing above −45 dB → keep everything, gain 0.
3. **Encode** the kept range × gain (clipped to ±1) as AAC-LC 96 kbps in MP4.

## iOS (`ios/Core/*.swift`, plain AVFoundation)

- **Ogg Opus** (WhatsApp): AVFoundation decodes Opus but can't read Ogg. `OggOpus.swift` splits
  pages into packets (RFC 3533/7845), reads `OpusHead` (channels, pre-skip), works out each
  packet's samples from its TOC byte (RFC 6716 §3.1), and decodes packet by packet with
  `AVAudioConverter` from an `kAudioFormatOpus` description (one converter per frame size).
  Then `Resampler` (AVAudioConverter, 48 → 44.1 kHz, mono).
- **Everything else** via `AVAssetReaderAudioMixOutput`, which mixes and resamples itself:
  mp3, m4a/aac, wav, aiff, caf, flac, amr, and the sound track of mp4/mov/3gp videos.
- Not on iOS: Ogg Vorbis, webm/mkv (no Apple decoder); MPEG-PS `.mpeg` + MP2 is reported by the
  tests, not required. Those songs get `audioState = 'unsupported'`.
- Encode with `AVAudioFile(forWriting:)` (kAudioFormatMPEG4AAC).
- Tests: `swift-tests/` builds `ios/Core` as a Swift package on macOS (same frameworks) and runs
  it on the fixtures (`npm run test:ios-audio` on a Mac; `native.yml` in CI). Verified
  2026-10-26: Opus (20/60 ms), mp3, m4a, wav, flac, mp4, mov, 3gp → 2.45 s, −15.9 dB, gain
  ≈ +13.8 dB; `.mpeg` (MPEG-2 PS + MP2) also decodes; Vorbis and webm don't (expected).
  `DiagnosticsTests` prints the reader's ASBD and per-block levels — that is how the too-quiet
  first fixtures were found.

## Android (`android/src/main/java/app/shiron/audio/`)

- `MediaExtractor` + `MediaCodec` decoder for the first audio track (Opus/Ogg, Vorbis, mp3, aac,
  flac, wav, amr, 3gp/mp4/webm/mkv video); 16-bit or float output, down-mixed to mono, linear
  resampling to 44.1 kHz.
- `MediaCodec` AAC encoder + `MediaMuxer` (MPEG-4).
- Tests: JVM unit tests for `LoudnessPlan` run in CI. Instrumented tests
  (`src/androidTest`, every fixture through the real codecs) exist but run only locally —
  `cd app && npx expo prebuild -p android && cd android && ./gradlew
  :shiron-audio:connectedDebugAndroidTest` with a device or emulator attached. On GitHub
  runners (Oct 2026) the emulator never came up: Ubuntu 26 image → boot timeout after 10 min;
  Ubuntu 24.04 with API 33 default / API 34 google_apis → the emulator action failed within a
  minute, no reason readable without raw logs.

## Failure handling (both platforms)

- Every failure leaves no output: a half-written `.m4a` is deleted (module level and, on
  Android, in `encode`), so a retry starts clean. Errors always carry an `ERR_AUDIO_*` code;
  unexpected ones map to `FAILED`.
- Android: codec/muxer cleanup runs in `runCatching` (`stop()` throws on a codec in the error
  state and would hide the real error); a decoder or encoder that keeps returning
  `INFO_TRY_AGAIN_LATER` after end of input for ~10 s is treated as broken (`CORRUPT` /
  `FAILED`) instead of spinning forever. The resampler writes into a primitive `FloatArray`
  (it boxed every sample into an `ArrayList<Float>` before 0.3.3).
- iOS: each `CMSampleBuffer` is read inside its own `autoreleasepool`, so memory stays flat on
  long recordings.

## Windows Media (WMA/WMV, 0.10.0)

Neither platform decodes it. `native/wma/wma2wav.c` (FFmpeg: ASF demuxer + wmav1/wmav2/wmapro/
wmalossless/wmavoice) writes a 16-bit WAV at the source rate; then the normal pipeline runs on the
WAV. iOS: `ShironAudioModule.decodedIfWindowsMedia` (module layer, `#if SHIRON_WMA`; Core and its
Swift package tests don't see FFmpeg). Android: `AudioProcessor.process` → `WmaDecoder` (JNI), so
the instrumented tests cover `tone.wma` and `video.wmv`. Build: `scripts/build-wma-decoder.sh
ios|android|host` (`host` builds a command-line `wma2wav` to try on a Linux/Mac machine); outputs
are git-ignored; every workflow that builds the app runs it first (cached by the script's and the
C file's hash). Codes: -1 open, -2 no audio, -3 no decoder, -4 decode, -5 write, -6 over an hour.

## Parts for transcription (`AudioSplitter`, 0.10.0)

`splitAudio(input, outDir, chunkSec)` cuts a converted .m4a into consecutive `part-N.m4a`
files without re-encoding — iOS: `AVAssetExportSession` passthrough per time range; Android:
`MediaExtractor` → `MediaMuxer`, read straight through. The last part absorbs a tail shorter
than min(5 s, chunk/4). Used by `api/ai.ts → transcribeInParts` (40 s parts) so every stretch
of a song is transcribed. Tested on both platforms (`AudioSplitterTests.swift`,
`AudioProcessorTest.splitPartsCoverTheWholeSong`): parts cover the song within 0.15 s.

## In the app (`src/ingest/processor.ts`)

The audio lane (`convertNew`, independent of Groq): songs with `audioState = 'raw'` are
converted oldest first. On success the `.m4a` becomes `playableUri`, the original is deleted
(videos can be large; the SHA-256 for dedupe is already stored) and `durationSec` is set. If
the song is in the player's queue at that moment (Android plays the original before
conversion; the native playlist holds its path), the original is kept and deleted by a later
pass once it left the queue (`isQueued`). On failure the original stays
and is played if the platform reads it (`isNativelyPlayable`), otherwise the song shows
"הפורמט לא נתמך במכשיר הזה".

Songs imported by 0.1 (`audio_state` added by migration v2 with default `raw`) are converted on
first launch of 0.2.
