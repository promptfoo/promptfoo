# Auth Sessions Example

This example demonstrates how to manage authentication sessions (i.e. obtaining and using a session token) using Javascript, Python, and HTTP providers.

```sh
npx promptfoo@latest init --example auth-sessions
```

## Management

### Creating a session

The recommended way to create a session is to use the `beforeAll` hook. This hook is run before all tests, and it creates a session. See `hooks.js` for an example.

### Destroying a session

The recommended way to destroy a session is to use the `afterAll` hook. This hook is run after all tests, and it destroys the session. See `hooks.js` for an example.

## Running the example

1. Install dependencies:

```bash
npm install
```

2. Run the session management server:

```bash
node server.js
```

3. Run the evaluation:

```bash
promptfoo eval -c promptfooconfig.yaml
```
