---
sidebar_position: 4
---

# Installation

## Requirements

- Node.js 18 or newer
- Supported operating systems: macOS, Linux, Windows

## Installation Methods

### For Command-Line Usage

#### Using npm (recommended)

Install `promptfoo` globally using npm:

```sh
npm install -g promptfoo
```

Or use `npx` to run `promptfoo` directly without installation:

```sh
npx promptfoo@latest
```

#### Using Homebrew

If you prefer using Homebrew, you can install promptfoo with:

```sh
brew install promptfoo
```

### For Library Usage

Install `promptfoo` as a library in your project:

```sh
npm install promptfoo
```

## Verify Installation

To verify that promptfoo is installed correctly, run:

```sh
promptfoo --version
```

This should display the version number of promptfoo.

## Updating

To update promptfoo to the latest version, run:

```sh
promptfoo update
```

This will automatically detect how promptfoo was installed and update it accordingly.

You can also update manually using one of:

```sh
# If installed via npm
npm install -g promptfoo@latest

# If installed via Homebrew
brew upgrade promptfoo
```

## Next Steps

After installation, you can start using promptfoo by running:

```sh
promptfoo init
```

This will create a `promptfooconfig.yaml` placeholder in your current directory.

For more detailed usage instructions, please refer to our [Getting Started guide](./getting-started.md).
