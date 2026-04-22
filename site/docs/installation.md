---
title: Install Promptfoo
description: Learn how to install promptfoo using npm, npx, or Homebrew. Set up promptfoo for command-line usage or as a library in your project.
keywords: [install, installation, npm, npx, homebrew, windows, setup, promptfoo]
sidebar_position: 4
---

import CodeBlock from '@theme/CodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Installation

Install promptfoo using [npm](https://nodejs.org/en/download), [npx](https://nodejs.org/en/download), or [Homebrew](https://brew.sh) (Mac, Linux):

<Tabs groupId="promptfoo-command">
  <TabItem value="npm" label="npm" default>
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
npm and npx require [Node.js](https://nodejs.org/en/download) 20.20+ or 22.22+.
:::

To use promptfoo as a library in your project, run `npm install promptfoo --save`.

## Verify Installation

To verify that promptfoo is installed correctly, run:

<Tabs groupId="promptfoo-command">
  <TabItem value="npm" label="npm" default>
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
  <TabItem value="npm" label="npm" default>
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
  <TabItem value="npm" label="npm" default>
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
