import { describe, expect, it } from 'vitest';
import { PythonProvider } from '../../src/providers/pythonCompletion';

describe('PythonProvider mixed-case construction', () => {
  it('splits the selector before constructing the worker path', () => {
    const provider = new PythonProvider('provider.PY:custom_call', {
      config: { basePath: '/base' },
    });

    expect(provider.id()).toBe('python:provider.PY:custom_call');
  });
});
