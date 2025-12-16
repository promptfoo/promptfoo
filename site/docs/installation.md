---
title: Install Promptfoo
description: Learn how to install promptfoo using the shell installer, npm, npx, or Homebrew.
keywords: [install, installation, npm, npx, homebrew, curl, shell, setup, promptfoo]
sidebar_position: 4
---

import CodeBlock from '@theme/CodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Installation

## Requirements

- Supported operating systems: macOS, Linux, Windows
- Node.js 20 or newer (only required for npm/npx installation)

## For Command-Line Usage

<Tabs groupId="promptfoo-command">
  <TabItem value="curl" label="curl" default>
    ```bash
    curl -fsSL https://promptfoo.dev/install.sh | bash
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

## For Library Usage

Install `promptfoo` as a library in your project:

```sh
npm install promptfoo --save
```

## Verify Installation

To verify that promptfoo is installed correctly, run:

<Tabs groupId="promptfoo-command">
  <TabItem value="curl" label="curl" default>
    ```bash
    promptfoo --version
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

This should display the version number:

```text
0.114.7
```

## Run Promptfoo

After installation, you can start using promptfoo by running:

<Tabs groupId="promptfoo-command">
  <TabItem value="curl" label="curl" default>
    ```bash
    promptfoo init
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

This creates a `promptfooconfig.yaml` placeholder in your current directory.

For more detailed usage instructions, please refer to our [Getting Started guide](./getting-started.md).

## See Also

- [Getting Started](./getting-started.md)
- [Troubleshooting](./usage/troubleshooting.md)
- [Contributing](./contributing.md)
