import { describe, expect, it } from 'vitest';
import { ALL_PLUGINS, ALL_STRATEGIES } from '../../src/redteam/constants';
import { BlobsSchemas } from '../../src/types/api/blobs';
import {
  ErrorResponseSchema,
  JsonObjectSchema,
  SuccessResponseSchema,
} from '../../src/types/api/common';
import { ConfigSchemas } from '../../src/types/api/configs';
import { EvalSchemas } from '../../src/types/api/eval';
import { MediaSchemas } from '../../src/types/api/media';
import { ModelAuditSchemas } from '../../src/types/api/modelAudit';
import { ProviderSchemas } from '../../src/types/api/providers';
import { RedteamSchemas } from '../../src/types/api/redteam';
import { ServerSchemas } from '../../src/types/api/server';
import { TracesSchemas } from '../../src/types/api/traces';
import { UserSchemas } from '../../src/types/api/user';
import { VersionSchemas } from '../../src/types/api/version';

const VALID_PLUGIN_ID = ALL_PLUGINS[0];
const VALID_STRATEGY_ID = ALL_STRATEGIES.includes('basic') ? 'basic' : ALL_STRATEGIES[0];
const VALID_BLOB_HASH = 'a'.repeat(64);

describe('API schema red-team coverage', () => {
  describe('common schemas', () => {
    it('keeps shared success and error DTOs narrow where it matters', () => {
      expect(SuccessResponseSchema.parse({ success: true, extra: { preserved: true } })).toEqual({
        success: true,
        extra: { preserved: true },
      });

      expect(ErrorResponseSchema.parse({ error: 'Nope', success: false, code: 'E_TEST' })).toEqual({
        error: 'Nope',
        success: false,
        code: 'E_TEST',
      });
      expect(ErrorResponseSchema.safeParse({ error: 'Nope', success: true }).success).toBe(false);
      expect(JsonObjectSchema.safeParse([]).success).toBe(false);
      expect(JsonObjectSchema.safeParse(null).success).toBe(false);
    });
  });

  describe('server schemas', () => {
    it('coerces only the supported result-list boolean query representation', () => {
      expect(ServerSchemas.ResultList.Query.parse({ includeProviders: 'true' })).toMatchObject({
        includeProviders: true,
      });
      expect(ServerSchemas.ResultList.Query.parse({ includeProviders: 'false' })).toMatchObject({
        includeProviders: false,
      });
      expect(ServerSchemas.ResultList.Query.parse({ includeProviders: '1' })).toMatchObject({
        includeProviders: false,
      });
    });

    it('rejects malformed result filters and share identifiers before database access', () => {
      expect(ServerSchemas.ResultList.Query.safeParse({ type: 'sideways' }).success).toBe(false);
      expect(ServerSchemas.ResultList.Query.safeParse({ datasetId: '' }).success).toBe(false);
      expect(ServerSchemas.ShareCheckDomain.Query.safeParse({ id: '' }).success).toBe(false);
      expect(ServerSchemas.ShareCheckDomain.Query.safeParse({ id: 'undefined' }).success).toBe(
        false,
      );
    });

    it('keeps prompt hashes and generated dataset bodies bounded to expected shapes', () => {
      expect(ServerSchemas.Prompt.Params.safeParse({ sha256hash: 'a'.repeat(64) }).success).toBe(
        true,
      );
      expect(
        ServerSchemas.Prompt.Params.safeParse({ sha256hash: '../'.padEnd(64, 'a') }).success,
      ).toBe(false);
      expect(
        ServerSchemas.DatasetGenerate.Request.safeParse({
          prompts: ['Prompt'],
          tests: [{ vars: { q: 'seed' } }],
        }).success,
      ).toBe(true);
      expect(
        ServerSchemas.DatasetGenerate.Request.safeParse({
          prompts: [{ raw: 'Prompt', label: 'Prompt' }],
          tests: [{ vars: { q: 'seed' } }],
        }).success,
      ).toBe(true);
      expect(ServerSchemas.DatasetGenerate.Request.safeParse({ prompts: ['Prompt'] }).success).toBe(
        true,
      );
      expect(
        ServerSchemas.DatasetGenerate.Request.safeParse({ prompts: [], tests: [] }).success,
      ).toBe(false);
      expect(
        ServerSchemas.DatasetGenerate.Request.safeParse({ prompts: 'Prompt', tests: [] }).success,
      ).toBe(false);
      expect(
        ServerSchemas.DatasetGenerate.Request.safeParse({ prompts: [null], tests: [] }).success,
      ).toBe(false);
      expect(
        ServerSchemas.DatasetGenerate.Request.safeParse({
          prompts: ['Prompt'],
          tests: [null],
        }).success,
      ).toBe(false);
    });

    it('allows only supported telemetry events and scalar-safe properties', () => {
      const parsed = ServerSchemas.Telemetry.Request.parse({
        event: 'webui_api',
        properties: { route: '/api/results', count: 2, cached: false, tags: ['ui'] },
      });

      expect(parsed.packageVersion).toEqual(expect.any(String));
      expect(
        ServerSchemas.Telemetry.Request.safeParse({
          event: 'webui_api',
          properties: { nested: { leak: true } },
        }).success,
      ).toBe(false);
      expect(
        ServerSchemas.Telemetry.Request.safeParse({
          event: 'not-real',
          properties: {},
        }).success,
      ).toBe(false);
    });
  });

  describe('media schemas', () => {
    it('rejects traversal-like media params and accepts only expected storage keys', () => {
      expect(
        MediaSchemas.Info.Params.safeParse({ type: 'audio', filename: 'abcdef123456.mp3' }).success,
      ).toBe(true);
      expect(
        MediaSchemas.Info.Params.safeParse({ type: 'document', filename: 'abcdef123456.pdf' })
          .success,
      ).toBe(false);
      expect(
        MediaSchemas.Info.Params.safeParse({ type: 'audio', filename: '../../passwd' }).success,
      ).toBe(false);
    });

    it('preserves nullable URLs for providers that cannot generate direct links', () => {
      expect(
        MediaSchemas.Info.Response.parse({
          success: true,
          data: {
            key: 'audio/abcdef123456.mp3',
            exists: true,
            url: null,
          },
        }),
      ).toEqual({
        success: true,
        data: {
          key: 'audio/abcdef123456.mp3',
          exists: true,
          url: null,
        },
      });
    });
  });

  describe('provider schemas', () => {
    it('requires real provider IDs while preserving nested provider config', () => {
      const parsed = ProviderSchemas.Test.Request.parse({
        prompt: 'hello',
        providerOptions: {
          id: 'http',
          config: {
            url: 'https://example.test',
            headers: { authorization: 'Bearer token' },
            nested: { arbitrary: true },
          },
          inputs: { question: 'user question' },
        },
      });

      expect(parsed.providerOptions.config.nested.arbitrary).toBe(true);
      expect(parsed.providerOptions.inputs).toEqual({ question: 'user question' });
      expect(ProviderSchemas.Test.Request.safeParse({ providerOptions: { id: '' } }).success).toBe(
        false,
      );
      expect(
        ProviderSchemas.Test.Request.safeParse({ providerOptions: { id: { toString: 'nope' } } })
          .success,
      ).toBe(false);
    });

    it('keeps transform test inputs and outputs intentionally bounded', () => {
      expect(
        ProviderSchemas.TestRequestTransform.Request.safeParse({
          transformCode: 'return prompt',
          prompt: 'hello',
        }).success,
      ).toBe(true);
      expect(
        ProviderSchemas.TestRequestTransform.Request.safeParse({ transformCode: 'return prompt' })
          .success,
      ).toBe(false);
      expect(
        ProviderSchemas.TestRequestTransform.Response.parse({
          success: true,
          result: { body: { prompt: 'hello' } },
        }),
      ).toEqual({ success: true, result: { body: { prompt: 'hello' } } });
      expect(
        ProviderSchemas.TestRequestTransform.Response.safeParse({ success: false }).success,
      ).toBe(false);
    });

    it('preserves provider test/session payloads without accepting malformed envelopes', () => {
      expect(
        ProviderSchemas.Test.Response.parse({
          testResult: {
            success: false,
            message: 'Needs headers',
            changes_needed: true,
            changes_needed_suggestions: ['Add Authorization'],
          },
          providerResponse: { output: { nested: true } },
          transformedRequest: { url: 'https://example.test' },
        }),
      ).toMatchObject({
        testResult: {
          success: false,
          message: 'Needs headers',
        },
      });
      expect(
        ProviderSchemas.Test.Response.safeParse({ testResult: { success: true } }).success,
      ).toBe(false);
      expect(
        ProviderSchemas.TestSession.Response.parse({
          success: false,
          message: 'Manual review required',
          reason: 'remote disabled',
          details: { request1: { prompt: 'one' } },
        }),
      ).toMatchObject({
        success: false,
        reason: 'remote disabled',
        details: { request1: { prompt: 'one' } },
      });
    });

    it('keeps generator and discovery schemas from accepting empty or non-object envelopes', () => {
      expect(
        ProviderSchemas.HttpGenerator.Request.safeParse({
          requestExample: 'POST /v1/chat',
          responseExample: '{"ok":true}',
        }).success,
      ).toBe(true);
      expect(ProviderSchemas.HttpGenerator.Request.safeParse({ requestExample: '' }).success).toBe(
        false,
      );
      expect(
        ProviderSchemas.Discover.Response.safeParse({
          purpose: 'support bot',
          limitations: null,
          user: null,
          tools: [],
        }).success,
      ).toBe(true);
      expect(ProviderSchemas.Discover.Response.safeParse(['not', 'an', 'object']).success).toBe(
        false,
      );
    });
  });

  describe('redteam schemas', () => {
    it('defaults generated-test request fields while rejecting fake plugins and strategies', () => {
      const parsed = RedteamSchemas.GenerateTest.Request.parse({
        plugin: { id: VALID_PLUGIN_ID },
        strategy: { id: VALID_STRATEGY_ID },
        config: { applicationDefinition: { purpose: null } },
      });

      expect(parsed.plugin.config).toEqual({});
      expect(parsed.strategy.config).toEqual({});
      expect(parsed.history).toEqual([]);
      expect(parsed.turn).toBe(0);
      expect(parsed.count).toBe(1);
      expect(
        RedteamSchemas.GenerateTest.Request.parse({
          plugin: { id: VALID_PLUGIN_ID },
          strategy: { id: VALID_STRATEGY_ID },
          config: { applicationDefinition: {} },
        }).config.applicationDefinition.purpose,
      ).toBeUndefined();
      expect(
        RedteamSchemas.GenerateTest.Request.safeParse({
          plugin: { id: 'not-a-plugin' },
          strategy: { id: VALID_STRATEGY_ID },
          config: { applicationDefinition: { purpose: 'support bot' } },
        }).success,
      ).toBe(false);
      expect(
        RedteamSchemas.GenerateTest.Request.safeParse({
          plugin: { id: VALID_PLUGIN_ID },
          strategy: { id: '../prompt-injection' },
          config: { applicationDefinition: { purpose: 'support bot' } },
        }).success,
      ).toBe(false);
    });

    it('bounds batch generation, turn state, and conversation history', () => {
      expect(
        RedteamSchemas.GenerateTest.Request.parse({
          plugin: { id: VALID_PLUGIN_ID, config: { inputs: { accountId: 'acct_1' } } },
          strategy: { id: VALID_STRATEGY_ID, config: { enabled: true, custom: ['kept'] } },
          config: { applicationDefinition: { purpose: 'support bot' } },
          history: [{ role: 'user', content: 'hello' }],
          turn: 2,
          maxTurns: 4,
          count: 10,
        }),
      ).toMatchObject({
        plugin: { config: { inputs: { accountId: 'acct_1' } } },
        strategy: { config: { custom: ['kept'] } },
        turn: 2,
        maxTurns: 4,
        count: 10,
      });
      expect(
        RedteamSchemas.GenerateTest.Request.safeParse({
          plugin: { id: VALID_PLUGIN_ID },
          strategy: { id: VALID_STRATEGY_ID },
          config: { applicationDefinition: { purpose: 'support bot' } },
          count: 0,
        }).success,
      ).toBe(false);
      expect(
        RedteamSchemas.GenerateTest.Request.safeParse({
          plugin: { id: VALID_PLUGIN_ID },
          strategy: { id: VALID_STRATEGY_ID },
          config: { applicationDefinition: { purpose: 'support bot' } },
          count: 11,
        }).success,
      ).toBe(false);
      expect(
        RedteamSchemas.GenerateTest.Request.safeParse({
          plugin: { id: VALID_PLUGIN_ID },
          strategy: { id: VALID_STRATEGY_ID },
          config: { applicationDefinition: { purpose: 'support bot' } },
          history: [{ role: 'system', content: 'jailbreak' }],
        }).success,
      ).toBe(false);
      expect(
        RedteamSchemas.GenerateTest.Request.safeParse({
          plugin: { id: VALID_PLUGIN_ID },
          strategy: { id: VALID_STRATEGY_ID },
          config: { applicationDefinition: { purpose: 'support bot' } },
          turn: -1,
        }).success,
      ).toBe(false);
    });

    it('keeps redteam run and task envelopes bounded around remote execution', () => {
      expect(
        RedteamSchemas.Run.Request.parse({
          config: { redteam: { plugins: ['default'] } },
          delay: '250',
          maxConcurrency: '3',
          force: true,
        }),
      ).toMatchObject({ delay: 250, maxConcurrency: 3, force: true });
      expect(RedteamSchemas.Run.Request.safeParse({ config: [], delay: 0 }).success).toBe(false);
      expect(RedteamSchemas.Run.Request.safeParse({ config: {}, delay: -1 }).success).toBe(false);
      expect(
        RedteamSchemas.Run.Request.safeParse({ config: {}, maxConcurrency: 1.5 }).success,
      ).toBe(false);
      expect(RedteamSchemas.Run.Response.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
      expect(RedteamSchemas.Task.Params.safeParse({ taskId: 'x'.repeat(128) }).success).toBe(true);
      expect(RedteamSchemas.Task.Params.safeParse({ taskId: 'x'.repeat(129) }).success).toBe(false);
      expect(RedteamSchemas.Status.Response.parse({ hasRunningJob: false, jobId: null })).toEqual({
        hasRunningJob: false,
        jobId: null,
      });
    });

    it('preserves both single and batch generated-test responses without accepting malformed counts', () => {
      expect(
        RedteamSchemas.GenerateTest.Response.parse({
          prompt: 'Try this',
          context: 'Generated locally',
          metadata: { pluginId: VALID_PLUGIN_ID },
        }),
      ).toMatchObject({ prompt: 'Try this', metadata: { pluginId: VALID_PLUGIN_ID } });
      expect(
        RedteamSchemas.GenerateTest.Response.parse({
          testCases: [{ prompt: 'one', context: 'ctx', metadata: { index: 1 } }],
          count: 1,
        }),
      ).toMatchObject({ count: 1 });
      expect(
        RedteamSchemas.GenerateTest.Response.safeParse({
          testCases: [{ prompt: 'one', context: 'ctx' }],
          count: -1,
        }).success,
      ).toBe(false);
    });
  });

  describe('model-audit schemas', () => {
    it('trims path checks and rejects empty path probes before filesystem access', () => {
      expect(ModelAuditSchemas.CheckPath.Request.parse({ path: '  ~/model.pkl  ' })).toEqual({
        path: '~/model.pkl',
      });
      expect(ModelAuditSchemas.CheckPath.Request.safeParse({ path: '   ' }).success).toBe(false);
      expect(ModelAuditSchemas.CheckPath.Response.parse({ exists: false, type: null })).toEqual({
        exists: false,
        type: null,
      });
      expect(
        ModelAuditSchemas.CheckPath.Response.safeParse({
          exists: true,
          type: 'symlink',
          absolutePath: '/tmp/model.pkl',
          name: 'model.pkl',
        }).success,
      ).toBe(false);
    });

    it('requires at least one non-empty scan path while preserving scanner options', () => {
      const parsed = ModelAuditSchemas.Scan.Request.parse({
        paths: [' ', './model.pkl'],
        options: {
          timeout: 0,
          scanners: ['pickle'],
          excludeScanner: ['weight_distribution'],
          persist: false,
        },
      });

      expect(parsed.options.timeout).toBe(0);
      expect(parsed.options.scanners).toEqual(['pickle']);
      expect(parsed.options.persist).toBe(false);
      expect(ModelAuditSchemas.Scan.Request.safeParse({ paths: [] }).success).toBe(false);
      expect(ModelAuditSchemas.Scan.Request.safeParse({ paths: [' ', '\n'] }).success).toBe(false);
      expect(
        ModelAuditSchemas.Scan.Request.safeParse({
          paths: ['./model.pkl'],
          options: { timeout: -1 },
        }).success,
      ).toBe(false);
      expect(
        ModelAuditSchemas.Scan.Request.safeParse({
          paths: ['./model.pkl'],
          options: { format: 'xml' },
        }).success,
      ).toBe(false);
    });

    it('keeps scanner catalog and scan responses extensible but validates envelopes', () => {
      expect(
        ModelAuditSchemas.ListScanners.Response.parse({
          scanners: [{ id: 'pickle', extra: { severity: 'high' } }],
          raw: true,
        }),
      ).toMatchObject({
        scanners: [{ id: 'pickle', class: '', description: '', extensions: [], dependencies: [] }],
        raw: true,
      });
      expect(
        ModelAuditSchemas.Scan.Response.parse({
          rawOutput: '{"ok":true}',
          auditId: 'scan-1',
          persisted: true,
          total_checks: 2,
        }),
      ).toMatchObject({ total_checks: 2, persisted: true });
      expect(
        ModelAuditSchemas.Scan.ErrorResponse.safeParse({ error: 'boom', success: true }).success,
      ).toBe(false);
    });

    it('coerces bounded scan-list query parameters and rejects hostile sort probes', () => {
      expect(
        ModelAuditSchemas.ListScans.Query.parse({
          limit: '25',
          offset: '5',
          sort: 'failedChecks',
          order: 'asc',
          search: 'pickle',
        }),
      ).toEqual({
        limit: 25,
        offset: 5,
        sort: 'failedChecks',
        order: 'asc',
        search: 'pickle',
      });
      expect(ModelAuditSchemas.ListScans.Query.safeParse({ limit: '999' }).success).toBe(false);
      expect(ModelAuditSchemas.ListScans.Query.safeParse({ offset: '-1' }).success).toBe(false);
      expect(ModelAuditSchemas.ListScans.Query.safeParse({ sort: '1;drop table' }).success).toBe(
        false,
      );
      expect(ModelAuditSchemas.GetScan.Params.safeParse({ id: '' }).success).toBe(false);
      expect(ModelAuditSchemas.DeleteScan.Response.safeParse({ success: false }).success).toBe(
        false,
      );
    });
  });

  describe('blob schemas', () => {
    it('requires SHA-256 hashes for blob params, query filters, and response items', () => {
      expect(
        BlobsSchemas.Get.Params.safeParse({ hash: VALID_BLOB_HASH.toUpperCase() }).success,
      ).toBe(true);
      expect(BlobsSchemas.Get.Params.safeParse({ hash: '../etc/passwd' }).success).toBe(false);
      expect(
        BlobsSchemas.Library.Query.parse({
          type: 'image',
          evalId: 'eval-1',
          hash: VALID_BLOB_HASH,
          limit: '10',
          offset: '2',
          sortField: 'sizeBytes',
          sortOrder: 'asc',
        }),
      ).toEqual({
        type: 'image',
        evalId: 'eval-1',
        hash: VALID_BLOB_HASH,
        limit: 10,
        offset: 2,
        sortField: 'sizeBytes',
        sortOrder: 'asc',
      });
      expect(BlobsSchemas.Library.Query.safeParse({ type: 'document' }).success).toBe(false);
      expect(BlobsSchemas.Library.Query.safeParse({ limit: '101' }).success).toBe(false);
      expect(BlobsSchemas.Library.Query.safeParse({ hash: 'x'.repeat(64) }).success).toBe(false);
      expect(
        BlobsSchemas.Library.Response.safeParse({
          success: true,
          data: {
            items: [
              {
                hash: 'not-a-hash',
                mimeType: 'image/png',
                sizeBytes: 10,
                kind: 'image',
                createdAt: '2026-04-27T00:00:00.000Z',
                url: '/api/blobs/not-a-hash',
                context: { evalId: 'eval-1' },
              },
            ],
            total: 1,
            hasMore: false,
          },
        }).success,
      ).toBe(false);
    });

    it('keeps blob bytes, redirects, and eval picker queries bounded', () => {
      expect(BlobsSchemas.Get.BinaryResponse.safeParse(Buffer.from('blob')).success).toBe(true);
      expect(BlobsSchemas.Get.BinaryResponse.safeParse('blob').success).toBe(false);
      expect(BlobsSchemas.LibraryEvals.Query.parse({ limit: '25', search: 'alpha' })).toEqual({
        limit: 25,
        search: 'alpha',
      });
      expect(BlobsSchemas.LibraryEvals.Query.safeParse({ limit: '502' }).success).toBe(false);
      expect(BlobsSchemas.LibraryEvals.Query.safeParse({ search: 'x'.repeat(201) }).success).toBe(
        false,
      );
    });
  });

  describe('eval schemas', () => {
    it('keeps table query pagination integer-only and export formats explicit', () => {
      expect(
        EvalSchemas.Table.Query.parse({
          format: 'json',
          limit: '10',
          offset: '2',
          filterMode: 'errors',
          filter: 'metadata.team=red',
          comparisonEvalIds: 'eval-b',
        }),
      ).toMatchObject({
        format: 'json',
        limit: 10,
        offset: 2,
        filter: ['metadata.team=red'],
        comparisonEvalIds: ['eval-b'],
      });
      expect(EvalSchemas.Table.Query.safeParse({ limit: '1.5' }).success).toBe(false);
      expect(EvalSchemas.Table.Query.safeParse({ offset: '1.5' }).success).toBe(false);
      expect(EvalSchemas.Table.Query.safeParse({ format: 'xml' }).success).toBe(false);
    });

    it('accepts single comparison eval IDs for metadata keys and rejects empty metadata probes', () => {
      expect(EvalSchemas.MetadataKeys.Params.safeParse({ id: 'ab' }).success).toBe(false);
      expect(EvalSchemas.MetadataKeys.Query.parse({ comparisonEvalIds: 'eval-b' })).toMatchObject({
        comparisonEvalIds: ['eval-b'],
      });
      expect(EvalSchemas.MetadataValues.Query.safeParse({ key: '' }).success).toBe(false);
      expect(EvalSchemas.MetadataValues.Query.parse({ key: 'team' })).toEqual({ key: 'team' });
    });

    it('bounds eval mutations, jobs, replay, and bulk operations', () => {
      expect(
        EvalSchemas.CreateJob.Request.safeParse({
          prompts: ['Tell me a joke'],
          providers: ['echo'],
          tests: [{ vars: { topic: 'security' } }],
          extra: { preserved: true },
        }).success,
      ).toBe(true);
      expect(
        EvalSchemas.CreateJob.Request.safeParse({ prompts: 'Tell me a joke', providers: ['echo'] })
          .success,
      ).toBe(false);
      expect(EvalSchemas.CreateJob.Request.safeParse({ prompts: ['Tell me a joke'] }).success).toBe(
        false,
      );
      expect(EvalSchemas.GetJob.Params.safeParse({ id: crypto.randomUUID() }).success).toBe(true);
      expect(EvalSchemas.GetJob.Params.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
      expect(
        EvalSchemas.AddResults.Request.safeParse([
          { promptIdx: 0, testIdx: 0, success: true, score: 1, provider: { id: 'echo' } },
        ]).success,
      ).toBe(true);
      expect(
        EvalSchemas.AddResults.Request.safeParse([
          { promptIdx: -1, testIdx: 0, success: true, score: 1 },
        ]).success,
      ).toBe(false);
      expect(
        EvalSchemas.Replay.Request.safeParse({ evaluationId: 'eval-1', prompt: '' }).success,
      ).toBe(false);
      expect(
        EvalSchemas.Replay.Response.parse({
          output: '{"structured":true}',
          error: null,
          response: { tokenUsage: { total: 1 } },
        }),
      ).toMatchObject({ error: null, response: { tokenUsage: { total: 1 } } });
      expect(
        EvalSchemas.SubmitRating.Request.parse({ pass: false, score: 0, reason: 'manual' }),
      ).toMatchObject({ pass: false, reason: 'manual' });
      expect(EvalSchemas.BulkDelete.Request.safeParse({ ids: [] }).success).toBe(false);
    });

    it('preserves saved eval payloads without allowing null envelopes', () => {
      expect(
        EvalSchemas.Save.Request.parse({
          data: {
            results: { version: 3, results: [] },
            config: { prompts: ['hi'] },
            extra: 'kept',
          },
        }),
      ).toMatchObject({ data: { extra: 'kept' } });
      expect(
        EvalSchemas.Save.Request.safeParse({
          data: {
            results: null,
            config: {},
          },
        }).success,
      ).toBe(false);
      expect(
        EvalSchemas.Table.Response.parse({
          table: { head: { prompts: [], vars: [] }, body: [] },
          totalCount: 0,
          filteredCount: 0,
          filteredMetrics: null,
          config: {},
          author: null,
          version: 4,
          id: 'eval-1',
          stats: { success: true },
          extra: 'preserved',
        }),
      ).toMatchObject({ extra: 'preserved', version: 4 });
    });
  });

  describe('user, config, trace, and version schemas', () => {
    it('keeps user auth and email contracts narrow while preserving legacy validate coercion', () => {
      expect(UserSchemas.EmailStatus.Query.parse({})).toEqual({ validate: false });
      expect(UserSchemas.EmailStatus.Query.parse({ validate: 'true' })).toEqual({
        validate: true,
      });
      expect(UserSchemas.EmailStatus.Query.parse({ validate: '1' })).toEqual({
        validate: false,
      });
      expect(UserSchemas.Update.Request.safeParse({ email: 'bad-email' }).success).toBe(false);
      expect(
        UserSchemas.Login.Request.safeParse({
          apiKey: '',
          apiHost: 'https://api.promptfoo.dev',
        }).success,
      ).toBe(false);
      expect(
        UserSchemas.Login.Request.safeParse({
          apiKey: 'sk-test',
          apiHost: 'not-a-url',
        }).success,
      ).toBe(false);
      expect(
        UserSchemas.Login.Response.safeParse({
          success: false,
          user: { id: 'u', name: 'User', email: 'u@example.com' },
          organization: { id: 'o', name: 'Org' },
          app: { url: 'https://app.promptfoo.dev' },
        }).success,
      ).toBe(false);
    });

    it('rejects empty config identifiers and preserves config payloads intentionally', () => {
      expect(ConfigSchemas.List.Query.safeParse({ type: '' }).success).toBe(false);
      expect(
        ConfigSchemas.Create.Request.parse({
          name: 'Redteam config',
          type: 'redteam',
          config: { plugins: ['default'] },
        }),
      ).toMatchObject({ config: { plugins: ['default'] } });
      expect(
        ConfigSchemas.Create.Request.safeParse({ name: 'x', type: 'redteam', config: null })
          .success,
      ).toBe(false);
      expect(ConfigSchemas.Get.Params.safeParse({ type: 'redteam', id: '' }).success).toBe(false);
      expect(
        ConfigSchemas.Get.Response.parse({
          id: 'cfg-1',
          name: 'Config',
          type: 'redteam',
          config: { nested: true },
          createdAt: 0,
          updatedAt: '2026-04-27T00:00:00.000Z',
          source: 'test',
        }),
      ).toMatchObject({ source: 'test' });
    });

    it('validates trace params and version command metadata', () => {
      expect(TracesSchemas.GetByEval.Params.safeParse({ evaluationId: '' }).success).toBe(false);
      expect(TracesSchemas.Get.Params.safeParse({ traceId: 'trace-1' }).success).toBe(true);
      expect(TracesSchemas.Get.Response.parse({ trace: { spans: [{ id: 'span-1' }] } })).toEqual({
        trace: { spans: [{ id: 'span-1' }] },
      });
      expect(
        VersionSchemas.Response.parse({
          currentVersion: '1.0.0',
          latestVersion: '1.0.1',
          updateAvailable: true,
          selfHosted: false,
          isNpx: true,
          updateCommands: {
            primary: 'npx promptfoo@latest',
            alternative: null,
            commandType: 'npx',
          },
          commandType: 'npx',
        }),
      ).toMatchObject({ commandType: 'npx' });
      expect(
        VersionSchemas.Response.safeParse({
          currentVersion: '1.0.0',
          latestVersion: '1.0.1',
          updateAvailable: true,
          selfHosted: false,
          isNpx: true,
          updateCommands: {
            primary: 'brew upgrade promptfoo',
            alternative: null,
            commandType: 'brew',
          },
          commandType: 'brew',
        }).success,
      ).toBe(false);
    });
  });
});
