import { beforeEach, expect, it, vi } from 'vitest';
import { PythonWorker } from '../../src/python/worker';

const mocks = vi.hoisted(() => ({ validate: vi.fn(), spawn: vi.fn() }));

vi.mock('../../src/python/pythonUtils', () => ({ validatePythonPath: mocks.validate }));
vi.mock('python-shell', () => ({
  PythonShell: class {
    constructor() {
      mocks.spawn();
    }
  },
}));

beforeEach(() => vi.resetAllMocks());

it('does not spawn a Python worker after shutdown during executable validation', async () => {
  let finishValidation!: (path: string) => void;
  mocks.validate.mockReturnValue(new Promise<string>((resolve) => (finishValidation = resolve)));
  const worker = new PythonWorker('/tmp/fixture.py', 'call_api');
  const initialization = worker.initialize().catch(() => undefined);

  await worker.shutdown();
  finishValidation('/usr/bin/python3');
  await initialization;

  expect(mocks.spawn).not.toHaveBeenCalled();
});
