#!/bin/sh

set -eu

RELEASES_URL="${CHATGPT_TUI_RELEASES_URL:-https://api.github.com/repos/jonnyAnd/chatgpt-tui/releases}"
INSTALL_PATH="${CHATGPT_TUI_INSTALL_PATH:-/usr/local/bin/chatgpt-tui}"
ASSET_NAME="chatgpt-tui-linux-x64"

fail() {
  printf '%s\n' "Error: $*" >&2
  exit 1
}

cleanup() {
  if [ -n "${TEMPORARY_DIRECTORY:-}" ]; then
    rm -rf "$TEMPORARY_DIRECTORY"
  fi
  if [ -n "${INSTALL_TEMPORARY_FILE:-}" ]; then
    if [ -n "${INSTALL_WITH_SUDO:-}" ]; then
      sudo rm -f "$INSTALL_TEMPORARY_FILE" >/dev/null 2>&1 || true
    else
      rm -f "$INSTALL_TEMPORARY_FILE"
    fi
  fi
}

install_command() {
  if [ -n "${INSTALL_WITH_SUDO:-}" ]; then
    sudo "$@"
  else
    "$@"
  fi
}

trap cleanup 0 HUP INT TERM
umask 077

printf '%s\n' "Detecting platform"
case "$(uname -s)" in
  Linux) ;;
  *) fail "Unsupported platform. Only Linux x64 is supported." ;;
esac

case "$(uname -m)" in
  x86_64 | amd64) ;;
  *) fail "Unsupported architecture. Only Linux x64 is supported." ;;
esac

command -v python3 >/dev/null 2>&1 || fail "python3 is required to inspect GitHub release metadata."

if [ -e "$INSTALL_PATH" ] || [ -L "$INSTALL_PATH" ]; then
  printf '%s\n' "An existing chatgpt-tui installation was detected at $INSTALL_PATH."
  printf '%s\n' "Use chatgpt-tui --update instead."
  exit 0
fi

TEMPORARY_DIRECTORY=$(mktemp -d "${TMPDIR:-/tmp}/chatgpt-tui-install.XXXXXX") || fail "Could not create a temporary directory."
RELEASE_METADATA="$TEMPORARY_DIRECTORY/releases.json"

printf '%s\n' "Checking latest release"
if ! curl -fsSL \
  -H "Accept: application/vnd.github+json" \
  -H "User-Agent: chatgpt-tui-installer" \
  "$RELEASES_URL" \
  -o "$RELEASE_METADATA"; then
  fail "Could not fetch GitHub release information."
fi

if ! python3 - "$RELEASE_METADATA" "$TEMPORARY_DIRECTORY" "$ASSET_NAME" <<'PY'
import json
import re
import sys

metadata_path, output_directory, asset_name = sys.argv[1:]

try:
    with open(metadata_path, encoding="utf-8") as metadata_file:
        releases = json.load(metadata_file)
    if not isinstance(releases, list):
        raise ValueError("GitHub returned an unexpected releases response")

    def semantic_version(tag):
        match = re.fullmatch(
            r"v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z.-]+)?",
            tag.strip(),
        )
        if not match:
            return None
        return tuple(int(part) for part in match.groups())

    candidates = []
    for release in releases:
        if not isinstance(release, dict):
            continue
        if release.get("draft") or release.get("prerelease"):
            continue
        tag_name = release.get("tag_name")
        if not isinstance(tag_name, str):
            continue
        version = semantic_version(tag_name)
        if version is not None:
            candidates.append((version, release))

    if not candidates:
        raise ValueError("No published stable releases with a valid semantic version were found")

    _, release = max(candidates, key=lambda candidate: candidate[0])
    assets = release.get("assets")
    if not isinstance(assets, list):
        raise ValueError("The selected release has an invalid asset list")

    asset = next(
        (
            candidate
            for candidate in assets
            if isinstance(candidate, dict) and candidate.get("name") == asset_name
        ),
        None,
    )
    if not asset or not isinstance(asset.get("browser_download_url"), str):
        raise ValueError(f"The selected release does not include {asset_name}")

    with open(f"{output_directory}/version", "w", encoding="utf-8") as output:
        output.write(f"{release['tag_name']}\n")
    with open(f"{output_directory}/url", "w", encoding="utf-8") as output:
        output.write(f"{asset['browser_download_url']}\n")
    digest = asset.get("digest")
    with open(f"{output_directory}/digest", "w", encoding="utf-8") as output:
        output.write(f"{digest}\n" if isinstance(digest, str) else "")
except (OSError, ValueError, json.JSONDecodeError, KeyError) as error:
    print(f"Error: {error}", file=sys.stderr)
    sys.exit(1)
PY
then
  exit 1
fi

VERSION=$(cat "$TEMPORARY_DIRECTORY/version")
DOWNLOAD_URL=$(cat "$TEMPORARY_DIRECTORY/url")
DIGEST=$(cat "$TEMPORARY_DIRECTORY/digest")
DOWNLOADED_EXECUTABLE="$TEMPORARY_DIRECTORY/$ASSET_NAME"

printf '%s\n' "Found version $VERSION"
printf '%s\n' "Downloading"
if ! curl -fL --progress-bar \
  -H "Accept: application/octet-stream" \
  -H "User-Agent: chatgpt-tui-installer" \
  "$DOWNLOAD_URL" \
  -o "$DOWNLOADED_EXECUTABLE"; then
  fail "Could not download $ASSET_NAME."
fi

[ -s "$DOWNLOADED_EXECUTABLE" ] || fail "Downloaded executable is empty."

printf '%s\n' "Verifying download"
if [ -n "$DIGEST" ]; then
  case "$DIGEST" in
    sha256:*) ;;
    *) fail "Release asset has an unsupported checksum digest." ;;
  esac
  command -v sha256sum >/dev/null 2>&1 || fail "sha256sum is required to verify the release checksum."
  EXPECTED_DIGEST=${DIGEST#sha256:}
  if ! printf '%s\n' "$EXPECTED_DIGEST" | grep -Eq '^[0-9A-Fa-f]{64}$'; then
    fail "Release asset has an unsupported checksum digest."
  fi
  ACTUAL_DIGEST=$(sha256sum "$DOWNLOADED_EXECUTABLE" | awk '{print $1}')
  [ "$ACTUAL_DIGEST" = "$EXPECTED_DIGEST" ] || fail "Downloaded executable checksum did not match the release asset."
fi

chmod 755 "$DOWNLOADED_EXECUTABLE" || fail "Could not make the downloaded executable runnable."

INSTALL_DIRECTORY=$(dirname "$INSTALL_PATH")
[ -d "$INSTALL_DIRECTORY" ] || fail "Installation directory $INSTALL_DIRECTORY does not exist."

printf '%s\n' "Installing"
if [ ! -w "$INSTALL_DIRECTORY" ]; then
  command -v sudo >/dev/null 2>&1 || fail "Installation needs permission to write to $INSTALL_DIRECTORY, but sudo is not available."
  printf '%s\n' "Administrator privileges are required to install to $INSTALL_DIRECTORY."
  if ! sudo -v; then
    fail "Administrator privileges are required to install to $INSTALL_DIRECTORY."
  fi
  INSTALL_WITH_SUDO=1
fi

if ! INSTALL_TEMPORARY_FILE=$(install_command mktemp "$INSTALL_DIRECTORY/.chatgpt-tui.XXXXXX"); then
  fail "Could not prepare the installation in $INSTALL_DIRECTORY."
fi
if ! install_command cp "$DOWNLOADED_EXECUTABLE" "$INSTALL_TEMPORARY_FILE" \
  || ! install_command chmod 755 "$INSTALL_TEMPORARY_FILE"; then
  fail "Could not prepare the executable for installation."
fi

if ! install_command ln "$INSTALL_TEMPORARY_FILE" "$INSTALL_PATH"; then
  if [ -e "$INSTALL_PATH" ] || [ -L "$INSTALL_PATH" ]; then
    printf '%s\n' "An existing chatgpt-tui installation was detected at $INSTALL_PATH."
    printf '%s\n' "Use chatgpt-tui --update instead."
    exit 0
  fi
  fail "Could not install chatgpt-tui to $INSTALL_DIRECTORY."
fi

install_command rm -f "$INSTALL_TEMPORARY_FILE"
INSTALL_TEMPORARY_FILE=

printf '%s\n' "Installation complete. You can now run: chatgpt-tui"
