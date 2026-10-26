# AI pipeline (Groq)

_Last verified: 2026-10-26 (0.2.0; request shapes from Groq's docs — not yet run against the live API)_

There is no Shiron server. The app calls **Groq** directly with **the teacher's own free API
key**, which she connects once from inside the app. Owner's decisions (2026-10-26): processing
in the app, cloud models only, free services only, Groq only, every user connects her own key.

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
| 5xx / no network | stop, retry on next foreground or import |
| 413 / other 4xx | this song only: fallback title from context/file name → review inbox |

The song keeps `status = 'pending'` while waiting; nothing is lost.

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
- Connect flow (`src/app/connect.tsx`): "פתיחת Groq" opens `console.groq.com/keys` in an in-app
  browser (Google sign-in works there) → she creates and copies a key → on return (browser
  closed, or app back in foreground) the clipboard is read **only then**, a `gsk_…` key is found
  (`findGroqKey`), checked with `GET /models`, saved, and the clipboard is cleared. A paste
  field is the fallback.
- Offered automatically once, after the first imported song (`settings.connectOffered`); after
  that the home banner and Settings lead to it.
- Privacy note shown in the app: recordings are sent to Groq for transcription.
