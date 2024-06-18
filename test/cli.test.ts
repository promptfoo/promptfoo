import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const cliPath = 'npm run local --';

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
  describe.only('--help and --version', () => {
    it('should display help menu', async () => {
      const { stdout } = await runCliCommand(['--help']);
      expect(stdout).toContain('Usage: main [options] [command]');
    });

    it('should display version', async () => {
      const { stdout } = await runCliCommand(['--version']);
      expect(stdout).toMatch(/\d+\.\d+\.\d+/); // Expect version number format
    });
  });

  describe('init command', () => {
    it('should initialize project with dummy files in current directory', async () => {
      const { stdout } = await runCliCommand(['init']);
      expect(stdout).toContain('Project initialized with dummy files');
    });

    it('should initialize project with dummy files in specified directory', async () => {
      const tempDir = path.join(__dirname, 'temp');
      fs.mkdirSync(tempDir, { recursive: true });
      const { stdout } = await runCliCommand(['init', tempDir]);
      expect(stdout).toContain(`Project initialized with dummy files in ${tempDir}`);
      fs.rmdirSync(tempDir, { recursive: true });
    });

    it('should run in non-interactive mode', async () => {
      const { stdout } = await runCliCommand(['init', '--no-interactive']);
      expect(stdout).toContain('Project initialized with dummy files');
    });
  });

  describe('view command', () => {
    it('should start browser UI on default port', async () => {
      const { stdout } = await runCliCommand(['view']);
      expect(stdout).toContain('Starting server on port 15500');
    });

    it('should start browser UI on specified port', async () => {
      const { stdout } = await runCliCommand(['view', '--port', '16000']);
      expect(stdout).toContain('Starting server on port 16000');
    });

    it('should start browser UI with specified options', async () => {
      const { stdout } = await runCliCommand(['view', '--yes']);
      expect(stdout).toContain('Auto-opening the URL');
    });
  });

  describe('share command', () => {
    it('should create a shareable URL', async () => {
      const { stdout } = await runCliCommand(['share']);
      expect(stdout).toContain('View results:');
    });

    it('should create a shareable URL with confirmation', async () => {
      const { stdout } = await runCliCommand(['share', '--yes']);
      expect(stdout).toContain('View results:');
    });
  });

  describe('cache command', () => {
    it('should clear cache', async () => {
      const { stdout } = await runCliCommand(['cache', 'clear']);
      expect(stdout).toContain('Clearing cache...');
    });
  });

  describe('feedback command', () => {
    it('should send feedback', async () => {
      const { stdout } = await runCliCommand(['feedback', 'Great tool!']);
      expect(stdout).toContain('Thank you for your feedback!');
    });

    it('should prompt for feedback if no message provided', async () => {
      const { stdout } = await runCliCommand(['feedback']);
      expect(stdout).toContain('Please provide your feedback:');
    });
  });

  describe('generate command', () => {
    describe('dataset subcommand', () => {
      it('should generate synthetic data', async () => {
        const { stdout } = await runCliCommand(['generate', 'dataset']);
        expect(stdout).toContain('New test Cases');
      });

      it('should generate synthetic data with specific options', async () => {
        const { stdout } = await runCliCommand(['generate', 'dataset', '--numPersonas', '3']);
        expect(stdout).toContain('New test Cases');
      });
    });

    describe('redteam subcommand', () => {
      it('should generate adversarial test cases', async () => {
        const { stdout } = await runCliCommand(['generate', 'redteam']);
        expect(stdout).toContain('Wrote new test cases');
      });

      it('should generate adversarial test cases with specific options', async () => {
        const { stdout } = await runCliCommand([
          'generate',
          'redteam',
          '--purpose',
          'test-purpose',
        ]);
        expect(stdout).toContain('Wrote new test cases');
      });
    });
  });

  describe('eval command', () => {
    it('should evaluate prompts', async () => {
      const { stdout } = await runCliCommand(['eval']);
      expect(stdout).toContain('Evaluation complete');
    });

    it('should evaluate prompts with specific configuration', async () => {
      const { stdout } = await runCliCommand(['eval', '--config', 'path/to/config']);
      expect(stdout).toContain('Evaluation complete');
    });
  });

  describe('list command', () => {
    it('should list resources', async () => {
      const { stdout } = await runCliCommand(['list']);
      expect(stdout).toContain('List of resources');
    });
  });

  describe('show command', () => {
    it('should show details of a specific resource', async () => {
      const { stdout } = await runCliCommand(['show', '1']);
      expect(stdout).toContain('Resource details for ID 1');
    });

    it('should show details of a specific resource with options', async () => {
      const { stdout } = await runCliCommand(['show', '1', '--verbose']);
      expect(stdout).toContain('Resource details for ID 1');
    });
  });

  describe('delete command', () => {
    it('should delete specified resource', async () => {
      const { stdout } = await runCliCommand(['delete', '1']);
      expect(stdout).toContain('Deleted resource with ID 1');
    });

    it('should delete specified resource with options', async () => {
      const { stdout } = await runCliCommand(['delete', '1', '--force']);
      expect(stdout).toContain('Deleted resource with ID 1');
    });
  });

  describe('import command', () => {
    it('should import eval record from JSON file', async () => {
      const { stdout } = await runCliCommand(['import', 'record.json']);
      expect(stdout).toContain('Imported eval record from record.json');
    });

    it('should import eval record from JSON file with options', async () => {
      const { stdout } = await runCliCommand(['import', 'record.json', '--verbose']);
      expect(stdout).toContain('Imported eval record from record.json');
    });
  });

  describe('export command', () => {
    it('should export eval record to JSON file', async () => {
      const { stdout } = await runCliCommand(['export', '1']);
      expect(stdout).toContain('Exported eval record for ID 1');
    });

    it('should export eval record to JSON file with options', async () => {
      const { stdout } = await runCliCommand(['export', '1', '--verbose']);
      expect(stdout).toContain('Exported eval record for ID 1');
    });
  });
});
