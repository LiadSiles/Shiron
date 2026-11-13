# Decisions

Newest first. Each entry: what was decided, why, and what was rejected. Add an entry
whenever a choice would surprise a future contributor.

### 2026-11-13 — Repeat on the lock screen: Android button; e2e flakes fixed, not deleted (0.16.1)

- The owner asked again for repeat-song / repeat-list on the lock screen. Android: a repeat
  button in the media controls that cycles the app's mode. iOS: still impossible with the Now
  Playing controls (no custom items since iOS 16); a Live Activity / Control Center control is
  the only route — offered to the owner as a separate, larger step.
- The owner asked to delete always-failing checks where the app is known to work. None failed
  because of the app; each had a test-side cause, so each was fixed instead: the playlist flow
  types a Latin name (the simulator scrambles Hebrew typing), the YouTube flow no longer restarts
  the app in the middle of the link's import, and the "launch did not run" line was a bookkeeping
  bug in `ios.sh`.

### 2026-11-13 — Lock screen: no repeat button on iOS; "play next" plays once (0.16.0)

- Owner asked for restart-the-song and restart-the-list controls on the lock screen. iOS's
  Now Playing controls have no repeat/shuffle button, so instead: at the end of the list the
  player parks on the last song (▶ replays it, ⏭ starts the list again) — see `player.md`.
  Repeat modes stay in the app. Android custom buttons were left out for now.
- Lock screen shows PlayGan as album and in the artist line, with the app icon as artwork.
  Rejected: showing only "PlayGan" as artist — the category helps her know which song it is.
- "נגני הבא" is one-time: the song plays after the current one and leaves the queue, rather than
  being added to the list. Several in a row play in the order she chose them.

### 2026-11-08 — Sharing a whole list or category (0.13.0)

- Owner: share a whole playlist or category. A share button in the header of a list and of a
  category ("כל השירים" and "נוספו לאחרונה" too) sends every audio song as its file and all the
  YouTube songs as one text of titles and youtu.be links, in one system share sheet
  (`shareBundle`: unique file names "שיר (2).m4a"; songs still being prepared are left out and
  counted in a toast).
- Both platforms through our native module (`shareFilesAsync`): Android `ACTION_SEND_MULTIPLE`
  with every URI in the ClipData; iOS a `UIActivityViewController` with the file URLs and the
  text (expo-sharing takes one file). Since 0.13.1 one song goes the same way (expo-sharing removed).
- Whether WhatsApp keeps the text next to many files is up to WhatsApp; untested on a device.

### 2026-11-08 — Songs leave the iPhone as .aac; a searched song plays alone (0.13.1)

- Owner: sharing a song to WhatsApp on the iPhone showed a video trimmer, then "not supported",
  for every song. iOS declares .m4a as `public.mpeg-4-audio`, which conforms to `public.mpeg-4`
  — a **movie** type (Apple's system-declared UTIs) — and WhatsApp's share extension took it for
  a video with no picture. The iPhone now shares a copy re-wrapped as ADTS **.aac**
  (`AacExporter` in the native module: the same AAC packets, a 7-byte header each, no
  re-encoding; `public.aac-audio` is audio only), for one song and for lists alike. Android
  keeps sending the .m4a. One native share sheet on both platforms; expo-sharing is gone (it
  also renamed files to its declared type's extension). Whether WhatsApp then sends it as an
  audio message or as a file is WhatsApp's choice; untested on a device.
- Owner: a song played from the search results must stop at its end — she searched for that
  song, she is not in a list. Search rows now play a queue of that one song (repeat modes still
  apply to it); lists, categories and the home sections still go on.

### 2026-11-08 — YouTube doesn't play in the background; the music goes on without it (0.13.0)

- Owner asked for YouTube to keep playing after leaving the app — without a window if
  possible, else in a small window. Declined: YouTube's Developer Policies forbid background
  play, "including keeping videos playing after your service's window is closed or minimized"
  (a system picture-in-picture outside the app is exactly that), and breaking them risks the
  embeds being blocked. iOS also suspends a page's video in the background.
- Instead: leaving pauses the video and the lock screen offers the next audio song; in the
  background YouTube songs are passed over (told on return); back in the app a paused video
  resumes where it stopped. Details in `player.md` → "In the background".

### 2026-11-08 — Android sharing through our own share sheet (0.12.2)

- Owner: "השיתוף דרך whatsapp לא עובד". expo-sharing on Android starts the share sheet *for a
  result* and refuses every later share ("Another share request is being processed now") until
  that result arrives — and after she sends to WhatsApp it often never does, because WhatsApp
  moves on to the chat. It also grants read access only to the apps it resolves for the sheet
  itself, not through the intent. Android now uses `SongSharer` in our native module: a plain
  `startActivity` of the sheet, the file's read grant on the intent (ClipData + flag), our own
  `FileProvider` (`<package>.share`) exposing only `cache/share/`. iOS kept expo-sharing until
  0.13.1 (see above).
- The e2e flow shares the same song twice in a row; the emulator can't reproduce WhatsApp
  itself, so the WhatsApp leg is still untested on a device.

### 2026-11-07 — Sharing a song out of the app (0.12.0)

- The owner asked to send songs from the app to WhatsApp. The song screen has "שיתוף": the
  phone's own share sheet (`expo-sharing` for a file, React Native `Share` for text), so the
  app itself still sends nothing anywhere and needs no service. An audio song goes as its
  converted .m4a, copied into the cache under her title (`shareFileName`: no characters file
  systems refuse, ≤ 80 characters, "שיר" if empty) so the other side sees a name; the previous
  copy is cleared on the next share, not right after, because the receiving app may still be
  reading it. A YouTube song goes as its title and a youtu.be link (no file — terms of service).
- `expo-sharing` is installed **without** its config plugin: the plugin can add a receiving
  share extension, and receiving is expo-share-intent's job (our patched extension). Sending
  needs no plugin.
- Untested on a device; the simulator check opens the share sheet (best effort: it is another
  process).

### 2026-11-07 — YouTube keeps playing in a small window; MPG; retry failed songs (0.11.0)
- **YouTube while browsing** (owner): one YouTube player for the whole app (`ui/YouTubeHost`,
  above the navigator). On the full player it sits in the screen's slot; when she leaves, it
  shrinks to a 224 × 200 window in the corner (YouTube's minimum is 200 × 200) with ⤢ (full
  player) and ✕ (stop). It stays **visible** — the terms forbid hidden/background playback, not
  a smaller player — and never plays when the app is in the background. The player screen is now
  a card sliding up, not a native modal: a native modal would cover the overlay.
- **MPG on iPhone** (owner): the FFmpeg build became a general fallback (MPEG-PS/TS, AVI, MKV,
  FLV; MP2, AC-3, AAC…), tried whenever the platform can't convert a file. Renamed from the
  WMA-only decoder (`build-ffmpeg.sh`, `native/ffmpeg`, `ShironFFmpeg`, `libshironffmpeg.so`).
- **Retry failed songs**: Settings → "ניסיון חוזר לשירים שנכשלו" (unconverted files and failed
  AI steps), and once per app version the app retries unconverted files by itself, since a new
  version may read their format — the teacher needn't know.

### 2026-11-06 — WMA through our own FFmpeg build (0.10.0)
Owner wants WMA played. No platform decoder exists, ffmpeg-kit was retired (Jan 2025, binaries
removed), community builds are tens of MB (some GPL), and Hermes has no WebAssembly
(ffmpeg.wasm). So `scripts/build-ffmpeg.sh` (then `build-wma-decoder.sh`) builds FFmpeg (tag pinned, unmodified, LGPL
2.1, `--disable-everything` + ASF demuxer + WMA decoders, no asm) and one C file,
`native/ffmpeg/to_wav.c` (then `native/wma/wma2wav.c`), that writes a 16-bit WAV; the existing converter then handles it as any
WAV. iOS: a static `ShironFFmpeg.xcframework` (device + simulator arm64, module map) vendored by
the podspec when present (`SHIRON_FFMPEG`); Android: `libshironffmpeg.so` per ABI in `jniLibs`
(16 KB pages, FFmpeg symbols hidden) + `FfmpegDecoder.kt` (JNI). Built in CI with a cache, never
committed. Cost: ~1–2 MB per platform. A WMV's sound comes the same way. LGPL: the source is
FFmpeg's own tag and the build script is in this repo; review again before an App Store release.

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
- WMA/WMV: no decoder on iOS or Android and neither AI service reads them. First refused with
  an explanation; then the owner chose to support them: see "WMA through our own FFmpeg build".

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
