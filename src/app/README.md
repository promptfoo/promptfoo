# Promptfoo Web UI

This is the web interface for Promptfoo, built with React and Vite.

## Development

### Running with the main app (recommended)

From the root directory:
```bash
npm run dev
```

This runs both the server and the web UI. Environment variables are loaded by the main server and inherited by the Vite app.

### Running standalone

If you need to run just the web UI:

```bash
cd src/app
npm install
npm run dev
```

When running standalone, create a `.env` file in `src/app/` with any required environment variables:

```bash
# API Configuration
API_PORT=15500
PROMPTFOO_REMOTE_API_BASE_URL=http://localhost:15500

# Feature flags
FEATURE_ENABLED__EVAL_RESULTS_MULTI_FILTERING=false
```

## Environment Variables

The app uses Vite's built-in environment variable handling:
- Variables prefixed with `VITE_` are exposed to the client code
- Access them via `import.meta.env.VITE_*`
- When running via `npm run dev` from root, variables are inherited from the parent process
- When running standalone, use a `.env` file in this directory

## Build

```bash
npm run build
```

The build output goes to `../../dist/src/app/`. 