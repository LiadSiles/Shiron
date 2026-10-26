# Audio processing on the phone

_Last verified: 2026-10-26 (0.2.0 written; Native audio CI results pending; not yet run on a real device)_

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
  it on the fixtures (`npm run test:ios-audio` on a Mac; `native.yml` in CI).

## Android (`android/src/main/java/app/shiron/audio/`)

- `MediaExtractor` + `MediaCodec` decoder for the first audio track (Opus/Ogg, Vorbis, mp3, aac,
  flac, wav, amr, 3gp/mp4/webm/mkv video); 16-bit or float output, down-mixed to mono, linear
  resampling to 44.1 kHz.
- `MediaCodec` AAC encoder + `MediaMuxer` (MPEG-4).
- Tests: JVM unit tests for `LoudnessPlan`; instrumented tests on an API 34 emulator decode
  every fixture with the real codecs (`native.yml`).

## In the app (`src/ingest/processor.ts`)

Step 1 of the queue, before any AI: songs with `audioState = 'raw'` are converted oldest first.
On success the `.m4a` becomes `playableUri`, the original is deleted (videos can be large; the
SHA-256 for dedupe is already stored) and `durationSec` is set. On failure the original stays
and is played if the platform reads it (`isNativelyPlayable`), otherwise the song shows
"הפורמט לא נתמך במכשיר הזה".

Songs imported by 0.1 (`audio_state` added by migration v2 with default `raw`) are converted on
first launch of 0.2.
