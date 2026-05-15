import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import {
  createServerOpenApiDocument,
  createServerOpenApiRegistry,
  SERVER_OPENAPI_ROUTE_COUNT,
} from '../../src/openapi/server';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'] as const;

const ROUTE_PREFIXES = new Map([
  ['src/server/server.ts', ''],
  ['src/server/routes/blobs.ts', '/api/blobs'],
  ['src/server/routes/configs.ts', '/api/configs'],
  ['src/server/routes/eval.ts', '/api/eval'],
  ['src/server/routes/media.ts', '/api/media'],
  ['src/server/routes/modelAudit.ts', '/api/model-audit'],
  ['src/server/routes/providers.ts', '/api/providers'],
  ['src/server/routes/redteam.ts', '/api/redteam'],
  ['src/server/routes/traces.ts', '/api/traces'],
  ['src/server/routes/user.ts', '/api/user'],
  ['src/server/routes/version.ts', '/api/version'],
]);

function operations(document: ReturnType<typeof createServerOpenApiDocument>) {
  return Object.entries(document.paths ?? {}).flatMap(([path, pathItem]) =>
    HTTP_METHODS.flatMap((method) => {
      const operation = (pathItem as Partial<Record<(typeof HTTP_METHODS)[number], unknown>>)?.[
        method
      ];
      return operation ? [{ path, method, operation }] : [];
    }),
  );
}

function normalizeRoutePath(prefix: string, routePath: string) {
  const joined = routePath === '/' ? prefix || '/' : `${prefix}${routePath}`;
  return joined.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function sourceRouteOperations() {
  const routePattern =
    /(?:app|\w+Router|router)\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2/g;

  return [...ROUTE_PREFIXES.entries()].flatMap(([file, prefix]) => {
    const source = fs.readFileSync(path.resolve(file), 'utf8');
    return [...source.matchAll(routePattern)]
      .map((match) => ({
        method: match[1].toUpperCase(),
        path: normalizeRoutePath(prefix, match[3]),
      }))
      .filter(({ path }) => path !== '/*splat' && !path.includes('/*'));
  });
}

describe('server OpenAPI generation', () => {
  it('registers every server route exactly once', () => {
    const { routes } = createServerOpenApiRegistry();
    const document = createServerOpenApiDocument();
    const generatedOperations = operations(document);
    const sourceOperations = sourceRouteOperations();

    expect(routes).toHaveLength(SERVER_OPENAPI_ROUTE_COUNT);
    expect(generatedOperations).toHaveLength(SERVER_OPENAPI_ROUTE_COUNT);
    expect(sourceOperations).toHaveLength(SERVER_OPENAPI_ROUTE_COUNT);

    const generatedKeys = generatedOperations.map(
      ({ method, path }) => `${method.toUpperCase()} ${path}`,
    );
    const sourceKeys = sourceOperations.map(({ method, path }) => `${method} ${path}`);
    expect(new Set(generatedKeys).size).toBe(SERVER_OPENAPI_ROUTE_COUNT);
    expect(generatedKeys.sort()).toEqual(sourceKeys.sort());
    expect(generatedKeys.some((key) => key.includes('/:'))).toBe(false);
  });

  it('documents representative request and response shapes', () => {
    const document = createServerOpenApiDocument();
    const paths = document.paths ?? {};
    const addEvalResultsOperation = paths['/api/eval/{id}/results']?.post as any;
    const createEvalJobOperation = paths['/api/eval/job']?.post as any;
    const evalTableOperation = paths['/api/eval/{id}/table']?.get as any;
    const getMediaOperation = paths['/api/media/{type}/{filename}']?.get as any;
    const getMediaInfoOperation = paths['/api/media/info/{type}/{filename}']?.get as any;
    const getBlobOperation = paths['/api/blobs/{hash}']?.get as any;
    const listBlobLibraryOperation = paths['/api/blobs/library']?.get as any;
    const modelAuditScanOperation = paths['/api/model-audit/scan']?.post as any;
    const shareResultOperation = paths['/api/results/share']?.post as any;
    const userEmailStatusOperation = paths['/api/user/email/status']?.get as any;
    const includeProvidersParam = paths['/api/results']?.get?.parameters?.find(
      (param: any) => param.name === 'includeProviders',
    ) as any;
    const validateParam = userEmailStatusOperation?.parameters?.find(
      (param: any) => param.name === 'validate',
    ) as any;
    const evalTableFormatParam = evalTableOperation?.parameters?.find(
      (param: any) => param.name === 'format',
    ) as any;
    const evalTableLimitParam = evalTableOperation?.parameters?.find(
      (param: any) => param.name === 'limit',
    ) as any;
    const evalTableResponseContent = evalTableOperation?.responses['200']?.content;
    const evalTableJsonSchema = evalTableResponseContent?.['application/json']?.schema as
      | { anyOf?: unknown[]; oneOf?: unknown[] }
      | undefined;

    expect(document.openapi).toBe('3.1.0');
    expect(paths['/api/results']?.get?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ in: 'query', name: 'type' }),
        expect.objectContaining({ in: 'query', name: 'includeProviders' }),
      ]),
    );
    expect(addEvalResultsOperation?.responses['204']).toEqual(
      expect.objectContaining({ description: 'Results added' }),
    );
    expect(
      createEvalJobOperation?.requestBody?.content?.['application/json']?.schema?.required,
    ).toEqual(expect.arrayContaining(['prompts', 'providers']));
    expect(
      getMediaOperation?.responses['200']?.content?.['application/octet-stream']?.schema,
    ).toEqual(expect.objectContaining({ format: 'binary', type: 'string' }));
    expect(getBlobOperation?.responses['302']).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          Location: expect.objectContaining({ description: 'Redirect target URL' }),
        }),
      }),
    );
    expect(shareResultOperation?.responses['429']).toBeUndefined();
    expect(includeProvidersParam?.schema).toEqual({
      oneOf: [{ type: 'boolean' }, { type: 'string' }],
    });
    expect(validateParam?.schema).toEqual({});
    expect(evalTableFormatParam?.schema).toEqual({
      enum: ['csv', 'json'],
      type: 'string',
    });
    expect(evalTableResponseContent?.['text/csv']?.schema).toEqual(
      expect.objectContaining({ type: 'string' }),
    );
    expect(evalTableJsonSchema?.oneOf ?? evalTableJsonSchema?.anyOf).toHaveLength(2);
    expect(evalTableLimitParam?.schema).toEqual(
      expect.objectContaining({ default: 50, type: 'integer' }),
    );
    expect(
      getMediaInfoOperation?.responses['200']?.content?.['application/json']?.schema?.properties
        ?.data?.properties?.url,
    ).toEqual({ type: ['string', 'null'] });
    expect(
      modelAuditScanOperation?.requestBody?.content?.['application/json']?.schema?.properties
        ?.options?.properties?.timeout,
    ).toEqual(expect.objectContaining({ minimum: 0, type: 'number' }));
    expect(
      listBlobLibraryOperation?.responses['200']?.content?.['application/json']?.schema?.properties
        ?.data?.properties?.items?.items?.properties?.hash,
    ).toEqual(expect.objectContaining({ pattern: '^[a-f0-9]{64}$/i', type: 'string' }));
  });

  it('emits representative inline DTO schemas', () => {
    const document = createServerOpenApiDocument();
    const paths = document.paths ?? {};
    const telemetryRequest = (paths['/api/telemetry']?.post?.requestBody as any)?.content?.[
      'application/json'
    ]?.schema;
    const providerTestRequest = (paths['/api/providers/test']?.post?.requestBody as any)?.content?.[
      'application/json'
    ]?.schema;

    expect(telemetryRequest).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          event: expect.objectContaining({
            enum: expect.arrayContaining(['webui_api', 'redteam run']),
          }),
        }),
        type: 'object',
      }),
    );
    expect(providerTestRequest).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          providerOptions: expect.anything(),
        }),
        type: 'object',
      }),
    );
  });

  it('documents explicit server-error response paths', () => {
    const paths = createServerOpenApiDocument().paths ?? {};
    const explicitServerErrorOperations = [
      paths['/api/eval/{id}/table']?.get,
      paths['/api/eval/{evalId}/results/{id}/rating']?.post,
      paths['/api/model-audit/scanners']?.get,
      paths['/api/model-audit/check-path']?.post,
      paths['/api/model-audit/scans']?.get,
      paths['/api/model-audit/scans/latest']?.get,
      paths['/api/model-audit/scans/{id}']?.get,
      paths['/api/model-audit/scans/{id}']?.delete,
      paths['/api/providers/test']?.post,
      paths['/api/blobs/{hash}']?.get,
    ];

    for (const operation of explicitServerErrorOperations) {
      expect(operation?.responses?.['500']).toEqual(
        expect.objectContaining({ description: 'Server error' }),
      );
    }
  });
});
