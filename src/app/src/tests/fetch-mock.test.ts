import { describe, expect, it } from 'vitest';

describe('frontend fetch test setup', () => {
  it('provides app bootstrap fetch defaults', async () => {
    await expect(
      fetch('/api/providers/config-status').then((response) => response.json()),
    ).resolves.toEqual({
      success: true,
      data: { hasCustomConfig: false },
    });

    await expect(
      fetch('/api/user/cloud-config').then((response) => response.json()),
    ).resolves.toEqual({});

    await expect(fetch('/api/providers').then((response) => response.json())).resolves.toEqual({
      success: true,
      data: {
        hasCustomConfig: false,
        providers: [],
      },
    });
  });

  it('rejects unhandled provider fetches', async () => {
    await expect(fetch('/api/providers/test', { method: 'POST' })).rejects.toThrow(
      'Unhandled POST fetch request in frontend test setup: /api/providers/test',
    );
  });

  it('reports the method from Request inputs', async () => {
    await expect(
      fetch(new Request('http://localhost/api/unmocked', { method: 'PUT' })),
    ).rejects.toThrow(
      'Unhandled PUT fetch request in frontend test setup: http://localhost/api/unmocked',
    );
  });
});
