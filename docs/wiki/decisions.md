# Decisions

Newest first. Each entry: what was decided, why, and what was rejected. Add an entry
whenever a choice would surprise a future contributor.

### 2026-11-06 — Her categories; sorting and tiles; lyrics to the end (0.10.0)
- **Categories are hers to change** (owner): rename, new emoji/colour, remove, add — also from a
  song's screen ("קטגוריה חדשה" adds it to that song). Built-ins stay in code
  (`BUILTIN_CATEGORIES`: hints, seasons and hours keep working); her changes are rows in
  `category_custom` (DB v7) applied in memory (`applyCategoryCustomizations`) so lookups stay
  synchronous. Removing a built-in hides it (restorable in Settings); removing hers deletes it.
  Either way its song links go, and the AI no longer offers it; her own categories are offered
  to the AI with their name as the hint. "לא מסווג" can be renamed but not removed. Her empty
  categories still show in the library (built-in empty ones don't).
- **Sorting and layout** (owner): songs by smart / A–Z / plays / last played / newest / length
  (+ "her order" in playlists, where a sorted order can be saved as the list's order);
  categories by smart / A–Z / song count / plays; rows or tiles for both. One choice per kind,
  remembered (`ui/viewPrefs.ts`, settings table) rather than per screen — fewer things to set.
- **Lyrics to the end** (owner: "must not give up on this"): some songs were transcribed only
  in part. Causes: Whisper skips the rest after long instrumentals; our filter dropped sung
  lines Whisper was unsure of; the prompt told the model "accuracy over completeness, drop
  unclear parts". Now: the converted song is cut on the phone into 40 s parts (no
  re-encoding, `AudioSplitter` in Swift and Kotlin) and each part is transcribed (Groq: Whisper
  with the previous part's end as prompt; Gemini: a verbatim request per part); only a clear
  "no speech" drops a line; the prompt requires every word incl. repeats; and if the model's
  tidy lyrics have under 85% of the transcript's words, the transcript itself is kept
  (`completeLyrics`). Existing songs: "תמלול מחדש" on the song screen.

### 2026-11-06 — "+" on the home screen; WMA refused with an explanation (0.9.3)
- Adding from Files was only offered on the empty library, so it vanished after the first song
  (owner's report). Now a "+" sits in the home header for good: it is also the way in for
  recordings on an iPhone install whose share extension can't pass files.
- WMA/WMV: no decoder on iOS or Android and neither AI service reads them. Refused at import
  with an alert that says why and how to convert to MP3 (owner: "if they really can't be
  supported, tell the user"). Rejected for now: shipping an FFmpeg build with the WMA decoder
  on both platforms (size, build work, two native code paths) — owner's call if WMA matters.

### 2026-11-06 — Our own iOS share extension (0.9.2, 0.9.3)
First iPhone install (Sideloadly, free Apple ID): sharing a recording from WhatsApp froze
WhatsApp and nothing arrived. Sideloadly with a free Apple ID grants no App Group, and the
library's extension force-unwrapped the group container and crashed behind its invisible view.
- The extension controller is ours (`patches/expo-share-intent+9.0.0.patch` replaces the
  plugin's template; the module gets the same App Group lookup). It looks the group up:
  declared name → `ALTAppGroups` (AltStore/SideStore rename it) → the embedded provisioning
  profile. It reads audio/video from any provider (WhatsApp offers a voice note as an audio file
  representation, not necessarily a file URL), one attachment at a time, and always ends the
  request (alert in Hebrew, 60 s watchdog).
- Without a group, a link or text travels in the URL (`shiron://share?text=…`, parsed by
  `core/incoming.ts`); files cannot, so the alert says the way round: save to Files, then
  Settings → בחירת קבצי שמע או וידאו in the app.
- Also tried in 0.9.2: audio/video document types, for an "Open in PlayGan" that needs no App
  Group. Removed in 0.9.3: the simulator check showed the share sheet lists PlayGan once — the
  extension — so the "Open in" entry never appears beside it.
- Why WhatsApp froze even for links: the template started work in `viewDidLoad` with an
  invisible view and, on an error, presented an alert before the view was on screen; iOS drops
  that alert, so the request was never completed. Ours starts in `viewDidAppear`.
- Verified on the iPhone simulator (`ios-sim.yml`): with the group, a YouTube link from Safari
  and a voice note from Files both arrive; without entitlements, the voice note gets the Hebrew
  alert, the extension receives a link (`group none`), iOS asks "Open in PlayGan?", and the app
  saves the link from `shiron://share?text=…`.
- Rejected: passing files through the pasteboard (wipes or races her clipboard, size limits)
  or inside the URL (megabytes). The real fix for the teacher is a signing route that grants App
  Groups — AltStore/SideStore (free, auto-refresh) or a paid Apple Developer account
  (TestFlight); the owner decides.

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

### 2026-10-26 — Media controls stay left-to-right in the RTL UI
Owner reported next/previous reversed in 0.2.0. Media players (including Hebrew apps) keep
▶ pointing right, next on the right and time running left → right; only the surrounding layout
is mirrored. Control rows and the scrubber are `direction: 'ltr'`, icons drawn with Views.

### 2026-10-26 — One play/pause, no stop button
0.2.0 had a stop (■) in the mini player and play/pause in the full player, and they drifted
apart. A song row, the mini player and the full player now all use one toggle with
optimistic state. Pausing still fades out; "stop" adds nothing for a teacher.

### 2026-10-26 — Forgiving local search, plus Groq for meaning only when needed
Search stays local and instant: typos (Damerau–Levenshtein), Hebrew sound-alike letters and
spelling variants, the WhatsApp message and the file name. Meaning ("אביב" → a song about
blossoming almonds) needs a model; local embeddings are ruled out (no local models), so Groq
suggests related words — only the query is sent, only when fewer than 3 songs match, and the
result is marked as "בנושא דומה". Rejected: sending lyrics/library to the model per search
(privacy, rate limits).

### 2026-10-26 — Categories are one flat list
The owner saw "עולם הילד" with "טבע וגינה" under it and read it as a category inside a
category. The six groups are gone from the taxonomy and the UI: the library is a two-column grid
of square tiles (Spotify "browse" style), ordered in season → most used → most songs; the song
editor shows one list of chips. (Since 0.10.0 she can also see rows and sort otherwise.)

### 2026-10-26 — Patch expo-audio rather than fork or replace it
The non-dismissible notification is in expo-audio's native service. A config plugin can't change
library code, a fork means maintaining a whole module, and react-native-track-player would
replace the player for one behaviour. `patch-package` keeps a ~60-line diff that fails loudly
on upgrade. See player.md.

### 2026-10-26 — Songs waiting for review are visible everywhere but category tiles
Owner: a new song must be playable at once, with its details filling in later. Songs in
`review` used to be hidden from search, "כל השירים" and the home screen until approved — an
approval step the zero-maintenance rule says she may never do. Now they appear (with "ממתין
לאישור") everywhere except inside category tiles, where their unconfirmed AI category could
put them in the wrong place. Home has a "נוספו עכשיו" section (last 2 days, any status).

### 2026-10-26 — Gemini as a second AI service, with the recording, behind a warning
Owner asked to be able to switch language model and connect Gemini "like Groq". Asked first,
because Gemini's free tier (unlike Groq) may use submitted content to improve Google's models
and lets human reviewers read it, and recordings may contain children. Options offered: text
only (transcription stays on Groq), full Gemini with a warning, or no Gemini. **Owner chose
full Gemini with a warning**, and automatic fallback between connected services when one runs
out of quota. Groq stays the recommended default. Earlier decision "Groq only" is superseded.

### 2026-10-26 — Hand-pasted keys are not format-checked
0.4.0 recognised only `AIza…` Gemini keys; Google had moved to `AQ.…` keys, so the owner could
neither have his key detected nor save it. Clipboard detection stays pattern-based (it must not
grab unrelated text), but a key pasted into the field is accepted if it is one token of 20–200
printable characters and the service's own check decides.

### 2026-10-26 — No review inbox
Owner asked to remove the review screen and the approval step entirely, and to show recently
added songs instead (home section and a library tile). Every processed song is `ready`; she
corrects a name or category on the song screen if she wants. Supersedes "songs waiting for
review are visible everywhere but category tiles". DB v5 moves `review` → `ready`.

### 2026-10-26 — YouTube songs in the queue, still only in a visible player
Owner: a YouTube song reached with "next" should play in the big player as part of the list.
It does — in YouTube's IFrame player on the full player screen, which opens by itself. This
keeps the ToS rule (visible embedded player, no background play): when the screen is closed
or the app is in the background, YouTube doesn't play.

### 2026-11-06 — The app is called PlayGan (0.9.0)
Owner renamed the app from "שירון" to **PlayGan** (that spelling) and chose a new logo: a play
arrow built from rainbow xylophone bars with three small notes above it (approved after
several rounds; drawn by `app/assets/source/make-icons.py`).
- Only what she sees changes: the label under the icon (Android `app_name` via
  `plugins/withDisplayName.js`, iOS `CFBundleDisplayName`), the share-sheet entry
  (`iosShareExtensionName: "PlayGan"`), in-app text, notifications, the lock screen, release
  file names (`playgan-<version>.apk/ipa`).
- Unchanged on purpose: package / bundle id `app.shiron.gan` (a new id = a separate app; she
  would lose her library), signing key, scheme `shiron://`, the repo, code names (`Shiron*`).
- app.json `name` is "פלייגן" (not "PlayGan"): Expo derives native project names from it. A
  non-Latin name keeps the Xcode project "app" (the release workflow builds `app.xcworkspace`),
  and a Latin "PlayGan" would collide with the share extension's target, which is named from
  its display name. CI asserts both visible names.

### 2026-11-05 — Playlists the teacher builds herself (0.7.0)
Owner asked for user-defined playlists assembled from the library (moved up from 0.8).
- A song appears in a list at most once (PK `playlist_id, song_id`) — a duplicate is almost
  always a mis-tap; repeat handles "play it again".
- Reordering is ▲/▼ buttons in a "סידור" mode, not drag-and-drop: 48 pt targets, no precise
  long-press gesture, identical on iOS and Android, no extra native library.
- Deleting a list never deletes songs; deleting a song takes it out of every list (cascade).
- One-tap play: home shows the lists as a row of cards with a round play button; the library
  tab has "הרשימות שלי" above the categories with a "רשימה חדשה" tile; a song screen has
  "הוספה לרשימה". Lists are purely local, like the rest of the library.

### 2026-10-27 — Repository made public
Owner's choice, to get free GitHub Actions while his billing is blocked. The code holds no
user data or AI keys; the Android signing key is now public (see build-and-release.md) and must
be replaced, outside the repo, before real use.
