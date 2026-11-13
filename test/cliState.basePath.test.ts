import { expect, it, vi } from 'vitest';
import cliState from '../src/cliState';

it('shares the active base path across module copies and isolates concurrent evaluations', async () => {
  vi.resetModules();
  const { default: extensionState } = await import('../src/cliState');
  expect(extensionState).not.toBe(cliState);

  const original = extensionState.basePath;
  await Promise.all(
    ['first/config', 'second/config'].map((basePath) =>
      cliState.withBasePath(basePath, async () => {
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(extensionState.basePath).toBe(basePath);
        extensionState.withBasePath(undefined, () => expect(cliState.basePath).toBeUndefined());
        expect(extensionState.basePath).toBe(basePath);
      }),
    ),
  );

  expect(extensionState.basePath).toBe(original);
});
