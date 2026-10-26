# iOS constraints

_Last verified: 2026-10-26 (0.2.0)_

iPhone is the top-priority platform. Check every idea against this page.

| Fact | Consequence |
|---|---|
| AVPlayer does not play Ogg/Opus (WhatsApp voice notes `.opus`), and AVFoundation does not read the Ogg container at all. AudioToolbox does decode Opus packets. | The app demuxes Ogg itself and decodes with `AVAudioConverter`, then writes AAC `.m4a` ([audio-processing.md](audio-processing.md)). Until converted (seconds), a voice note isn't playable on iOS (row shows "מכינה לניגון…"). |
| No Apple decoder for Vorbis, webm/mkv. | Those files are "unsupported" on iPhone (fine on Android). |
| Apps can't read WhatsApp's chats or files. | Only the share sheet (or a chat export ZIP) brings files in. |
| A share extension is a separate target with its own bundle id and an App Group. | `expo-share-intent` generates it at prebuild; EAS credentials need a profile for it too. Free Apple IDs used for sideloading may not support App Groups — the share flow may fail on a sideloaded build (untested). |
| Background audio needs `UIBackgroundModes: audio` and an active session. | Set by the `expo-audio` plugin. |
| YouTube ToS: no downloading, visible player. | YouTube links play only in the embedded player on the full player screen, foreground only; a run of audio songs continues in the background and the YouTube song starts when she returns. |
| The app container path changes between updates. | Store file paths relative to Documents (`ingest/storage.ts`). |
| No installing arbitrary files. There is no ".apk for iPhone". | Distribution: unsigned IPA sideloaded with the user's Apple ID (7-day expiry on free accounts), or TestFlight / App Store with a paid Apple Developer account ($99/yr). See [build-and-release.md](build-and-release.md). |
| Expo Go can't run native modules we use (share extension). | Dev/release builds only. |
