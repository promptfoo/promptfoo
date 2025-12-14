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
#
# Requirements:
#   - curl or wget
#   - tar (for extracting archives)
#   - Node.js 20+ (for now, until SEA binaries are available)

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────

readonly GITHUB_REPO="promptfoo/promptfoo"
readonly GITHUB_API="https://api.github.com/repos/${GITHUB_REPO}"
readonly GITHUB_RELEASES="https://github.com/${GITHUB_REPO}/releases"

INSTALL_DIR="${PROMPTFOO_INSTALL_DIR:-$HOME/.promptfoo}"
BIN_DIR="$INSTALL_DIR/bin"
VERSION="${PROMPTFOO_VERSION:-${1:-latest}}"

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
  cat << EOF
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
      -h|--help)
        show_help
        ;;
      -d|--dir)
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

# ─── Platform Detection ──────────────────────────────────────────────────────

detect_platform() {
  local os arch

  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin)
      os="darwin"
      ;;
    Linux)
      os="linux"
      # Check for musl (Alpine, etc.)
      if ldd --version 2>&1 | grep -q musl; then
        os="linux-musl"
      fi
      ;;
    MINGW*|MSYS*|CYGWIN*)
      error "Windows detected. Please use PowerShell:\n  irm https://promptfoo.dev/install.ps1 | iex"
      ;;
    *)
      error "Unsupported operating system: $os"
      ;;
  esac

  case "$arch" in
    x86_64|amd64)
      arch="x64"
      ;;
    arm64|aarch64)
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
      info "Rosetta 2 detected, installing native arm64 binary"
      arch="arm64"
    fi
  fi

  echo "${os}-${arch}"
}

# ─── Version Resolution ──────────────────────────────────────────────────────

resolve_version() {
  local version="$1"

  if [[ "$version" == "latest" ]]; then
    info "Fetching latest version..."

    # Try to get latest release from GitHub API
    if command -v curl &> /dev/null; then
      version=$(curl -fsSL "${GITHUB_API}/releases/latest" 2>/dev/null | grep '"tag_name"' | cut -d'"' -f4 || true)
    elif command -v wget &> /dev/null; then
      version=$(wget -qO- "${GITHUB_API}/releases/latest" 2>/dev/null | grep '"tag_name"' | cut -d'"' -f4 || true)
    fi

    if [[ -z "$version" ]]; then
      error "Failed to fetch latest version from GitHub.\nPlease specify a version manually."
    fi
  fi

  # Strip 'v' prefix if present
  version="${version#v}"

  echo "$version"
}

# ─── Download Helpers ────────────────────────────────────────────────────────

download() {
  local url="$1"
  local output="$2"

  if command -v curl &> /dev/null; then
    curl --fail --location --progress-bar --output "$output" "$url"
  elif command -v wget &> /dev/null; then
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

  # For now, we install via npm since SEA binaries aren't ready yet
  # This requires Node.js to be installed
  if ! command -v node &> /dev/null; then
    error "Node.js is required but not installed.\nPlease install Node.js 20+ from https://nodejs.org"
  fi

  local node_version
  node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
  if [[ "$node_version" -lt 20 ]]; then
    error "Node.js 20+ is required but found version $(node --version).\nPlease upgrade Node.js."
  fi

  # Install promptfoo globally in the install directory
  npm install -g promptfoo@"$version" --prefix "$INSTALL_DIR"

  # Create symlinks in bin directory
  if [[ -f "$INSTALL_DIR/lib/node_modules/promptfoo/dist/src/main.js" ]]; then
    ln -sf "$INSTALL_DIR/lib/node_modules/promptfoo/dist/src/main.js" "$BIN_DIR/promptfoo"
    chmod +x "$BIN_DIR/promptfoo"

    # Also create 'pf' alias
    ln -sf "$INSTALL_DIR/lib/node_modules/promptfoo/dist/src/main.js" "$BIN_DIR/pf"
    chmod +x "$BIN_DIR/pf"
  fi

  return 0
}

install_binary() {
  local version="$1"
  local platform="$2"
  local archive_name download_url temp_file

  archive_name="promptfoo-${version}-${platform}.tar.gz"
  download_url="${GITHUB_RELEASES}/download/${version}/${archive_name}"
  temp_file="/tmp/${archive_name}"

  info "Installing promptfoo v$version for $platform..."
  info "Downloading from $download_url"

  # Create installation directory
  mkdir -p "$BIN_DIR"

  # Download archive
  if ! download "$download_url" "$temp_file"; then
    warn "Binary release not found for $platform."
    warn "Falling back to npm installation..."
    rm -f "$temp_file"
    install_npm "$version"
    return $?
  fi

  # Extract archive
  info "Extracting to $BIN_DIR"
  tar -xzf "$temp_file" -C "$BIN_DIR"
  chmod +x "$BIN_DIR/promptfoo"

  # Create 'pf' alias
  ln -sf "$BIN_DIR/promptfoo" "$BIN_DIR/pf"

  # Cleanup
  rm -f "$temp_file"

  return 0
}

verify_installation() {
  if [[ -x "$BIN_DIR/promptfoo" ]]; then
    # Try to run version check
    if "$BIN_DIR/promptfoo" --version &> /dev/null; then
      return 0
    fi
  fi
  return 1
}

# ─── PATH Setup ──────────────────────────────────────────────────────────────

setup_path() {
  if [[ -n "${PROMPTFOO_NO_MODIFY_PATH:-}" ]]; then
    return 0
  fi

  local shell_name rc_file export_line
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
      export_line="set -gx PATH $BIN_DIR \$PATH"
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
    if grep -q "promptfoo" "$rc_file" 2>/dev/null || grep -q "$BIN_DIR" "$rc_file" 2>/dev/null; then
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
    } >> "$rc_file"

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

  (
    if command -v curl &> /dev/null; then
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

  echo ""
  echo -e "${BOLD}${MAGENTA}Promptfoo Installer${NC}"
  echo ""

  # Check prerequisites
  if ! command -v tar &> /dev/null; then
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
    local installed_version
    installed_version=$("$BIN_DIR/promptfoo" --version 2>/dev/null || echo "unknown")
    success "promptfoo v$installed_version installed successfully"
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
