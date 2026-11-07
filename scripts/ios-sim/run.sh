#!/usr/bin/env bash
# Runs the end-to-end checks (e2e-*.yaml, must pass) and the share-sheet flows on an iPhone simulator for one build of the app (see ios-sim.yml).
# usage: run.sh <app bundle> <variant name>; writes shots/ and sim-<variant>.log
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
  --predicate 'eventMessage CONTAINS "PlayGan" OR process == "PlayGan" OR (process == "app" AND (eventMessage CONTAINS[c] "share" OR eventMessage CONTAINS[c] "url" OR eventMessage CONTAINS[c] "error"))' \
  > "sim-$VARIANT.log" 2>&1 &
LOGPID=$!

# A flow that must pass (`check`) or one that depends on the share sheet, which the simulator
# taps unreliably (`try`: its failure is reported, not counted).
FAILED=()
flow() { # must|soft, flow, screenshot prefix, extra maestro args…
  local kind=$1 flow=$2 tag=$3; shift 3
  echo "== $tag: $flow"
  cp "$HERE/$flow" "$HERE/dismiss.yaml" shots/
  if (cd shots && maestro --device "$UDID" test --test-output-dir "maestro-$tag" -e VARIANT="$tag" "$@" "$flow" 2>&1 | tail -30; exit "${PIPESTATUS[0]}"); then
    echo "PASS $tag $flow" >> "shots/results-$VARIANT.txt"
  else
    echo "== $tag: $flow FAILED"
    echo "FAIL($kind) $tag $flow" >> "shots/results-$VARIANT.txt"
    [ "$kind" = must ] && FAILED+=("$tag/$flow")
    maestro --device "$UDID" hierarchy 2>/dev/null | head -c 30000 > "shots/$tag-${flow%.yaml}-hierarchy.json"
    xcrun simctl io "$UDID" screenshot "shots/$tag-${flow%.yaml}-FAILED.png" >/dev/null 2>&1
  fi
}
check() { flow must "$@"; }
try() { flow soft "$@"; }
shot() { xcrun simctl io "$UDID" screenshot "shots/$1.png" >/dev/null 2>&1; }
inject() { # fixture, name, mime
  bash "$HERE/inject.sh" "$UDID" "app/modules/shiron-audio/fixtures/$1" "$2" "$3" || echo "FAIL(must) $VARIANT inject $2" >> "shots/results-$VARIANT.txt"
  sleep 3; flow soft dismiss.yaml "$VARIANT-inject"; sleep 2
}

# A fresh install: the empty library.
check launch.yaml "$VARIANT"
# The link the extension sends when it has no App Group, straight to the app.
xcrun simctl openurl "$UDID" "shiron://share?text=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ"
sleep 3; flow soft dismiss.yaml "$VARIANT-url"; sleep 5
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
  check e2e-import.yaml "$VARIANT"
  check e2e-player.yaml "$VARIANT"
  check e2e-song.yaml "$VARIANT"
  check e2e-playlist.yaml "$VARIANT"
  check e2e-search.yaml "$VARIANT"
fi

# Through the real share sheet and file picker (flaky taps on the simulator).
try share-link.yaml "$VARIANT"
try share-file.yaml "$VARIANT" -e FILE=voice-whatsapp
try add-files.yaml "$VARIANT-add-mp3" -e FILE=boker-tov
try categories.yaml "$VARIANT-cats"

sleep 2; kill $LOGPID 2>/dev/null
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
