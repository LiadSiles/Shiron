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
- Repeat sets `player.loop`. On `didJustFinish` without repeat → next in queue.
- Lock screen metadata: title, first category as artist, album "שירון".
- YouTube songs never go through this player (`playOrOpen` routes them to `youtube/[id]`),
  and opening that screen stops the audio player.

## Play counting

A session tracks listened seconds from `playbackStatusUpdate` deltas (ignores jumps > 2 s,
i.e. seeks). `recordPlay` on song change, end, or next; ranking decides what counts as a play.
YouTube: time the screen was open (≥ 5 s).

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
- Swiping it away (`setDeleteIntent` → `ACTION_DISMISS`) keeps it hidden until playback resumes.
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
