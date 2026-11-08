# Player

_Last verified: 2026-10-26 (0.3.1; notification changes and the playlist not yet tested on a device)_

`app/src/player/player.ts`, on `expo-audio` (SDK 58).

## Audio session

```ts
setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' })
```

- `playsInSilentMode`: classroom phones are often on silent.
- `doNotMix` is **required** for lock-screen controls (`setActiveForLockScreen`).
- iOS: the `expo-audio` plugin adds `UIBackgroundModes: audio` (`enableBackgroundPlayback: true`).
- Android: background playback beyond ~3 minutes needs `setActiveForLockScreen(true)`
  (foreground media service, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`); Android 13+ also needs
  the notification permission, requested on first play.
- Microphone permission and `RECORD_AUDIO` are disabled in the plugin config — the app never
  records.

## Behaviour

- One native `AudioPlaylist` for the app (since 0.3.1; 0.3.0 used an `AudioPlayer` with
  `replace()`). `playSong(song, queue)` clears it, adds the queue (songs still processing or
  with a missing file are skipped), `skipTo(index)`, plays. Why a playlist: expo-audio shows
  next/previous in the notification and lock screen **only for playlists**
  (`supportsNextTrack` is false for `AudioPlayer`), and those buttons drive the native queue
  directly, so they work with the app in the background.
- JS follows the native queue through `trackChanged` and `currentIndex` in status updates
  (`onIndex` → `moveTo`): play accounting, lock-screen metadata, mini player. After a rebuild
  or a JS next/previous, `expectIndex` ignores stale index reports until the native side
  reports the index we asked for.
- Repeat = playlist `loop: 'single'`. Previous in the app: back to 0:00 if > 3 s in, otherwise
  the previous song; previous in the notification goes straight to the previous song.
- Live song data: `PlayerState.song` is a snapshot, so the player subscribes to
  `onLibraryChange` and on track changes re-reads the current song (`refreshCurrent`, compares
  `updatedAt` + category ids). An edit to the lyrics or the AI naming the song shows at once in
  the full player, the mini player and the lock screen (0.3.3 needed a song switch).
- Playback errors: `status.error` (untyped; `{message, code}` on Android) → `PlayerState.error`.
- Mini player (0.9.0): previous · play/pause · next, left-to-right as on every player
  (`direction: 'ltr'`); previous behaves as in the full player (restart after 3 s, else the
  song before). Next hides on the last song unless repeat-all.
- One play/pause action everywhere: `togglePlay()` (mini player, full player) and
  `playOrToggle(song)` (a song row: same song → toggle, other song → play it). There is no
  separate "stop" — 0.2 had a square stop in the mini player and a play/pause in the full
  player that went out of sync (owner report).
- Pausing fades volume to 0 over 0.5 s, then pauses (no abrupt cut in front of children).
  State is set optimistically on tap; while `fading` is true, status updates that still say
  `playing` are ignored — otherwise the icon flipped back mid-fade and a second tap
  restarted the song.
- `seek(seconds)`: clamped, optimistic position, and position updates are ignored for
  800 ms (`seekingUntil`) so the bar doesn't jump back to the old time before the player
  reports the new one. `previous()` = back to 0:00.
- Status `error` is stored in `PlayerState.error` and logged with `diag`; the players show it.
- Repeat (`cycleRepeat`): off → **all** (the whole list, around) → **one** → off
  (`core/queue.ts`, tested). Repeat-one = native `loop: 'single'` (YouTube: seek 0 on end);
  repeat-all wraps natively only when the run is the whole queue, otherwise the app wraps.
  What follows the end of a song is one decision, `afterEnd` (`core/queue.ts`, tested): the
  same song (one), the next, around (all), or stop — for audio past the native loop and for
  YouTube alike (`continueAfterEnd`; each end is logged, "ended · <title> · repeat · loop").
  After a stop, `ended` is set: iOS removes a finished item from the native queue, so "play"
  and a seek load the song again (`startAt`) instead of resuming nothing. `e2e-end.yaml` drags
  a lone song to its end in each mode (0.13.0: the owner heard the song start again on the
  iPhone in every mode; until then no check ever let a song end).
- Lock screen metadata: title, first category as artist, album "שירון".

## YouTube in the queue (0.5.0)

- The queue holds audio **and** YouTube songs in the order she picked from. The native
  playlist holds only the **run** of consecutive audio songs around the current one
  (`audioRun`); the notification's next/previous work inside that run.
- At the end of a run (`didJustFinish` on its last song), or on next/previous across its edge,
  the app calls `startAt(index)`: a YouTube song pauses the native player, clears the
  lock-screen controls (they would show the previous song) and opens the full player
  (`router.push('/player')` unless it is showing — `setPlayerScreenOpen`).
- The full player shows `ui/YouTubeView`: YouTube's IFrame API in a WebView (visible, as the
  terms require; `youtube-nocookie.com`). It posts state (1 playing / 2 paused / 0 ended), time
  and errors; the app's play/pause/seek/scrubber drive it through `attachYoutube` +
  `injectJavaScript`. Ended → next song (audio or YouTube).
- Loading and offline (0.6.0): the view shows "טוען מיוטיוב…" until the IFrame API's `onReady`;
  the API script failing to load, WebView `onError`, or 15 s without `ready` → "אין חיבור
  לאינטרנט" with "נסי שוב" (reloads the WebView). Offline and errors 2/5 are **not** skipped:
  0.5.2 skipped forward after any error, so "previous" onto an offline YouTube song bounced
  forward again (owner report: "only next works"). Only permanent errors (100 removed, 101/150
  embedding forbidden) skip after 3 s, **in the direction she was going** (`direction`, set by
  next/previous/end). "Previous" on a failed YouTube song goes to the previous song at once.
  `playing` stays false for a YouTube song until YouTube reports it really plays.
- One YouTube player for the whole app (`ui/YouTubeHost`, 0.11.0): on the full player it is
  placed over the screen's slot (`youtubeView.frame`, window coordinates, re-measured every
  250 ms while the player is the focused screen — one measurement during the slide-in was wrong
  on the simulator and the video covered the header's back button; a measurement is used only
  while the screen is focused and only if it is 16:9 below the header; a screen opened on top,
  e.g. details, blurs it and the video drops to the small window); leaving the screen shrinks it to a small window (224 × 200, YouTube's
  minimum is 200 × 200) above the mini player — still visible, still playing, same WebView so
  the video doesn't restart. ⤢ opens the full player, ✕ (`closeYoutube`) stops it; play in the
  mini player then reopens the full player, which autoplays. The player route is a card
  (`slide_from_bottom`), not a native modal, so the overlay can sit above it.
- The status banner and toasts (`ui/toast.tsx → StatusHost`, root layout) sit **below** the
  header and take no touches (`pointerEvents="none"`). Until 0.12.0 they sat over the header:
  while songs were being named or converted the banner covered "חזרה" on every screen and
  swallowed its taps — the owner's "back stops working after the second visit" (0.11.0 and
  0.11.1), not navigation.
  Since 0.12.1 only the short "saving a share" banner floats there; preparing and naming /
  transcribing (minutes) show as a line in the home screen's content (`WorkStatus`) and in each
  song's row — the floating line hid the top of every screen while a transcription ran.
- Every way to the full player goes through `showPlayer()` (mini player, ⤢, a YouTube song
  starting): it counts mounted player screens and, if one is already in the stack (details on
  top of it), `dismissTo('/player')` instead of pushing a second; a push not yet mounted
  blocks another for 1.5 s. Before 0.11.1 a boolean flag and plain pushes could stack two
  players, after which "חזרה" seemed to do nothing (owner, 0.11.0 on the iPhone).
- The small window is dragged by its bar (a grip between ✕ and ⤢) and snaps to the nearest
  corner, between the header and the mini player; the corner is kept while the app runs. The
  host is laid out `direction: 'ltr'` so the slot frame and corners are physical coordinates.
  The WebView doesn't scroll or bounce (it looked like a scrollable box).

## In the background (0.13.0)

YouTube's Developer Policies forbid "background play", explicitly including keeping a video
playing after the app's window is closed or minimized — so no system picture-in-picture either
(`allowsPictureInPictureMediaPlayback={false}`). The owner asked for YouTube in the background;
it was declined for this reason, and the music goes on with the audio songs instead:

- **Native slots.** The native playlist holds `slots` (queue indexes in its order). In the
  foreground: the run around the current song, as before. Going to the background
  (`AppState` → `background`) appends every audio song ahead (`core/queue.backgroundSlots`,
  around the list when repeating it), so the end of a song and the lock screen's "next" pass
  over YouTube songs instead of stopping. Back in the foreground, slots past a YouTube gap are
  removed again (`foregroundSlots`; only after the current one — removing before it would
  shift the native index), so a YouTube song plays in its visible player again.
- **Leaving during a YouTube song.** The video is paused (on Android a WebView would go on
  playing). What it was doing as she left counts — iOS may pause the page itself on the way
  out, so the state at `inactive` is kept. The native playlist is loaded, paused, with the audio
  songs ahead and the lock screen shows the first (`standby`). Play or next there → that song
  becomes current (`adoptStandby`). Back without that → the video carries on where it stopped
  (if it was playing).
- **Reaching a YouTube song in the background** (`startAt` with the app not active): the next
  audio song plays; with none left, the YouTube song waits (`pendingYoutube`) and starts when
  she is back. She is told how many YouTube songs were passed over (a toast on return).
- **The page dropped.** iOS may terminate the WebView's content process in the background, and
  an Android renderer can die (unhandled, that closes the app): `onContentProcessDidTerminate` /
  `onRenderProcessGone` reload the page at the position it had, playing only if it was.
- Deleting a song takes it out of the queue and the native list (`forgetSong`); before, only
  the current song was forgotten and the list later stopped on the missing file.
- Calls and other interruptions, and a Bluetooth speaker or headphones going away, are handled
  by expo-audio itself (iOS: pause, resume when the system says so; Android: "becoming noisy"
  pauses) — checked in its source (SDK 58), not on a device.
- Untested on a device: the lock screen in standby (a paused native playlist with Now Playing
  info) and process termination. The Maestro flow `e2e-background.yaml` covers leaving and
  coming back during a YouTube song, and checks the technical log for "background: youtube
  paused" (logged as soon as the video is paused — at first it was logged only once the lock
  screen's song was set up, which never happens when she comes back within a moment or no audio
  song is ahead, so the iPhone run found no line). On the Android emulator a flow takes minutes, so the 3½-minute test video can end
  before the check and the list moves on to the next audio song (seen at aedff68): the flow
  waits for the window only on the iPhone and then opens whichever player is showing.
- The old `youtube/[id]` screen is gone; "פתיחה באפליקציית יוטיוב" is on the full player.

## Play counting

A session tracks listened seconds from `playbackStatusUpdate` deltas (ignores jumps > 2 s,
i.e. seeks). `recordPlay` on song change, end, or next; ranking decides what counts as a play.
YouTube: the same session accounting, from the IFrame API's time reports.

## Controls (`ui/icons.tsx`, `ui/Scrubber.tsx`)

- **Media controls are never mirrored in RTL.** Play points right, next = ▶| on the right,
  previous = |◀ on the left, time runs left → right — like every player, including Hebrew
  ones. Rows of controls and the scrubber use `direction: 'ltr'`. (0.2 had next/previous
  swapped by the forced RTL layout — owner report.)
- Icons are drawn with Views, not Unicode symbols: ⏸/⏹ render as coloured emoji on some
  Android phones and differ from iOS.
- `Scrubber`: PanResponder on a 44 pt-high touch area. Grant takes `locationX`, moves add
  `gesture.dx` (no `measure` needed); the thumb grows and the time shows the target while
  dragging; seek happens once on release. `onPanResponderTerminationRequest: false` keeps the
  drag inside the ScrollView. VoiceOver/TalkBack: adjustable, ±10 s.

## Android notification (patched expo-audio)

expo-audio 58 starts its `AudioControlsService` in the foreground and never leaves it, so the
media notification could never be swiped away and stayed after leaving the app (owner report,
0.3.0). `app/patches/expo-audio+58.0.10.patch` (applied by `patch-package` on `npm ci`):

- Foreground only while playback should run (`playWhenReady` and not ENDED/IDLE). Paused or
  finished → `stopForeground(STOP_FOREGROUND_DETACH)`, re-posted as a normal, dismissible
  notification; resumed → `startForeground` again. This is what media3's own
  `MediaSessionService` does.
- Swiping it away (`setDeleteIntent` → `ACTION_DISMISS`) keeps it hidden until playback resumes
  **or a song is started**: `setPlayableOptions` (every `setActiveForLockScreen` for the same
  player, i.e. every `playSong`) resets `dismissed` and, if playback is on, promotes the
  service to the foreground again. 0.5.1 kept a swiped-away notification hidden for good on
  the owner's phone (owner report). The released session is also nulled at once, so no
  notification is built on it while the new one is being created.
- `onTaskRemoved`: closing the app from recents while nothing plays clears the session.
- Seek bar: the session already allows `COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM`, which Android
  13+ shows as a draggable bar; we pass `isLiveStream: false` explicitly. The owner saw no bar
  in 0.3.0 on his Xiaomi — unknown whether HyperOS hides it; check on 0.3.1.

**Gotcha (cost us 0.3.1):** Expo SDK 58 modules ship a prebuilt AAR in
`node_modules/<pkg>/local-maven-repo`, and Gradle uses it instead of the source — so a patch to
the Kotlin source silently does nothing. `app/package.json → expo.autolinking.android.
buildFromSource: ["expo-audio"]` forces the source build, and the release workflow fails if the
patched string is missing from the APK's dex.

When upgrading expo-audio, the patch fails loudly in `npm ci` if it no longer applies: re-check
whether upstream fixed this (then drop the patch) or regenerate it with
`npx patch-package expo-audio`.
