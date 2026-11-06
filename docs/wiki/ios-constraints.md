# iOS constraints

_Last verified: 2026-11-06 (0.9.2; share extension on a Sideloadly install)_

iPhone is the top-priority platform. Check every idea against this page.

| Fact | Consequence |
|---|---|
| AVPlayer does not play Ogg/Opus (WhatsApp voice notes `.opus`), and AVFoundation does not read the Ogg container at all. AudioToolbox does decode Opus packets. | The app demuxes Ogg itself and decodes with `AVAudioConverter`, then writes AAC `.m4a` ([audio-processing.md](audio-processing.md)). Until converted (seconds), a voice note isn't playable on iOS (row shows "מכינה לניגון…"). |
| No Apple decoder for Vorbis, webm/mkv. | Those files are "unsupported" on iPhone (fine on Android). |
| Apps can't read WhatsApp's chats or files. | Only the share sheet (or a chat export ZIP) brings files in. |
| A share extension is a separate target with its own bundle id; it hands files to the app through an App Group. | `expo-share-intent` generates it at prebuild (with our controller, see [decisions.md](decisions.md) 2026-11-06); EAS credentials need a profile for it too. **Sideloadly with a free Apple ID grants no App Group** (seen on the owner's iPhone, 0.9.1: WhatsApp froze, nothing arrived). AltStore/SideStore grant one under a new name (`group.<id>.<TEAMID>`, listed in `ALTAppGroups`). Without a group, only links/text get through the extension; files come in through "Open in PlayGan" (document types). |
| Apps that declare document types appear in the share sheet for those files ("Open in"); iOS copies the file into the app's `Documents/Inbox` and opens the app with its `file://` URL. Needs no App Group. | `ios.infoPlist` → `CFBundleDocumentTypes` (audio, movie, Opus, Ogg) + `UTImportedTypeDeclarations` for `.opus`/`.ogg`, which iOS doesn't know. Untested from WhatsApp on a device. |
| Background audio needs `UIBackgroundModes: audio` and an active session. | Set by the `expo-audio` plugin. |
| YouTube ToS: no downloading, visible player. | YouTube links play only in the embedded player on the full player screen, foreground only; a run of audio songs continues in the background and the YouTube song starts when she returns. |
| The app container path changes between updates. | Store file paths relative to Documents (`ingest/storage.ts`). |
| No installing arbitrary files. There is no ".apk for iPhone". | Distribution: unsigned IPA sideloaded with the user's Apple ID (7-day expiry on free accounts), or TestFlight / App Store with a paid Apple Developer account ($99/yr). See [build-and-release.md](build-and-release.md). |
| Expo Go can't run native modules we use (share extension). | Dev/release builds only. |
