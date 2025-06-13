---
title: Install Promptfoo
description: Learn how to install promptfoo using npm, npx, or Homebrew. Set up promptfoo for command-line usage or as a library in your project.
keywords: [install, installation, npm, npx, homebrew, setup, promptfoo]
sidebar_position: 4
---

import CodeBlock from '@theme/CodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Installation

## Requirements

- Node.js 18 or newer
- Supported operating systems: macOS, Linux, Windows

## For Command-Line Usage

Install promptfoo using [npx](https://nodejs.org/en/download), [npm](https://nodejs.org/en/download), or [brew](https://brew.sh/):

<Tabs groupId="promptfoo-command">
  <TabItem value="npm" label="npm" default>
    <CodeBlock language="bash">
      npm install -g promptfoo
    </CodeBlock>
  </TabItem>
  <TabItem value="npx" label="npx">
    <CodeBlock language="bash">
      npx promptfoo@latest
    </CodeBlock>
  </TabItem>
  <TabItem value="brew" label="brew">
    <CodeBlock language="bash">
      brew install promptfoo
    </CodeBlock>
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
    <CodeBlock language="bash">
      promptfoo --version
    </CodeBlock>
  </TabItem>
  <TabItem value="npx" label="npx">
    <CodeBlock language="bash">
      npx promptfoo@latest --version
    </CodeBlock>
  </TabItem>
  <TabItem value="brew" label="brew">
    <CodeBlock language="bash">
      promptfoo --version
    </CodeBlock>
  </TabItem>
</Tabs>

This should display the version number of promptfoo:

```
0.114.7
```

## Run Promptfoo

After installation, you can start using promptfoo by running:

<Tabs groupId="promptfoo-command">
  <TabItem value="npm" label="npm" default>
    <CodeBlock language="bash">
      promptfoo init
    </CodeBlock>
  </TabItem>
  <TabItem value="npx" label="npx">
    <CodeBlock language="bash">
      npx promptfoo@latest init
    </CodeBlock>
  </TabItem>
  <TabItem value="brew" label="brew">
    <CodeBlock language="bash">
      promptfoo init
    </CodeBlock>
  </TabItem>
</Tabs>

This will create a `promptfooconfig.yaml` placeholder in your current directory.

For more detailed usage instructions, please refer to our [Getting Started guide](./getting-started.md).
