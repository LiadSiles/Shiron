#!/usr/bin/env bash
# Runs the end-to-end checks on an Android emulator (inside reactivecircus/android-emulator-runner,
# see .github/workflows/smoke.yml): the same flows as the iPhone (e2e-*.yaml, platform
# differences in back.yaml / dismiss.yaml), songs added the way she adds them on Android — a
# YouTube link shared as text, files through the system picker — and sharing a song out.
# usage: android.sh <apk>; writes shots/ and shots/results-android.txt; fails when a check fails.
set -uo pipefail
APK=$1
PKG=app.shiron.gan
ACT="$PKG/.MainActivity"
HERE=$(cd "$(dirname "$0")" && pwd)
FIX=app/modules/shiron-audio/fixtures
VARIANT=android
mkdir -p shots
RESULTS="shots/results-$VARIANT.txt"
: > "$RESULTS"

curl -fsSL "https://get.maestro.mobile.dev" | bash >/dev/null
export PATH="$HOME/.maestro/bin:$PATH"

adb install -r -g "$APK" || { echo "== install failed"; exit 1; }
adb shell settings put global hide_error_dialogs 1
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
for f in "song.mp3 boker-tov.mp3" "voice-whatsapp.opus voice-whatsapp.opus" "tone.wma old-song.wma" \
         "video.mpg gan-party.mpg" "not-audio.mp3 broken.mp3"; do
  set -- $f
  adb push "$FIX/$1" "/sdcard/Download/$2" >/dev/null
  adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file:///sdcard/Download/$2" >/dev/null 2>&1
done
adb logcat -c

export MAESTRO_DRIVER_STARTUP_TIMEOUT=240000
FAILED=()
flow() { # must|soft, flow, screenshot prefix, extra maestro args…
  local kind=$1 flow=$2 tag=$3; shift 3
  echo "== $tag: $flow"
  cp "$HERE"/*.yaml shots/
  if (cd shots && maestro test --test-output-dir "maestro-$tag" -e VARIANT="$tag" "$@" "$flow" 2>&1 | tail -30; exit "${PIPESTATUS[0]}"); then
    echo "PASS $tag $flow" >> "$RESULTS"
  else
    echo "== $tag: $flow FAILED"
    echo "FAIL($kind) $tag $flow" >> "$RESULTS"
    [ "$kind" = must ] && FAILED+=("$tag/$flow")
    maestro hierarchy 2>/dev/null | head -c 30000 > "shots/$tag-${flow%.yaml}-hierarchy.json"
    adb exec-out screencap -p > "shots/$tag-${flow%.yaml}-FAILED.png" 2>/dev/null
  fi
}
check() { flow must "$@"; }
try() { flow soft "$@"; }
crashed() { adb logcat -d -b crash | grep -q "Process: $PKG"; }

check launch.yaml "$VARIANT"
# A YouTube link shared as text, the way WhatsApp shares one.
adb shell am start -a android.intent.action.SEND -t text/plain \
  --es android.intent.extra.TEXT "'https://www.youtube.com/watch?v=dQw4w9WgXcQ'" -n "$ACT" >/dev/null
sleep 6
check e2e-youtube.yaml "$VARIANT"
check e2e-settings.yaml "$VARIANT" -e SHARE="בחירת קבצי שמע או וידאו"

# Files through the system picker: mp3, WhatsApp voice note, WMA and MPG (our FFmpeg build),
# a broken "mp3", and the mp3 again (must not double).
for f in boker-tov.mp3 voice-whatsapp.opus old-song.wma gan-party.mpg broken.mp3 boker-tov.mp3; do
  check add-android.yaml "$VARIANT-add-${f%%.*}" -e FILE="$f"
done
check e2e-import.yaml "$VARIANT"
check e2e-player.yaml "$VARIANT"
check e2e-song.yaml "$VARIANT"
check e2e-playlist.yaml "$VARIANT"
check e2e-search.yaml "$VARIANT"
check share-out-android.yaml "$VARIANT"
# The share sheet really received the song's file (an audio stream through our provider).
if adb logcat -d | grep -E "act=android.intent.action.CHOOSER" | grep -q .; then
  echo "PASS $VARIANT share chooser opened" >> "$RESULTS"
else
  echo "FAIL(must) $VARIANT share chooser never opened" >> "$RESULTS"; FAILED+=("share chooser")
fi
try categories.yaml "$VARIANT-cats"

if crashed; then
  echo "FAIL(must) $VARIANT crash" >> "$RESULTS"; FAILED+=("crash")
  adb logcat -d -b crash | tail -60 > shots/crash.txt
fi
adb logcat -d '*:E' | grep -E "AndroidRuntime|ReactNativeJS|Expo|FATAL" | tail -60 > shots/errors-android.txt
find shots -path '*maestro-*' -name '*.png' -exec cp {} shots/ \; 2>/dev/null
rm -f shots/*.yaml
cat "$RESULTS"
if [ ${#FAILED[@]} -gt 0 ]; then
  for f in "${FAILED[@]}"; do echo "::error::android: $f failed (see shots/ on the screenshots branch)"; done
  exit 1
fi
exit 0
