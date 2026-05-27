#!/bin/bash
# Promptfoo installation script
#
# Usage:
#   curl -fsSL https://promptfoo.dev/install.sh | bash
#   curl -fsSL https://promptfoo.dev/install.sh | bash -s -- v0.120.0
#   curl -fsSL https://promptfoo.dev/install.sh | bash -s -- --help
#
# Environment variables:
#   PROMPTFOO_INSTALL_DIR  - Installation directory (default: ~/.promptfoo)
#   PROMPTFOO_VERSION      - Version to install (default: latest)
#   PROMPTFOO_NO_MODIFY_PATH - Skip PATH modification if set
#   PROMPTFOO_DISABLE_TELEMETRY - Skip anonymous installation telemetry if set
#
# Requirements:
#   - curl or wget
#   - tar (for extracting archives)
#   - Node.js ^20.20.0 or >=22.22.0 only when falling back to npm installation

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────

readonly GITHUB_REPO="promptfoo/promptfoo"
readonly GITHUB_RELEASES="https://github.com/${GITHUB_REPO}/releases"
readonly NPM_LATEST_URL="https://registry.npmjs.org/promptfoo/latest"

INSTALL_DIR="${PROMPTFOO_INSTALL_DIR:-}"
BIN_DIR=""
VERSION="${PROMPTFOO_VERSION:-latest}"
INSTALLED_VERSION=""

# ─── Colors ──────────────────────────────────────────────────────────────────

setup_colors() {
  if [[ -t 1 ]] && [[ -z "${NO_COLOR:-}" ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    BLUE='\033[0;34m'
    MAGENTA='\033[0;35m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    DIM='\033[2m'
    NC='\033[0m' # No Color
  else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    MAGENTA=''
    CYAN=''
    BOLD=''
    DIM=''
    NC=''
  fi
}

# ─── Logging ─────────────────────────────────────────────────────────────────

info() {
  echo -e "${BLUE}info${NC}  $*"
}

warn() {
  echo -e "${YELLOW}warn${NC}  $*" >&2
}

error() {
  echo -e "${RED}error${NC} $*" >&2
  exit 1
}

success() {
  echo -e "${GREEN}✓${NC} $*"
}

# ─── Help ────────────────────────────────────────────────────────────────────

show_help() {
  cat <<EOF
${BOLD}Promptfoo Installer${NC}

${BOLD}USAGE${NC}
    curl -fsSL https://promptfoo.dev/install.sh | bash
    curl -fsSL https://promptfoo.dev/install.sh | bash -s -- [OPTIONS] [VERSION]

${BOLD}OPTIONS${NC}
    -h, --help      Show this help message
    -d, --dir DIR   Installation directory (default: ~/.promptfoo)
    --no-modify-path  Don't modify shell config files

${BOLD}VERSION${NC}
    Specify a version tag (e.g., 0.120.0) or "latest" (default)

${BOLD}ENVIRONMENT VARIABLES${NC}
    PROMPTFOO_INSTALL_DIR     Installation directory
    PROMPTFOO_VERSION         Version to install
    PROMPTFOO_NO_MODIFY_PATH  Skip PATH modification if set
    PROMPTFOO_DISABLE_TELEMETRY  Skip anonymous installation telemetry if set

${BOLD}EXAMPLES${NC}
    # Install latest version
    curl -fsSL https://promptfoo.dev/install.sh | bash

    # Install specific version
    curl -fsSL https://promptfoo.dev/install.sh | bash -s -- 0.120.0

    # Install to custom directory
    curl -fsSL https://promptfoo.dev/install.sh | bash -s -- -d /opt/promptfoo

${BOLD}MORE INFO${NC}
    https://promptfoo.dev/docs/installation
EOF
  exit 0
}

# ─── Argument Parsing ────────────────────────────────────────────────────────

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
    -h | --help)
      show_help
      ;;
    -d | --dir)
      if [[ $# -lt 2 || -z "${2:-}" || "${2:-}" == -* ]]; then
        error "Option $1 requires a non-empty directory.\nRun with --help for usage."
      fi
      INSTALL_DIR="$2"
      BIN_DIR="$INSTALL_DIR/bin"
      shift 2
      ;;
    --no-modify-path)
      PROMPTFOO_NO_MODIFY_PATH=1
      shift
      ;;
    -*)
      error "Unknown option: $1\nRun with --help for usage."
      ;;
    *)
      VERSION="$1"
      shift
      ;;
    esac
  done
}

configure_install_directory() {
  if [[ -z "$INSTALL_DIR" ]]; then
    if [[ -z "${HOME:-}" ]]; then
      error "HOME is unset. Set HOME, set PROMPTFOO_INSTALL_DIR, or pass --dir DIR."
    fi
    INSTALL_DIR="$HOME/.promptfoo"
  fi
  BIN_DIR="$INSTALL_DIR/bin"
}

# ─── Platform Detection ──────────────────────────────────────────────────────

detect_platform() {
  local os arch macos_version libc_version major minor

  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
  Darwin)
    macos_version=$(sw_vers -productVersion 2>/dev/null || true)
    if [[ "$macos_version" =~ ^([0-9]+)\.([0-9]+) ]]; then
      major="${BASH_REMATCH[1]}"
      minor="${BASH_REMATCH[2]}"
      if ((major < 13 || (major == 13 && minor < 5))); then
        warn "macOS $macos_version cannot run the standalone binary, which requires macOS 13.5+."
        os="darwin-unsupported"
      else
        os="darwin"
      fi
    else
      warn "Unable to determine macOS version; using npm installation instead of a standalone binary."
      os="darwin-unsupported"
    fi
    ;;
  Linux)
    os="linux"
    # Check for musl (Alpine, etc.). Missing ldd is handled through the
    # glibc probe below and otherwise falls back to npm.
    if command -v ldd &>/dev/null && ldd --version 2>&1 | grep -q musl; then
      os="linux-musl"
    else
      if command -v getconf &>/dev/null; then
        libc_version=$(getconf GNU_LIBC_VERSION 2>/dev/null || true)
      else
        libc_version=$(ldd --version 2>&1 | head -n 1 || true)
      fi

      if [[ "$libc_version" =~ ([0-9]+)\.([0-9]+) ]]; then
        major="${BASH_REMATCH[1]}"
        minor="${BASH_REMATCH[2]}"
        if ((major < 2 || (major == 2 && minor < 28))); then
          warn "Linux glibc ${major}.${minor} cannot run the standalone binary, which requires glibc 2.28+."
          os="linux-unsupported"
        fi
      else
        warn "Unable to determine Linux glibc version; using npm installation instead of a standalone binary."
        os="linux-unsupported"
      fi
    fi
    ;;
  MINGW* | MSYS* | CYGWIN*)
    error "Windows detected. Please use PowerShell:\n  irm https://promptfoo.dev/install.ps1 | iex"
    ;;
  *)
    error "Unsupported operating system: $os"
    ;;
  esac

  case "$arch" in
  x86_64 | amd64)
    arch="x64"
    ;;
  arm64 | aarch64)
    arch="arm64"
    ;;
  armv7l)
    arch="arm"
    ;;
  *)
    error "Unsupported architecture: $arch"
    ;;
  esac

  # Detect Rosetta 2 on macOS
  if [[ "$os" == "darwin" && "$arch" == "x64" ]]; then
    if [[ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" == "1" ]]; then
      info "Rosetta 2 detected, installing native arm64 binary" >&2
      arch="arm64"
    fi
  fi

  echo "${os}-${arch}"
}

# ─── Version Resolution ──────────────────────────────────────────────────────

resolve_version() {
  local version="$1"

  if [[ "$version" == "latest" ]]; then
    # This function is used in command substitution; keep progress off stdout.
    info "Fetching latest version..." >&2

    # The repository also publishes component releases; use the stable npm
    # package metadata to select the CLI version, not GitHub's global latest.
    if command -v curl &>/dev/null; then
      version=$(curl -fsSL "$NPM_LATEST_URL" 2>/dev/null | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1 || true)
    elif command -v wget &>/dev/null; then
      version=$(wget -qO- "$NPM_LATEST_URL" 2>/dev/null | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1 || true)
    fi

    if [[ -z "$version" ]]; then
      error "Failed to fetch the latest promptfoo version.\nPlease specify a version manually."
    fi
  fi

  # Strip 'v' prefix if present
  version="${version#v}"

  if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]]; then
    error "Invalid version: $version"
  fi

  echo "$version"
}

# ─── Download Helpers ────────────────────────────────────────────────────────

download() {
  local url="$1"
  local output="$2"

  if command -v curl &>/dev/null; then
    curl --fail --location --progress-bar --output "$output" "$url"
  elif command -v wget &>/dev/null; then
    wget --quiet --show-progress --output-document="$output" "$url"
  else
    error "Neither curl nor wget found. Please install one of them."
  fi
}

# ─── Installation ────────────────────────────────────────────────────────────

install_npm() {
  local version="$1"

  info "Installing promptfoo v$version via npm..."

  # Create installation directory
  mkdir -p "$BIN_DIR"

  # npm fallback requires Node.js to be installed.
  if ! command -v node &>/dev/null; then
    error "Node.js is required but not installed.\nPlease install Node.js ^20.20.0 or >=22.22.0 from https://nodejs.org"
  fi
  if ! command -v npm &>/dev/null; then
    error "npm is required for fallback installation but was not found on PATH.\nPlease install npm or use a supported standalone binary platform."
  fi

  local node_version node_major node_minor
  node_version=$(node --version 2>/dev/null || true)
  if [[ ! "$node_version" =~ ^v?([0-9]+)\.([0-9]+)\.[0-9]+(\+[0-9A-Za-z.-]+)?$ ]]; then
    error "Unable to parse Node.js version '$node_version'.\nThe npm fallback requires Node.js ^20.20.0 or >=22.22.0."
  fi
  node_major="${BASH_REMATCH[1]}"
  node_minor="${BASH_REMATCH[2]}"
  if ! ((node_major == 20 && node_minor >= 20 || node_major >= 22 && (node_major > 22 || node_minor >= 22))); then
    error "The npm fallback requires Node.js ^20.20.0 or >=22.22.0, but found $node_version.\nPlease upgrade Node.js."
  fi

  # Install promptfoo globally in the install directory
  if ! npm install -g promptfoo@"$version" --prefix "$INSTALL_DIR" --registry=https://registry.npmjs.org/; then
    return 1
  fi

  if [[ ! -x "$BIN_DIR/promptfoo" ]]; then
    error "npm install completed, but promptfoo executable was not found at $BIN_DIR/promptfoo"
  fi

  if [[ ! -x "$BIN_DIR/pf" ]]; then
    error "npm install completed, but pf executable was not found at $BIN_DIR/pf"
  fi

  return 0
}

install_binary() {
  local version="$1"
  local platform="$2"
  local archive_name download_url temp_file extract_dir archive_entry install_staging backup_parent

  case "$platform" in
  linux-x64 | linux-arm64 | darwin-x64 | darwin-arm64) ;;
  *)
    warn "No bundled binary is published for $platform."
    warn "Falling back to npm installation, which requires Node.js."
    install_npm "$version"
    return $?
    ;;
  esac

  archive_name="promptfoo-${version}-${platform}.tar.gz"
  download_url="${GITHUB_RELEASES}/download/${version}/${archive_name}"
  temp_file=$(mktemp "${TMPDIR:-/tmp}/promptfoo-download.XXXXXXXX")

  info "Installing promptfoo v$version for $platform..."
  info "Downloading from $download_url"

  # Download archive
  if ! download "$download_url" "$temp_file"; then
    warn "Binary release not found for $platform."
    warn "Falling back to npm installation..."
    rm -f "$temp_file"
    install_npm "$version"
    return $?
  fi

  extract_dir=$(mktemp -d "${TMPDIR:-/tmp}/promptfoo-extract.XXXXXXXX")

  # Reject entries that could escape the extraction root, and reject links so
  # later entries cannot write through a link created by the archive.
  if ! tar -tzf "$temp_file" >"$extract_dir/entries"; then
    rm -f "$temp_file"
    rm -rf "$extract_dir"
    error "Downloaded archive is invalid and could not be inspected."
  fi
  while IFS= read -r archive_entry; do
    case "$archive_entry" in
    /* | .. | ../* | */.. | */../*)
      rm -f "$temp_file"
      rm -rf "$extract_dir"
      error "Downloaded archive contains an unsafe path: $archive_entry"
      ;;
    esac
  done <"$extract_dir/entries"
  if ! tar -tvzf "$temp_file" >"$extract_dir/listing"; then
    rm -f "$temp_file"
    rm -rf "$extract_dir"
    error "Downloaded archive is invalid and could not be inspected."
  fi
  if grep -Eq '^[lh]' "$extract_dir/listing"; then
    rm -f "$temp_file"
    rm -rf "$extract_dir"
    error "Downloaded archive contains unsupported link entries."
  fi

  # Extract into an empty staging directory, then copy validated payload files.
  mkdir -p "$extract_dir/payload"
  if ! tar --no-same-owner --no-same-permissions -xzf "$temp_file" -C "$extract_dir/payload"; then
    rm -f "$temp_file"
    rm -rf "$extract_dir"
    error "Downloaded archive could not be extracted safely."
  fi
  if [[ ! -x "$extract_dir/payload/promptfoo" ]]; then
    rm -f "$temp_file"
    rm -rf "$extract_dir"
    error "Downloaded archive does not contain an executable promptfoo binary."
  fi

  # Prepare the complete replacement next to the current install so the final
  # rename stays on one filesystem and stale files cannot survive an upgrade.
  info "Installing to $BIN_DIR"
  mkdir -p "$INSTALL_DIR"
  install_staging=$(mktemp -d "$INSTALL_DIR/.bin-install.XXXXXXXX")
  if ! cp -R "$extract_dir/payload/." "$install_staging/"; then
    rm -f "$temp_file"
    rm -rf "$extract_dir" "$install_staging"
    error "Downloaded archive could not be staged for installation."
  fi
  chmod +x "$install_staging/promptfoo"
  ln -sf "promptfoo" "$install_staging/pf"

  backup_parent=""
  if [[ -e "$BIN_DIR" ]]; then
    backup_parent=$(mktemp -d "$INSTALL_DIR/.bin-backup.XXXXXXXX")
    if ! mv "$BIN_DIR" "$backup_parent/bin"; then
      rm -f "$temp_file"
      rm -rf "$extract_dir" "$install_staging" "$backup_parent"
      error "Existing installation could not be prepared for replacement."
    fi
  fi
  if ! mv "$install_staging" "$BIN_DIR"; then
    if [[ -n "$backup_parent" && -d "$backup_parent/bin" ]]; then
      mv "$backup_parent/bin" "$BIN_DIR" || true
    fi
    rm -f "$temp_file"
    rm -rf "$extract_dir" "$install_staging" "$backup_parent"
    error "New installation could not replace the existing installation."
  fi
  if [[ -n "$backup_parent" ]]; then
    rm -rf "$backup_parent"
  fi

  # Cleanup
  rm -f "$temp_file"
  rm -rf "$extract_dir"

  return 0
}

verify_installation() {
  local verify_dir installed_version
  if ! verify_dir=$(mktemp -d "${TMPDIR:-/tmp}/promptfoo-verify.XXXXXXXX"); then
    return 1
  fi

  if [[ -x "$BIN_DIR/promptfoo" ]] &&
    installed_version=$(
      PROMPTFOO_CONFIG_DIR="$verify_dir/state" \
        PROMPTFOO_CACHE_PATH="$verify_dir/cache" \
        PROMPTFOO_DISABLE_SHARING=true \
        PROMPTFOO_DISABLE_TELEMETRY=true \
        PROMPTFOO_DISABLE_UPDATE=true \
        "$BIN_DIR/promptfoo" --version 2>/dev/null
    ); then
    INSTALLED_VERSION="$installed_version"
    rm -rf "$verify_dir"
    return 0
  fi

  rm -rf "$verify_dir"
  return 1
}

# ─── PATH Setup ──────────────────────────────────────────────────────────────

setup_path() {
  if [[ -n "${PROMPTFOO_NO_MODIFY_PATH:-}" ]]; then
    return 0
  fi

  if [[ -z "${HOME:-}" ]]; then
    warn "HOME is unset; skipping shell PATH modification. Add $BIN_DIR to PATH manually."
    return 0
  fi

  local shell_name rc_file export_line fish_bin_dir
  local path_already_set=false

  shell_name=$(basename "${SHELL:-/bin/bash}")

  case "$shell_name" in
  bash)
    if [[ -f "$HOME/.bashrc" ]]; then
      rc_file="$HOME/.bashrc"
    elif [[ -f "$HOME/.bash_profile" ]]; then
      rc_file="$HOME/.bash_profile"
    else
      rc_file="$HOME/.bashrc"
    fi
    export_line="export PATH=\"$BIN_DIR:\$PATH\""
    ;;
  zsh)
    rc_file="${ZDOTDIR:-$HOME}/.zshrc"
    export_line="export PATH=\"$BIN_DIR:\$PATH\""
    ;;
  fish)
    rc_file="$HOME/.config/fish/config.fish"
    fish_bin_dir=${BIN_DIR//\\/\\\\}
    fish_bin_dir=${fish_bin_dir//\'/\\\'}
    export_line="set -gx PATH '$fish_bin_dir' \$PATH"
    ;;
  *)
    rc_file=""
    export_line="export PATH=\"$BIN_DIR:\$PATH\""
    ;;
  esac

  # Check if already in PATH
  if [[ ":$PATH:" == *":$BIN_DIR:"* ]]; then
    path_already_set=true
  fi

  # Check if export already exists in rc file
  if [[ -n "$rc_file" ]] && [[ -f "$rc_file" ]]; then
    if grep -Fq "promptfoo" "$rc_file" 2>/dev/null || grep -Fq -- "$BIN_DIR" "$rc_file" 2>/dev/null; then
      path_already_set=true
    fi
  fi

  if [[ "$path_already_set" == "false" ]] && [[ -n "$rc_file" ]]; then
    # Create directory if needed (for fish)
    mkdir -p "$(dirname "$rc_file")"

    # Append to rc file
    {
      echo ""
      echo "# Promptfoo"
      echo "$export_line"
    } >>"$rc_file"

    info "Added promptfoo to PATH in $rc_file"
  fi

  # Print instructions
  echo ""
  echo -e "${BOLD}Installation complete!${NC}"
  echo ""

  if [[ "$path_already_set" == "false" ]]; then
    echo "To use promptfoo in this terminal session, run:"
    echo ""
    echo -e "  ${CYAN}export PATH=\"$BIN_DIR:\$PATH\"${NC}"
    echo ""
    echo "Or restart your terminal."
    echo ""
  fi

  echo "Get started:"
  echo ""
  echo -e "  ${CYAN}promptfoo --help${NC}     Show all commands"
  echo -e "  ${CYAN}promptfoo init${NC}       Initialize a new project"
  echo -e "  ${CYAN}promptfoo eval${NC}       Run an evaluation"
  echo ""
  echo -e "Documentation: ${BLUE}https://promptfoo.dev/docs${NC}"
  echo ""
}

# ─── Telemetry ───────────────────────────────────────────────────────────────

send_install_telemetry() {
  # Fire-and-forget telemetry (don't block installation)
  local platform="$1"
  local version="$2"

  if [[ -n "${PROMPTFOO_DISABLE_TELEMETRY:-}" ]]; then
    return 0
  fi

  (
    if command -v curl &>/dev/null; then
      curl -fsSL -X POST "https://r.promptfoo.app/" \
        -H "Content-Type: application/json" \
        -d "{
          \"event\": \"install\",
          \"meta\": {
            \"method\": \"shell\",
            \"platform\": \"$platform\",
            \"version\": \"$version\"
          }
        }" 2>/dev/null || true
    fi
  ) &
}

# ─── Main ────────────────────────────────────────────────────────────────────

main() {
  setup_colors
  parse_args "$@"
  configure_install_directory

  echo ""
  echo -e "${BOLD}${MAGENTA}Promptfoo Installer${NC}"
  echo ""

  # Check prerequisites
  if ! command -v tar &>/dev/null; then
    error "tar is required but not installed."
  fi

  # Detect platform
  local platform
  platform=$(detect_platform)
  info "Detected platform: $platform"

  # Resolve version
  VERSION=$(resolve_version "$VERSION")
  info "Version: $VERSION"

  # Try binary installation first, fall back to npm
  if ! install_binary "$VERSION" "$platform"; then
    error "Installation failed."
  fi

  # Verify installation
  if verify_installation; then
    success "promptfoo v${INSTALLED_VERSION:-unknown} installed successfully"
  else
    warn "Installation completed but verification failed."
    warn "You may need to check your Node.js installation."
  fi

  # Setup PATH
  setup_path

  # Send telemetry
  send_install_telemetry "$platform" "$VERSION"
}

main "$@"
