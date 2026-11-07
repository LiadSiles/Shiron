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

# A flow that must pass (`check`) or one that depends on the share sheet, which the simulator
# taps unreliably (`try`: its failure is reported, not counted).
export MAESTRO_DRIVER_STARTUP_TIMEOUT=240000   # the driver sometimes starts slowly on CI Macs
FAILED=()
# One run of a flow; 0 = passed.
once() { # flow, tag, extra…
  local flow=$1 tag=$2; shift 2
  (cd shots && maestro --device "$UDID" test --test-output-dir "maestro-$tag" -e VARIANT="$tag" "$@" "$flow" > "last-$tag.log" 2>&1; r=$?; tail -30 "last-$tag.log"; exit $r)
}
flow() { # must|soft, flow, screenshot prefix, extra maestro args…
  local kind=$1 flow=$2 tag=$3; shift 3
  echo "== $tag: $flow"
  cp "$HERE"/*.yaml shots/
  # A second try only for failures of the test machinery (the driver not starting), not of the app.
  if once "$flow" "$tag" "$@" || { grep -q "IOSDriverTimeoutException\|driver not ready" "shots/last-$tag.log" 2>/dev/null && once "$flow" "$tag" "$@"; }; then
    echo "PASS $tag $flow" >> "shots/results-$VARIANT.txt"
  else
    echo "== $tag: $flow FAILED"
    echo "FAIL($kind) $tag $flow" >> "shots/results-$VARIANT.txt"
    [ "$kind" = must ] && FAILED+=("$tag/$flow")
    maestro --device "$UDID" hierarchy 2>/dev/null > "shots/$tag-${flow%.yaml}-hierarchy.json"
    xcrun simctl io "$UDID" screenshot "shots/$tag-${flow%.yaml}-FAILED.png" >/dev/null 2>&1
  fi
}
check() { flow must "$@"; }
try() { flow soft "$@"; }
shot() { xcrun simctl io "$UDID" screenshot "shots/$1.png" >/dev/null 2>&1; }
open_url() { # url — opens it in the app and answers iOS's "Open in PlayGan?" until it is gone
  xcrun simctl openurl "$UDID" "$1"
  sleep 2
  for i in 1 2 3; do once open-prompt.yaml "$VARIANT-prompt" && return 0; sleep 2; done
  echo "FAIL(soft) $VARIANT open prompt stayed for $1" >> "shots/results-$VARIANT.txt"
}
inject() { # fixture, name, mime
  bash "$HERE/inject-ios.sh" "$UDID" "app/modules/shiron-audio/fixtures/$1" "$2" "$3" || echo "FAIL(must) $VARIANT inject $2" >> "shots/results-$VARIANT.txt"
  sleep 2; for i in 1 2 3; do once open-prompt.yaml "$VARIANT-prompt" && break; sleep 2; done; sleep 2
}

# A fresh install: the empty library.
check launch.yaml "$VARIANT"
# The link the extension sends when it has no App Group, straight to the app.
open_url "shiron://share?text=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ"; sleep 5
check e2e-youtube.yaml "$VARIANT"
if [ "$VARIANT" = group ]; then SHARE="הקלטות וקישורים"; else SHARE="רק קישורים"; fi
check e2e-settings.yaml "$VARIANT" -e SHARE="$SHARE"

# Files, the way the share extension hands them over (only an App Group can carry files).
if [ "$VARIANT" = group ]; then
  inject song.mp3 boker-tov.mp3 audio/mpeg
  inject voice-whatsapp.opus voice-whatsapp.opus audio/ogg
  inject tone.wma old-song.wma audio/x-ms-wma
  inject video.mpg gan-party.mpg video/mpeg
  inject song.mp3 boker-tov.mp3 audio/mpeg            # the same song again: must not double
  inject not-audio.mp3 broken.mp3 audio/mpeg           # not really audio: explained, no crash
  inject README.md notes.txt text/plain                # not a song: must not crash or be added
  check e2e-import.yaml "$VARIANT" -e COUNT=6
  check e2e-player.yaml "$VARIANT"
  check e2e-song.yaml "$VARIANT"
  check e2e-playlist.yaml "$VARIANT"
  check e2e-search.yaml "$VARIANT"
  try share-out.yaml "$VARIANT"
fi

# Through the real share sheet and file picker (flaky taps on the simulator).
try share-link.yaml "$VARIANT"
try share-file.yaml "$VARIANT" -e FILE=voice-whatsapp
try add-files.yaml "$VARIANT-add-mp3" -e FILE=boker-tov
try categories.yaml "$VARIANT-cats"

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
  echo "FAIL(must) $VARIANT the app crashed ($(ls shots/crashes | wc -l))" >> "shots/results-$VARIANT.txt"; FAILED+=("crash")
fi
find shots -path '*maestro-*' -name '*.png' -exec cp {} shots/ \; 2>/dev/null
rm -f shots/*.yaml
echo "== $VARIANT log lines: $(wc -l < "sim-$VARIANT.log")"
grep -h '\[PlayGan\]' "sim-$VARIANT.log" | head -20
cat "shots/results-$VARIANT.txt"
if [ ${#FAILED[@]} -gt 0 ]; then
  for f in "${FAILED[@]}"; do echo "::error::$VARIANT: $f failed (see shots/ on the screenshots branch)"; done
  exit 1
fi
exit 0
