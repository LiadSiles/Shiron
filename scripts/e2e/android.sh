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
adb logcat -G 16M >/dev/null 2>&1 || true  # room for the whole run's technical log
adb logcat -c
# Every share sheet that opens, kept from the start: one long session overflows logcat's buffer
# (0.13.0: the count at the end found 0 of 4).
adb logcat -v brief | grep --line-buffered "act=android.intent.action.CHOOSER" > shots/choosers.txt &
CHOOSERLOG=$!

export MAESTRO_DRIVER_STARTUP_TIMEOUT=240000
crashed() { adb logcat -d -b crash | grep -q "Process: $PKG"; }
# A run of flows in one Maestro session (suite.sh); after each, the file picker is closed.
suite() { bash "$HERE/suite.sh" "$RESULTS" "$VARIANT" cleanup-android.yaml "$@"; }

suite must:launch.yaml
# A YouTube link shared as text, the way WhatsApp shares one.
adb shell am start -a android.intent.action.SEND -t text/plain \
  --es android.intent.extra.TEXT "'https://www.youtube.com/watch?v=dQw4w9WgXcQ'" -n "$ACT" >/dev/null
sleep 6
# Files through the system picker: mp3, WhatsApp voice note, WMA and MPG (our FFmpeg build),
# and the mp3 again (must not double). The broken "mp3" is pushed too: the picker hides it.
ADDS=()
for f in boker-tov.mp3 voice-whatsapp.opus old-song.wma gan-party.mpg boker-tov.mp3; do
  ADDS+=("must:add-android.yaml@FILE=$f,VARIANT=$VARIANT-add-${f%%.*}")
done
suite must:e2e-youtube.yaml "must:e2e-settings.yaml@SHARE=בחירת קבצי שמע או וידאו" "${ADDS[@]}" \
  "must:e2e-import.yaml@COUNT=5" must:e2e-player.yaml must:e2e-song.yaml must:e2e-playlist.yaml \
  must:e2e-search.yaml must:e2e-end.yaml must:e2e-background.yaml must:e2e-select.yaml must:share-out-android.yaml \
  "soft:categories.yaml@VARIANT=$VARIANT-cats"
# The system share sheet really opened each time: the file twice in a row, the link, the category.
kill $CHOOSERLOG 2>/dev/null
CHOOSERS=$(wc -l < shots/choosers.txt | tr -d ' ')
if [ "$CHOOSERS" -ge 4 ]; then
  echo "PASS $VARIANT share sheet opened $CHOOSERS times" >> "$RESULTS"
else
  echo "FAIL(must) $VARIANT share sheet opened $CHOOSERS of 4 times" >> "$RESULTS"
fi

# Opening the app, filmed (shots/launch.mp4): the owner sees the home screen flicker on Android.
# A cold start with her library in place; the video shows each frame between splash and home.
adb shell am force-stop "$PKG"
adb shell screenrecord --time-limit 8 /sdcard/launch.mp4 >/dev/null 2>&1 &
REC=$!
sleep 1
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
wait $REC
adb pull /sdcard/launch.mp4 shots/launch.mp4 >/dev/null 2>&1 || echo "== no launch video"
# Every frame that differs from the one before it, at the video's full rate, on one sheet: a
# single odd frame between splash and home can't fall between samples.
[ -f shots/launch.mp4 ] && ffmpeg -loglevel error -y -i shots/launch.mp4 \
  -vf "select='gt(scene,0.003)',scale=200:-1,tile=8x6:padding=4:color=white" -fps_mode vfr \
  -frames:v 1 shots/launch-frames.png

if crashed; then
  echo "FAIL(must) $VARIANT crash" >> "$RESULTS"
  adb logcat -d -b crash | tail -60 > shots/crash.txt
fi
adb logcat -d '*:E' | grep -E "AndroidRuntime|ReactNativeJS|Expo|FATAL" | tail -60 > shots/errors-android.txt
# The app's technical log and audio focus, for player checks that fail on the emulator only.
adb logcat -d -v time | grep -E "\[diag\]|MediaFocusControl|AudioFocus|ExpoAudio" | tail -400 > shots/log-android.txt
cat "$RESULTS"
grep "^FAIL(must)" "$RESULTS" | sed "s/^/::error::/;s/\$/ (see shots\/ on the screenshots branch)/"
! grep -q "^FAIL(must)" "$RESULTS"
