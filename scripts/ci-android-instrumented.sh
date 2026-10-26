#!/bin/bash
# Runs inside reactivecircus/android-emulator-runner: the audio module's instrumented tests on the
# emulator, everything logged to connected.log so the next step can report it as annotations.
cd "$GITHUB_WORKSPACE" || exit 1
LOG="$GITHUB_WORKSPACE/connected.log"
{
  echo "== adb devices"; adb devices
  echo "== emulator"; adb shell getprop ro.build.version.sdk; adb shell getprop ro.product.cpu.abi
  cd app/android && ./gradlew :shiron-audio:connectedDebugAndroidTest --console=plain
  echo "== exit $?"
  echo "== logcat ShironAudioTest"; adb logcat -d -s ShironAudioTest:V | tail -60
} > "$LOG" 2>&1
grep -q '^== exit 0' "$LOG"
