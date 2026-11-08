#!/usr/bin/env bash
# The test songs, about 40 s long, for the e2e flows (writes them to <dir>). The fixtures last
# 2.5 s after trimming: a song had already ended — and the next one started — before Maestro
# looked for "מתנגן: <title>", above all on the slower Android emulator. Falls back to the
# fixture itself for any format this machine's ffmpeg can't write.
# usage: long-songs.sh <dir>
set -u
OUT=$1
FIX=app/modules/shiron-audio/fixtures
mkdir -p "$OUT"
long() { # fixture, name, ffmpeg output args…
  local src=$1 name=$2; shift 2
  if ! command -v ffmpeg >/dev/null || ! ffmpeg -v error -y -stream_loop 9 -i "$FIX/$src" "$@" "$OUT/$name"; then
    echo "== long-songs: $name stays short"
    cp "$FIX/$src" "$OUT/$name"
  fi
}
long song.mp3 boker-tov.mp3 -c:a libmp3lame -b:a 64k
long voice-whatsapp.opus voice-whatsapp.opus -c:a libopus -b:a 32k
long tone.wma old-song.wma -c:a wmav2
long video.mpg gan-party.mpg -c copy -f mpeg
cp "$FIX/not-audio.mp3" "$OUT/broken.mp3"
