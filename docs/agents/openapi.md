# Server OpenAPI Generation

The local server serves its installed-version API specification at
`GET /api/openapi.json`. Its relative server URL follows the origin and port of
that request.

The docs site uses `site/static/openapi.json` for
`/docs/local-server-api-reference/`. This snapshot has version `latest` so a
package version bump does not create schema drift. The existing
`/docs/api-reference/` page describes the Cloud and Enterprise API.

## Generate The Site Snapshot

```bash
npm run openapi:generate
npm run openapi:check
```

The first command updates `site/static/openapi.json`; the second fails if that
file differs from the generated specification. CI performs the same drift
check in the Generate Assets job. To inspect a temporary snapshot, pass an
output path:

```bash
npm run openapi:generate -- /tmp/promptfoo-openapi.json
```

## Add Or Change A Route

Update the route's Zod schemas in `src/types/api/` and its Express handler in
`src/server/`. Then update the matching `register()` call in
`src/openapi/server.ts`, including its method, path, operation ID, request
schemas, and responses. Use `{id}` for OpenAPI path parameters where Express
uses `:id`.

The registry's `params()`, `query()`, `jsonBody()`, and `jsonResponse()` helpers
embed schemas inline. Their name arguments label call sites; they do not
create reusable `components.schemas` entries. Use explicit character classes
instead of JavaScript RegExp flags, which JSON Schema patterns cannot carry.

Use `binaryResponse()` for bytes, `redirectResponse()` for redirects, and
`noContent()` for empty responses. Give error responses an error description
through `validationError()`, `notFound()`, `serverError()`, or `errorResponse()`.
When runtime transforms cannot be represented in OpenAPI, document the wire
format with a separate schema and explain the difference beside it.

Add a route case to `test/server/routes/serverRouteSmoke.test.ts` and update
`SERVER_OPENAPI_ROUTE_COUNT`. The OpenAPI tests compare the registry with
Express route declarations; schema tests should check representative accepted
and rejected values.

```bash
npx vitest run test/openapi/serverOpenApi.test.ts test/server/routes/serverRouteSmoke.test.ts
npm run openapi:generate
npm run openapi:check
```

Also run the affected handler/schema tests. The hosted local-server reference
hides test requests because cross-origin requests to a local server are subject
to its CSRF checks. Use the runtime specification for integrations against an
installed version.
