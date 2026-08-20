#!/usr/bin/env bash
# Launches a Chromium-based browser with Delphi already loaded — skips the
# manual "enable Developer mode -> Load unpacked" steps in chrome://extensions.
# Uses a separate, throwaway profile (.dev-profile/) so it never touches your
# normal browsing profile or its extensions.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE_DIR="$SCRIPT_DIR/.dev-profile"

# Respects $BROWSER if set; otherwise tries common Chromium-based binaries
# in order. Firefox isn't included here — this project's Firefox support is
# still unverified (see CLAUDE.md), and Firefox doesn't support
# --load-extension the same way anyway (needs `web-ext run`, a separate tool).
CANDIDATES=(
  "${BROWSER:-}"
  google-chrome
  google-chrome-stable
  chromium
  chromium-browser
  brave-browser
  brave
)

BROWSER_BIN=""
for candidate in "${CANDIDATES[@]}"; do
  [ -z "$candidate" ] && continue
  if command -v "$candidate" &>/dev/null; then
    BROWSER_BIN="$candidate"
    break
  fi
done

if [ -z "$BROWSER_BIN" ]; then
  echo "No Chrome/Chromium/Brave binary found on PATH." >&2
  echo "Set \$BROWSER to your browser's binary name and try again, e.g.:" >&2
  echo "  BROWSER=chromium ./install.sh" >&2
  exit 1
fi

echo "Launching $BROWSER_BIN with Delphi loaded (profile: $PROFILE_DIR)..."
echo "First run: open the toolbar puzzle-piece icon and pin Delphi. See docs/walkthrough.md for the rest."

exec "$BROWSER_BIN" \
  --user-data-dir="$PROFILE_DIR" \
  --load-extension="$SCRIPT_DIR" \
  --no-first-run \
  "$@"
