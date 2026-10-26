# Build and release

_Last verified: 2026-10-26 (workflows written; first CI run pending)_

## Toolchain

Expo SDK 58 (React Native 0.88, React 19.3, Hermes), expo-router, TypeScript 6 (app) /
7 (server), vitest 5, Node 22 (`.nvmrc`). Server: Fastify 5, `@anthropic-ai/sdk` 1.3,
`openai` 7, ffmpeg (6.1 in this sandbox and on CI runners, 5.1 in the Debian-based Docker image). iOS deployment target 16.4 (Expo default). Android
`arm64-v8a` + `armeabi-v7a` in release APKs.

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
- `ubuntu-latest` moved to Ubuntu 26 in October 2026: the server job now runs ffmpeg 8.0.
- The server's tests import `app/src/core/categories.ts`, and the server CI job installs
  no app dependencies. vite/oxc resolves the *nearest* tsconfig, which was
  `app/tsconfig.json` → `extends: expo/tsconfig.base` → "Tsconfig not found". Fixed with a
  standalone `app/src/core/tsconfig.json`. Locally this hid behind vitest's transform cache —
  reproduce with `app/node_modules` moved away and `server/node_modules/.vitest-cache`
  deleted.

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
assertions on the generated config (background audio, share extension, media playback
service, audio intent filters, signing); server typecheck + tests (installs ffmpeg);
server Docker image build + `/health` smoke test.

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
Apple ID; free IDs expire after 7 days and need Developer Mode on iOS 16+.

## Local builds

- Android: `cd app && npx expo run:android` (Android Studio SDK, device with USB debugging).
- iOS: `cd app && npx expo run:ios --device` (Mac + Xcode + Apple ID).
- Dev client with fast refresh: `npx eas-cli@latest build --profile development`.
