#!/usr/bin/env bash
# Hands a file to the app exactly the way our share extension does when it has an App Group:
# copy into the group container, a JSON list under "shironShareKey" in the group's defaults,
# then open shiron://dataUrl=shironShareKey#file. Skips the share sheet itself, whose tap is
# flaky on the simulator, so the import → convert → play path can be checked every run.
# usage: inject.sh <simulator udid> <file> <name she would see> [mime]
set -euo pipefail
UDID=$1 SRC=$2 NAME=$3 MIME=${4:-application/octet-stream}
GROUP_ID=group.app.shiron.gan
GROUP=$(xcrun simctl get_app_container "$UDID" app.shiron.gan "$GROUP_ID")
EXT=${NAME##*.}
DEST="$GROUP/$(uuidgen).$EXT"
cp "$SRC" "$DEST"
SIZE=$(stat -f%z "$DEST")
JSON=$(jq -cn --arg path "file://$DEST" --arg name "$NAME" --arg mime "$MIME" --argjson size "$SIZE" \
  '[{path:$path, thumbnail:null, fileName:$name, fileSize:$size, width:null, height:null, duration:null, mimeType:$mime, type:"file"}]')
HEX=$(printf '%s' "$JSON" | xxd -p | tr -d '\n')
xcrun simctl spawn "$UDID" defaults write "$GROUP/Library/Preferences/$GROUP_ID" shironShareKey -data "$HEX"
xcrun simctl openurl "$UDID" "shiron://dataUrl=shironShareKey?nonce=$(uuidgen)#file"
