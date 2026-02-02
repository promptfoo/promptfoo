# http-form-data (HTTP Form Data Provider)

This example demonstrates HTTP provider configurations with form data and streaming responses.

## Examples Included

| File | Description |
|------|-------------|
| `promptfooconfig.yaml` | Form-encoded data with httpbin.org (no API key) |
| `promptfooconfig-streaming.yaml` | SSE streaming with OpenAI API |
| `promptfooconfig-local.yaml` | Form data + streaming with local test server |
| `promptfooconfig-raw.yaml` | **Raw HTTP request** format with form data + streaming |
| `promptfooconfig-extensive.yaml` | Comprehensive test suite |
| `promptfooconfig-auth.yaml` | **Authentication methods** (bearer, API key, basic) |
| `promptfooconfig-multipart.yaml` | **multipart/form-data** content type |
| `test-server.cjs` | Local server that accepts form data and streams SSE |
| `raw-request.txt` | External raw HTTP request file |

## Quick Start

```bash
npx promptfoo@latest init --example http-form-data
cd http-form-data
npx promptfoo@latest eval
```

## Local Test Server

```bash
# Terminal 1: Start server
node test-server.cjs

# Terminal 2: Run tests
npx promptfoo@latest eval -c promptfooconfig-local.yaml
```

## Raw HTTP Request Format

For full control over the HTTP request, use the `request` field with raw HTTP format:

```yaml
providers:
  - id: http  # Use 'http' for localhost, 'https' for HTTPS
    config:
      request: |
        POST / HTTP/1.1
        Host: localhost:3456
        Content-Type: application/x-www-form-urlencoded
        Accept: text/event-stream

        prompt={{prompt}}&model={{model}}&stream=true
      transformResponse: |
        (json, text) => {
          let output = '';
          for (const line of String(text || '').split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue;
            try {
              const chunk = JSON.parse(trimmed.slice(6));
              const delta = chunk.choices?.[0]?.delta?.content;
              if (typeof delta === 'string') output += delta;
            } catch {}
          }
          return output.trim();
        }
```

**Raw request format:**
- First line: `METHOD /path HTTP/1.1`
- Headers follow (one per line)
- Blank line separates headers from body
- Body contains form data with template variables

**Load from external file:**
```yaml
config:
  request: file://raw-request.txt
```

## Form Data Configuration (Standard)

```yaml
providers:
  - id: https
    config:
      url: 'http://localhost:3456'
      method: 'POST'
      headers:
        'Content-Type': 'application/x-www-form-urlencoded'
      body: 'prompt={{prompt}}&model={{model}}&stream=true'
      transformResponse: '...'
```

## SSE Streaming Response

OpenAI-style streaming uses Server-Sent Events:

```
data: {"choices":[{"delta":{"content":"Hello"}}]}

data: {"choices":[{"delta":{"content":" world"}}]}

data: [DONE]
```

The `transformResponse` function parses each `data:` line and accumulates `delta.content` values.

## Authentication

The test server supports multiple auth methods. Test with `promptfooconfig-auth.yaml`.

**Bearer Token (header):**
```yaml
headers:
  'Authorization': 'Bearer {{env.API_KEY}}'
```

**Bearer Token (auth config):**
```yaml
auth:
  type: bearer
  token: '{{env.API_KEY}}'
```

**API Key Header:**
```yaml
auth:
  type: api_key
  keyName: 'X-API-Key'
  value: '{{env.API_KEY}}'
  placement: header
```

**Basic Auth:**
```yaml
auth:
  type: basic
  username: '{{env.USERNAME}}'
  password: '{{env.PASSWORD}}'
```

**Raw HTTP Request with Auth:**
```yaml
config:
  request: |
    POST / HTTP/1.1
    Host: localhost:3456
    Content-Type: application/x-www-form-urlencoded
    Authorization: Bearer {{env.API_KEY}}

    prompt={{prompt}}&stream=true
```

## Multipart Form Data

For `multipart/form-data` content type (used for file uploads), use a raw HTTP request:

```yaml
providers:
  - id: http
    config:
      request: |
        POST / HTTP/1.1
        Host: localhost:3456
        Content-Type: multipart/form-data; boundary=----FormBoundary
        Authorization: Bearer {{env.API_KEY}}

        ------FormBoundary
        Content-Disposition: form-data; name="prompt"

        {{prompt}}
        ------FormBoundary
        Content-Disposition: form-data; name="model"

        {{model}}
        ------FormBoundary
        Content-Disposition: form-data; name="stream"

        true
        ------FormBoundary--
      transformResponse: '...'
```

**Multipart format:**
- Boundary defined in `Content-Type` header
- Each field wrapped with `--boundary` + headers + blank line + value
- Final boundary ends with `--`
