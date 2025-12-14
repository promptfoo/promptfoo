# `pip install promptfoo` + `curl promptfoo.dev/install.sh | bash`

## Revised Comprehensive Implementation Plan

---

## Executive Summary

This revised plan introduces a **multi-channel distribution strategy** with a bundled Node.js binary as the core artifact:

| Channel | Command | Target Audience |
|---------|---------|-----------------|
| **Shell installer** | `curl -fsSL https://promptfoo.dev/install.sh \| bash` | Quick start, CI/CD |
| **pip** | `pip install promptfoo` | Python developers, ML teams |
| **npm** | `npm install -g promptfoo` | Node.js developers |
| **Docker** | `docker pull ghcr.io/promptfoo/promptfoo` | Containerized environments |
| **Homebrew** | `brew install promptfoo` | macOS users (existing) |

The key insight: **build once, distribute everywhere**. We compile a fully bundled binary with Node.js runtime embedded, then package it differently for each channel.

---

## 1. Architecture: Bundled Binary Approach

### 1.1 Why Bundle Everything

Current state: npm package requires Node.js runtime + `node_modules/` tree (~300MB installed).

Proposed state: Single binary with embedded Node.js runtime (~50-80MB compressed).

**Benefits:**
- No Node.js installation required
- No npm dependency resolution at install time
- Consistent behavior across environments
- Faster cold start (no module resolution)
- Simpler debugging (one artifact)

### 1.2 Bundle Architecture

```
promptfoo (single binary)
├── Node.js runtime (embedded)          ~45MB
├── Bundled JavaScript (esbuild output)  ~8MB
├── better-sqlite3.node (native addon)   ~3MB
├── Python wrappers                      ~50KB
└── Static assets (web UI)               ~5MB
                                        ─────
                                        ~60MB uncompressed
                                        ~20MB compressed
```

### 1.3 The Native Module Challenge

**Problem:** `better-sqlite3` is a native C++ addon (`.node` file). It cannot be embedded in a single executable.

**Solution Options:**

1. **Ship .node file alongside binary** (Recommended for now)
   - Extract at first run to `~/.promptfoo/lib/`
   - Requires prebuild per platform (5-6 builds)
   - Well-tested, production-ready

2. **Use Node.js native SQLite** (Future migration path)
   - Available in Node.js 22+ (experimental), 23.4+ (no flag needed)
   - Eliminates native module entirely
   - Blocked by: Drizzle ORM lacks `node:sqlite` adapter
   - Target: When Node.js 24 becomes LTS (April 2025)

3. **Use sql.js** (Not recommended)
   - WebAssembly-based SQLite
   - 3-5x slower than native
   - Universal but performance cost too high

**Decision:** Ship better-sqlite3 for Phase 1-2. Plan migration to node:sqlite when Drizzle ORM adds adapter and Node.js 24 becomes LTS.

See `docs/agents/native-sqlite-analysis.md` for detailed comparison.

### 1.4 Build Pipeline

```
TypeScript Source → esbuild bundle → Single JS file → Node.js SEA → Platform binaries
                                                                  ↓
better-sqlite3 → prebuildify → .node files per platform ─────────→ Package for distribution
```

---

## 2. Detailed Technical Implementation

### 2.1 esbuild Bundling Configuration

Create `scripts/bundle.ts`:

```typescript
import * as esbuild from 'esbuild';
import { readFileSync } from 'fs';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));

await esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'bundle/promptfoo.mjs',
  minify: true,
  sourcemap: false,

  // Critical: handle native modules
  external: [
    'better-sqlite3',  // Loaded at runtime from extracted .node file
    'sharp',           // Optional, remains external
    'playwright',      // Optional, remains external
    '@swc/core',       // Optional, remains external
  ],

  // Inject version and telemetry key at build time
  define: {
    '__PROMPTFOO_VERSION__': JSON.stringify(packageJson.version),
    '__PROMPTFOO_POSTHOG_KEY__': JSON.stringify(process.env.PROMPTFOO_POSTHOG_KEY || ''),
    '__PROMPTFOO_INSTALL_METHOD__': '"binary"',
  },

  // Bundle the web UI assets
  loader: {
    '.html': 'text',
    '.css': 'text',
  },

  // Handle __dirname/__filename in ESM
  banner: {
    js: `
      import { fileURLToPath } from 'url';
      import { dirname } from 'path';
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
    `,
  },
});
```

### 2.2 Native Module Loader

Create `src/native/loader.ts`:

```typescript
import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';
import { getConfigDirectoryPath } from '../util/config/manage';

// Embedded .node file as base64 (injected at build time)
declare const __BETTER_SQLITE3_NODE__: string;

let nativeModulePath: string | null = null;

export function getBetterSqlite3Path(): string {
  if (nativeModulePath) return nativeModulePath;

  const libDir = join(getConfigDirectoryPath(true), 'lib');
  const nodePath = join(libDir, 'better_sqlite3.node');

  if (!existsSync(nodePath)) {
    mkdirSync(libDir, { recursive: true });
    const buffer = Buffer.from(__BETTER_SQLITE3_NODE__, 'base64');
    writeFileSync(nodePath, buffer);
    chmodSync(nodePath, 0o755);
  }

  nativeModulePath = nodePath;
  return nodePath;
}

export function loadBetterSqlite3() {
  const require = createRequire(import.meta.url);
  const modulePath = getBetterSqlite3Path();
  return require(modulePath);
}
```

### 2.3 Node.js SEA (Single Executable Application)

Create `scripts/build-sea.sh`:

```bash
#!/bin/bash
set -euo pipefail

VERSION="${1:-$(node -p "require('./package.json').version")}"
PLATFORMS=("darwin-x64" "darwin-arm64" "linux-x64" "linux-arm64" "win-x64")

# Build the bundled JS first
npm run bundle

for platform in "${PLATFORMS[@]}"; do
  echo "Building for $platform..."

  os="${platform%-*}"
  arch="${platform#*-}"

  # Map to Node.js platform names
  case "$os" in
    darwin) node_os="darwin" ;;
    linux)  node_os="linux" ;;
    win)    node_os="win32" ;;
  esac

  # Download Node.js for target platform
  node_version="v20.18.0"

  # Create SEA config
  cat > sea-config.json << EOF
{
  "main": "bundle/promptfoo.mjs",
  "output": "bundle/sea-prep.blob",
  "disableExperimentalSEAWarning": true,
  "useCodeCache": true
}
EOF

  # Generate SEA blob
  node --experimental-sea-config sea-config.json

  # Copy Node binary and inject blob
  cp "node-${node_version}-${node_os}-${arch}/bin/node" "dist/promptfoo-${platform}"

  # Inject the blob (platform-specific)
  case "$os" in
    darwin)
      npx postject "dist/promptfoo-${platform}" NODE_SEA_BLOB bundle/sea-prep.blob \
        --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
        --macho-segment-name NODE_SEA
      codesign --sign - "dist/promptfoo-${platform}"
      ;;
    linux)
      npx postject "dist/promptfoo-${platform}" NODE_SEA_BLOB bundle/sea-prep.blob \
        --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
      ;;
    win)
      npx postject "dist/promptfoo-${platform}.exe" NODE_SEA_BLOB bundle/sea-prep.blob \
        --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
      ;;
  esac

  echo "✓ Built dist/promptfoo-${platform}"
done
```

### 2.4 Pre-compiled Native Modules

Use `prebuildify` to compile `better-sqlite3` for all platforms:

```bash
# In CI, run on each platform:
npx prebuildify \
  --napi \
  --platform linux \
  --arch x64 \
  --strip \
  --out prebuilds/

# Produces: prebuilds/linux-x64/better_sqlite3.node
```

**Platform matrix:**

| Platform | Node.js | Output |
|----------|---------|--------|
| linux-x64 | 20.x | `better_sqlite3.node` |
| linux-arm64 | 20.x | `better_sqlite3.node` |
| darwin-x64 | 20.x | `better_sqlite3.node` |
| darwin-arm64 | 20.x | `better_sqlite3.node` |
| win32-x64 | 20.x | `better_sqlite3.node` |

---

## 3. install.sh Implementation

### 3.1 Script Design

Create `scripts/install.sh`:

```bash
#!/bin/bash
# Promptfoo installation script
# Usage: curl -fsSL https://promptfoo.dev/install.sh | bash
#    or: curl -fsSL https://promptfoo.dev/install.sh | bash -s -- v0.120.0

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────

INSTALL_DIR="${PROMPTFOO_INSTALL_DIR:-$HOME/.promptfoo}"
BIN_DIR="$INSTALL_DIR/bin"
VERSION="${1:-latest}"

GITHUB_REPO="https://github.com/promptfoo/promptfoo"
RELEASES_URL="$GITHUB_REPO/releases"

# ─── Colors (only if TTY) ────────────────────────────────────────────────────

if [[ -t 1 ]]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  BLUE='\033[0;34m'
  BOLD='\033[1m'
  NC='\033[0m'
else
  RED='' GREEN='' YELLOW='' BLUE='' BOLD='' NC=''
fi

# ─── Helpers ─────────────────────────────────────────────────────────────────

info() { echo -e "${BLUE}info${NC}: $*"; }
warn() { echo -e "${YELLOW}warn${NC}: $*" >&2; }
error() { echo -e "${RED}error${NC}: $*" >&2; exit 1; }
success() { echo -e "${GREEN}✓${NC} $*"; }

# ─── Platform Detection ──────────────────────────────────────────────────────

detect_platform() {
  local os arch

  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin)  os="darwin" ;;
    Linux)   os="linux" ;;
    MINGW*|MSYS*|CYGWIN*)
      error "Windows detected. Please use PowerShell:\n  irm https://promptfoo.dev/install.ps1 | iex"
      ;;
    *) error "Unsupported operating system: $os" ;;
  esac

  case "$arch" in
    x86_64|amd64)  arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *) error "Unsupported architecture: $arch" ;;
  esac

  # Detect Rosetta 2 (macOS)
  if [[ "$os" == "darwin" && "$arch" == "x64" ]]; then
    if [[ "$(sysctl -n sysctl.proc_translated 2>/dev/null)" == "1" ]]; then
      info "Rosetta 2 detected, installing native arm64 binary"
      arch="arm64"
    fi
  fi

  # Detect musl (Alpine Linux)
  if [[ "$os" == "linux" ]]; then
    if ldd --version 2>&1 | grep -q musl; then
      os="linux-musl"
    fi
  fi

  echo "${os}-${arch}"
}

# ─── Version Resolution ──────────────────────────────────────────────────────

resolve_version() {
  local version="$1"

  if [[ "$version" == "latest" ]]; then
    version=$(curl -fsSL "https://api.github.com/repos/promptfoo/promptfoo/releases/latest" \
      | grep '"tag_name"' \
      | cut -d'"' -f4)

    if [[ -z "$version" ]]; then
      error "Failed to fetch latest version"
    fi
  fi

  echo "${version#v}"
}

# ─── Installation ────────────────────────────────────────────────────────────

install() {
  local platform version download_url archive_name

  platform=$(detect_platform)
  version=$(resolve_version "$VERSION")

  info "Installing promptfoo v$version for $platform"

  archive_name="promptfoo-${version}-${platform}.tar.gz"
  download_url="${RELEASES_URL}/download/${version}/${archive_name}"

  mkdir -p "$BIN_DIR"

  info "Downloading from $download_url"

  if ! curl --fail --location --progress-bar --output "/tmp/$archive_name" "$download_url"; then
    error "Failed to download promptfoo. Check that version '$version' exists."
  fi

  info "Extracting to $BIN_DIR"
  tar -xzf "/tmp/$archive_name" -C "$BIN_DIR"
  chmod +x "$BIN_DIR/promptfoo"

  rm -f "/tmp/$archive_name"

  if "$BIN_DIR/promptfoo" --version > /dev/null 2>&1; then
    success "promptfoo v$version installed successfully"
  else
    error "Installation verification failed"
  fi
}

# ─── PATH Setup ──────────────────────────────────────────────────────────────

setup_path() {
  local shell_name rc_file export_line

  shell_name=$(basename "$SHELL")
  export_line="export PATH=\"$BIN_DIR:\$PATH\""

  case "$shell_name" in
    bash)
      if [[ -f "$HOME/.bashrc" ]]; then
        rc_file="$HOME/.bashrc"
      elif [[ -f "$HOME/.bash_profile" ]]; then
        rc_file="$HOME/.bash_profile"
      else
        rc_file="$HOME/.bashrc"
      fi
      ;;
    zsh)
      rc_file="$HOME/.zshrc"
      ;;
    fish)
      rc_file="$HOME/.config/fish/config.fish"
      export_line="set -gx PATH $BIN_DIR \$PATH"
      ;;
    *)
      rc_file=""
      ;;
  esac

  if [[ ":$PATH:" == *":$BIN_DIR:"* ]]; then
    return 0
  fi

  if [[ -n "$rc_file" ]]; then
    if ! grep -q "promptfoo" "$rc_file" 2>/dev/null; then
      echo "" >> "$rc_file"
      echo "# Promptfoo" >> "$rc_file"
      echo "$export_line" >> "$rc_file"
      info "Added promptfoo to PATH in $rc_file"
    fi
  fi

  echo ""
  echo -e "${BOLD}To get started:${NC}"
  echo ""

  if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    echo "  # Add to your current session:"
    echo "  export PATH=\"$BIN_DIR:\$PATH\""
    echo ""
  fi

  echo "  # Verify installation:"
  echo "  promptfoo --version"
  echo ""
  echo "  # Quick start:"
  echo "  promptfoo init"
  echo ""
}

# ─── Telemetry ───────────────────────────────────────────────────────────────

send_install_telemetry() {
  (
    curl -fsSL -X POST "https://r.promptfoo.app/" \
      -H "Content-Type: application/json" \
      -d "{
        \"event\": \"install\",
        \"meta\": {
          \"method\": \"shell\",
          \"platform\": \"$(detect_platform)\",
          \"version\": \"$VERSION\"
        }
      }" 2>/dev/null || true
  ) &
}

# ─── Main ────────────────────────────────────────────────────────────────────

main() {
  echo ""
  echo -e "${BOLD}Promptfoo Installer${NC}"
  echo ""

  if ! command -v curl &> /dev/null; then
    error "curl is required but not installed"
  fi

  if ! command -v tar &> /dev/null; then
    error "tar is required but not installed"
  fi

  install
  setup_path
  send_install_telemetry
}

main
```

### 3.2 PowerShell Installer for Windows

Create `scripts/install.ps1`:

```powershell
# Promptfoo installation script for Windows
# Usage: irm https://promptfoo.dev/install.ps1 | iex

$ErrorActionPreference = "Stop"

$InstallDir = if ($env:PROMPTFOO_INSTALL_DIR) { $env:PROMPTFOO_INSTALL_DIR } else { "$HOME\.promptfoo" }
$BinDir = "$InstallDir\bin"
$Version = if ($args[0]) { $args[0] } else { "latest" }

$GithubRepo = "https://github.com/promptfoo/promptfoo"

function Write-Info { Write-Host "info: " -ForegroundColor Blue -NoNewline; Write-Host $args }
function Write-Error { Write-Host "error: " -ForegroundColor Red -NoNewline; Write-Host $args; exit 1 }
function Write-Success { Write-Host "✓ " -ForegroundColor Green -NoNewline; Write-Host $args }

if ($Version -eq "latest") {
    $Release = Invoke-RestMethod "$GithubRepo/releases/latest" -Headers @{"Accept"="application/json"}
    $Version = $Release.tag_name -replace '^v', ''
}

$Platform = "win-x64"
$ArchiveName = "promptfoo-$Version-$Platform.zip"
$DownloadUrl = "$GithubRepo/releases/download/$Version/$ArchiveName"

Write-Info "Installing promptfoo v$Version for $Platform"

New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

Write-Info "Downloading from $DownloadUrl"
$TempFile = "$env:TEMP\$ArchiveName"
Invoke-WebRequest -Uri $DownloadUrl -OutFile $TempFile

Write-Info "Extracting to $BinDir"
Expand-Archive -Path $TempFile -DestinationPath $BinDir -Force

Remove-Item $TempFile

$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$BinDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$BinDir;$UserPath", "User")
    Write-Info "Added $BinDir to PATH"
}

Write-Success "promptfoo v$Version installed successfully"
Write-Host ""
Write-Host "Restart your terminal, then run: promptfoo --version"
```

---

## 4. pip Distribution

### 4.1 Package Structure

```
python/
├── pyproject.toml
├── src/
│   └── promptfoo/
│       ├── __init__.py
│       ├── __main__.py
│       ├── cli.py
│       └── _bin/
│           ├── promptfoo
│           └── better_sqlite3.node
└── tests/
```

### 4.2 CLI Wrapper

```python
# src/promptfoo/cli.py
"""Thin wrapper that delegates to the bundled binary."""
import os
import sys
import subprocess
from pathlib import Path

def get_binary_path() -> Path:
    """Get path to the bundled promptfoo binary."""
    pkg_dir = Path(__file__).parent

    if sys.platform == 'win32':
        binary = pkg_dir / '_bin' / 'promptfoo.exe'
    else:
        binary = pkg_dir / '_bin' / 'promptfoo'

    if not binary.exists():
        raise RuntimeError(f"Bundled binary not found at {binary}")

    return binary

def main() -> int:
    """Run promptfoo CLI."""
    binary = get_binary_path()

    env = os.environ.copy()
    env['PROMPTFOO_INSTALL_METHOD'] = 'pip'

    lib_dir = Path.home() / '.promptfoo' / 'lib'
    native_module = Path(__file__).parent / '_bin' / 'better_sqlite3.node'

    if native_module.exists() and not (lib_dir / 'better_sqlite3.node').exists():
        lib_dir.mkdir(parents=True, exist_ok=True)
        import shutil
        shutil.copy(native_module, lib_dir / 'better_sqlite3.node')

    result = subprocess.run(
        [str(binary)] + sys.argv[1:],
        env=env,
        cwd=os.getcwd(),
    )
    return result.returncode

if __name__ == '__main__':
    sys.exit(main())
```

### 4.3 pyproject.toml

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "promptfoo"
version = "0.120.4"
description = "LLM eval & testing toolkit"
requires-python = ">=3.8"
license = "MIT"
authors = [{ name = "Promptfoo", email = "team@promptfoo.dev" }]
classifiers = [
    "Development Status :: 4 - Beta",
    "Environment :: Console",
    "Intended Audience :: Developers",
    "License :: OSI Approved :: MIT License",
    "Operating System :: OS Independent",
    "Programming Language :: Python :: 3",
    "Topic :: Software Development :: Testing",
]

[project.scripts]
promptfoo = "promptfoo.cli:main"
pf = "promptfoo.cli:main"

[project.urls]
Homepage = "https://promptfoo.dev"
Documentation = "https://promptfoo.dev/docs"
Repository = "https://github.com/promptfoo/promptfoo"

[tool.hatch.build.targets.wheel]
packages = ["src/promptfoo"]
```

---

## 5. GitHub Actions Workflows

### 5.1 Build Binaries Workflow

```yaml
# .github/workflows/build-binaries.yml
name: Build Platform Binaries

on:
  push:
    tags: ['*']
  workflow_dispatch:

jobs:
  build-native-modules:
    strategy:
      matrix:
        include:
          - os: ubuntu-latest
            platform: linux-x64
          - os: ubuntu-24.04-arm
            platform: linux-arm64
          - os: macos-13
            platform: darwin-x64
          - os: macos-14
            platform: darwin-arm64
          - os: windows-latest
            platform: win-x64
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v5

      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'

      - name: Build better-sqlite3
        run: |
          npm install better-sqlite3
          npx prebuildify --napi --strip

      - uses: actions/upload-artifact@v4
        with:
          name: native-${{ matrix.platform }}
          path: prebuilds/

  build-bundles:
    needs: build-native-modules
    strategy:
      matrix:
        include:
          - os: ubuntu-latest
            platform: linux-x64
          - os: ubuntu-24.04-arm
            platform: linux-arm64
          - os: macos-13
            platform: darwin-x64
          - os: macos-14
            platform: darwin-arm64
          - os: windows-latest
            platform: win-x64
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v5

      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'

      - uses: actions/download-artifact@v4
        with:
          name: native-${{ matrix.platform }}
          path: prebuilds/

      - name: Install dependencies
        run: npm ci

      - name: Bundle with esbuild
        run: npm run bundle
        env:
          PROMPTFOO_POSTHOG_KEY: ${{ secrets.PROMPTFOO_POSTHOG_KEY }}

      - name: Build SEA binary
        run: npm run build:sea -- ${{ matrix.platform }}

      - name: Package
        run: |
          mkdir -p dist
          tar -czvf dist/promptfoo-${{ github.ref_name }}-${{ matrix.platform }}.tar.gz \
            -C bundle promptfoo better_sqlite3.node

      - uses: actions/upload-artifact@v4
        with:
          name: binary-${{ matrix.platform }}
          path: dist/*.tar.gz

  create-release:
    needs: build-bundles
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          pattern: binary-*
          path: dist/
          merge-multiple: true

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          files: dist/*
          generate_release_notes: true

  build-python-wheels:
    needs: build-bundles
    strategy:
      matrix:
        include:
          - os: ubuntu-latest
            platform: manylinux_2_17_x86_64
            binary: linux-x64
          - os: ubuntu-24.04-arm
            platform: manylinux_2_17_aarch64
            binary: linux-arm64
          - os: macos-13
            platform: macosx_10_15_x86_64
            binary: darwin-x64
          - os: macos-14
            platform: macosx_11_0_arm64
            binary: darwin-arm64
          - os: windows-latest
            platform: win_amd64
            binary: win-x64
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v5

      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - uses: actions/download-artifact@v4
        with:
          name: binary-${{ matrix.binary }}
          path: python/src/promptfoo/_bin/

      - name: Extract binary
        run: |
          cd python/src/promptfoo/_bin
          tar -xzf *.tar.gz
          rm *.tar.gz

      - name: Build wheel
        run: |
          pip install build
          python -m build --wheel python/

      - uses: actions/upload-artifact@v4
        with:
          name: wheel-${{ matrix.platform }}
          path: python/dist/*.whl

  publish-pypi:
    needs: build-python-wheels
    runs-on: ubuntu-latest
    environment: pypi
    permissions:
      id-token: write
    steps:
      - uses: actions/download-artifact@v4
        with:
          pattern: wheel-*
          path: dist/
          merge-multiple: true

      - uses: pypa/gh-action-pypi-publish@release/v1
        with:
          packages-dir: dist/
```

---

## 6. Telemetry Strategy

### 6.1 Installation Method Tracking

Modify `src/telemetry.ts`:

```typescript
type InstallMethod = 'npm' | 'pip' | 'shell' | 'docker' | 'homebrew' | 'unknown';

function getInstallMethod(): InstallMethod {
  const method = getEnvString('PROMPTFOO_INSTALL_METHOD', '');
  if (method) return method as InstallMethod;

  if (process.env.npm_execpath) return 'npm';
  if (process.env.VIRTUAL_ENV) return 'pip';
  if (existsSync('/.dockerenv')) return 'docker';

  const execPath = process.execPath;
  if (execPath.includes('.promptfoo/bin')) return 'shell';
  if (execPath.includes('Homebrew') || execPath.includes('homebrew')) return 'homebrew';

  return 'unknown';
}
```

### 6.2 New Telemetry Events

```typescript
event: z.enum([
  // ... existing events
  'install',
  'first_run',
  'upgrade',
])
```

---

## 7. Documentation Plan

### 7.1 New Pages

| Page | Path | Content |
|------|------|---------|
| Installation Overview | `/docs/installation/` | All methods with tabs |
| Shell Install | `/docs/installation/shell` | curl/PowerShell details |
| Python/pip | `/docs/installation/python` | pip-specific notes |
| Known Limitations | `/docs/installation/limitations` | What doesn't work |

### 7.2 Known Limitations

```markdown
# Known Limitations

## Shell/pip Installation

### Not Supported
- **JavaScript/TypeScript custom providers** - Use Python providers instead
- **Hot reload in `promptfoo view`** - Static server only

### Platform-Specific

| Platform | Limitation |
|----------|------------|
| Windows ARM | Not supported yet |
| Linux musl (Alpine) | Experimental |
| macOS < 10.15 | Not supported |

## Workarounds

For full functionality including JS/TS providers, use npm:
npm install -g promptfoo
```

---

## 8. QA Strategy

### 8.1 Test Matrix

| Test | Trigger | Platforms | Duration |
|------|---------|-----------|----------|
| Unit tests | Every PR | Linux | 2 min |
| Binary smoke test | Every PR | All | 5 min |
| Integration test | Daily | Linux, macOS | 15 min |
| E2E with providers | Weekly | Linux | 30 min |
| Release validation | On release | All | 10 min |

### 8.2 Smoke Test Script

```bash
#!/bin/bash
# test/smoke/run.sh

set -euo pipefail

echo "=== Smoke Test Suite ==="

echo "Test: --version"
promptfoo --version || exit 1

echo "Test: --help"
promptfoo --help || exit 1

echo "Test: init --yes"
cd "$(mktemp -d)"
promptfoo init --yes || exit 1
[ -f "promptfooconfig.yaml" ] || exit 1

echo "Test: eval with echo provider"
cat > promptfooconfig.yaml << 'EOF'
prompts:
  - "Hello {{name}}"
providers:
  - id: echo
tests:
  - vars:
      name: World
    assert:
      - type: contains
        value: World
EOF
promptfoo eval --no-cache || exit 1

echo "Test: database access"
promptfoo list || exit 1

echo "=== All smoke tests passed ==="
```

---

## 9. Crawl → Walk → Run Timeline

### Phase 1: CRAWL (Foundation)

**Goal:** Basic install.sh working on macOS and Linux

**Deliverables:**
- [ ] esbuild bundle configuration
- [ ] better-sqlite3 prebuilds for 4 platforms
- [ ] Node.js SEA build script
- [ ] install.sh script (macOS/Linux)
- [ ] GitHub Action for binary builds
- [ ] Smoke test suite
- [ ] Manual release to GitHub Releases

**Exit Criteria:** `curl promptfoo.dev/install.sh | bash && promptfoo eval` works

### Phase 2: WALK (Production)

**Goal:** Full platform support, pip distribution, automated releases

**Deliverables:**
- [ ] Windows support (PowerShell installer, exe binary)
- [ ] pip package with platform wheels
- [ ] Automated release pipeline (GitHub → npm + PyPI + binaries)
- [ ] Telemetry for install method
- [ ] Documentation on promptfoo.dev
- [ ] Integration tests

**Exit Criteria:** All installation methods work end-to-end automatically

### Phase 3: RUN (Polish)

**Goal:** First-class experience, size optimization, ecosystem integration

**Deliverables:**
- [ ] Linux musl (Alpine) support
- [ ] Bundle size reduction (<15MB compressed)
- [ ] Lazy loading for faster cold start
- [ ] Python SDK (`from promptfoo import evaluate`)
- [ ] Native SQLite migration (Node.js 24+)

---

## 10. Open Questions

1. **Node.js version for SEA:** Pin to 20.x LTS, or use 22.x for native SQLite?

2. **install.sh hosting:** GitHub Pages vs Cloudflare for `promptfoo.dev/install.sh`?

3. **PyPI package name:** Is `promptfoo` available, or do we need `promptfoo-cli`?

4. **Binary signing:** Code signing for macOS (notarization) and Windows (Authenticode)?

5. **Native SQLite:** When to migrate from better-sqlite3 to Node.js native? See `docs/agents/native-sqlite-analysis.md`

---

## Summary

| Distribution | Package Size | Cold Start | Dependencies |
|--------------|--------------|------------|--------------|
| npm (current) | ~300MB installed | ~2s | Node.js required |
| **Shell binary** | ~20MB download | ~0.5s | None |
| **pip wheel** | ~25MB download | ~0.5s | Python (wrapper only) |
| Docker | ~500MB image | ~1s | Docker |
| Homebrew | ~300MB | ~2s | Node.js (via brew) |

The bundled binary approach significantly improves the installation experience while maintaining full functionality.
