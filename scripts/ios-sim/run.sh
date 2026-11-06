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
  (cd shots && maestro --device "$UDID" test -e VARIANT="$tag" "$@" "$HERE/$flow") \
    || { echo "== $tag: $flow FAILED"; maestro --device "$UDID" hierarchy 2>/dev/null | head -c 30000 > "shots/$tag-${flow%.yaml}-hierarchy.json"; }
}
shot() { xcrun simctl io "$UDID" screenshot "shots/$1.png" >/dev/null 2>&1; }
run launch.yaml "$VARIANT"
run share-link.yaml "$VARIANT"
sleep 5; shot "$VARIANT-8-app-after-link"
run share-file.yaml "$VARIANT-ext" -e PICK=0
sleep 5; shot "$VARIANT-9-after-file-ext"
run share-file.yaml "$VARIANT-openin" -e PICK=1
sleep 5; shot "$VARIANT-10-after-file-openin"
run launch.yaml "$VARIANT-final"

sleep 2; kill $LOGPID 2>/dev/null
echo "== $VARIANT log lines: $(wc -l < "sim-$VARIANT.log")"
grep -h '\[PlayGan\]' "sim-$VARIANT.log" | head -20
exit 0
