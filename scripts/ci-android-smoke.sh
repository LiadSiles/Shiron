#!/bin/bash
# Runs inside reactivecircus/android-emulator-runner. Installs an APK, opens the app like a user
# would and checks it is still running 30 s later (smoke.log). Then, when SHOTS=1, walks the main
# screens — with a few songs shared in the way WhatsApp shares them — and saves screenshots to
# shots/ (light and dark) for design review.
APK="$1"
PKG=app.shiron.gan
ACT="$PKG/.MainActivity"
cd "$GITHUB_WORKSPACE" || exit 1
LOG="$GITHUB_WORKSPACE/smoke.log"
{
  echo "== emulator sdk $(adb shell getprop ro.build.version.sdk) abi $(adb shell getprop ro.product.cpu.abi)"
  adb install -r -g "$APK" || echo "== install failed"
  adb logcat -c
  adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null
  sleep 30
  if adb shell pidof "$PKG" >/dev/null; then echo "== alive"; else echo "== dead"; fi
  echo "== crash buffer"; adb logcat -d -b crash | tail -80
  echo "== errors"; adb logcat -d '*:E' | grep -E "AndroidRuntime|ReactNativeJS|ReactNative|Expo|FATAL|Exception" | tail -60
} > "$LOG" 2>&1
adb exec-out screencap -p > "$GITHUB_WORKSPACE/smoke.png" || true
grep -q '^== alive' "$LOG" && ! grep -q "Process: $PKG" "$LOG" || exit 1
[ "$SHOTS" = 1 ] || exit 0

# ---------- screenshots ----------
mkdir -p shots
n=0
open_link() { adb shell am start -a android.intent.action.VIEW -d "$1" "$PKG" >/dev/null; }
back() { adb shell input keyevent KEYCODE_BACK; sleep 1; }
# Tap the first on-screen element whose text or accessibility label matches (uiautomator dump).
tap() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  local b
  b=$(adb shell cat /sdcard/ui.xml | python3 -c "
import re,sys
x=sys.stdin.read()
for m in re.finditer(r'<node [^>]*>', x):
    n=m.group(0)
    t=re.search(r' text=\"([^\"]*)\"',n).group(1); d=re.search(r'content-desc=\"([^\"]*)\"',n).group(1)
    if re.search(sys.argv[1], t) or re.search(sys.argv[1], d):
        a=list(map(int,re.findall(r'\d+',re.search(r'bounds=\"([^\"]*)\"',n).group(1))))
        print((a[0]+a[2])//2,(a[1]+a[3])//2); break
" "$1")
  if [ -n "$b" ]; then adb shell input tap $b; echo "tap $1 at $b"; else echo "tap $1: not found"; fi
}
# A slow emulator often shows "System UI isn't responding" over everything: hide such dialogs,
# and if one still shows, answer "Wait" before taking the picture.
adb shell settings put global hide_error_dialogs 1
adb shell settings put global anr_show_background 0
dismiss_anr() {
  if adb shell dumpsys window | grep -q "Application Not Responding\|isn't responding"; then
    tap '^(Wait|המתן)$'; sleep 1
  fi
}
shot() { n=$((n+1)); sleep "${2:-3}"; dismiss_anr; adb exec-out screencap -p > "shots/$(printf %02d $n)-$1.png"; echo "shot $1"; }
share_text() {
  adb shell am start -a android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT "'$1'" -n "$ACT" >/dev/null
}

for mode in light dark; do
  if [ "$mode" = dark ]; then adb shell cmd uimode night yes; else adb shell cmd uimode night no; fi
  adb shell am force-stop "$PKG"; adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null
  shot "$mode-home" 6
  if [ "$mode" = light ]; then
    # A few songs, shared the way WhatsApp shares a link (YouTube songs need no AI key to be playable).
    share_text "https://youtu.be/XqZsoesa55w"
    shot "$mode-saving" 1
    share_text "https://www.youtube.com/watch?v=e_04ZrNroTo"
    sleep 2
    share_text "https://youtu.be/BQ0mxQXmLsk"
    sleep 6
    # The first song opens "connect an AI service" once (by design): picture it, then close it.
    shot "$mode-connect-offer" 1
    back
    shot "$mode-home-with-songs" 2
  fi
  tap '^ספרייה$'; shot "$mode-library"
  open_link "shiron://category/all"; shot "$mode-category-all"
  tap '^נגני '; shot "$mode-after-play" 4
  open_link "shiron://player"; shot "$mode-player" 5
  back
  open_link "shiron://playlist/pick"; shot "$mode-new-playlist"
  back
  open_link "shiron://settings"; shot "$mode-settings"
  adb shell input swipe 540 1800 540 600 300; shot "$mode-settings-2" 2
  back
  open_link "shiron://connect"; shot "$mode-connect"
  back
done
adb shell cmd uimode night no
echo "== shots: $(ls shots | wc -l)"
# The walk shares songs and opens every screen: a crash there fails the check too.
{
  echo "== after the walk"
  if adb shell pidof "$PKG" >/dev/null; then echo "== alive"; else echo "== dead"; fi
  echo "== crash buffer"; adb logcat -d -b crash | tail -80
  echo "== errors"; adb logcat -d '*:E' | grep -E "AndroidRuntime|ReactNativeJS|FATAL" | tail -40
} >> "$LOG" 2>&1
! adb logcat -d -b crash | grep -q "Process: $PKG"
