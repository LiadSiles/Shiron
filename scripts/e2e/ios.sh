#!/usr/bin/env bash
# Runs the end-to-end checks (e2e-*.yaml, must pass) and the share-sheet flows on an iPhone
# simulator for one build of the app (see .github/workflows/ios-sim.yml).
# usage: ios.sh <app bundle> <variant name>; writes shots/ and sim-<variant>.log
set -uo pipefail
APP=$1 VARIANT=$2
HERE=$(cd "$(dirname "$0")" && pwd)
UDID=$(xcrun simctl list devices booted -j | jq -r '[.devices[][]][0].udid')
mkdir -p shots

xcrun simctl uninstall "$UDID" app.shiron.gan >/dev/null 2>&1
xcrun simctl install "$UDID" "$APP" || { echo "== install failed"; exit 1; }

# The voice note in Files → On My iPhone.
FILES=$(xcrun simctl get_app_container "$UDID" com.apple.DocumentsApp groups 2>/dev/null \
  | awk '/FileProvider.LocalStorage/ {print $2}')
if [ -n "$FILES" ]; then
  mkdir -p "$FILES/File Provider Storage"
  cp app/modules/shiron-audio/fixtures/voice-whatsapp.opus "$FILES/File Provider Storage/"
  cp app/modules/shiron-audio/fixtures/song.mp3 "$FILES/File Provider Storage/boker-tov.mp3"
  else
  echo "== no Files local storage container"
fi

xcrun simctl spawn "$UDID" log stream --level debug --style compact \
  --predicate 'eventMessage CONTAINS "PlayGan" OR process == "PlayGan" OR (process == "app" AND (eventMessage CONTAINS[c] "share" OR eventMessage CONTAINS[c] "url" OR eventMessage CONTAINS[c] "error" OR eventMessage CONTAINS[c] "exception" OR eventMessage CONTAINS[c] "fatal" OR messageType == fault)) OR (process == "runningboardd" AND eventMessage CONTAINS "app.shiron.gan" AND (eventMessage CONTAINS[c] "exit" OR eventMessage CONTAINS[c] "termin" OR eventMessage CONTAINS[c] "crash"))' \
  > "sim-$VARIANT.log" 2>&1 &
LOGPID=$!

export MAESTRO_DRIVER_STARTUP_TIMEOUT=240000   # the driver sometimes starts slowly on CI Macs
RESULTS="shots/results-$VARIANT.txt"
: > "$RESULTS"
# A run of flows in one Maestro session (suite.sh). Only a failure of the test machinery (the
# driver not starting, nothing reported) gets one more try, not a failure of the app.
suite() {
  local before; before=$(wc -l < "$RESULTS")
  bash "$HERE/suite.sh" "$RESULTS" "$VARIANT" - "$@" && return
  grep -q "IOSDriverTimeoutException\|driver not ready" "shots/last-$VARIANT.log" 2>/dev/null || return
  head -n "$before" "$RESULTS" > "$RESULTS.tmp" && mv "$RESULTS.tmp" "$RESULTS"
  bash "$HERE/suite.sh" "$RESULTS" "$VARIANT" - "$@"
}

# A fresh install: the empty library.
suite must:launch.yaml
# The link the extension sends without an App Group, straight to the app (the next flow
# answers iOS's "Open in PlayGan?").
xcrun simctl openurl "$UDID" "shiron://share?text=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ"
if [ "$VARIANT" = group ]; then SHARE="הקלטות וקישורים"; else SHARE="רק קישורים"; fi
FLOWS=(must:e2e-youtube.yaml "must:e2e-settings.yaml@SHARE=$SHARE")
if [ "$VARIANT" = group ]; then
  # Files the way the share extension hands them over (only an App Group can carry files), in
  # one share: mp3, voice note, WMA, MPG, the mp3 again (must not double), a broken "mp3"
  # (explained, no crash) and a text file (not a song: not added).
  bash "$HERE/long-songs.sh" songs
  bash "$HERE/inject-ios.sh" "$UDID" \
    "songs/boker-tov.mp3|boker-tov.mp3|audio/mpeg" "songs/voice-whatsapp.opus|voice-whatsapp.opus|audio/ogg" \
    "songs/old-song.wma|old-song.wma|audio/x-ms-wma" "songs/gan-party.mpg|gan-party.mpg|video/mpeg" \
    "songs/boker-tov.mp3|boker-tov.mp3|audio/mpeg" "songs/broken.mp3|broken.mp3|audio/mpeg" \
    "app/modules/shiron-audio/fixtures/README.md|notes.txt|text/plain" \
    || echo "FAIL(must) $VARIANT staging the shared files" >> "$RESULTS"
  FLOWS+=(must:import-shared.yaml "must:e2e-import.yaml@COUNT=6" must:e2e-player.yaml must:e2e-song.yaml
    must:e2e-playlist.yaml must:e2e-search.yaml must:e2e-end.yaml must:e2e-background.yaml
    "soft:add-files.yaml@FILE=boker-tov,VARIANT=$VARIANT-add-mp3" "soft:categories.yaml@VARIANT=$VARIANT-cats")
fi
# The real share sheet: the simulator taps it unreliably (these have not passed there in many
# runs), so only when asked for (FULL=1, the workflow's "full" input).
if [ "${FULL:-0}" = 1 ]; then
  [ "$VARIANT" = group ] && FLOWS+=(soft:share-out.yaml)
  FLOWS+=(soft:share-link.yaml "soft:share-file.yaml@FILE=voice-whatsapp")
fi
suite "${FLOWS[@]}"

sleep 2; kill $LOGPID 2>/dev/null
# The app's own technical log and its songs, straight from its database (what she would see
# in Settings → יומן טכני): explains a failed check without a device.
DATA=$(xcrun simctl get_app_container "$UDID" app.shiron.gan data 2>/dev/null)
DB=$(find "$DATA" -name 'shiron.db' 2>/dev/null | head -1)
if [ -n "$DB" ]; then
  sqlite3 "$DB" "select value from settings where key='diagLog'" 2>/dev/null | jq -r '.[]' > "shots/diag-$VARIANT.txt" 2>/dev/null
  sqlite3 -header "$DB" "select title, kind, audio_state, status, error from songs" > "shots/songs-$VARIANT.txt" 2>/dev/null
fi
# Crash reports of the app, if any (a crash is a failed check).
mkdir -p shots/crashes
find "$HOME/Library/Logs/DiagnosticReports" -newer "$APP" \( -name 'app-*' -o -name 'app_*' \) -exec cp {} shots/crashes/ \; 2>/dev/null
if ls shots/crashes/* >/dev/null 2>&1; then
  for f in shots/crashes/*; do cp "$f" "shots/crash-$VARIANT-$(basename "$f").txt"; done
  echo "FAIL(must) $VARIANT the app crashed ($(ls shots/crashes | wc -l))" >> "$RESULTS"
fi
echo "== $VARIANT log lines: $(wc -l < "sim-$VARIANT.log")"
grep -h '\[PlayGan\]' "sim-$VARIANT.log" | head -20
cat "$RESULTS"
grep "^FAIL(must)" "$RESULTS" | sed "s/^/::error::/;s/\$/ (see shots\/ on the screenshots branch)/"
! grep -q "^FAIL(must)" "$RESULTS"
