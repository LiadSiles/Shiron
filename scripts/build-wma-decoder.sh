#!/usr/bin/env bash
# Builds the WMA decoder: a minimal FFmpeg (ASF demuxer + WMA decoders, LGPL, unmodified source)
# plus our native/wma C files, for the platform asked. Outputs are git-ignored and cached in CI:
#   ios      → app/modules/shiron-audio/ios/WmaDecoder.xcframework (device arm64 + simulator arm64)
#   android  → app/modules/shiron-audio/android/src/main/jniLibs/<abi>/libshironwma.so
#   host     → build/wma/host/wma2wav (a command-line check on this machine)
# usage: scripts/build-wma-decoder.sh ios|android|host [android ABIs…]
# Needs: git, make, clang; ios: Xcode; android: ANDROID_NDK_HOME (or ANDROID_NDK_LATEST_HOME).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SRC_C="$ROOT/app/modules/shiron-audio/native/wma"
WORK="$ROOT/build/wma"
FFMPEG_TAG=n7.1.1
IOS_MIN=16.4  # = ShironAudio.podspec
ANDROID_API=24
mkdir -p "$WORK"

if [ ! -d "$WORK/ffmpeg" ]; then
  git clone --quiet --depth 1 --branch "$FFMPEG_TAG" https://github.com/FFmpeg/FFmpeg.git "$WORK/ffmpeg"
fi

COMMON=(
  --disable-everything --disable-programs --disable-doc --disable-network --disable-autodetect
  --disable-avdevice --disable-swscale --disable-swresample --disable-avfilter --disable-asm
  --disable-debug --enable-small --enable-pic --enable-static --disable-shared
  --enable-protocol=file --enable-demuxer=asf
  --enable-decoder=wmav1,wmav2,wmapro,wmalossless,wmavoice
)

# configure + make + install one FFmpeg build into $WORK/<name>/prefix
ffmpeg_build() {
  local name=$1; shift
  local prefix="$WORK/$name/prefix"
  [ -f "$prefix/lib/libavformat.a" ] && return
  mkdir -p "$WORK/$name/obj"
  (cd "$WORK/$name/obj" && "$WORK/ffmpeg/configure" --prefix="$prefix" "${COMMON[@]}" "$@" >/dev/null \
    && make -j"$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)" >/dev/null && make install >/dev/null)
}

libs() { echo "$WORK/$1/prefix/lib/libavformat.a $WORK/$1/prefix/lib/libavcodec.a $WORK/$1/prefix/lib/libavutil.a"; }

case "${1:-}" in
  host)
    ffmpeg_build host
    mkdir -p "$WORK/host"
    cat > "$WORK/host/main.c" <<'C'
#include <stdio.h>
int shiron_wma_to_wav(const char *, const char *);
int main(int argc, char **argv) { int r = argc == 3 ? shiron_wma_to_wav(argv[1], argv[2]) : -1; printf("%d\n", r); return r != 0; }
C
    # shellcheck disable=SC2046
    cc -O2 -I"$WORK/host/prefix/include" "$SRC_C/wma2wav.c" "$WORK/host/main.c" $(libs host) -lm -lpthread -o "$WORK/host/wma2wav"
    echo "$WORK/host/wma2wav"
    ;;

  ios)
    OUT="$ROOT/app/modules/shiron-audio/ios/WmaDecoder.xcframework"
    args=()
    for sdk in iphoneos iphonesimulator; do
      target=arm64-apple-ios$IOS_MIN; [ $sdk = iphonesimulator ] && target=$target-simulator
      cc="xcrun -sdk $sdk clang -target $target"
      ffmpeg_build "ios-$sdk" --enable-cross-compile --target-os=darwin --arch=arm64 \
        --cc="$cc" --extra-cflags="-target $target" --extra-ldflags="-target $target"
      dir="$WORK/ios-$sdk"
      $cc -O2 -fPIC -I"$dir/prefix/include" -c "$SRC_C/wma2wav.c" -o "$dir/wma2wav.o"
      # shellcheck disable=SC2046
      libtool -static -no_warning_for_no_symbols -o "$dir/libwmadecoder.a" "$dir/wma2wav.o" $(libs "ios-$sdk")
      mkdir -p "$dir/headers"
      echo 'int shiron_wma_to_wav(const char *input, const char *output);' > "$dir/headers/wma2wav.h"
      printf 'module WmaDecoder {\n  header "wma2wav.h"\n  export *\n}\n' > "$dir/headers/module.modulemap"
      args+=(-library "$dir/libwmadecoder.a" -headers "$dir/headers")
    done
    rm -rf "$OUT"
    xcodebuild -create-xcframework "${args[@]}" -output "$OUT" >/dev/null
    echo "$OUT"
    ;;

  android)
    NDK=${ANDROID_NDK_HOME:-${ANDROID_NDK_LATEST_HOME:-}}
    [ -n "$NDK" ] || { echo "set ANDROID_NDK_HOME" >&2; exit 1; }
    TC=$(echo "$NDK"/toolchains/llvm/prebuilt/*)
    shift
    ABIS=("${@:-arm64-v8a armeabi-v7a x86_64 x86}")
    # shellcheck disable=SC2068
    for abi in ${ABIS[@]}; do
      case $abi in
        arm64-v8a) arch=aarch64; triple=aarch64-linux-android ;;
        armeabi-v7a) arch=arm; triple=armv7a-linux-androideabi ;;
        x86_64) arch=x86_64; triple=x86_64-linux-android ;;
        x86) arch=x86; triple=i686-linux-android ;;
        *) echo "unknown ABI $abi" >&2; exit 1 ;;
      esac
      cc="$TC/bin/$triple$ANDROID_API-clang"
      ffmpeg_build "android-$abi" --enable-cross-compile --target-os=android --arch=$arch --cc="$cc" \
        --ar="$TC/bin/llvm-ar" --ranlib="$TC/bin/llvm-ranlib" --nm="$TC/bin/llvm-nm" --strip="$TC/bin/llvm-strip"
      out="$ROOT/app/modules/shiron-audio/android/src/main/jniLibs/$abi"
      mkdir -p "$out"
      # 16 KB pages (Android 15+). -Wl,--exclude-libs keeps FFmpeg's symbols private.
      # shellcheck disable=SC2046
      "$cc" -shared -fPIC -O2 -I"$WORK/android-$abi/prefix/include" "$SRC_C/wma2wav.c" "$SRC_C/wma_jni.c" \
        $(libs "android-$abi") -lm -Wl,-z,max-page-size=16384 -Wl,--exclude-libs,ALL -Wl,-soname,libshironwma.so \
        -o "$out/libshironwma.so"
      "$TC/bin/llvm-strip" --strip-unneeded "$out/libshironwma.so"
      echo "$out/libshironwma.so ($(wc -c < "$out/libshironwma.so") bytes)"
    done
    ;;

  *) echo "usage: $0 ios|android|host [ABIs…]" >&2; exit 1 ;;
esac
