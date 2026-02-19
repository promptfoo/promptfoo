import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

      // Validate response matches schema
      const parsed = CreateConfigResponseSchema.safeParse(res.body);
      expect(parsed.success).toBe(true);
    });

    it('should return 400 for missing name', async () => {
      const res = await request(app).post('/api/configs').send({
        type: 'eval',
        config: {},
      });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 400 for missing type', async () => {
      const res = await request(app).post('/api/configs').send({
        name: 'test-config',
        config: {},
      });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 400 for empty name', async () => {
      const res = await request(app).post('/api/configs').send({
        name: '',
        type: 'eval',
        config: {},
      });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 400 for missing config', async () => {
      const res = await request(app).post('/api/configs').send({
        name: 'test-config',
        type: 'eval',
      });

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

      // Validate response matches schema
      const parsed = ListConfigsResponseSchema.safeParse(res.body);
      expect(parsed.success).toBe(true);

      // Verify each config has expected fields
      for (const config of res.body.configs) {
        expect(config).toHaveProperty('id');
        expect(config).toHaveProperty('name');
        expect(config).toHaveProperty('createdAt');
        expect(config).toHaveProperty('updatedAt');
        expect(config).toHaveProperty('type');
      }
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

      // Validate response matches schema
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

      // Validate response matches schema
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
