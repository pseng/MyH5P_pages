#!/bin/bash
# Downloads H5P core and editor files from GitHub
# Usage: ./scripts/download-h5p.sh [core-version] [editor-version]

CORE_VERSION="${1:-master}"
EDITOR_VERSION="${2:-$CORE_VERSION}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
H5P_DIR="$PROJECT_DIR/h5p"

mkdir -p "$H5P_DIR/tmp" "$H5P_DIR/core" "$H5P_DIR/editor" "$H5P_DIR/libraries"

echo "Downloading H5P core ($CORE_VERSION)..."
curl -sL "https://github.com/h5p/h5p-php-library/archive/$CORE_VERSION.zip" -o "$H5P_DIR/tmp/core.zip"

echo "Downloading H5P editor ($EDITOR_VERSION)..."
curl -sL "https://github.com/h5p/h5p-editor-php-library/archive/$EDITOR_VERSION.zip" -o "$H5P_DIR/tmp/editor.zip"

echo "Extracting core..."
rm -rf "$H5P_DIR/core/"*
unzip -q -o "$H5P_DIR/tmp/core.zip" -d "$H5P_DIR/tmp/"
mv "$H5P_DIR/tmp/h5p-php-library-"*/* "$H5P_DIR/core/"

echo "Extracting editor..."
rm -rf "$H5P_DIR/editor/"*
unzip -q -o "$H5P_DIR/tmp/editor.zip" -d "$H5P_DIR/tmp/"
mv "$H5P_DIR/tmp/h5p-editor-php-library-"*/* "$H5P_DIR/editor/"

echo "Cleaning up..."
rm -rf "$H5P_DIR/tmp"

echo "Done! H5P core and editor files installed."
