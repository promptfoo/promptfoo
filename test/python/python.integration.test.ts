import { exec } from 'child_process';
import dedent from 'dedent';
import fs from 'fs';
import path from 'path';
import util from 'util';
import logger from '../../src/logger';
import { runPython } from '../../src/python/pythonUtils';

const execPromise = util.promisify(exec);

describe('pythonUtils Integration Tests', () => {
  const scriptsDir = path.join(__dirname, 'scripts');

  beforeAll(() => {
    if (!fs.existsSync(scriptsDir)) {
      fs.mkdirSync(scriptsDir);
    }

    fs.writeFileSync(
      path.join(scriptsDir, 'simple.py'),
      dedent`
        import json
        import sys

        def main(*args):
            message = ' '.join(str(arg) for arg in args)
            return {
                'message': message,
                'success': True
            }

        def print_to_stdout(*args):
            message = ' '.join(str(arg) for arg in args)
            print(message)
            return main(*args)

        class TestClass:
            @classmethod
            def class_method(cls, *args):
                return main(*args)

        async def async_function(*args):
            return main(*args)
        `,
    );

    fs.writeFileSync(
      path.join(scriptsDir, 'with_imports.py'),
      dedent`
        import os
        import datetime

        def get_env_and_date():
            return {
                'env': os.environ.get('TEST_ENV', 'not set'),
                'date': str(datetime.datetime.now().date())
            }
        `,
    );
  });

  afterAll(() => {
    fs.rmSync(path.join(scriptsDir), { recursive: true, force: true });
  });

  it('should be able to call Python directly', async () => {
    const { stdout } = await execPromise('python --version');
    expect(stdout).toContain('Python');
  });

  it('should successfully run a simple Python script', async () => {
    const result = await runPython(path.join(scriptsDir, 'simple.py'), 'main', ['Hello, World!']);
    expect(result).toEqual({
      message: 'Hello, World!',
      success: true,
    });
  });

  it('should handle multiple arguments', async () => {
    const result = await runPython(path.join(scriptsDir, 'simple.py'), 'main', [
      'Multiple',
      'Arguments',
    ]);
    expect(result).toEqual({
      message: 'Multiple Arguments',
      success: true,
    });
  });

  it('should handle empty string argument', async () => {
    const result = await runPython(path.join(scriptsDir, 'simple.py'), 'main', ['']);
    expect(result).toEqual({
      message: '',
      success: true,
    });
  });

  it('should handle non-string argument', async () => {
    const result = await runPython(path.join(scriptsDir, 'simple.py'), 'main', [123]);
    expect(result).toEqual({
      message: '123',
      success: true,
    });
  });

  it('should throw an error for non-existent script', async () => {
    const nonExistentPath = path.join(scriptsDir, 'non_existent.py');
    await expect(runPython(nonExistentPath, 'main', ['test'])).rejects.toThrow(expect.any(Error));
  });

  it('should handle Python script that prints to stdout', async () => {
    const result = await runPython(path.join(scriptsDir, 'simple.py'), 'print_to_stdout', [
      'Print to stdout',
    ]);
    expect(result).toEqual({
      message: 'Print to stdout',
      success: true,
    });
  });

  it('should handle class methods', async () => {
    const result = await runPython(path.join(scriptsDir, 'simple.py'), 'TestClass.class_method', [
      'Class method',
    ]);
    expect(result).toEqual({
      message: 'Class method',
      success: true,
    });
  });

  it('should handle async functions', async () => {
    const result = await runPython(path.join(scriptsDir, 'simple.py'), 'async_function', [
      'Async function',
    ]);
    expect(result).toEqual({
      message: 'Async function',
      success: true,
    });
  });

  it('should handle scripts with imports', async () => {
    const result = await runPython(
      path.join(scriptsDir, 'with_imports.py'),
      'get_env_and_date',
      [],
    );
    expect(result).toHaveProperty('env');
    expect(result).toHaveProperty('date');
    expect((result as any).env).toBe('not set');
    expect(new Date((result as any).date)).toBeInstanceOf(Date);
  });

  it('should handle scripts with environment variables', async () => {
    process.env.TEST_ENV = 'test_value';
    const result = await runPython(
      path.join(scriptsDir, 'with_imports.py'),
      'get_env_and_date',
      [],
    );
    expect((result as any).env).toBe('test_value');
    delete process.env.TEST_ENV;
  });

  it('should log debug messages', async () => {
    jest.clearAllMocks();

    const result = await runPython(path.join(scriptsDir, 'simple.py'), 'main', ['Debug Test']);

    expect(result).toEqual({
      message: 'Debug Test',
      success: true,
    });
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Running Python wrapper with args'),
    );
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Python script'));
  });
});
