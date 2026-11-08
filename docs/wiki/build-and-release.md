# Build and release

_Last verified: 2026-10-26 (v0.1.0 released with APK 45 MB + IPA 11.6 MB; 0.2.0 workflows pending)_

## Toolchain

Expo SDK 58 (React Native 0.88, React 19.3, Hermes), expo-router, TypeScript 6, vitest 5,
Node 22 (`.nvmrc`). Local native module `app/modules/shiron-audio` (Swift 5.9 / Kotlin, classic
Expo module DSL). iOS deployment target 16.4 (Expo default). Android `arm64-v8a` +
`armeabi-v7a` in release APKs. ffmpeg is used only to (re)generate test fixtures.

## Native projects

Continuous Native Generation: `npx expo prebuild` writes `app/ios` and `app/android` from
`app.json` + plugins. Both are git-ignored; never edit them. Xcode workspace
`ios/app.xcworkspace`, scheme and main target `app` (the Hebrew app name sanitizes to
nothing, so Expo falls back to "app"; the display name is still "שירון"). Share extension
target `Shiron` (`ios/Shiron/`).

## Sandbox gotchas (Claude Code cloud sessions)

- `npx expo install` fails with "HTTP Proxy Network Error: Forbidden" (it calls the React
  Native Directory API). Use `EXPO_OFFLINE=1 npx expo install <pkg>`; it uses the version map
  bundled with `expo`. For a package missing from that map, read the version from
  `node_modules/expo/bundledNativeModules.json` and `npm install` it.
- `app/.npmrc` has `legacy-peer-deps=true`: `react-dom` (web-only optional peer) conflicts
  with React 19.3.0 and plain `npm install` refuses.
- No Xcode / Android SDK here: **CI is the native compile check.** Locally you can still run
  typecheck, tests, `expo prebuild` (config plugins) and `expo export` (JS bundle).
- Raw Actions job logs are unreachable (blob storage blocked). Read results through
  `gh api repos/LiadSiles/shiron/check-runs/<job id>/annotations`; every workflow step that
  can fail re-emits its errors as `::error::` lines for this reason.
- This session's token cannot dispatch workflows (`workflow_dispatch` → 403). To start a
  release, push a commit that touches `app/**`, `scripts/**` or `release.yml`.

## CI gotchas

- The very first push of `main` to the new repo did not trigger `release.yml` (path filters
  had nothing to diff against). Later pushes do.
- 0.1.0's first two publish attempts failed at `gh release create` (exit 1, no message in
  annotations). Adding `--repo "$GITHUB_REPOSITORY"` (and stderr → annotations) fixed it on
  the next run. Likely cause: `gh` inferring the repo from the checkout's remote after the
  repo was renamed to `Shiron`; not proven. Keep `--repo` explicit.
- `ubuntu-latest` moved to Ubuntu 26 in October 2026 (ffmpeg 8.0 if installed there).
- vite/oxc (vitest) resolves the *nearest* tsconfig of every file it transforms; one that
  `extends` a package that isn't installed fails with "Tsconfig not found". Hit in 0.1 when the
  (now removed) server imported app code. Locally this hides behind vitest's transform cache
  (`node_modules/.vitest-cache`).

## Signing

- **Android:** `app/keystore/shiron.keystore` (alias `shiron`, password `shiron-android`)
  is committed on purpose. `app/plugins/withSigningKey.js` copies it into the generated
  project and points both debug and release at it, so every APK — CI or local — installs as
  an update of the previous one. Replacing it forces every user to uninstall (losing the
  library). If the app ever goes to Google Play, use Play App Signing with a separate upload key.
- **iOS:** release IPAs are **unsigned** (`CODE_SIGNING_ALLOWED=NO`). The installer signs
  them with their own Apple ID (Sideloadly / AltStore). Signed builds go through EAS.

## CI (`.github/workflows/ci.yml`)

Push to `main`/`dev/**` and PRs: app typecheck + tests + `expo prebuild --clean` with
assertions on the generated config (background audio, share extension incl. movies, media
playback service, audio/video intent filters, signing, the audio module autolinked on both
platforms).

`native.yml` (when `app/modules/**` changes): **apple** job on `macos-15` builds
`ios/Core` as a Swift package and runs it on the fixtures (`swift-tests/run.sh`; per-format
results as `::notice::`/`::warning::` annotations); **android** job compiles the module and runs
the JVM unit tests of `LoudnessPlan`. The emulator-based instrumented tests are local-only (see
audio-processing.md). Gradle project of the local module: `:shiron-audio`.

**GitHub keeps at most 10 annotations of each level per step.** Anything diagnostic must be
joined into one annotation (`tr '\n' '|'`) or get its own step, or it is silently dropped.

## Releases (`.github/workflows/release.yml`)

Trigger: push to `main` touching `app/**`, `scripts/**` or the workflow; or manual.

| Situation | Tag | Files | Type |
|---|---|---|---|
| `app.json` version has no tag yet | `v<version>` | `shiron-<version>.apk` + `shiron-<version>.ipa` | latest release, notes = CHANGELOG section |
| same version, later push | `v<version>-build.<n>` | APK | prerelease |
| manual run with `ios: true` | `v<version>-build.<n>` | APK + IPA | prerelease |

- Build number `n = 100 + run_number` → Android `versionCode` and iOS `CFBundleVersion`
  (`scripts/set-build-number.mjs`, run before prebuild), so each APK upgrades the previous.
- Android: `expo prebuild -p android` → `./gradlew assembleRelease` (JS bundle embedded;
  checked in the APK).
- iOS: `macos-15`, latest stable Xcode, `expo prebuild -p ios` (runs `pod install`) →
  `xcodebuild archive` unsigned → `Payload/app.app` zipped as `.ipa`. The job checks the
  share extension (`PlugIns/Shiron.appex`) and `main.jsbundle` are inside.
- **Cost:** macOS minutes count 10× on a private repo (GitHub Free: 2,000 min/month ≈ 200
  macOS minutes). That is why iOS builds only per version or on demand.
- Release notes end with `.github/release-install.md` (Hebrew install steps for both
  platforms).
- Cutting a version: `npm run version:bump -- minor` (updates `app.json`, `app/package.json`,
  adds the CHANGELOG heading) → commit → push to `main`.

## TestFlight (opt-in, not set up yet)

Needs the owner's Apple Developer account ($99/yr) and an Expo account:
1. `cd app && npx eas-cli@latest init` (adds `extra.eas.projectId` to `app.json`), then
   `npx eas-cli@latest credentials` once interactively to create certificates and profiles
   for the app **and** the share extension.
2. GitHub: secret `EXPO_TOKEN`, repository variable `ENABLE_TESTFLIGHT=true`.
3. Each full release then runs the `testflight` job (`eas build --auto-submit`).

## Installing on a phone

See `.github/release-install.md` (also appended to every release). Android: download APK,
allow unknown sources once, install over the previous version. iPhone: Sideloadly with an
Apple ID; free IDs expire after 7 days and need Developer Mode on iOS 16+. Sideloadly with a
free ID grants no App Group, so the share extension can pass links but not files (files: save to
Files, then the in-app picker). AltStore/SideStore (free) or a paid account give the full share.

## FFmpeg fallback decoder in CI

`scripts/build-ffmpeg.sh` runs before `expo prebuild` in release.yml (android: 4 ABIs; ios),
ios-sim.yml (ios), native.yml and smoke.yml (android x86_64), with `actions/cache` on `build/ffmpeg`
keyed by the script and `native/ffmpeg/*`. The podspec only vendors the xcframework if it exists at
`pod install` time — so the script must run before prebuild. Release fails if
`lib/arm64-v8a/libshironffmpeg.so` is missing from the APK. Android uses
`ANDROID_NDK_LATEST_HOME` (preinstalled on GitHub's Ubuntu runners).

## iPhone check (`ios-sim.yml`)

Every push to a dev branch touching the app runs two parallel jobs — a simulator build with the
App Group and one with no entitlements (like Sideloadly with a free ID) — driven by Maestro
(`scripts/e2e/ios.sh`). Since 0.11.1 the job **fails** when a must-pass check fails:

- `check` (must pass, `e2e-*.yaml` + `launch.yaml`, with assertions): the empty first launch;
  YouTube (from the extension's no-group link, `simctl openurl`) — full player, the small
  window, ⤢ and "חזרה" three times, dragging, ✕; Settings' "שיתוף מוואטסאפ" row ("הקלטות
  וקישורים" with the group, "רק קישורים" without). With the group: files handed over the way
  the extension does (`inject-ios.sh`: copy into the group container, the JSON list under
  `shironShareKey` in the group's defaults, `shiron://dataUrl=shironShareKey#file`) — mp3,
  WhatsApp opus, WMA, MPG, the mp3 again (no duplicate), a broken "mp3" (explained, no crash),
  a text file (ignored) → 6 songs, each real one converts and plays; the player (play all,
  next/previous, the three repeat modes, pause, details and "חזרה" three times); a song's
  screen (rename kept after a restart, pin, delete); a list (create, reorder, play, delete);
  search (Latin, Hebrew, nothing found).
- `try` (reported in `results-<variant>.txt`, not counted): the real share sheet from Safari
  and Files, the home screen's "+" with the file picker, the category editor.

Failed checks get a screenshot (`*-FAILED.png`) and the view hierarchy (`*-hierarchy.json`).
Screenshots, results and the simulator log go to the `screenshots` branch under
`ios-<branch>-<variant>`; the extension's `[PlayGan]` lines and the results become
annotations. With the `GEMINI_API_KEY` secret the group job also runs the live Gemini test.
Gotchas:
- The share sheet and the file picker are other processes; Maestro sometimes can't see or tap
  them, which is why they are `try` and the import path is checked through `inject-ios.sh`.
- Maestro's `back` does nothing on iOS: tap the header's "חזרה" — exactly, since `.*חזרה.*`
  also matches the repeat button "בלי חזרה".
- Rows are found by their spoken label ("נגני <title>"), not the title alone.
- "PlayGan" also labels the status bar's back link: the sheet's icon is `index: 1`.
- Taps by position break: GitHub picks different iPhone models between runs.
- `simctl openurl` and the no-group extension make iOS ask "Open in PlayGan?" (`dismiss.yaml`).
- The simulator's network sometimes drops: YouTube then shows "אין אינטרנט".
- WhatsApp can't run on a simulator; Safari and Files stand in for it.

## Android end-to-end check (`smoke.yml` → `e2e`)

Same flows as the iPhone (`scripts/e2e/*.yaml`; `back.yaml` taps "חזרה" on iOS and presses
the system back on Android; `dismiss.yaml` closes iOS's "Open in" prompt and the one-time "חיבור
שירות AI" offer) on an API 34 emulator with the release APK (`scripts/e2e/android.sh`). Songs
come in the way she adds them on Android: a YouTube link shared as text (`am start SEND`), files
pushed to Downloads and picked with the home screen's "+" (`add-android.yaml`, the system
picker): mp3, WhatsApp opus, WMA, MPG, a broken "mp3", the mp3 again. Then import → player →
song → list → search, and sharing out (`share-out-android.yaml`: the system share sheet opens
for a file and for a YouTube link; the script also checks logcat for the CHOOSER intent). The
job fails on a failed check or a crash; screenshots, results and errors go to the
`screenshots` branch under `android-<branch>`.

The songs are the fixtures looped to ~40 s (`scripts/e2e/long-songs.sh`, both platforms;
the fixture itself if ffmpeg can't write a format): at 2.5 s a song had ended and the next one
started before the emulator's Maestro looked for "מתנגן: <title>". `share-out-android.yaml`
shares the same file twice in a row, then a link; the script counts the CHOOSER intents in
logcat (≥ 3), since the sheet itself is another app.

The CI machines have no ffmpeg by default: both workflows install it (apt, brew).

Gotchas: `hide_error_dialogs` does not hide a launcher ANR ("Pixel Launcher isn't responding")
— in 0.12.1's run it covered every flow. `android.sh` now lets the launcher settle for 20 s
after install, and `dismiss.yaml` taps "Wait" while such a dialog shows. On the iPhone, the
first "חזרה" right after the YouTube player opened was once ignored (the playing video keeps
`waitForAnimationToEnd` from settling): `e2e-youtube.yaml` retries that one back once with a
screenshot; the three rounds after it must pass outright.

## Local builds

- Android: `cd app && npx expo run:android` (Android Studio SDK, device with USB debugging).
- iOS: `cd app && npx expo run:ios --device` (Mac + Xcode + Apple ID).
- Dev client with fast refresh: `npx eas-cli@latest build --profile development`.

## Sandbox gotchas (0.3.0)

- `gh release view`, `gh pr view` and other GraphQL-backed `gh` commands return 403 from
  Claude sessions. Use REST: `gh api repos/LiadSiles/shiron/releases/tags/v<version>`.
- `npm run version:bump` turns `## [Unreleased]` into the new version heading. Write the
  entries under `[Unreleased]` first; don't add the version heading by hand (it duplicates).
- Patched native dependencies: Expo modules come with prebuilt Android AARs; list any module
  with a patch in `app/package.json → expo.autolinking.android.buildFromSource` (see player.md).
- "The job was not started because recent account payments have failed or your spending limit
  needs to be increased" = the owner's GitHub Actions billing (private repo; macOS minutes
  count 10×), not the workflow. The APK/IPA are still downloadable as run artifacts
  (`android`, `ios`, kept 90 days); once billing is fixed, "Re-run failed jobs" on the run
  publishes the release. Sessions here can't create releases themselves (403).
- 2026-10-27: the owner made the repo **public** so Actions run free (billing was blocked).
  Consequence: the committed signing keystore (`app/keystore/shiron.keystore`, password in
  `plugins/withSigningKey.js`) is public — anyone can sign an APK that installs as an update.
  Acceptable while only the owner tests; **generate a new key (kept out of the repo, as a CI
  secret) before the teacher relies on the app** — a new key means one uninstall/reinstall.
  Sessions here can't re-run workflows (403); a push touching `app/`, `scripts/` or
  `release.yml` triggers the release.

## R8 keep rules (`app/plugins/withKeepRules.js`)

Expo SDK 58's template turns R8 on for release builds (`android.enableMinifyInReleaseBuilds`).
0.7.0 crashed at launch on every Android phone, before any screen:
`NoSuchMethodException: androidx.work.impl.WorkDatabase_Impl.<init>` in `WorkManagerInitializer`
— R8 removed the constructor WorkManager (via expo-background-task) creates by reflection. The
plugin appends keep rules to `android/app/proguard-rules.pro`; CI asserts they are there. A new
native library that uses reflection may need its own rule: the launch check below catches it.

## Android launch check (`.github/workflows/smoke.yml`)

Builds a dev branch's **release** APK (R8 as in a real release, x86_64 for the emulator), opens
it on an API 34 emulator, waits 30 s and reports whether the app is still running, with the
logcat crash buffer as annotations and a screenshot artifact. Runs on every push to `dev/**`
touching `app/`; a branch should pass it before merging to `main`. Dispatch with a tag to open a
published APK instead. (The released APK has only ARM code, so it can't fully start on the x86_64
emulator — a crash before native code loads, like 0.7.0's, still shows.)

### Screenshots from the launch check

With `SHOTS=1` (set in `smoke.yml`) the script then walks the app on a Pixel 6 profile, light and
dark: shares three YouTube links the way WhatsApp does (`am start -a SEND -t text/plain`),
pictures the save toast, the connect offer, home, library (tapped by label via `uiautomator
dump`), a category, the player (deep links `shiron://…`), a new playlist, settings and connect.
The PNGs are pushed to the **`screenshots`** branch under the dev branch's name
(`dev-0.6/NN-mode-screen.png`) — fetch it with git; artifact downloads are blocked in some review
sandboxes. Gotchas: the slow emulator shows "System UI isn't responding" over everything —
the script sets `hide_error_dialogs` and taps "Wait"; the first song opens the connect offer
once, so the walk presses back. A crash of our process during the walk fails the check.

