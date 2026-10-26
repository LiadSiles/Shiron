# Player

_Last verified: 2026-10-26 (0.3.0; background playback and seeking not yet tested on a device)_

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

- One `AudioPlayer` for the app; `replace()` per song. Queue = the list the song was picked
  from (only playable items).
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
