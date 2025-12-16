# Injection Server

A simple local server for hosting injection payloads when testing indirect prompt injection via web fetch.

## Quick Start

```bash
npm install
npm start
```

Server runs on `http://localhost:3456` by default.

## Environment Variables

- `PORT` - Server port (default: 3456)
- `BASE_URL` - Base URL for generated page URLs (default: `http://localhost:{PORT}`)

## Endpoints

### POST /pages
Create a new page with HTML content.

```bash
curl -X POST http://localhost:3456/pages \
  -H "Content-Type: application/json" \
  -d '{"content": "<html><body>Hello</body></html>"}'
```

Response:
```json
{"id": "abc123", "url": "http://localhost:3456/pages/abc123"}
```

### GET /pages/:id
Serve the page content. Increments fetch count.

### PUT /pages/:id
Update page content.

```bash
curl -X PUT http://localhost:3456/pages/abc123 \
  -H "Content-Type: application/json" \
  -d '{"content": "<html><body>Updated</body></html>"}'
```

### GET /pages/:id/stats
Get page statistics.

```json
{"fetchCount": 5, "lastFetched": "2024-01-01T00:00:00.000Z", "createdAt": "2024-01-01T00:00:00.000Z"}
```

### GET /pages
List all pages (for debugging).

### GET /health
Health check endpoint.

## Usage with promptfoo

Set the environment variable before running redteam:

```bash
export PROMPTFOO_WEB_FETCH_SERVICE_URL=http://localhost:3456
npx promptfoo redteam run -c config.yaml
```

Or configure in your redteam config:

```yaml
strategies:
  - id: iterative
    config:
      webFetchInjection:
        serviceUrl: http://localhost:3456
```
