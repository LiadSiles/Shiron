# Audio fixtures

Shared by the Swift tests (`../swift-tests`) and the Android instrumented tests
(`../android/src/androidTest`). Every file carries the same signal so one expectation fits all:

**1 s silence · 2 s of a 440 Hz sine at about −30 dBFS · 1 s silence** (4 s total).

After processing: ~2.45 s (the tone + 0.15 s before + 0.3 s after), gain ≈ +14 dB, level ≈ −16 dB,
mono AAC at 44.1 kHz.

| File | What it stands for |
|---|---|
| `voice-whatsapp.opus` | WhatsApp voice note: Ogg Opus, mono 48 kHz, 20 ms frames, VoIP mode |
| `voice-60ms.ogg` | Opus with 60 ms frames (other recorders) |
| `song.mp3` | stereo mp3 (`audio/mpeg`) |
| `memo.m4a` | iPhone voice memo / AAC |
| `tone.wav` | 16 kHz PCM |
| `tone.flac` | 22.05 kHz FLAC |
| `tone-vorbis.ogg` | Ogg Vorbis (Android only) |
| `video.mp4`, `video.mov` | phone video, H.264 + AAC |
| `video.3gp` | old phone video, H.263 + AAC 16 kHz |
| `video.mpeg` | MPEG-2 program stream + MP2 audio (reported, not required) |
| `video.webm` | VP8 + Opus (Android only) |
| `tone.wma` | Windows Media Audio (WMA v2, ASF) — decoded by our FFmpeg build (`native/wma`) |
| `video.wmv` | Windows Media Video (WMV2 + WMA v2) — the sound track via the same decoder |
| `not-audio.mp3` | garbage with an audio extension — must be rejected |

Regenerate with ffmpeg (commands in the commit that last changed this folder). Mind that ffmpeg's
`sine` source has amplitude 1/8: `volume=0.36` gives the −30 dBFS tone. The first set used
`volume=0.045` and sat at −45 dB, right on the silence threshold — nothing was trimmed.
No AMR fixture: the ffmpeg build used has no AMR encoder.
