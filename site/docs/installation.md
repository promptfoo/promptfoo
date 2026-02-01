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

## Requirements

- Node.js 20.20+ or 22.22+
- Supported operating systems: Windows, Mac, Linux

## For Command-Line Usage

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
  <TabItem value="brew" label="brew (Mac, Linux)">
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
  <TabItem value="brew" label="brew (Mac, Linux)">
    ```bash
    promptfoo --version
    ```
  </TabItem>
</Tabs>

This should display the version number of promptfoo:

```text
0.120.20
```

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
  <TabItem value="brew" label="brew (Mac, Linux)">
    ```bash
    promptfoo init
    ```
  </TabItem>
</Tabs>

This will create a `promptfooconfig.yaml` placeholder in your current directory.

For more detailed usage instructions, please refer to our [Getting Started guide](./getting-started.md).

## See Also

- [Getting Started](./getting-started.md)
- [Troubleshooting](./usage/troubleshooting.md)
- [Contributing](./contributing.md)
