#!/usr/bin/env bash
# Builds the fallback decoder: a small FFmpeg (a few containers and audio decoders, LGPL,
# unmodified source) plus our native/ffmpeg C files, for the platform asked. It reads what the
# phone can't (WMA/WMV, MPEG program streams, AVI, MKV…). Outputs are git-ignored, cached in CI:
#   ios      → app/modules/shiron-audio/ios/ShironFFmpeg.xcframework (device + simulator arm64)
#   android  → app/modules/shiron-audio/android/src/main/jniLibs/<abi>/libshironffmpeg.so
#   host     → build/ffmpeg/host/to-wav (a command-line check on this machine)
# usage: scripts/build-ffmpeg.sh ios|android|host [android ABIs…]
# Needs: git, make, clang; ios: Xcode; android: ANDROID_NDK_HOME (or ANDROID_NDK_LATEST_HOME).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SRC_C="$ROOT/app/modules/shiron-audio/native/ffmpeg"
WORK="$ROOT/build/ffmpeg"
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
  --enable-protocol=file
  --enable-demuxer=asf,mpegps,mpegts,avi,matroska,flv,wav,aiff,mp3,aac,ac3
  --enable-parser=mpegaudio,ac3,aac,aac_latm,mpegvideo
  --enable-decoder=wmav1,wmav2,wmapro,wmalossless,wmavoice,mp1,mp2,mp3,mp1float,mp2float,mp3float
  --enable-decoder=ac3,eac3,aac,aac_latm,flac,vorbis
  --enable-decoder=pcm_s16le,pcm_s16be,pcm_s24le,pcm_u8,pcm_f32le,pcm_alaw,pcm_mulaw,pcm_dvd,adpcm_ima_wav,adpcm_ms
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
int shiron_ffmpeg_to_wav(const char *, const char *);
int main(int argc, char **argv) { int r = argc == 3 ? shiron_ffmpeg_to_wav(argv[1], argv[2]) : -1; printf("%d\n", r); return r != 0; }
C
    # shellcheck disable=SC2046
    cc -O2 -I"$WORK/host/prefix/include" "$SRC_C/to_wav.c" "$WORK/host/main.c" $(libs host) -lm -lpthread -o "$WORK/host/to-wav"
    echo "$WORK/host/to-wav"
    ;;

  ios)
    OUT="$ROOT/app/modules/shiron-audio/ios/ShironFFmpeg.xcframework"
    args=()
    for sdk in iphoneos iphonesimulator; do
      target=arm64-apple-ios$IOS_MIN; [ $sdk = iphonesimulator ] && target=$target-simulator
      cc="xcrun -sdk $sdk clang -target $target"
      ffmpeg_build "ios-$sdk" --enable-cross-compile --target-os=darwin --arch=arm64 \
        --cc="$cc" --extra-cflags="-target $target" --extra-ldflags="-target $target"
      dir="$WORK/ios-$sdk"
      $cc -O2 -fPIC -I"$dir/prefix/include" -c "$SRC_C/to_wav.c" -o "$dir/to_wav.o"
      # shellcheck disable=SC2046
      libtool -static -no_warning_for_no_symbols -o "$dir/libshironffmpeg.a" "$dir/to_wav.o" $(libs "ios-$sdk")
      mkdir -p "$dir/headers"
      echo 'int shiron_ffmpeg_to_wav(const char *input, const char *output);' > "$dir/headers/shiron_ffmpeg.h"
      printf 'module ShironFFmpeg {\n  header "shiron_ffmpeg.h"\n  export *\n}\n' > "$dir/headers/module.modulemap"
      args+=(-library "$dir/libshironffmpeg.a" -headers "$dir/headers")
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
      "$cc" -shared -fPIC -O2 -I"$WORK/android-$abi/prefix/include" "$SRC_C/to_wav.c" "$SRC_C/jni.c" \
        $(libs "android-$abi") -lm -Wl,-z,max-page-size=16384 -Wl,--exclude-libs,ALL -Wl,-soname,libshironffmpeg.so \
        -o "$out/libshironffmpeg.so"
      "$TC/bin/llvm-strip" --strip-unneeded "$out/libshironffmpeg.so"
      echo "$out/libshironffmpeg.so ($(wc -c < "$out/libshironffmpeg.so") bytes)"
    done
    ;;

  *) echo "usage: $0 ios|android|host [ABIs…]" >&2; exit 1 ;;
esac
