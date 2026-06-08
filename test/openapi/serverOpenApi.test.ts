import fs from 'node:fs';
import path from 'node:path';

import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  createServerOpenApiDocument,
  createServerOpenApiRegistry,
  SERVER_OPENAPI_ROUTE_COUNT,
} from '../../src/openapi/server';
import { createApp } from '../../src/server/server';
import { ALL_API_ROUTES, ApiRoutes, buildApiPath } from '../../src/types/api/routes';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'] as const;
const ROOT_SERVER_FILE = 'src/server/server.ts';
const ROUTER_SOURCE_FILES = [
  'src/server/routes/blobs.ts',
  'src/server/routes/configs.ts',
  'src/server/routes/eval.ts',
  'src/server/routes/media.ts',
  'src/server/routes/modelAudit.ts',
  'src/server/routes/providers.ts',
  'src/server/routes/redteam.ts',
  'src/server/routes/traces.ts',
  'src/server/routes/user.ts',
  'src/server/routes/version.ts',
] as const;

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

describe('server OpenAPI generation', () => {
  it('registers every server route exactly once', () => {
    const { routes } = createServerOpenApiRegistry();
    const document = createServerOpenApiDocument();
    const generatedOperations = operations(document);
    const contractKeys = ALL_API_ROUTES.map(
      ({ method, openApiPath }) => `${method.toUpperCase()} ${openApiPath}`,
    );

    expect(routes).toHaveLength(SERVER_OPENAPI_ROUTE_COUNT);
    expect(generatedOperations).toHaveLength(SERVER_OPENAPI_ROUTE_COUNT);
    expect(ALL_API_ROUTES).toHaveLength(SERVER_OPENAPI_ROUTE_COUNT);

    const generatedKeys = generatedOperations.map(
      ({ method, path }) => `${method.toUpperCase()} ${path}`,
    );
    expect(new Set(generatedKeys).size).toBe(SERVER_OPENAPI_ROUTE_COUNT);
    expect(new Set(contractKeys).size).toBe(SERVER_OPENAPI_ROUTE_COUNT);
    expect(generatedKeys.sort()).toEqual(contractKeys.sort());
    expect(generatedKeys.some((key) => key.includes('/:'))).toBe(false);
  });

  it('builds encoded client paths from route contracts', () => {
    expect(buildApiPath(ApiRoutes.Eval.Table, { id: 'suite/result 1' })).toBe(
      '/eval/suite%2Fresult%201/table',
    );
    expect(() => buildApiPath(ApiRoutes.Blobs.Get)).toThrow('Missing API path parameter: hash');
  });

  it('requires server API registrations to use shared route contracts', () => {
    const rootSource = fs.readFileSync(path.resolve(ROOT_SERVER_FILE), 'utf8');
    const rootLiteralPaths = [
      ...rootSource.matchAll(/\bapp\.(?:get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\1/g),
    ]
      .map((match) => match[2])
      .filter((registeredPath) => registeredPath !== '/*splat');
    const literalApiMounts = [
      ...rootSource.matchAll(/\bapp\.use\(\s*(['"`])(\/api(?:\/[^'"`]*)?)\1/g),
    ].map((match) => match[2]);

    expect(rootLiteralPaths).toEqual([]);
    expect(literalApiMounts).toEqual([]);

    for (const sourceFile of ROUTER_SOURCE_FILES) {
      const source = fs.readFileSync(path.resolve(sourceFile), 'utf8');
      const literalHandlerPaths = [
        ...source.matchAll(
          /\b(?:[A-Za-z]+Router|router)\.(?:get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\1/g,
        ),
      ].map((match) => match[2]);

      expect(literalHandlerPaths, sourceFile).toEqual([]);
    }
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
    const createEvalJobSchema =
      createEvalJobOperation?.requestBody?.content?.['application/json']?.schema;
    expect(createEvalJobSchema?.properties?.sourceEvalId).toEqual(
      expect.objectContaining({ minLength: 1, type: 'string' }),
    );
    expect(createEvalJobSchema?.properties?.tests?.oneOf).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'string' })]),
    );
    expect(
      addEvalResultsOperation?.requestBody?.content?.['application/json']?.schema?.items?.properties
        ?.provider?.oneOf,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'string' })]));
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

  it('uses the default local server URL for generated static documents', () => {
    expect(createServerOpenApiDocument().servers).toEqual([
      {
        description: 'Default local Promptfoo server',
        url: 'http://localhost:15500',
      },
    ]);
  });

  it('uses the requested document version in version-bearing schemas', () => {
    const document = createServerOpenApiDocument({ version: 'latest' });
    const telemetryRequest = (document.paths?.['/api/telemetry']?.post?.requestBody as any)
      ?.content?.['application/json']?.schema;

    expect(document.info.version).toBe('latest');
    expect(telemetryRequest?.properties?.packageVersion?.default).toBe('latest');
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

  it('serves the live OpenAPI document at /api/openapi.json', async () => {
    const app = createApp();

    const response = await request(app).get('/api/openapi.json');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body.openapi).toBe('3.1.0');
    expect(response.body.info?.title).toBe('Promptfoo Local Server API');
    expect(response.body.servers).toEqual([
      {
        description: 'Current local Promptfoo server',
        url: '/',
      },
    ]);
    expect(Object.keys(response.body.paths ?? {})).toContain('/api/openapi.json');
    expect(Object.keys(response.body.paths ?? {}).length).toBeGreaterThan(0);
  });

  it('keeps the static site/static/openapi.json artifact in sync with the live registry', () => {
    const staticPath = path.resolve('site/static/openapi.json');
    expect(fs.existsSync(staticPath)).toBe(true);
    const staticDoc = JSON.parse(fs.readFileSync(staticPath, 'utf8'));
    const liveDoc = createServerOpenApiDocument();
    // Path-set parity is the contract that matters for client-code generators —
    // info.version may differ between commits, but the route surface must match.
    expect(Object.keys(staticDoc.paths ?? {}).sort()).toEqual(
      Object.keys(liveDoc.paths ?? {}).sort(),
    );
  });

  it('does not describe error responses as successful', () => {
    const paths = createServerOpenApiDocument().paths ?? {};

    for (const pathItem of Object.values(paths)) {
      for (const operation of Object.values(pathItem ?? {})) {
        if (!operation || typeof operation !== 'object' || !('responses' in operation)) {
          continue;
        }

        for (const [status, response] of Object.entries(operation.responses ?? {})) {
          if (
            !/^[45]\d\d$/.test(status) ||
            !response ||
            typeof response !== 'object' ||
            !('description' in response)
          ) {
            continue;
          }

          expect(response.description).not.toBe('Successful response');
        }
      }
    }
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

  it('documents shared parser and CSRF failures for mutation routes', () => {
    const mutationOperations = operations(createServerOpenApiDocument()).filter(
      ({ path, method }) => path.startsWith('/api/') && method !== 'get',
    );

    for (const { operation } of mutationOperations) {
      expect((operation as any).responses?.['400']).toEqual(
        expect.objectContaining({ description: expect.any(String) }),
      );
      expect((operation as any).responses?.['403']).toEqual(
        expect.objectContaining({ description: 'CSRF protection rejected request' }),
      );
    }
  });
});
