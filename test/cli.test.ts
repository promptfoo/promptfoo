import { spawn } from 'child_process';

const runCliCommand = (args: string[]) => {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
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
  });
};

describe('CLI Tool', () => {
  describe('--help and --version', () => {
    it('should display help menu', async () => {
      const { stdout } = await runCliCommand(['--help']);
      expect(stdout).toContain('Usage: main [options] [command]');
    });

    it('should display version', async () => {
      const { stdout } = await runCliCommand(['--version']);
      expect(stdout).toMatch(/\d+\.\d+\.\d+/); // Expect version number format
    });
  });
});
