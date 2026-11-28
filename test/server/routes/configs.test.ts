import * as fs from 'node:fs/promises';
import path from 'node:path';

import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../../src/database/index';
import { configsTable } from '../../../src/database/tables';
import { runDbMigrations } from '../../../src/migrate';
import { createApp } from '../../../src/server/server';
import {
  CreateConfigResponseSchema,
  GetConfigResponseSchema,
  ListConfigsByTypeResponseSchema,
  ListConfigsResponseSchema,
} from '../../../src/types/api/configs';

vi.mock('node:fs/promises', { spy: true });

describe('configs routes', () => {
  let app: ReturnType<typeof createApp>;
  const testConfigIds = new Set<string>();

  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(() => {
    app = createApp();
  });

  afterEach(async () => {
    const db = await getDb();
    for (const id of testConfigIds) {
      try {
        await db.delete(configsTable).where(eq(configsTable.id, id));
      } catch {
        // Ignore cleanup errors
      }
    }
    testConfigIds.clear();
  });

  describe('GET /api/configs/eval/default/draft', () => {
    const endpoint = '/api/configs/eval/default/draft';

    async function mockDefaultFiles(files: Record<string, string>) {
      const { readFile } = await vi.importActual<typeof fs>('node:fs/promises');
      return vi.mocked(fs.readFile).mockImplementation(async (file, options) => {
        if (typeof file === 'string' && /^promptfooconfig\.ya?ml$/.test(path.basename(file))) {
          const content = files[path.basename(file)];
          if (content === undefined) {
            throw Object.assign(new Error('Missing fixture'), { code: 'ENOENT' });
          }
          return content;
        }
        return readFile(file, options);
      });
    }

    afterEach(() => {
      vi.mocked(fs.readFile).mockReset();
    });

    it.each(['yaml', 'yml'])('returns a sanitized .%s draft', async (extension) => {
      await mockDefaultFiles({
        [`promptfooconfig.${extension}`]: `
providers:
  - id: openai:gpt-4o-mini
    config:
      apiKey: '{{ env.OPENAI_API_KEY }}'
  - id: openai:gpt-4o
    config:
      apiKeyEnvar: GATEWAY_API_KEY
  - id: openai:gpt-4.1
    config:
      apiKey: fake-inline-secret
  - id: openai:gpt-4.1-mini
    config:
      apiKeyEnvar: AWS_PROFILE
env:
  OPENAI_API_BASE_URL: http://localhost:9000/v1
  OPENAI_API_KEY: fake-openai-secret
  GATEWAY_API_KEY: fake-gateway-secret
  AWS_PROFILE: fake-aliased-secret
prompts: ['Hello']
tests: [{}]
`,
      });

      const res = await request(app).get(endpoint).expect(200).expect('Cache-Control', 'no-store');
      expect(res.body.config.providers).toEqual([
        { id: 'openai:gpt-4o-mini', config: { apiKey: '{{ env.OPENAI_API_KEY }}' } },
        { id: 'openai:gpt-4o', config: { apiKeyEnvar: 'GATEWAY_API_KEY' } },
        { id: 'openai:gpt-4.1', config: {} },
        { id: 'openai:gpt-4.1-mini', config: { apiKeyEnvar: 'AWS_PROFILE' } },
      ]);
      expect(res.body.config.env).toEqual({ OPENAI_API_BASE_URL: 'http://localhost:9000/v1' });
      expect(res.body.config.prompts).toEqual(['Hello']);
      expect(res.body.config.tests).toHaveLength(1);
      expect(res.text).not.toMatch(/fake-.*-secret/);
    });

    it('prefers .yaml when both conventional files exist', async () => {
      await mockDefaultFiles({
        'promptfooconfig.yaml': 'description: Picked YAML',
        'promptfooconfig.yml': 'description: Alternate YML',
      });

      const res = await request(app).get(endpoint).expect(200);
      expect(res.body.config.description).toBe('Picked YAML');
      expect(fs.readFile).not.toHaveBeenCalledWith(
        expect.stringMatching(/promptfooconfig\.yml$/),
        'utf8',
      );
    });

    it('returns a null draft when both files are absent', async () => {
      await mockDefaultFiles({});
      await request(app).get(endpoint).expect(200, { config: null });
    });

    it.each(['providers: [fake-invalid-secret', 'providers: 1'])(
      'returns a generic error for an invalid config',
      async (content) => {
        await mockDefaultFiles({ 'promptfooconfig.yaml': content });
        await request(app)
          .get(endpoint)
          .expect(500, { error: 'Failed to load the default eval draft' });
      },
    );
  });

  describe('POST /api/configs', () => {
    it('should create a config and return id and createdAt', async () => {
      const res = await request(app)
        .post('/api/configs')
        .send({
          name: 'test-config',
          type: 'eval',
          config: { prompts: ['hello'] },
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('createdAt');
      testConfigIds.add(res.body.id);

      const parsed = CreateConfigResponseSchema.safeParse(res.body);
      expect(parsed.success).toBe(true);
    });

    it.each([
      ['missing name', { type: 'eval', config: {} }],
      ['missing type', { name: 'test-config', config: {} }],
      ['empty name', { name: '', type: 'eval', config: {} }],
      ['missing config', { name: 'test-config', type: 'eval' }],
      ['null config', { name: 'test-config', type: 'eval', config: null }],
    ])('should return 400 for %s', async (_label, body) => {
      const res = await request(app).post('/api/configs').send(body);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /api/configs', () => {
    it('should return all configs with valid response schema', async () => {
      const createRes = await request(app)
        .post('/api/configs')
        .send({
          name: 'list-test',
          type: 'eval',
          config: { foo: 'bar' },
        });
      testConfigIds.add(createRes.body.id);

      const res = await request(app).get('/api/configs');

      expect(res.status).toBe(200);
      expect(res.body.configs.length).toBeGreaterThanOrEqual(1);

      const parsed = ListConfigsResponseSchema.safeParse(res.body);
      expect(parsed.success).toBe(true);
    });

    it('should filter configs by type query parameter', async () => {
      const createRes = await request(app).post('/api/configs').send({
        name: 'filter-test',
        type: 'redteam',
        config: {},
      });
      testConfigIds.add(createRes.body.id);

      const res = await request(app).get('/api/configs?type=redteam');

      expect(res.status).toBe(200);
      expect(res.body.configs.length).toBeGreaterThanOrEqual(1);
      for (const config of res.body.configs) {
        expect(config.type).toBe('redteam');
      }
    });

    it('should return 400 for empty type query parameter', async () => {
      const res = await request(app).get('/api/configs?type=');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /api/configs/:type', () => {
    it('should return configs filtered by type with valid response schema', async () => {
      const createRes = await request(app)
        .post('/api/configs')
        .send({
          name: 'type-filter-test',
          type: 'eval',
          config: { hello: 'world' },
        });
      testConfigIds.add(createRes.body.id);

      const res = await request(app).get('/api/configs/eval');

      expect(res.status).toBe(200);
      expect(res.body.configs.length).toBeGreaterThanOrEqual(1);

      const parsed = ListConfigsByTypeResponseSchema.safeParse(res.body);
      expect(parsed.success).toBe(true);
    });

    it('should return empty array for unknown type', async () => {
      const res = await request(app).get('/api/configs/nonexistent-type-xyz');

      expect(res.status).toBe(200);
      expect(res.body.configs).toEqual([]);
    });
  });

  describe('GET /api/configs/:type/:id', () => {
    it('should return a specific config with valid response schema', async () => {
      const createRes = await request(app)
        .post('/api/configs')
        .send({
          name: 'get-test',
          type: 'eval',
          config: { key: 'value' },
        });
      const configId = createRes.body.id;
      testConfigIds.add(configId);

      const res = await request(app).get(`/api/configs/eval/${configId}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(configId);
      expect(res.body.name).toBe('get-test');
      expect(res.body.type).toBe('eval');
      expect(res.body.config).toEqual({ key: 'value' });

      const parsed = GetConfigResponseSchema.safeParse(res.body);
      expect(parsed.success).toBe(true);
    });

    it('should return 404 for non-existent config', async () => {
      const res = await request(app).get('/api/configs/eval/non-existent-id');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Config not found');
    });
  });
});
