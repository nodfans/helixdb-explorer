#!/bin/bash

# HelixDB Explorer - macOS One-liner Installer
# This script downloads, installs, and clears Gatekeeper blocks.

set -e

APP_NAME="HelixDB Explorer"
DMG_URL="https://github.com/nodfans/helixdb-explorer/releases/latest/download/HelixDB-Explorer-macOS.dmg"
DMG_PATH="/tmp/HelixDB-Explorer-macOS.dmg"
MOUNT_POINT="/tmp/helixdb-mount"

echo "🚀 Starting installation of $APP_NAME..."

# 1. Download DMG
echo "📥 Downloading latest release..."
curl -L -o "$DMG_PATH" "$DMG_URL"

# 2. Mount DMG
echo "📦 Mounting disk image..."
mkdir -p "$MOUNT_POINT"
hdiutil attach "$DMG_PATH" -mountpoint "$MOUNT_POINT" -quiet

# 3. Copy App to /Applications
echo "🚚 Copying to /Applications..."
# Using ditto as it's better for .app bundles than cp
sudo ditto "$MOUNT_POINT/$APP_NAME.app" "/Applications/$APP_NAME.app"

# 4. Unmount and Clean up
echo "🧹 Cleaning up..."
hdiutil detach "$MOUNT_POINT" -quiet
rm "$DMG_PATH"
rmdir "$MOUNT_POINT"

# 5. Clear Gatekeeper Quarantine
echo "🔐 Clearing Gatekeeper blocks (Quarantine bit)..."
sudo xattr -rd com.apple.quarantine "/Applications/$APP_NAME.app"

echo "✅ Installation complete! You can now launch '$APP_NAME' from your Applications folder."
