import request from 'supertest';
import { runDbMigrations } from '../../src/migrate';
import { createApp } from '../../src/server/server';

describe('share', () => {
  const app = createApp();
  beforeAll(async () => {
    await runDbMigrations();
  });
});
