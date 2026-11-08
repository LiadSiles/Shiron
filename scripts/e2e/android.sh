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
VARIANT=android
mkdir -p shots
RESULTS="shots/results-$VARIANT.txt"
: > "$RESULTS"

bash "$HERE/install-maestro.sh" || exit 1
export PATH="$HOME/.maestro/bin:$PATH"

adb install -r -g "$APK" || { echo "== install failed"; exit 1; }
adb shell settings put global hide_error_dialogs 1
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
bash "$HERE/long-songs.sh" songs
for f in boker-tov.mp3 voice-whatsapp.opus old-song.wma gan-party.mpg broken.mp3; do
  adb push "songs/$f" "/sdcard/Download/$f" >/dev/null
  adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file:///sdcard/Download/$f" >/dev/null 2>&1
done
# Let the launcher finish starting before the first flow (it ANRs on a busy emulator).
adb shell input keyevent KEYCODE_HOME
sleep 20
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null 2>&1
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
    maestro hierarchy 2>/dev/null > "shots/$tag-${flow%.yaml}-hierarchy.json"
    adb exec-out screencap -p > "shots/$tag-${flow%.yaml}-FAILED.png" 2>/dev/null
    # A file picker left open sits in the app's task and comes back in later flows (it covered
    # the full player in e2e-background): close it, so one failure stays one failure.
    adb shell am force-stop com.google.android.documentsui >/dev/null 2>&1
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
# and the mp3 again (must not double). The broken "mp3" is pushed too: the picker hides it.
for f in boker-tov.mp3 voice-whatsapp.opus old-song.wma gan-party.mpg boker-tov.mp3; do
  check add-android.yaml "$VARIANT-add-${f%%.*}" -e FILE="$f"
done
check e2e-import.yaml "$VARIANT" -e COUNT=5
check e2e-player.yaml "$VARIANT"
check e2e-song.yaml "$VARIANT"
check e2e-playlist.yaml "$VARIANT"
check e2e-search.yaml "$VARIANT"
check e2e-background.yaml "$VARIANT"
check share-out-android.yaml "$VARIANT"
# The system share sheet really opened each time: the file twice in a row, the link, the category.
CHOOSERS=$(adb logcat -d | grep -c "act=android.intent.action.CHOOSER")
if [ "$CHOOSERS" -ge 4 ]; then
  echo "PASS $VARIANT share sheet opened $CHOOSERS times" >> "$RESULTS"
else
  echo "FAIL(must) $VARIANT share sheet opened $CHOOSERS of 4 times" >> "$RESULTS"; FAILED+=("share chooser")
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
