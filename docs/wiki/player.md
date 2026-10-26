# Player

_Last verified: 2026-10-26 (0.1.0; background playback not yet tested on a device)_

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
- `stop()` fades volume to 0 over 0.5 s, then pauses (no abrupt cut in front of children).
- Repeat sets `player.loop`. On `didJustFinish` without repeat → next in queue.
- Lock screen metadata: title, first category as artist, album "שירון".
- YouTube songs never go through this player (`playOrOpen` routes them to `youtube/[id]`),
  and opening that screen stops the audio player.

## Play counting

A session tracks listened seconds from `playbackStatusUpdate` deltas (ignores jumps > 2 s,
i.e. seeks). `recordPlay` on song change, end, or next; ranking decides what counts as a play.
YouTube: time the screen was open (≥ 5 s).
