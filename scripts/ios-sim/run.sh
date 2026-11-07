#!/usr/bin/env bash
# Runs the share flows on an iPhone simulator for one build of the app (see ios-sim.yml).
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
  cp app/modules/shiron-audio/fixtures/tone.wma "$FILES/File Provider Storage/old-song.wma"
  cp app/modules/shiron-audio/fixtures/video.mpg "$FILES/File Provider Storage/gan-party.mpg"
else
  echo "== no Files local storage container"
fi

xcrun simctl spawn "$UDID" log stream --level debug --style compact \
  --predicate 'eventMessage CONTAINS "PlayGan" OR process == "PlayGan" OR (process == "app" AND (eventMessage CONTAINS[c] "share" OR eventMessage CONTAINS[c] "url" OR eventMessage CONTAINS[c] "error"))' \
  > "sim-$VARIANT.log" 2>&1 &
LOGPID=$!

run() { # flow, screenshot prefix, extra maestro args…
  local flow=$1 tag=$2; shift 2
  echo "== $tag: $flow"
  cp "$HERE/$flow" "$HERE/dismiss.yaml" shots/
  (cd shots && maestro --device "$UDID" test --test-output-dir "maestro-$tag" -e VARIANT="$tag" "$@" "$flow" 2>&1 | tail -30) \
    || { echo "== $tag: $flow FAILED"; maestro --device "$UDID" hierarchy 2>/dev/null | head -c 30000 > "shots/$tag-${flow%.yaml}-hierarchy.json"; }
}
shot() { xcrun simctl io "$UDID" screenshot "shots/$1.png" >/dev/null 2>&1; }
run launch.yaml "$VARIANT"
run share-link.yaml "$VARIANT"
sleep 5; shot "$VARIANT-8-app-after-link"
# The link the extension sends when it has no App Group, straight to the app.
xcrun simctl openurl "$UDID" "shiron://share?text=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ"
sleep 3; run dismiss.yaml "$VARIANT-url"
sleep 5; shot "$VARIANT-8b-app-after-url-link"
run share-file.yaml "$VARIANT" -e FILE=voice-whatsapp
# Formats the phone can't read itself (our FFmpeg build), through the share extension — only
# with an App Group can files go that way.
if [ "$VARIANT" = group ]; then
  run share-file.yaml "$VARIANT-wma" -e FILE=old-song
  run share-file.yaml "$VARIANT-mpg" -e FILE=gan-party
  sleep 20; run launch.yaml "$VARIANT-after-formats"
fi
sleep 5; shot "$VARIANT-9-after-file"
run add-files.yaml "$VARIANT-add-mp3" -e FILE=boker-tov
run add-files.yaml "$VARIANT-add-wma" -e FILE=old-song
run tour.yaml "$VARIANT-tour"
run categories.yaml "$VARIANT-cats"

sleep 2; kill $LOGPID 2>/dev/null
find shots -path '*maestro-*' -name '*.png' -exec cp {} shots/ \; 2>/dev/null
rm -f shots/*.yaml
echo "== $VARIANT log lines: $(wc -l < "sim-$VARIANT.log")"
grep -h '\[PlayGan\]' "sim-$VARIANT.log" | head -20
exit 0
