---
title: Install Promptfoo
description: Install Promptfoo with standalone shell and PowerShell installers, pip, npm, npx, or Homebrew, verify the CLI, and begin running local evals on your system.
keywords:
  [
    install,
    installation,
    pip,
    python,
    npm,
    npx,
    homebrew,
    curl,
    powershell,
    shell,
    windows,
    setup,
    promptfoo,
  ]
sidebar_position: 4
---

import CodeBlock from '@theme/CodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Installation

Install promptfoo using a standalone installer, [pip](https://pip.pypa.io/), [npm](https://nodejs.org/en/download), [npx](https://nodejs.org/en/download), or [Homebrew](https://brew.sh):

<Tabs groupId="promptfoo-command">
  <TabItem value="curl" label="curl" default>
    ```bash
    curl -fsSL https://promptfoo.dev/install.sh | bash
    ```
  </TabItem>
  <TabItem value="powershell" label="PowerShell">
    ```powershell
    irm https://promptfoo.dev/install.ps1 | iex
    ```
  </TabItem>
  <TabItem value="pip" label="pip">
    ```bash
    python -m pip install promptfoo
    ```
  </TabItem>
  <TabItem value="npm" label="npm">
    ```bash
    npm install -g promptfoo
    ```
  </TabItem>
  <TabItem value="npx" label="npx">
    ```bash
    npx promptfoo@latest
    ```
  </TabItem>
  <TabItem value="brew" label="brew">
    ```bash
    brew install promptfoo
    ```
  </TabItem>
</Tabs>

:::note
The standalone installers include their own runtime on macOS 13.5+ (x64 and arm64),
Linux with glibc 2.28+ (x64 and arm64), and Windows x64. The Python package supports
those Linux and Windows platforms and macOS 14+ (x64 and arm64). Other environments
fall back to npm and require [Node.js](https://nodejs.org/en/download) `^20.20.0` or
`>=22.22.0`.

Providers that rely on optional Node packages, such as local Transformers models,
browser automation, or some cloud-provider SDKs, require the npm or npx installation
instead of the standalone installer or Python package.
:::

To pass explicit options to the PowerShell installer without first installing the
default latest version, load its function with auto-install disabled and invoke it once:

```powershell
$env:PROMPTFOO_NO_AUTO_INSTALL = '1'
irm https://promptfoo.dev/install.ps1 | iex
Remove-Item Env:PROMPTFOO_NO_AUTO_INSTALL
Install-Promptfoo -Version 0.120.0
```

To use promptfoo as a library in your project, run `npm install promptfoo --save`.

## Verify Installation

To verify that promptfoo is installed correctly, run:

<Tabs groupId="promptfoo-command">
  <TabItem value="curl" label="curl" default>
    ```bash
    promptfoo --version
    ```
  </TabItem>
  <TabItem value="powershell" label="PowerShell">
    ```powershell
    promptfoo --version
    ```
  </TabItem>
  <TabItem value="pip" label="pip">
    ```bash
    python -m promptfoo --version
    ```
  </TabItem>
  <TabItem value="npm" label="npm">
    ```bash
    promptfoo --version
    ```
  </TabItem>
  <TabItem value="npx" label="npx">
    ```bash
    npx promptfoo@latest --version
    ```
  </TabItem>
  <TabItem value="brew" label="brew">
    ```bash
    promptfoo --version
    ```
  </TabItem>
</Tabs>

This should display the current version number of promptfoo.

## Run Promptfoo

After installation, you can start using promptfoo by running:

<Tabs groupId="promptfoo-command">
  <TabItem value="curl" label="curl" default>
    ```bash
    promptfoo init
    ```
  </TabItem>
  <TabItem value="powershell" label="PowerShell">
    ```powershell
    promptfoo init
    ```
  </TabItem>
  <TabItem value="pip" label="pip">
    ```bash
    python -m promptfoo init
    ```
  </TabItem>
  <TabItem value="npm" label="npm">
    ```bash
    promptfoo init
    ```
  </TabItem>
  <TabItem value="npx" label="npx">
    ```bash
    npx promptfoo@latest init
    ```
  </TabItem>
  <TabItem value="brew" label="brew">
    ```bash
    promptfoo init
    ```
  </TabItem>
</Tabs>

This will guide you through the process of creating a `promptfooconfig.yaml` file.

For a guide on running your first evaluation, please refer to our [Getting Started guide](./getting-started.md).

## Uninstall Promptfoo

### Remove the package

If you installed promptfoo with more than one method (for example, both npm and Homebrew), repeat the relevant steps for each.

<Tabs groupId="promptfoo-command">
  <TabItem value="curl" label="curl" default>
    ```bash
    rm -rf ~/.promptfoo/bin
    ```
    Remove the `# Promptfoo` PATH entry from your shell profile if the installer added it.
  </TabItem>
  <TabItem value="powershell" label="PowerShell">
    ```powershell
    Remove-Item -Recurse -Force "$env:LOCALAPPDATA\promptfoo\bin"
    ```
    Remove the promptfoo `bin` directory from your user `PATH` if the installer added it.
  </TabItem>
  <TabItem value="pip" label="pip">
    ```bash
    python -m pip uninstall promptfoo
    ```
  </TabItem>
  <TabItem value="npm" label="npm">
    ```bash
    npm uninstall -g promptfoo
    ```
  </TabItem>
  <TabItem value="npx" label="npx">
    `npx` does not install promptfoo permanently — no uninstall step is needed. If you also have a global install (via npm or Homebrew), remove it using the corresponding tab.
</TabItem>
  <TabItem value="brew" label="brew (Mac, Linux)">
    ```bash
    brew uninstall promptfoo
    ```
  </TabItem>
</Tabs>

If you installed promptfoo as a project dependency, remove it from your project:

<Tabs groupId="package-manager">
  <TabItem value="npm" label="npm" default>
    ```bash
    npm uninstall promptfoo
    ```
  </TabItem>
  <TabItem value="yarn" label="yarn">
    ```bash
    yarn remove promptfoo
    ```
  </TabItem>
  <TabItem value="pnpm" label="pnpm">
    ```bash
    pnpm remove promptfoo
    ```
  </TabItem>
</Tabs>

### Verify removal

After uninstalling, confirm that promptfoo is no longer available globally:

<Tabs groupId="verify-os">
  <TabItem value="mac-linux" label="Mac / Linux" default>
    ```bash
    which -a promptfoo
    ```
  </TabItem>
  <TabItem value="windows" label="Windows">
    ```bash
    where promptfoo
    ```
  </TabItem>
</Tabs>

If this still returns a path, you have another global installation that needs to be removed. Note that project-local installs (`node_modules/.bin/promptfoo`) are not detected by these commands — remove those with the project dependency step above.

### Remove configuration and data (optional)

Promptfoo stores configuration, eval history, and cached results in `~/.promptfoo` (`%USERPROFILE%\.promptfoo` on Windows). Uninstalling the package does not remove this directory.

:::warning
This permanently deletes your eval history, database, and cached results.
:::

<Tabs groupId="cleanup-os">
  <TabItem value="mac-linux" label="Mac / Linux" default>
    ```bash
    rm -rf ~/.promptfoo
    ```
  </TabItem>
  <TabItem value="windows-ps" label="Windows (PowerShell)">
    ```powershell
    Remove-Item -Recurse -Force "$env:USERPROFILE\.promptfoo"
    ```
  </TabItem>
  <TabItem value="windows-cmd" label="Windows (CMD)">
    ```cmd
    rmdir /s /q "%USERPROFILE%\.promptfoo"
    ```
  </TabItem>
</Tabs>

If you set custom paths via environment variables, remove those directories as well:

- `PROMPTFOO_CONFIG_DIR` — configuration and database
- `PROMPTFOO_CACHE_PATH` — cached results
- `PROMPTFOO_LOG_DIR` — log files

## See Also

- [Getting Started](./getting-started.md)
- [Troubleshooting](./usage/troubleshooting.md)
- [Contributing](./contributing.md)
