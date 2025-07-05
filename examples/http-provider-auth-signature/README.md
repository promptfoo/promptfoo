# http-provider-auth-signature (Setting up an HTTP provider with cryptographically signed requests)

You can run this example with:

```bash
npx promptfoo@latest init --example http-provider-auth-signature
```

## Introduction

This example demonstrates how to setup authentication with an http provider using a signed authentication mechanism

## Setup

### Installation

1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
npm start
```

## Running Tests

```bash
# Run test cases
promptfoo eval --no-cache

# View results
promptfoo view
```

IMPORTANT: be sure to run with --no-cache when testing! Otherwise it may cache responses from good signatures.
