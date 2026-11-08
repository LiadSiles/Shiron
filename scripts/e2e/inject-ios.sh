#!/usr/bin/env bash
# Stages files the way our share extension does when it has an App Group: copies them into the
# group container and lists them (JSON) under "shironShareKey" in the group's defaults — one
# share holding several files, like a selection forwarded from WhatsApp. open-link.yaml then
# opens shiron://dataUrl=shironShareKey#file as the extension would. Skips the share sheet
# itself, whose tap is flaky on the simulator, so import → convert → play is checked every run.
# usage: inject-ios.sh <simulator udid> <file>|<name she would see>|<mime> …
set -euo pipefail
UDID=$1; shift
GROUP_ID=group.app.shiron.gan
GROUP=$(xcrun simctl get_app_container "$UDID" app.shiron.gan "$GROUP_ID")
ITEMS=()
for spec in "$@"; do
  IFS='|' read -r SRC NAME MIME <<< "$spec"
  DEST="$GROUP/$(uuidgen).${NAME##*.}"
  cp "$SRC" "$DEST"
  # type 2 = SharedMediaType.file — an Int in the module's Codable enum (a string crashed it).
  ITEMS+=("$(jq -cn --arg path "file://$DEST" --arg name "$NAME" --arg mime "${MIME:-application/octet-stream}" \
    --argjson size "$(stat -f%z "$DEST")" \
    '{path:$path, thumbnail:null, fileName:$name, fileSize:$size, width:null, height:null, duration:null, mimeType:$mime, type:2}')")
done
JSON=$(printf '%s\n' "${ITEMS[@]}" | jq -cs .)
HEX=$(printf '%s' "$JSON" | xxd -p | tr -d '\n')
xcrun simctl spawn "$UDID" defaults write "$GROUP/Library/Preferences/$GROUP_ID" shironShareKey -data "$HEX"
