import fs from 'node:fs';
import path from 'node:path';

import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import { createServerOpenApiDocument, createServerOpenApiRegistry } from '../../src/openapi/server';
import { EvalSchemas } from '../../src/types/api/eval';
import { TestCaseGenerationSchema } from '../../src/types/api/redteam';

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
        method: match[1],
        path: normalizeRoutePath(prefix, match[3]),
      }))
      .filter(({ path }) => path !== '/*splat' && !path.includes('/*'));
  });
}

describe('server OpenAPI generation', () => {
  it('describes error responses as errors', () => {
    for (const { operation } of operations(createServerOpenApiDocument())) {
      const responses = (operation as { responses: Record<string, { description: string }> })
        .responses;
      for (const [status, response] of Object.entries(responses)) {
        if (Number(status) >= 400) {
          expect(response.description).not.toBe('Successful response');
        }
      }
    }
  });

  it('registers every server route exactly once', () => {
    const routeKey = ({ method, path }: { method: string; path: string }) =>
      `${method.toUpperCase()} ${path}`;
    const registeredKeys = createServerOpenApiRegistry()
      .definitions.filter((definition) => definition.type === 'route')
      .map(({ route }) => routeKey(route))
      .sort();
    const generatedKeys = operations(createServerOpenApiDocument()).map(routeKey).sort();

    expect(registeredKeys).toEqual(generatedKeys);
    expect(sourceRouteOperations().map(routeKey).sort()).toEqual(generatedKeys);
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
    const submitRatingOperation = paths['/api/eval/{evalId}/results/{id}/rating']?.post as any;
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

    const filename = getMediaOperation.parameters.find(
      (param: { name: string }) => param.name === 'filename',
    );
    const acceptsFilename = new Ajv2020({ strict: false }).compile(filename.schema);
    expect(acceptsFilename('ABCDEF123456.PNG')).toBe(true);
    expect(acceptsFilename('A'.repeat(64))).toBe(true);
    expect(acceptsFilename('A'.repeat(63))).toBe(false);
    expect(acceptsFilename('file.png')).toBe(false);

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
    const { schema: jobSchema, example } =
      createEvalJobOperation.requestBody.content['application/json'];
    const acceptsJob = new Ajv2020({ strict: false }).compile(jobSchema);
    expect(example).toMatchObject({ providers: ['echo'], sharing: false });
    expect(acceptsJob(example)).toBe(true);
    expect(EvalSchemas.CreateJob.Request.safeParse(example).success).toBe(true);
    const job = { prompts: ['hello'], providers: ['echo'] };
    expect(acceptsJob({ ...job, tests: 'tests.yaml' })).toBe(true);
    expect(acceptsJob({ ...job, tests: { path: 'file://tests.js' } })).toBe(true);
    expect(acceptsJob({ ...job, tests: {} })).toBe(false);
    expect(jobSchema.required).toEqual(expect.arrayContaining(['prompts', 'providers']));
    expect(createEvalJobOperation.responses['500']).toBeDefined();
    expect(paths['/api/eval/job/{id}']?.get?.responses?.['500']).toBeDefined();
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
    ).toEqual(expect.objectContaining({ pattern: '^[A-Fa-f0-9]{64}$', type: 'string' }));
    expect(
      submitRatingOperation?.requestBody?.content?.['application/json']?.schema?.properties
        ?.ratingAction,
    ).toEqual(
      expect.objectContaining({
        description: 'Rating intent. Omit for the legacy inferred-rating behavior.',
        enum: ['rate', 'clear', 'update'],
      }),
    );
    expect(
      submitRatingOperation?.requestBody?.content?.['application/json']?.schema?.properties
        ?.ratingUpdate,
    ).toEqual(
      expect.objectContaining({
        description: 'Field to update; required only when ratingAction is update.',
        enum: ['score', 'comment'],
      }),
    );
    expect(
      submitRatingOperation?.responses['200']?.content?.['application/json']?.schema?.properties
        ?.gradingResult,
    ).toEqual(expect.objectContaining({ type: ['object', 'null'] }));
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
          packageVersion: { type: 'string' },
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
    expect(providerTestRequest.properties.providerOptions.properties.env).toBeUndefined();
  });

  it('matches preview provider input placement validation', () => {
    const document = createServerOpenApiDocument();
    const requestSchema = (document.paths?.['/api/redteam/generate-test']?.post as any)?.requestBody
      ?.content?.['application/json']?.schema;
    const request = {
      plugin: { id: 'aegis', config: {} },
      strategy: { id: 'basic', config: {} },
      config: { applicationDefinition: { purpose: 'test assistant' } },
      provider: {
        id: 'openai:chat:gpt-4.1',
        inputs: {
          document: {
            description: 'PDF document',
            type: 'pdf',
            config: { injectionPlacements: ['comment'] },
          },
        },
      },
    };
    const validateOpenApiRequest = new Ajv2020({ allErrors: true, strict: false }).compile(
      requestSchema,
    );

    expect(validateOpenApiRequest(request)).toBe(false);
    expect(TestCaseGenerationSchema.safeParse(request).success).toBe(false);
  });

  it('preserves required OpenAPI 3.1 response descriptions and media schemas', () => {
    const document = createServerOpenApiDocument();

    for (const { method, path, operation } of operations(document)) {
      const responses = (
        operation as {
          responses?: Record<
            string,
            { description?: string; content?: Record<string, { schema?: unknown }> }
          >;
        }
      ).responses;

      for (const [status, response] of Object.entries(responses ?? {})) {
        expect(response.description, `${method.toUpperCase()} ${path} ${status}`).toEqual(
          expect.any(String),
        );

        for (const [mediaType, content] of Object.entries(response.content ?? {})) {
          expect(
            content.schema,
            `${method.toUpperCase()} ${path} ${status} ${mediaType}`,
          ).toBeDefined();
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
});
