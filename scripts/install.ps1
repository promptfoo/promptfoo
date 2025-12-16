# Promptfoo installation script for Windows
#
# Usage:
#   irm https://promptfoo.dev/install.ps1 | iex
#   irm https://promptfoo.dev/install.ps1 | iex; Install-Promptfoo -Version 0.120.0
#   irm https://promptfoo.dev/install.ps1 | iex; Install-Promptfoo -Help
#
# Environment variables:
#   PROMPTFOO_INSTALL_DIR  - Installation directory (default: %LOCALAPPDATA%\promptfoo)
#   PROMPTFOO_VERSION      - Version to install (default: latest)
#   PROMPTFOO_NO_MODIFY_PATH - Skip PATH modification if set
#
# Requirements:
#   - PowerShell 5.1+ or PowerShell Core 7+
#   - Node.js 20+ (for now, until SEA binaries are available)

#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# ─── Configuration ───────────────────────────────────────────────────────────

$script:GitHubRepo = "promptfoo/promptfoo"
$script:GitHubApi = "https://api.github.com/repos/$script:GitHubRepo"
$script:GitHubReleases = "https://github.com/$script:GitHubRepo/releases"

# ─── Logging ─────────────────────────────────────────────────────────────────

function Write-Info {
    param([string]$Message)
    Write-Host "info  " -ForegroundColor Blue -NoNewline
    Write-Host $Message
}

function Write-Warn {
    param([string]$Message)
    Write-Host "warn  " -ForegroundColor Yellow -NoNewline
    Write-Host $Message
}

function Write-Error {
    param([string]$Message)
    Write-Host "error " -ForegroundColor Red -NoNewline
    Write-Host $Message
    throw $Message
}

function Write-Success {
    param([string]$Message)
    Write-Host "✓ " -ForegroundColor Green -NoNewline
    Write-Host $Message
}

# ─── Platform Detection ──────────────────────────────────────────────────────

function Get-Platform {
    $arch = if ([Environment]::Is64BitOperatingSystem) {
        if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or
            [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq 'Arm64') {
            'arm64'
        } else {
            'x64'
        }
    } else {
        throw "32-bit systems are not supported"
    }

    return "win32-$arch"
}

# ─── Version Resolution ──────────────────────────────────────────────────────

function Get-LatestVersion {
    Write-Info "Fetching latest version..."

    try {
        $response = Invoke-RestMethod -Uri "$script:GitHubApi/releases/latest" -Headers @{
            'Accept' = 'application/vnd.github.v3+json'
            'User-Agent' = 'promptfoo-installer'
        }
        return $response.tag_name -replace '^v', ''
    } catch {
        throw "Failed to fetch latest version from GitHub: $_"
    }
}

function Resolve-Version {
    param([string]$Version)

    if ($Version -eq 'latest' -or [string]::IsNullOrEmpty($Version)) {
        return Get-LatestVersion
    }

    # Strip 'v' prefix if present
    return $Version -replace '^v', ''
}

# ─── Installation ────────────────────────────────────────────────────────────

function Install-PromptfooNpm {
    param(
        [string]$Version,
        [string]$InstallDir
    )

    Write-Info "Installing promptfoo v$Version via npm..."

    # Check for Node.js
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) {
        throw "Node.js is required but not installed.`nPlease install Node.js 20+ from https://nodejs.org"
    }

    $nodeVersion = (node --version) -replace '^v', '' -split '\.' | Select-Object -First 1
    if ([int]$nodeVersion -lt 20) {
        throw "Node.js 20+ is required but found version $(node --version).`nPlease upgrade Node.js."
    }

    # Create installation directory
    $binDir = Join-Path $InstallDir "bin"
    New-Item -ItemType Directory -Path $binDir -Force | Out-Null

    # Install via npm
    & npm install -g "promptfoo@$Version" --prefix $InstallDir 2>&1 | ForEach-Object { Write-Host $_ }

    if ($LASTEXITCODE -ne 0) {
        throw "npm install failed"
    }

    # Create batch file wrapper in bin directory
    $mainJs = Join-Path $InstallDir "node_modules" "promptfoo" "dist" "src" "main.js"
    if (-not (Test-Path $mainJs)) {
        # Try lib path (npm global install structure)
        $mainJs = Join-Path $InstallDir "lib" "node_modules" "promptfoo" "dist" "src" "main.js"
    }

    if (Test-Path $mainJs) {
        $batContent = "@echo off`nnode `"$mainJs`" %*"
        Set-Content -Path (Join-Path $binDir "promptfoo.cmd") -Value $batContent -Encoding ASCII
        Set-Content -Path (Join-Path $binDir "pf.cmd") -Value $batContent -Encoding ASCII
    }

    return $true
}

function Install-PromptfooBinary {
    param(
        [string]$Version,
        [string]$Platform,
        [string]$InstallDir
    )

    $archiveName = "promptfoo-$Version-$Platform.zip"
    $downloadUrl = "$script:GitHubReleases/download/v$Version/$archiveName"
    $tempFile = Join-Path $env:TEMP $archiveName
    $binDir = Join-Path $InstallDir "bin"

    Write-Info "Installing promptfoo v$Version for $Platform..."
    Write-Info "Downloading from $downloadUrl"

    # Create installation directory
    New-Item -ItemType Directory -Path $binDir -Force | Out-Null

    try {
        # Download archive
        Invoke-WebRequest -Uri $downloadUrl -OutFile $tempFile -UseBasicParsing
    } catch {
        Write-Warn "Binary release not found for $Platform."
        Write-Warn "Falling back to npm installation..."
        Remove-Item -Path $tempFile -ErrorAction SilentlyContinue
        return Install-PromptfooNpm -Version $Version -InstallDir $InstallDir
    }

    # Extract archive
    Write-Info "Extracting to $binDir"
    Expand-Archive -Path $tempFile -DestinationPath $binDir -Force

    # Create pf alias
    $promptfooExe = Join-Path $binDir "promptfoo.exe"
    if (Test-Path $promptfooExe) {
        Copy-Item -Path $promptfooExe -Destination (Join-Path $binDir "pf.exe") -Force
    }

    # Cleanup
    Remove-Item -Path $tempFile -Force

    return $true
}

function Test-Installation {
    param([string]$BinDir)

    $promptfooCmd = Join-Path $BinDir "promptfoo.cmd"
    $promptfooExe = Join-Path $BinDir "promptfoo.exe"

    if ((Test-Path $promptfooCmd) -or (Test-Path $promptfooExe)) {
        try {
            if (Test-Path $promptfooExe) {
                $output = & $promptfooExe --version 2>&1
            } else {
                $output = & cmd /c $promptfooCmd --version 2>&1
            }
            return $true
        } catch {
            return $false
        }
    }
    return $false
}

# ─── PATH Setup ──────────────────────────────────────────────────────────────

function Add-ToPath {
    param(
        [string]$BinDir,
        [switch]$NoModifyPath
    )

    if ($NoModifyPath -or $env:PROMPTFOO_NO_MODIFY_PATH) {
        return
    }

    # Get current user PATH
    $currentPath = [Environment]::GetEnvironmentVariable('Path', 'User')

    # Check if already in PATH
    if ($currentPath -split ';' | Where-Object { $_ -eq $BinDir }) {
        return
    }

    # Add to user PATH
    $newPath = "$BinDir;$currentPath"
    [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')

    # Also update current session
    $env:Path = "$BinDir;$env:Path"

    Write-Info "Added promptfoo to PATH"
}

# ─── Telemetry ───────────────────────────────────────────────────────────────

function Send-InstallTelemetry {
    param(
        [string]$Platform,
        [string]$Version
    )

    # Fire-and-forget telemetry
    try {
        $body = @{
            event = 'install'
            meta = @{
                method = 'powershell'
                platform = $Platform
                version = $Version
            }
        } | ConvertTo-Json -Compress

        $null = Start-Job -ScriptBlock {
            param($body)
            try {
                Invoke-RestMethod -Uri 'https://r.promptfoo.app/' -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 5
            } catch {}
        } -ArgumentList $body
    } catch {}
}

# ─── Main ────────────────────────────────────────────────────────────────────

function Install-Promptfoo {
    [CmdletBinding()]
    param(
        [Parameter(Position = 0)]
        [string]$Version = 'latest',

        [string]$InstallDir,

        [switch]$NoModifyPath,

        [switch]$Help
    )

    if ($Help) {
        Write-Host @"

Promptfoo Installer for Windows

USAGE
    irm https://promptfoo.dev/install.ps1 | iex
    irm https://promptfoo.dev/install.ps1 | iex; Install-Promptfoo [OPTIONS] [VERSION]

OPTIONS
    -Version VERSION    Version to install (default: latest)
    -InstallDir DIR     Installation directory (default: %LOCALAPPDATA%\promptfoo)
    -NoModifyPath       Don't modify PATH
    -Help               Show this help message

ENVIRONMENT VARIABLES
    PROMPTFOO_INSTALL_DIR     Installation directory
    PROMPTFOO_VERSION         Version to install
    PROMPTFOO_NO_MODIFY_PATH  Skip PATH modification if set

EXAMPLES
    # Install latest version
    irm https://promptfoo.dev/install.ps1 | iex

    # Install specific version
    Install-Promptfoo -Version 0.120.0

    # Install to custom directory
    Install-Promptfoo -InstallDir C:\tools\promptfoo

MORE INFO
    https://promptfoo.dev/docs/installation

"@
        return
    }

    Write-Host ""
    Write-Host "Promptfoo Installer" -ForegroundColor Magenta
    Write-Host ""

    # Resolve install directory
    if ([string]::IsNullOrEmpty($InstallDir)) {
        $InstallDir = if ($env:PROMPTFOO_INSTALL_DIR) {
            $env:PROMPTFOO_INSTALL_DIR
        } else {
            Join-Path $env:LOCALAPPDATA "promptfoo"
        }
    }
    $binDir = Join-Path $InstallDir "bin"

    # Resolve version
    if ($env:PROMPTFOO_VERSION -and $Version -eq 'latest') {
        $Version = $env:PROMPTFOO_VERSION
    }

    # Detect platform
    $platform = Get-Platform
    Write-Info "Detected platform: $platform"

    # Resolve version
    $Version = Resolve-Version -Version $Version
    Write-Info "Version: $Version"

    # Install
    $success = Install-PromptfooBinary -Version $Version -Platform $platform -InstallDir $InstallDir

    if (-not $success) {
        throw "Installation failed"
    }

    # Verify installation
    if (Test-Installation -BinDir $binDir) {
        $installedVersion = $Version
        Write-Success "promptfoo v$installedVersion installed successfully"
    } else {
        Write-Warn "Installation completed but verification failed."
        Write-Warn "You may need to check your Node.js installation."
    }

    # Setup PATH
    Add-ToPath -BinDir $binDir -NoModifyPath:$NoModifyPath

    # Print instructions
    Write-Host ""
    Write-Host "Installation complete!" -ForegroundColor Green
    Write-Host ""

    if (-not ($env:Path -split ';' | Where-Object { $_ -eq $binDir })) {
        Write-Host "To use promptfoo in this terminal session, run:"
        Write-Host ""
        Write-Host "  `$env:Path = `"$binDir;`$env:Path`"" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Or restart your terminal."
        Write-Host ""
    }

    Write-Host "Get started:"
    Write-Host ""
    Write-Host "  promptfoo --help" -ForegroundColor Cyan -NoNewline
    Write-Host "     Show all commands"
    Write-Host "  promptfoo init" -ForegroundColor Cyan -NoNewline
    Write-Host "       Initialize a new project"
    Write-Host "  promptfoo eval" -ForegroundColor Cyan -NoNewline
    Write-Host "       Run an evaluation"
    Write-Host ""
    Write-Host "Documentation: " -NoNewline
    Write-Host "https://promptfoo.dev/docs" -ForegroundColor Blue
    Write-Host ""

    # Send telemetry
    Send-InstallTelemetry -Platform $platform -Version $Version
}

# Auto-run if invoked directly via iex
if ($MyInvocation.InvocationName -eq '&' -or $MyInvocation.Line -match 'iex') {
    Install-Promptfoo @args
}
