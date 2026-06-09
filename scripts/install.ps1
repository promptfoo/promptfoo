# Promptfoo installation script for Windows
#
# Usage:
#   irm https://promptfoo.dev/install.ps1 | iex
#   $env:PROMPTFOO_VERSION='0.120.0'; irm https://promptfoo.dev/install.ps1 | iex
#   $env:PROMPTFOO_NO_AUTO_INSTALL='1'; irm https://promptfoo.dev/install.ps1 | iex; Remove-Item Env:PROMPTFOO_NO_AUTO_INSTALL; Install-Promptfoo -Help
#
# Environment variables:
#   PROMPTFOO_INSTALL_DIR  - Installation directory (default: %LOCALAPPDATA%\promptfoo)
#   PROMPTFOO_VERSION      - Version to install (default: latest)
#   PROMPTFOO_NO_MODIFY_PATH - Skip PATH modification if set
#   PROMPTFOO_DISABLE_TELEMETRY - Skip anonymous installation telemetry if set
#   PROMPTFOO_NO_AUTO_INSTALL - Load functions without installing if set
#
# Requirements:
#   - PowerShell 5.1+ or PowerShell Core 7+
#   - Node.js ^20.20.0 or >=22.22.0 only when falling back to npm installation

#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# ─── Configuration ───────────────────────────────────────────────────────────

$script:GitHubRepo = "promptfoo/promptfoo"
$script:GitHubReleases = "https://github.com/$script:GitHubRepo/releases"
$script:NpmLatestUrl = "https://registry.npmjs.org/promptfoo/latest"

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
        $response = Invoke-RestMethod -Uri $script:NpmLatestUrl -Headers @{
            'Accept' = 'application/json'
            'User-Agent' = 'promptfoo-installer'
        }
        return $response.version
    } catch {
        throw "Failed to fetch the latest promptfoo version: $_"
    }
}

function Resolve-Version {
    param([string]$Version)

    if ($Version -eq 'latest' -or [string]::IsNullOrEmpty($Version)) {
        $Version = Get-LatestVersion
    }

    # Strip 'v' prefix if present
    $resolvedVersion = $Version -replace '^v', ''
    if ($resolvedVersion -notmatch '^\d+\.\d+\.\d+(?:[.-][A-Za-z0-9.-]+)?$') {
        throw "Invalid version: $resolvedVersion"
    }

    return $resolvedVersion
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
        throw "Node.js is required but not installed.`nPlease install Node.js ^20.20.0 or >=22.22.0 from https://nodejs.org"
    }
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw "npm is required for fallback installation but was not found on PATH.`nPlease install npm or use a supported standalone binary platform."
    }

    $nodeVersion = (& node --version).Trim()
    if ($nodeVersion -notmatch '^v?(\d+)\.(\d+)\.\d+(?:\+[0-9A-Za-z.-]+)?$') {
        throw "Unable to parse Node.js version '$nodeVersion'.`nThe npm fallback requires Node.js ^20.20.0 or >=22.22.0."
    }
    $nodeMajor = [int]$Matches[1]
    $nodeMinor = [int]$Matches[2]
    $isSupportedNode = ($nodeMajor -eq 20 -and $nodeMinor -ge 20) -or
        ($nodeMajor -ge 22 -and ($nodeMajor -gt 22 -or $nodeMinor -ge 22))
    if (-not $isSupportedNode) {
        throw "The npm fallback requires Node.js ^20.20.0 or >=22.22.0, but found $nodeVersion.`nPlease upgrade Node.js."
    }

    # Create installation directory
    $binDir = Join-Path $InstallDir "bin"
    New-Item -ItemType Directory -Path $binDir -Force | Out-Null

    # Install via npm
    & npm install -g "promptfoo@$Version" --prefix $InstallDir --registry=https://registry.npmjs.org/ 2>&1 | ForEach-Object { Write-Host $_ }

    if ($LASTEXITCODE -ne 0) {
        throw "npm install failed"
    }

    # Create batch file wrappers in bin directory for the package entrypoint.
    $entrypointJs = [System.IO.Path]::Combine($InstallDir, "node_modules", "promptfoo", "dist", "src", "entrypoint.js")
    if (-not (Test-Path $entrypointJs)) {
        # Try lib path (npm global install structure)
        $entrypointJs = [System.IO.Path]::Combine($InstallDir, "lib", "node_modules", "promptfoo", "dist", "src", "entrypoint.js")
    }

    if (-not (Test-Path $entrypointJs)) {
        throw "npm install completed, but promptfoo entrypoint was not found under $InstallDir"
    }

    $batContent = "@echo off`r`nnode `"$entrypointJs`" %*`r`nexit /b %ERRORLEVEL%"
    Set-Content -Path (Join-Path $binDir "promptfoo.cmd") -Value $batContent -Encoding ASCII
    Set-Content -Path (Join-Path $binDir "pf.cmd") -Value $batContent -Encoding ASCII

    return $true
}

function Install-PromptfooBinary {
    param(
        [string]$Version,
        [string]$Platform,
        [string]$InstallDir
    )

    if ($Platform -ne 'win32-x64') {
        Write-Warn "No bundled binary is published for $Platform."
        Write-Warn "Falling back to npm installation, which requires Node.js."
        return Install-PromptfooNpm -Version $Version -InstallDir $InstallDir
    }

    $archiveName = "promptfoo-$Version-$Platform.zip"
    $downloadUrl = "$script:GitHubReleases/download/$Version/$archiveName"
    $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("promptfoo-" + [Guid]::NewGuid().ToString("N"))
    $tempFile = Join-Path $tempDir $archiveName
    $binDir = Join-Path $InstallDir "bin"
    $stagingBinDir = Join-Path $InstallDir (".bin-install-" + [Guid]::NewGuid().ToString("N"))
    $previousBinDir = $null

    Write-Info "Installing promptfoo v$Version for $Platform..."
    Write-Info "Downloading from $downloadUrl"

    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    try {
        try {
            # Download archive
            $webRequestParameters = @{
                Uri = $downloadUrl
                OutFile = $tempFile
            }
            if ($PSVersionTable.PSVersion.Major -lt 6) {
                $webRequestParameters.UseBasicParsing = $true
            }
            Invoke-WebRequest @webRequestParameters
        } catch {
            Write-Warn "Binary release not found for $Platform."
            Write-Warn "Falling back to npm installation..."
            return Install-PromptfooNpm -Version $Version -InstallDir $InstallDir
        }

        # Extract and validate a complete replacement before altering an existing install.
        Write-Info "Extracting to $stagingBinDir"
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
        Expand-Archive -Path $tempFile -DestinationPath $stagingBinDir -Force

        # Create pf alias
        $promptfooExe = Join-Path $stagingBinDir "promptfoo.exe"
        if (-not (Test-Path -LiteralPath $promptfooExe -PathType Leaf)) {
            throw "Downloaded archive does not contain promptfoo.exe."
        }
        Copy-Item -LiteralPath $promptfooExe -Destination (Join-Path $stagingBinDir "pf.exe") -Force

        if (Test-Path -LiteralPath $binDir) {
            $previousBinDir = Join-Path $InstallDir (".bin-backup-" + [Guid]::NewGuid().ToString("N"))
            Move-Item -LiteralPath $binDir -Destination $previousBinDir
        }
        try {
            Move-Item -LiteralPath $stagingBinDir -Destination $binDir
        } catch {
            if ($null -ne $previousBinDir -and -not (Test-Path -LiteralPath $binDir)) {
                Move-Item -LiteralPath $previousBinDir -Destination $binDir
            }
            throw
        }
        if ($null -ne $previousBinDir) {
            Remove-Item -LiteralPath $previousBinDir -Recurse -Force
        }

        return $true
    } finally {
        Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $stagingBinDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Test-Installation {
    param([string]$BinDir)

    $promptfooCmd = Join-Path $BinDir "promptfoo.cmd"
    $promptfooExe = Join-Path $BinDir "promptfoo.exe"

    if (-not ((Test-Path $promptfooCmd) -or (Test-Path $promptfooExe))) {
        return $false
    }

    $verifyDir = Join-Path ([System.IO.Path]::GetTempPath()) ("promptfoo-verify-" + [Guid]::NewGuid().ToString("N"))
    $verifyEnvironment = @(
        'PROMPTFOO_CONFIG_DIR',
        'PROMPTFOO_CACHE_PATH',
        'PROMPTFOO_DISABLE_SHARING',
        'PROMPTFOO_DISABLE_TELEMETRY',
        'PROMPTFOO_DISABLE_UPDATE'
    )
    $previousEnvironment = @{}

    foreach ($name in $verifyEnvironment) {
        $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    }

    try {
        New-Item -ItemType Directory -Path $verifyDir -Force | Out-Null
        $env:PROMPTFOO_CONFIG_DIR = Join-Path $verifyDir 'state'
        $env:PROMPTFOO_CACHE_PATH = Join-Path $verifyDir 'cache'
        $env:PROMPTFOO_DISABLE_SHARING = 'true'
        $env:PROMPTFOO_DISABLE_TELEMETRY = 'true'
        $env:PROMPTFOO_DISABLE_UPDATE = 'true'

        if (Test-Path $promptfooExe) {
            $output = & $promptfooExe --version 2>&1
        } else {
            $output = & $promptfooCmd --version 2>&1
        }
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    } finally {
        foreach ($name in $verifyEnvironment) {
            [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
        }
        Remove-Item -Path $verifyDir -Recurse -Force -ErrorAction SilentlyContinue
    }
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

    if ($env:PROMPTFOO_DISABLE_TELEMETRY) {
        return
    }

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
    `$env:PROMPTFOO_NO_AUTO_INSTALL='1'; irm https://promptfoo.dev/install.ps1 | iex; Remove-Item Env:PROMPTFOO_NO_AUTO_INSTALL; Install-Promptfoo [OPTIONS] [VERSION]

OPTIONS
    -Version VERSION    Version to install (default: latest)
    -InstallDir DIR     Installation directory (default: %LOCALAPPDATA%\promptfoo)
    -NoModifyPath       Don't modify PATH
    -Help               Show this help message

ENVIRONMENT VARIABLES
    PROMPTFOO_INSTALL_DIR     Installation directory
    PROMPTFOO_VERSION         Version to install
    PROMPTFOO_NO_MODIFY_PATH  Skip PATH modification if set
    PROMPTFOO_DISABLE_TELEMETRY  Skip anonymous installation telemetry if set
    PROMPTFOO_NO_AUTO_INSTALL  Load installer functions without auto-installing

EXAMPLES
    # Install latest version
    irm https://promptfoo.dev/install.ps1 | iex

    # Install specific version
    `$env:PROMPTFOO_VERSION='0.120.0'; irm https://promptfoo.dev/install.ps1 | iex

    # Install to custom directory
    `$env:PROMPTFOO_NO_AUTO_INSTALL='1'; irm https://promptfoo.dev/install.ps1 | iex; Remove-Item Env:PROMPTFOO_NO_AUTO_INSTALL
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

# Auto-run for the one-line installer; callers setting PROMPTFOO_NO_AUTO_INSTALL
# can load the function first and invoke it once with explicit arguments.
if (($MyInvocation.InvocationName -eq '&' -or $MyInvocation.Line -match 'iex') -and
    -not $env:PROMPTFOO_NO_AUTO_INSTALL) {
    Install-Promptfoo @args
}
