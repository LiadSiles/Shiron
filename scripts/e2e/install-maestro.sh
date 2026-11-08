#!/usr/bin/env bash
# Installs the Maestro CLI into ~/.maestro/bin. The official installer's download host
# sometimes answers 504 for a whole morning: try it twice, then take the same zip straight from
# GitHub's release, and stop with a clear error if neither comes.
set -u
BIN="$HOME/.maestro/bin/maestro"
for i in 1 2; do
  curl -fsSL "https://get.maestro.mobile.dev" | bash >/dev/null 2>&1 && [ -x "$BIN" ] && exit 0
  echo "== maestro installer failed (try $i)"; sleep 15
done
for i in 1 2 3; do
  TMP=$(mktemp -d)
  if curl -fsSL --retry 3 -o "$TMP/maestro.zip" \
      "https://github.com/mobile-dev-inc/maestro/releases/latest/download/maestro.zip" \
     && unzip -q "$TMP/maestro.zip" -d "$TMP"; then
    # The zip holds maestro/{bin,lib}; find bin/maestro rather than trust the folder name.
    FOUND=$(find "$TMP" -path '*/bin/maestro' -type f | head -1)
    [ -n "$FOUND" ] || { echo "== no bin/maestro in the zip"; exit 1; }
    ROOT=$(dirname "$(dirname "$FOUND")")
    rm -rf "$HOME/.maestro"; mkdir -p "$HOME/.maestro"
    cp -R "$ROOT/." "$HOME/.maestro/"
    chmod +x "$BIN"
    [ -x "$BIN" ] && { echo "== maestro from GitHub release"; exit 0; }
  fi
  echo "== maestro zip from GitHub failed (try $i)"; sleep 20
done
echo "::error::Maestro could not be installed (installer and GitHub release both failed)"
exit 1
