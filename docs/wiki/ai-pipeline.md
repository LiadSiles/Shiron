# Processing server and AI pipeline

_Last verified: 2026-10-26 (0.1.0; Claude and transcription not yet run against real songs)_

## Endpoints (`server/src/app.ts`)

| Route | Body | Returns |
|---|---|---|
| `GET /health` | — | `{ ok }` (no auth; for load balancers) |
| `GET /v1/health` | — | `{ ok, transcription, ai }` — which keys are configured |
| `POST /v1/process` | multipart: `audio` file, `fileName`, `context` | `ProcessResult` + `audioPath` |
| `GET /v1/files/:uuid.m4a` | — | the converted audio (name validated by regex) |
| `POST /v1/youtube` | JSON `{ url, context }` | `ProcessResult` with `audioPath: null` |

All `/v1/*` routes require `Authorization: Bearer $APP_TOKEN` (timing-safe compare) when
`APP_TOKEN` is set. `ProcessResult` is defined once in `app/src/core/types.ts`.

## Audio chain (`server/src/audio.ts`)

1. **Trim** silence at both ends (`silenceremove`, −45 dB, keeps 0.15 s / 0.3 s padding) →
   PCM WAV.
2. **Loudness** `loudnorm=I=-16:TP=-1.5:LRA=11`, resample 44.1 kHz → AAC 128k `.m4a`,
   `+faststart`.
3. A 16 kHz mono mp3 copy (max 10 min) for transcription.

Two ffmpeg passes **on purpose**: with ffmpeg 6.1, `areverse … loudnorm` plus a resampler in
one graph deadlocks at end of stream (process never exits). Found 2026-10-25; reproduce
with `-f null` + `-ar 44100`. Every ffmpeg call has a 120 s kill timeout.

## Transcription (`server/src/transcribe.ts`)

OpenAI SDK against any OpenAI-compatible `/v1/audio/transcriptions`: default
`gpt-4o-transcribe`, `language: 'he'`, a Hebrew prompt priming children's-song vocabulary.
Set `TRANSCRIBE_BASE_URL` to use a self-hosted Hebrew Whisper (ivrit.ai models) instead —
sung Hebrew is the hardest input in the system; expect general models to miss.
No key → no lyrics; everything else still works.

## Understanding (`server/src/understand.ts`)

- `client.messages.parse` with `output_config.format = zodOutputFormat(Schema)` (structured
  output, SDK 1.3). Model `CLAUDE_MODEL`, default `claude-haiku-5-5` (cheap, enough for
  naming/categorizing). Schema fields are snake_case; `sanitize()` maps to `Understanding`.
- System prompt (Hebrew): naming rules (known song → canonical name; else first line or
  refrain; ≤ 5 words; the WhatsApp context message wins), categories only from the list,
  lyrics = tidy the transcript without inventing words, keywords = what a teacher would type.
- User message = full category list (`id: name — hint`) + file name + context + YouTube
  title/channel + transcript.
- `sanitize()`: drops unknown category ids, dedupes, clamps confidences to [0, 1], caps 3
  categories and 12 keywords, strips quotes from titles, falls back to `unsorted`.
- Any failure (no key, API error, unparsable) → `fallbackUnderstanding()` (title from YouTube
  title / short context line / file name, `unsorted`, confidence 0.3 → goes to review).

## Shared code

The server imports `app/src/core/categories.ts` directly (relative path) so the taxonomy
can't drift. That file must stay free of React Native imports. The Dockerfile copies it to
`/srv/app/src/core/` for the same relative path.

## Running

`server/.env` (see `.env.example`), `npm start` (Node 22 `--env-file-if-exists`, `tsx`).
Tests use a generated quiet Opus "voice note" and assert trimming, AAC output and a ≥ 6 dB
loudness increase; Claude is faked through an injected `messages.parse`.
