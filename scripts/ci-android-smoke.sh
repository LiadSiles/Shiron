#!/bin/bash
# Runs inside reactivecircus/android-emulator-runner: installs an APK, opens the app like a user
# would, and checks that it is still running 30 s later. Writes smoke.log (crash buffer, JS
# errors, process state) and smoke.png for the next step to report.
APK="$1"
PKG=app.shiron.gan
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
grep -q '^== alive' "$LOG" && ! grep -q 'FATAL EXCEPTION' "$LOG"
