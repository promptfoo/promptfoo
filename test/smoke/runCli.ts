import { spawnSync } from 'node:child_process';
import path from 'node:path';

export const CLI_PATH = path.resolve(__dirname, '../../dist/src/main.js');
export const ROOT_DIR = path.resolve(__dirname, '../..');

export function runCli(
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {},
): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync('node', [CLI_PATH, ...args], {
    cwd: options.cwd || ROOT_DIR,
    encoding: 'utf-8',
    env: { ...process.env, ...options.env, NO_COLOR: '1' },
    timeout: options.timeout || 60000,
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1,
  };
}
