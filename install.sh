#!/usr/bin/env bash

# This script installs or updates the promptfoo CLI tool
# It detects the OS and architecture, downloads the appropriate binary,
# and sets up the necessary environment variables

# Usage:
#   To install or update promptfoo:
#     curl -sSL https://raw.githubusercontent.com/promptfoo/promptfoo/main/install.sh | bash
#
#   To install a specific version:
#     curl -sSL https://raw.githubusercontent.com/promptfoo/promptfoo/main/install.sh | bash -s -- -v <version>
#
#   To install without prompts (non-interactive):
#     curl -sSL https://raw.githubusercontent.com/promptfoo/promptfoo/main/install.sh | bash -s -- -y
#
#   To install to a custom directory:
#     curl -sSL https://raw.githubusercontent.com/promptfoo/promptfoo/main/install.sh | bash -s -- -d <directory>
#
# Options:
#   -v, --version <version>  Install a specific version of promptfoo
#   -y, --yes                Skip confirmation prompts (non-interactive)
#   -d, --dir <directory>    Install to a custom directory
#   -h, --help               Display this help message

# Ensure the entire script is downloaded before execution
{
  set -e

  echo "WARNING: This installation script is in alpha. Expect bugs and issues."
  echo "It does not work for ARM-based systems."
  echo "Please report any problems you encounter to the promptfoo team."
  echo "Press Ctrl+C to cancel or wait 5 seconds to continue..."
  sleep 5

  # Configuration variables
  GITHUB_REPO="promptfoo/promptfoo"
  INSTALL_DIR="$HOME/.promptfoo"
  BIN_DIR="/usr/local/bin"
  TMP_DIR=$(mktemp -d)

  # Check if a command exists
  # Usage: promptfoo_has <command>
  promptfoo_has() {
    type "$1" >/dev/null 2>&1
  }

  # Echo a message to stdout
  # Usage: promptfoo_echo <message>
  promptfoo_echo() {
    command printf %s\\n "$*" 2>/dev/null
  }

  # Download a file using curl or wget
  # Usage: promptfoo_download <url> [<additional_args>...]
  promptfoo_download() {
    if promptfoo_has "curl"; then
      curl --fail --compressed -q "$@"
    elif promptfoo_has "wget"; then
      # Emulate curl with wget
      ARGS=$(promptfoo_echo "$@" | command sed -e 's/--progress-bar /--progress=bar /' \
        -e 's/--compressed //' \
        -e 's/--fail //' \
        -e 's/-L //' \
        -e 's/-I /--server-response /' \
        -e 's/-s /-q /' \
        -e 's/-sS /-nv /' \
        -e 's/-o /-O /' \
        -e 's/-C - /-c /')
      # shellcheck disable=SC2086
      eval wget $ARGS
    fi
  }

  # Get the latest version of promptfoo from GitHub
  promptfoo_latest_version() {
    promptfoo_echo "$(promptfoo_download -s "https://api.github.com/repos/$GITHUB_REPO/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')"
  }

  # Detect the user's shell profile file
  promptfoo_detect_profile() {
    if [ "${PROFILE-}" = '/dev/null' ]; then
      # The user has specifically requested NOT to have promptfoo touch their profile
      return
    fi

    if [ -n "${PROFILE}" ] && [ -f "${PROFILE}" ]; then
      promptfoo_echo "${PROFILE}"
      return
    fi

    local DETECTED_PROFILE
    DETECTED_PROFILE=''

    if [ "${SHELL#*bash}" != "$SHELL" ]; then
      if [ -f "$HOME/.bashrc" ]; then
        DETECTED_PROFILE="$HOME/.bashrc"
      elif [ -f "$HOME/.bash_profile" ]; then
        DETECTED_PROFILE="$HOME/.bash_profile"
      fi
    elif [ "${SHELL#*zsh}" != "$SHELL" ]; then
      if [ -f "$HOME/.zshrc" ]; then
        DETECTED_PROFILE="$HOME/.zshrc"
      elif [ -f "$HOME/.zprofile" ]; then
        DETECTED_PROFILE="$HOME/.zprofile"
      fi
    fi

    if [ -z "$DETECTED_PROFILE" ]; then
      for EACH_PROFILE in ".profile" ".bashrc" ".bash_profile" ".zprofile" ".zshrc"; do
        if DETECTED_PROFILE="$(promptfoo_try_profile "${HOME}/${EACH_PROFILE}")"; then
          break
        fi
      done
    fi

    if [ -n "$DETECTED_PROFILE" ]; then
      promptfoo_echo "$DETECTED_PROFILE"
    fi
  }

  # Check if a profile file exists and is readable
  # Usage: promptfoo_try_profile <profile_path>
  promptfoo_try_profile() {
    if [ -z "${1-}" ] || [ ! -f "${1}" ]; then
      return 1
    fi
    promptfoo_echo "${1}"
  }

  # Handle errors and perform cleanup
  # Usage: handle_error <error_message>
  handle_error() {
    promptfoo_echo "Error: $1" >&2
    cleanup
    exit 1
  }

  # Clean up temporary files
  cleanup() {
    rm -rf "$TMP_DIR"
  }

  # Detect the operating system and architecture
  detect_os_arch() {
    OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    ARCH=$(uname -m)
    case $ARCH in
    x86_64) ARCH="x64" ;;
    aarch64 | arm64) ARCH="arm64" ;;
    *) handle_error "Unsupported architecture: $ARCH" ;;
    esac
    case $OS in
    linux) ;;
    darwin) OS="macos" ;;
    *) handle_error "Unsupported operating system: $OS" ;;
    esac
  }

  # Check for existing installation and prompt for update
  check_existing_installation() {
    if [ -f "$BIN_DIR/promptfoo" ]; then
      read -p "promptfoo is already installed. Do you want to update it? (y/N) " -n 1 -r
      promptfoo_echo
      if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        promptfoo_echo "Installation cancelled."
        exit 0
      fi
    fi
  }

  # Download and install the promptfoo binary
  install_promptfoo() {
    local VERSION
    VERSION=$(promptfoo_latest_version)
    local FILENAME="promptfoo-$OS-$ARCH"
    local URL="https://github.com/$GITHUB_REPO/releases/download/$VERSION/$FILENAME"

    promptfoo_echo "=> Downloading promptfoo $VERSION for $OS-$ARCH..."
    promptfoo_download -L "$URL" -o "$TMP_DIR/promptfoo" || handle_error "Failed to download promptfoo"
    chmod +x "$TMP_DIR/promptfoo"

    promptfoo_echo "=> Installing promptfoo..."
    mkdir -p "$INSTALL_DIR"
    mv "$TMP_DIR/promptfoo" "$INSTALL_DIR/promptfoo"

    if [ -w "$BIN_DIR" ]; then
      ln -sf "$INSTALL_DIR/promptfoo" "$BIN_DIR/promptfoo"
      ln -sf "$INSTALL_DIR/promptfoo" "$BIN_DIR/pf"
    else
      sudo ln -sf "$INSTALL_DIR/promptfoo" "$BIN_DIR/promptfoo"
      sudo ln -sf "$INSTALL_DIR/promptfoo" "$BIN_DIR/pf"
    fi

    promptfoo_echo "=> promptfoo has been installed successfully!"
  }

  # Update PATH in the user's shell profile if necessary
  update_path() {
    local PROFILE
    PROFILE="$(promptfoo_detect_profile)"
    local PROFILE_INSTALL_DIR
    PROFILE_INSTALL_DIR="$(printf %s "${BIN_DIR}" | sed "s:^$HOME:\$HOME:")"

    SOURCE_STR="\\nexport PATH=\"\$PATH:$PROFILE_INSTALL_DIR\"  # This adds promptfoo to the PATH\\n"

    if [ -z "${PROFILE-}" ]; then
      local TRIED_PROFILE
      if [ -n "${PROFILE}" ]; then
        TRIED_PROFILE="${PROFILE} (as defined in \$PROFILE), "
      fi
      promptfoo_echo "=> Profile not found. Tried ${TRIED_PROFILE-}~/.bashrc, ~/.bash_profile, ~/.zshrc, and ~/.profile."
      promptfoo_echo "=> Create one of them and run this script again"
      promptfoo_echo "   OR"
      promptfoo_echo "=> Append the following lines to the correct file yourself:"
      command printf "${SOURCE_STR}"
    else
      if ! command grep -qc "$BIN_DIR" "$PROFILE"; then
        promptfoo_echo "=> Appending promptfoo source string to $PROFILE"
        command printf "${SOURCE_STR}" >>"$PROFILE"
      else
        promptfoo_echo "=> promptfoo source string already in ${PROFILE}"
      fi
    fi
  }

  # Main installation process
  main() {
    detect_os_arch
    check_existing_installation
    echo "Detected OS: $OS"
    echo "Detected ARCH: $ARCH"
    echo "Latest version: $(promptfoo_latest_version)"
    echo "Download URL: https://github.com/$GITHUB_REPO/releases/download/$(promptfoo_latest_version)/promptfoo-$OS-$ARCH"
    install_promptfoo
    update_path
    cleanup

    promptfoo_echo "=> Close and reopen your terminal to start using promptfoo or run the following to use it now:"
    command printf "${SOURCE_STR}"
  }

  # Run the main installation process
  main

} # This ensures the entire script is downloaded before execution
