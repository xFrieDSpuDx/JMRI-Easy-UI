#!/usr/bin/env bash
set -euo pipefail

# -------------------------
# Simple, portable builder
# -------------------------

# Detect JMRI install (override with: export JMRI_HOME=/path/to/JMRI)
if [ -z "${JMRI_HOME:-}" ]; then
  if [ -d "/Applications/JMRI" ]; then
    JMRI_HOME="/Applications/JMRI"         # macOS default
  elif [ -d "$HOME/JMRI" ]; then
    JMRI_HOME="$HOME/JMRI"                 # common Linux/RPi
  elif [ -d "/opt/JMRI" ]; then
    JMRI_HOME="/opt/JMRI"
  else
    echo "ERROR: JMRI_HOME not set and no default JMRI install found."
    echo "Set it, e.g.: export JMRI_HOME=/Applications/JMRI"
    exit 1
  fi
fi

# Project layout (run from server/)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

SRC_DIR="src/main/java"
RES_DIR="src/main/resources"
BUILD_DIR="build"
CLASSES_DIR="$BUILD_DIR/classes"
DIST_DIR="dist"

# Classpath exactly like your working command
CLASSPATH="$JMRI_HOME/*:$JMRI_HOME/lib/*"

# Clean & prepare
rm -rf "$CLASSES_DIR" "$DIST_DIR"
mkdir -p "$CLASSES_DIR" "$DIST_DIR"

echo "JMRI_HOME  : $JMRI_HOME"
echo "CLASSPATH  : $CLASSPATH"
echo "Compiling  : Java sources → $CLASSES_DIR"

# Quick check: any sources?
if ! find "$SRC_DIR" -type f -name "*.java" | grep -q . ; then
  echo "ERROR: No Java sources found under $SRC_DIR"
  exit 1
fi

# Compile using find+xargs (portable; handles spaces via -print0/-0)
# xargs may call javac multiple times if the list is long, which is fine
find "$SRC_DIR" -type f -name "*.java" -print0 \
| xargs -0 javac --release 11 -cp "$CLASSPATH" -d "$CLASSES_DIR"

# Copy resources (includes META-INF/services)
if [ -d "$RES_DIR" ]; then
  echo "Copying resources → $CLASSES_DIR"
  # The dot preserves hidden files like META-INF/service entries
  cp -R "$RES_DIR"/. "$CLASSES_DIR"/
fi

# Remove macOS cruft
find "$CLASSES_DIR" -name ".DS_Store" -delete || true

# Package JAR exactly like your working steps
echo "Packaging   : dist/jmri-easy-ui-server.jar"
jar cf "$DIST_DIR/jmri-easy-ui-server.jar" -C "$CLASSES_DIR" .

# Sanity checks (non-fatal warnings)
if ! jar tf "$DIST_DIR/jmri-easy-ui-server.jar" | grep -q 'META-INF/services/jmri.server.web.spi.WebServerConfiguration' ; then
  echo "WARNING: WebServerConfiguration service declaration not found in JAR."
fi

echo "Done. Output: $DIST_DIR/jmri-easy-ui-server.jar"

# Optional: install when called as `./build.sh install`
if [ "${1:-}" = "install" ]; then
  echo "Installing  : $DIST_DIR/jmri-easy-ui-server.jar → $JMRI_HOME/lib/"
  cp "$DIST_DIR/jmri-easy-ui-server.jar" "$JMRI_HOME/lib/"
  echo "Install complete. Restart JMRI."
fi
