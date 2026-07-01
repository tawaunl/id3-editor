#!/usr/bin/env bash
set -euo pipefail

# Build a macOS .icns file from a single 1024x1024 PNG source.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_PNG="${1:-$ROOT_DIR/assets/icon-source.png}"
OUTPUT_ICNS="$ROOT_DIR/assets/icon.icns"
ICONSET_DIR="$ROOT_DIR/assets/icon.iconset"

if [[ ! -f "$SOURCE_PNG" ]]; then
  echo "Source image not found: $SOURCE_PNG"
  echo "Place a 1024x1024 PNG at assets/icon-source.png or pass a path as the first argument."
  exit 1
fi

mkdir -p "$ICONSET_DIR"

# icon_16x16.png and icon_16x16@2x.png
sips -z 16 16 "$SOURCE_PNG" --out "$ICONSET_DIR/icon_16x16.png" >/dev/null
sips -z 32 32 "$SOURCE_PNG" --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null

# icon_32x32.png and icon_32x32@2x.png
sips -z 32 32 "$SOURCE_PNG" --out "$ICONSET_DIR/icon_32x32.png" >/dev/null
sips -z 64 64 "$SOURCE_PNG" --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null

# icon_128x128.png and icon_128x128@2x.png
sips -z 128 128 "$SOURCE_PNG" --out "$ICONSET_DIR/icon_128x128.png" >/dev/null
sips -z 256 256 "$SOURCE_PNG" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null

# icon_256x256.png and icon_256x256@2x.png
sips -z 256 256 "$SOURCE_PNG" --out "$ICONSET_DIR/icon_256x256.png" >/dev/null
sips -z 512 512 "$SOURCE_PNG" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null

# icon_512x512.png and icon_512x512@2x.png
sips -z 512 512 "$SOURCE_PNG" --out "$ICONSET_DIR/icon_512x512.png" >/dev/null
sips -z 1024 1024 "$SOURCE_PNG" --out "$ICONSET_DIR/icon_512x512@2x.png" >/dev/null

iconutil -c icns "$ICONSET_DIR" -o "$OUTPUT_ICNS"
rm -rf "$ICONSET_DIR"

echo "Created $OUTPUT_ICNS"
