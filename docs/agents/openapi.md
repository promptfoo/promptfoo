# Server OpenAPI Generation

Promptfoo's local server OpenAPI document is generated from the same Zod DTOs
used by Express route validation.

## Published Surfaces

- The running local server exposes the installed-version document at
  `/api/openapi.json`.
- The docs site publishes a latest snapshot at `site/static/openapi.json`, which
  backs `/docs/local-server-api-reference/`.

The runtime endpoint is the source of truth for integrations against an
installed Promptfoo version. The docs-site snapshot exists for discovery and
browsing on `promptfoo.dev`.

## Generate The Site Snapshot

```bash
source ~/.nvm/nvm.sh && nvm use
npm run openapi:generate
```

The default output is:

```text
site/static/openapi.json
```

You can write to another path when testing locally:

```bash
npm run openapi:generate -- /tmp/promptfoo-openapi.json
```

CI enforces that the checked-in docs snapshot is current. The `Generate Assets`
workflow runs `npm run openapi:generate` and fails if it changes
`site/static/openapi.json`.

For a local non-mutating check, run:

```bash
npm run openapi:check
```

## Where Things Live

- Shared route and DTO contracts: `src/contracts/api/*.ts`
- Runtime compatibility shims: `src/types/api/*.ts`
- OpenAPI route registry: `src/openapi/server.ts`
- Runtime endpoint: `GET /api/openapi.json`
- Generation script: `scripts/generateOpenApi.ts`
- Coverage tests: `test/openapi/serverOpenApi.test.ts`
- Published docs asset: `site/static/openapi.json`
- Docs page: `site/src/pages/docs/local-server-api-reference.tsx`

## Add Or Change A Route

1. Define or update the request/response Zod schemas in
   `src/contracts/api/<area>.ts` and keep its `src/types/api/<area>.ts` shim
   compatible when one exists.
2. Define the method, paths, operation ID, tag, and summary once in
   `src/contracts/api/routes.ts`.
3. Use that `ApiRoutes` contract in the Express route with `.safeParse()` for
   requests and `.parse()` for responses.
4. Register the same contract with `registerContract()` in
   `src/openapi/server.ts`.
5. Run the route contract and OpenAPI tests.
6. Regenerate `site/static/openapi.json` and run `npm run openapi:check`.

## JSON GET Example

For a route like:

```typescript
widgetRouter.get(ApiRoutes.Widgets.Get.routerPath, async (req, res) => {
  const params = WidgetSchemas.Get.Params.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: z.prettifyError(params.error) });
    return;
  }

  res.json(WidgetSchemas.Get.Response.parse({ id: params.data.id }));
});
```

Assuming `ApiRoutes.Widgets.Get` contains the method and path metadata, register
the operation-specific schemas and responses like this:

```typescript
registerContract(ApiRoutes.Widgets.Get, {
  request: {
    params: params('WidgetGetParams', WidgetSchemas.Get.Params),
  },
  responses: {
    200: jsonResponse('WidgetGetResponse', WidgetSchemas.Get.Response),
    400: validationError(),
    404: notFound('Widget not found'),
  },
});
```

The shared contract derives OpenAPI `{id}` paths from the Express `:id` path,
so do not duplicate either form in the registry.

## JSON POST Example

For request bodies, use `jsonBody()` to emit the runtime Zod schema inline in
the operation. The helper's name argument labels the schema at the call site,
but the current generator does not add it to `components.schemas`:

```typescript
registerContract(ApiRoutes.Widgets.Create, {
  request: {
    body: jsonBody('WidgetCreateRequest', WidgetSchemas.Create.Request),
  },
  responses: {
    200: jsonResponse('WidgetCreateResponse', WidgetSchemas.Create.Response),
    400: validationError(),
    500: serverError(),
  },
});
```

## Query Params Example

Query schemas are emitted inline the same way as params:

```typescript
registerContract(ApiRoutes.Widgets.List, {
  request: {
    query: query('WidgetListQuery', WidgetSchemas.List.Query),
  },
  responses: {
    200: jsonResponse('WidgetListResponse', WidgetSchemas.List.Response),
    400: validationError(),
  },
});
```

Zod transforms are allowed in runtime schemas. If a transform produces a poor
OpenAPI parameter shape, add OpenAPI metadata or create a docs-only schema next
to the route registration and leave a comment explaining the runtime/docs split.

## Binary Response Example

Runtime binary schemas such as `z.instanceof(Uint8Array)` do not map cleanly to
OpenAPI. Register the route with `binaryResponse()`:

```typescript
registerContract(ApiRoutes.Files.Get, {
  request: {
    params: params('FileHashParams', FileSchemas.Get.Params),
  },
  responses: {
    200: binaryResponse('File bytes'),
    400: validationError(),
    404: notFound('File not found'),
  },
});
```

This emits:

```json
{
  "type": "string",
  "format": "binary"
}
```

## Redirect Response Example

Routes that may redirect, such as blob storage downloads, should document the
redirect status separately:

```typescript
responses: {
  200: binaryResponse('Blob bytes'),
  302: redirectResponse('Presigned blob URL redirect'),
  404: notFound('Blob not found'),
}
```

## No Content Example

Use `noContent()` for `204` responses:

```typescript
responses: {
  204: noContent('Deleted successfully'),
  400: validationError(),
}
```

## QA Commands

```bash
source ~/.nvm/nvm.sh && nvm use
npx vitest run test/openapi/serverOpenApi.test.ts --run
npm run openapi:generate
npm run openapi:check
npm run tsc -- --pretty false
```

For full route DTO confidence, also run the focused server route tests that touch
the changed schemas.
