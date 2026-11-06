# AI pipeline (Groq, Gemini)

_Last verified: 2026-10-26 (0.4.1; request shapes from the services' docs — not yet run against the live APIs)_

There is no Shiron server. The app calls the AI services directly with **the teacher's own
free API keys**, which she connects from inside the app. Owner's decisions (2026-10-26):
processing in the app, cloud models only, free services only, every user connects her own key;
Groq first, and since 0.4.0 also **Gemini** (Google AI Studio key) — see "Two services" below.

## Two services (`src/core/ai.ts`, `src/api/ai.ts`, `src/api/keys.ts`)

- `PROVIDERS`: name, keys page, key pattern, `trainsOnData`. Keys in SecureStore
  (`groqApiKey`, `geminiApiKey`); which goes first is the setting `aiProvider` (default Groq).
- `nameSong(input, audio)` tries `providerOrder(preferred, connected)`: a **transient** error
  (quota, 5xx, network/timeout, invalid key) moves on to the next service; a service that hit
  its quota is skipped until its `retryAfterSec` (default 10 min). Only when no service can do
  it now does the queue stop (`AiError` thrown, same handling as before). A **refusal**
  (bad-request / too-large) doesn't try the other service: the song gets a fallback name and
  is ready with the error shown on its screen. `resumeAllProviders()` on "try again".
- Within a service, `eachModel()` (src/api/http.ts) walks the model list on 429 or 404
  (retired model).
- Search by meaning (`relatedWords`) uses the same order, cached per query.

### Gemini

| | |
|---|---|
| Endpoint | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`, header `x-goog-api-key` |
| Models | `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite` (stable, Oct 2026) |
| Request | `system_instruction`, `contents[0].parts` = the user message + `inline_data {mime_type, data: base64}` of the `.m4a`; `generationConfig.responseMimeType = application/json`, `responseJsonSchema = UNDERSTANDING_SCHEMA` (400 → again without the schema; refused audio → again from text) |
| One call | Gemini **listens to the recording** and writes the lyrics itself (`audioAttached` in the prompt) — no separate transcription step |
| Limits | request ≤ 20 MB incl. base64 → audio ≤ 14 MB (`GEMINI_MAX_AUDIO_BYTES`, ~20 min); 32 tokens per second of audio; free quotas per project, shown at aistudio.google.com/rate-limit (~10 RPM / ~1,500 per day for Flash per third-party trackers) |
| Errors | bad key = **400** `INVALID_ARGUMENT` + reason `API_KEY_INVALID`; quota = 429 `RESOURCE_EXHAUSTED` + `RetryInfo.retryDelay` ("41s"); see `errorFromGemini` |
| Empty answers | No answer text is an error now, with the reason (`geminiStopReason`): `RECITATION` = Gemini won't write out the words of a well-known (copyrighted) song — asked again with lyrics = null, so the song is still named; `SAFETY`/blocked = the audio is dropped and the song named from the text. Before 0.9.3 an empty answer silently gave a file-name title and no lyrics. |
| Live test | `tests/gemini.live.test.ts` sends the app's own request (`geminiNamingRequest`) with Hebrew speech made by `say -v Carmit`, on the macOS job of `ios-sim.yml`, only when the `GEMINI_API_KEY` repository secret exists |
| Key | from `aistudio.google.com/apikey`. **Since mid-2026 new keys look like `AQ.Ab…`** (length undocumented); old `AIza` + 35 chars keys are being rejected (unrestricted ones since 19 Jun 2026, all by Sep 2026). Both recognised; a hand-pasted key of any shape is sent for checking (`pastedKey`). Sent as `x-goog-api-key` (works for `AQ.`; `Authorization: Bearer` fails for them on the OpenAI-compatible route). Checked with `GET /v1beta/models?pageSize=1` |

**YouTube songs (0.5.0):** Gemini takes a public YouTube URL as a `file_data` part
(`{file_uri: "https://www.youtube.com/watch?v=…"}`) and watches/listens to the video itself —
Google's own feature, so nothing is downloaded by us and YouTube's terms aren't touched. That
gives YouTube songs lyrics and a better name. For a YouTube song `nameSong` puts Gemini first
when it is connected (Groq can only name it from the title). Limits: public videos only; free
tier up to 8 hours of YouTube video per day; marked "preview" by Google (may change). Timeout
180 s. A refused video (private, too long) → again from the title and context alone. Any song
can be sent through the AI step again from its screen ("תמלול מחדש", see below).

`generateContent` is labelled "legacy" since Google's Interactions API went GA (June 2026) but
"remains fully supported"; it is the documented way to send inline audio. Revisit if Google
announces a shutdown.

**Privacy (owner's decision, 2026-10-26):** under the Gemini API terms, content sent on the free
tier may be used to improve Google's models and read by human reviewers, and Google asks not to
send personal information. Recordings may contain children. The owner chose to offer Gemini
with the recording, with a plain warning on the connect screen and in Settings; Groq stays the
recommended default. The terms also say apps "made available to users" should use paid
services — with each teacher using her own key this is a grey area; reconsider before any
public release.

## Calls (`src/api/groq.ts`; pure rules in `src/core/groqRules.ts`, `src/core/understand.ts`)

| Step | Endpoint | Models (in order) |
|---|---|---|
| Transcription | `POST https://api.groq.com/openai/v1/audio/transcriptions` (multipart: `file`, `model`, `language=he`, `prompt`, `response_format=json`, `temperature=0`) | `whisper-large-v3`, then `whisper-large-v3-turbo` |
| Understanding | `POST …/chat/completions`, `response_format: json_schema` **strict** (`UNDERSTANDING_SCHEMA`), `reasoning_effort: low` | `openai/gpt-oss-120b`, then `openai/gpt-oss-20b` |
| Key check | `GET …/models` | — |
| YouTube title | `https://www.youtube.com/oembed` (no key) | — |

- The next model is tried only on **429**: each model has its own free-tier quota.
- A 400 on the strict schema → the same model again in `json_object` mode; `sanitize()` enforces
  the shape either way (unknown category ids dropped, confidences clamped, ≤ 3 categories,
  ≤ 12 keywords, quotes stripped from titles).
- Transcription uploads the converted `.m4a` (mono 96 kbps ≈ 0.7 MB/min). Free-tier limit
  25 MB (~35 min); longer files skip transcription and are named from the context/file name.
- Groq bills (and rate-limits) at least 10 s per transcription request.

## Free-tier limits (third-party summary, June 2026 — check console.groq.com)

Whisper models: 20 requests/min, 2,000/day each. gpt-oss-120b / 20b: 30 requests/min,
1,000/day each, 8,000 tokens/min. A teacher adding a few songs a day is far below this.
Source: <https://www.eesel.ai/blog/groq-pricing>.

## Errors (`errorFromResponse`, `describeGroqError`)

| Groq says | App does |
|---|---|
| 401/403 | stop the queue, `needsKey` → home banner "connect again" |
| 429 (all models) | stop, pause until `retry-after` / `x-ratelimit-reset-*` (default 10 min), notice "daily quota" |
| 5xx / no network / timeout | stop, retry on next foreground or import |
| 413 / other 4xx on transcription | logged; the song is still named, without lyrics |
| 413 / other 4xx on naming | this song only: fallback title, the transcript kept as lyrics → ready, error and retry on the song screen |

The song keeps `status = 'pending'` while waiting; nothing is lost. `processQueue()` never
rejects — anything unexpected goes to the technical log and the next trigger tries again.

Timeouts (`fetchWithTimeout`): chat 90 s (reasoning models can be slow), key check 20 s,
oEmbed and search expansion 15 s. A timeout is a retryable `network` error. The transcription
upload (`File.upload`) has no timeout option in expo-file-system; a hang there would hold the
queue until the app is restarted — not seen yet, revisit if the log shows it.

## Accuracy: invented words (0.5.2)

Owner report: lyrics contained words never sung, e.g. "תודה רבה". Whisper does this over music
and silence — it learned stock phrases from subtitled videos ("תודה רבה", "תודה שצפיתם",
subtitle credits) — and it can loop on one line over an instrumental. Defences, in order:

1. On-device silence trimming (audio step) removes the quiet ends where it happens most.
2. Groq transcription uses `response_format=verbose_json` (per-segment `avg_logprob`,
   `no_speech_prob`, `compression_ratio`); `core/transcript.ts → cleanTranscript` drops
   phantom segments: known stock phrases (exact, or credit-line prefixes), Whisper's own
   no-speech rule (no_speech_prob > 0.6 and avg_logprob < -1), loops (compression_ratio > 2.4
   and avg_logprob < -1), and more than four identical lines in a row (three or four repeats
   are normal in children's songs and stay).
3. The naming prompt asks for accuracy over completeness: only words actually sung, no filling
   in, drop stock phrases, leave out unclear stretches. Gemini (which transcribes itself) gets
   the same rules.
4. `sanitize()` runs `stripPhantomLines` on whatever lyrics come back, from either service.

Lists live in `transcript.ts` (`PHANTOM_EXACT`, `PHANTOM_PREFIX`); add phrases the log shows.

## Transcribing again (0.5.1)

The song screen has "תמלול מחדש" under the lyrics for every song with something to listen to
(`canTranscribe`: an audio file, or a YouTube video). It asks first when lyrics exist (they will
be replaced), sends her to connect a service when none is connected, and warns that YouTube
songs get lyrics only with Gemini. It calls `retrySong` (status → `pending`, pauses cleared);
her own title and confirmed categories are kept as always. The button reads "מתמללת…" while
the song is pending. An AI error shows under the title on the song screen.

## Prompt (Hebrew, `SYSTEM_PROMPT`)

Naming rules (known song → its canonical name; else first line or refrain; ≤ 5 words; the
WhatsApp message sent with the file wins), categories only from the list (also enforced by an
`enum` in the schema), lyrics = tidy the transcript without inventing words, keywords = what a
teacher would type. The user message lists all 32 categories with hints, plus file name,
context message, YouTube title/channel and the transcript. Whisper gets a short Hebrew prompt
priming children's-song vocabulary.

## The key

- Stored with `expo-secure-store` (Keychain / Keystore), cached in memory; never in SQLite,
  never in the repo or the build.
- Connect flow (`src/app/connect.tsx`, tabs Groq / Gemini, `?provider=`): "פתיחת …" opens the
  service's keys page in an in-app browser (Google sign-in works there) → she creates and
  copies a key → on return (browser closed, or app back in foreground) the clipboard is read
  **only then**; a key of **either** service is recognised (`findKey`; the tab switches to
  match), checked, saved, and the clipboard is cleared. A paste field is the fallback.
- Android: `openBrowserAsync` needs a browser with Custom Tabs support and throws
  `NoMatchingActivityException` otherwise — the owner's Xiaomi had none, and 0.2.0 swallowed the
  error ("the button does nothing"). Since 0.2.1 it falls back to `Linking.openURL` (system
  browser). On Android `openBrowserAsync` returns immediately, so the clipboard is checked on
  the next foreground (AppState), not after the call.
- Offered automatically once, after the first imported song (`settings.connectOffered`); after
  that the home banner and Settings lead to it.
- Privacy note shown in the app: recordings are sent to the service for transcription and
  naming; for Gemini, also the training/human-review warning above.

## Search by meaning (0.3.0)

`relatedWords(query)` in `src/api/ai.ts` (Groq: `relatedWordsWithGroq`, Gemini:
`relatedWordsWithGemini`): the search query alone → up to 12 related
Hebrew words (`EXPAND_PROMPT`, `json_object`, smaller chat model). Details and scoring in
`search-and-ranking.md`.
