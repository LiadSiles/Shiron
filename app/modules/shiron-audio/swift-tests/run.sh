#!/bin/bash
# Builds ios/Core as a Swift package and runs its tests against ../fixtures (macOS only).
set -euo pipefail
cd "$(dirname "$0")"
rm -rf Sources && mkdir -p Sources/ShironAudioCore
cp ../ios/Core/*.swift Sources/ShironAudioCore/
FIXTURES="$(cd ../fixtures && pwd)" swift test "$@"
