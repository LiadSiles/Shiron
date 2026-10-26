# Decisions

Newest first. Each entry: what was decided, why, and what was rejected. Add an entry
whenever a choice would surprise a future contributor.

### 2026-10-26 — No server: audio on the phone, AI through Groq with the teacher's own key (0.2.0)
Owner: processing must happen in the app, not on a server behind the scenes; support more
formats (mpeg and anything that may arrive); understanding (including transcription) by
**cloud** models, not local ones; **free options only**; connecting should be as easy as
possible from inside the app, by sending the user to the right place. Chosen after a survey of
free services (Gemini free tier, Groq, Puter, Pollinations): **Groq only** (owner's pick over
Gemini + Groq), and **every user connects her own key** (owner's pick over a key built into
the app). Consequences:
- The Node server, its Dockerfile and CI jobs are deleted. Conversion is a local Expo module
  (Swift + Kotlin) — see audio-processing.md. iOS still can't play Ogg Opus, so the module
  demuxes Ogg itself.
- No service is both free and unlimited: Groq's free tier has daily quotas per model; the app
  falls back between two models per step and pauses on 429.
- The key is per user, in the Keychain/Keystore. The connect screen opens Groq's keys page and
  picks the copied key from the clipboard on return.
Rejected: Gemini free tier (owner's choice; also: free-tier content is used to improve Google's
products), Puter (every user must sign in to Puter and pays beyond an allowance; browser only),
Pollinations (now requires a key and GitHub sign-in; keyless access undocumented), on-device
Whisper/LLM (owner wants cloud models), a key embedded in the build (owner's choice).

### 2026-10-26 — Releases: APK every push, APK + unsigned IPA every version
Owner asked for downloadable builds of every version for Android and iOS, like CallNotes.
There is no APK equivalent for iPhone: an IPA must be signed for the installing device.
Chosen: unsigned IPA per version, sideloaded with the user's Apple ID (Sideloadly/AltStore);
TestFlight job ready but opt-in until there is a paid Apple Developer account. iOS builds
only per version (not per push) because macOS runner minutes cost 10× on a private repo.
Rejected for now: EAS-only builds (needs an Expo account + Apple account before anything
works), ad-hoc signed IPAs (need device UDIDs registered in a paid account).

### 2026-10-26 — Committed Android keystore
Same reason as CallNotes: every APK from Releases must install over the previous one so the
teacher's library survives updates. Expo's template debug keystore would also be stable, but
an explicit project key (via `plugins/withSigningKey.js`) makes it ours and visible.

### 2026-10-25 — Monorepo: Expo app + stateless Node server (superseded 2026-10-26: no server)
Expo/React Native gives iOS (priority) and Android (owner's test device) from one codebase;
Expo's config plugins cover share extension and background audio without hand-edited native
projects. A server is required because iOS cannot play WhatsApp Opus voice notes and Hebrew
transcription quality needs a server-class model. The server keeps nothing (30-min TTL) —
recordings may contain children's voices and names.
Rejected: on-device transcription (sung Hebrew quality too low on phone-sized models; may be
revisited), native Swift + Kotlin apps (two codebases for one developer).

### 2026-10-25 — Claude Haiku with structured output for naming/categorizing (superseded 2026-10-26: Groq)
Naming and picking from 32 categories is a small, well-specified task; Haiku is fast and
cheap per song. Structured output (`zodOutputFormat`) avoids JSON repair. Unknown ids are
filtered server-side. Model is configurable (`CLAUDE_MODEL`).

### 2026-10-25 — Auto-accept at confidence ≥ 0.85 (title and top category)
Keeps the review inbox small (zero-maintenance principle) while catching unsure results.
The threshold is a placeholder until measured on ~200 real songs.

### 2026-10-25 — YouTube: embedded player only
YouTube's Terms forbid downloading and require a visible player. YouTube songs play in a
WebView (`youtube-nocookie.com/embed`) in the foreground; the screen says so and suggests
saving the song as an audio file for background play. Rejected: downloading with yt-dlp.

### 2026-10-25 — In-memory search and ranking
A teacher's library is hundreds of songs. Loading everything and ranking in JS keeps the
logic pure and unit-tested (`core/`). Revisit with SQLite FTS5 past ~2,000 songs.

### 2026-10-25 — Custom tab shell instead of a tab navigator
`src/app/index.tsx` renders four tabs itself so the mini player sits above the tab bar on
every tab and the RTL tab order is fully controlled. Trade-off: tabs don't have their own
URL/back history.
