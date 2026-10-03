import { expect, it } from 'vitest';

it('initializes both shared table consumers without a Node process global', async () => {
  expect('process' in globalThis).toBe(false);

  const [store, report] = await Promise.all([
    import('../../pages/eval/components/store'),
    import('../../pages/redteam/report/components/Report'),
  ]);

  expect(store.useTableStore.getState().table).toBeNull();
  expect(report.default).toBeTypeOf('function');
  expect('process' in globalThis).toBe(false);
});
