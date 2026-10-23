import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/util/apiHealth');

import { createApp } from '../../../src/server/server';
import { checkRemoteHealth } from '../../../src/util/apiHealth';
import { mockProcessEnv } from '../../util/utils';

const mockedCheckRemoteHealth = vi.mocked(checkRemoteHealth);

describe('Remote Health Route', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.resetAllMocks();
    app = createApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  it('returns DISABLED without upstream egress in no-network mode', async () => {
    const restoreEnv = mockProcessEnv({ PROMPTFOO_NO_NETWORK: 'true' });
    try {
      const response = await request(app).get('/api/remote-health');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ status: 'DISABLED' });
      // The upstream health check must never fire: no-network mode
      // promises zero non-eval egress, and the web UI polls this route
      // every 3 seconds.
      expect(mockedCheckRemoteHealth).not.toHaveBeenCalled();
    } finally {
      restoreEnv();
    }
  });

  it('checks upstream health when no-network mode is off', async () => {
    const restoreEnv = mockProcessEnv({ PROMPTFOO_NO_NETWORK: undefined });
    mockedCheckRemoteHealth.mockResolvedValue({ status: 'OK', message: 'healthy' });
    try {
      const response = await request(app).get('/api/remote-health');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ status: 'OK', message: 'healthy' });
      expect(mockedCheckRemoteHealth).toHaveBeenCalledTimes(1);
    } finally {
      restoreEnv();
    }
  });
});
