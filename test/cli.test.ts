import { spawn } from 'child_process';
import { version } from '../package.json';

const runCliCommand = (args: string[]) => {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    try {
      const child = spawn('npm', ['run', 'local', '--', ...args], { shell: true });
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Command failed with exit code ${code}\n${stderr}`));
        }
      });
    } catch (error) {
      reject(error);
    }
  });
};

describe('CLI Tool', () => {
  describe('--help and --version', () => {
    it('should display help menu', async () => {
      const { stdout } = await runCliCommand(['--help']);
      const subset = stdout.split('ts-node --cwdMode --transpileOnly src/main.ts --help')[1];
      expect(subset).toMatchSnapshot();
      expect(stdout).toContain('Usage: main [options] [command]');
    });

    it('should display version', async () => {
      const { stdout } = await runCliCommand(['--version']);
      expect(stdout).toMatch(/\d+\.\d+\.\d+/);
      expect(stdout).toContain(version);
    });
  });
});
