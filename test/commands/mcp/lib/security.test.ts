import fs from 'fs';
import os from 'os';
import path from 'path';

import { describe, expect, it, vi } from 'vitest';
import { ConfigurationError } from '../../../../src/commands/mcp/lib/errors';
import {
  validateFilePath,
  validateMcpConfigFile,
  validateMcpFilePath,
  validateProviderId,
  validateProviderReference,
} from '../../../../src/commands/mcp/lib/security';
import { escapeRegExp } from '../../../../src/util/text';

describe('MCP Security', () => {
  describe('validateFilePath', () => {
    it('should allow simple relative paths', () => {
      expect(() => validateFilePath('output.yaml')).not.toThrow();
      expect(() => validateFilePath('data/results.json')).not.toThrow();
      expect(() => validateFilePath('my-file.txt')).not.toThrow();
    });

    it('should reject paths containing ".."', () => {
      expect(() => validateFilePath('../etc/passwd')).toThrow(ConfigurationError);
      expect(() => validateFilePath('foo/../bar')).toThrow(ConfigurationError);
      expect(() => validateFilePath('/tmp/../etc/passwd')).toThrow(ConfigurationError);
    });

    it('should reject paths containing "~"', () => {
      expect(() => validateFilePath('~/.ssh/id_rsa')).toThrow(ConfigurationError);
      expect(() => validateFilePath('~/Documents/file.txt')).toThrow(ConfigurationError);
    });

    it.skipIf(process.platform === 'win32')('should reject paths to system directories', () => {
      // Unix paths are only recognized as absolute on Unix systems
      expect(() => validateFilePath('/etc/passwd')).toThrow(ConfigurationError);
      expect(() => validateFilePath('/sys/kernel')).toThrow(ConfigurationError);
      expect(() => validateFilePath('/proc/self/environ')).toThrow(ConfigurationError);
      expect(() => validateFilePath('/dev/null')).toThrow(ConfigurationError);
      expect(() => validateFilePath('/var/run/docker.sock')).toThrow(ConfigurationError);
    });

    it.skipIf(process.platform !== 'win32')('should reject Windows system directories', () => {
      // Windows paths are only recognized as absolute on Windows
      expect(() => validateFilePath('C:\\Windows\\System32\\config')).toThrow(ConfigurationError);
      expect(() => validateFilePath('C:\\Program Files\\app')).toThrow(ConfigurationError);
      expect(() => validateFilePath('C:\\ProgramData\\secret')).toThrow(ConfigurationError);
    });

    it.skipIf(process.platform === 'win32')(
      'should allow absolute paths to non-system directories',
      () => {
        // Unix paths are only recognized as absolute on Unix systems
        expect(() => validateFilePath('/tmp/output.yaml')).not.toThrow();
        expect(() => validateFilePath('/home/user/data.json')).not.toThrow();
        expect(() => validateFilePath('/Users/test/file.txt')).not.toThrow();
      },
    );

    describe('with basePath', () => {
      it('should allow paths within the base directory', () => {
        expect(() => validateFilePath('output.yaml', '/tmp/workdir')).not.toThrow();
        expect(() => validateFilePath('subdir/file.txt', '/tmp/workdir')).not.toThrow();
      });

      it('should reject paths that escape the base directory', () => {
        // Note: ".." is caught by the pre-normalization check
        expect(() => validateFilePath('../escape.txt', '/tmp/workdir')).toThrow(ConfigurationError);
      });
    });

    it('should include the original path in the error details', () => {
      try {
        validateFilePath('../etc/passwd');
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        expect((error as ConfigurationError).details).toEqual({ configPath: '../etc/passwd' });
      }
    });
  });

  describe('validateMcpFilePath', () => {
    it('should constrain paths to the current working directory', () => {
      const cwd = process.cwd();
      const insidePath = path.join(cwd, 'mcp-output.yaml');
      const outsidePath = path.join(path.dirname(cwd), 'outside-mcp-output.yaml');

      expect(() => validateMcpFilePath('mcp-output.yaml')).not.toThrow();
      expect(() => validateMcpFilePath(insidePath)).not.toThrow();
      expect(() => validateMcpFilePath(outsidePath)).toThrow(ConfigurationError);
    });

    it.skipIf(process.platform === 'win32')(
      'should reject paths that traverse outside the workspace through symlinks',
      () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-mcp-security-'));
        const workspace = path.join(tempRoot, 'workspace');
        const outside = path.join(tempRoot, 'outside');
        fs.mkdirSync(workspace);
        fs.mkdirSync(outside);
        fs.symlinkSync(outside, path.join(workspace, 'linked-outside'));
        const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(workspace);

        try {
          expect(() => validateMcpFilePath('linked-outside/output.yaml')).toThrow(
            ConfigurationError,
          );
        } finally {
          cwdSpy.mockRestore();
          fs.rmSync(tempRoot, { force: true, recursive: true });
        }
      },
    );

    it.skipIf(process.platform === 'win32')(
      'should allow real workspace paths when cwd is a symlink',
      () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-mcp-security-'));
        const realWorkspace = path.join(tempRoot, 'real-workspace');
        const symlinkWorkspace = path.join(tempRoot, 'symlink-workspace');
        fs.mkdirSync(realWorkspace);
        fs.symlinkSync(realWorkspace, symlinkWorkspace);
        const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(symlinkWorkspace);

        try {
          expect(() => validateMcpFilePath(path.join(realWorkspace, 'output.yaml'))).not.toThrow();
        } finally {
          cwdSpy.mockRestore();
          fs.rmSync(tempRoot, { force: true, recursive: true });
        }
      },
    );
  });

  describe('escapeRegExp', () => {
    it('should escape special regex characters', () => {
      expect(escapeRegExp('hello.world')).toBe('hello\\.world');
      expect(escapeRegExp('foo*bar')).toBe('foo\\*bar');
      expect(escapeRegExp('a+b')).toBe('a\\+b');
      expect(escapeRegExp('test?')).toBe('test\\?');
      expect(escapeRegExp('^start')).toBe('\\^start');
      expect(escapeRegExp('end$')).toBe('end\\$');
    });

    it('should escape brackets and braces', () => {
      expect(escapeRegExp('[abc]')).toBe('\\[abc\\]');
      expect(escapeRegExp('{1,3}')).toBe('\\{1,3\\}');
      expect(escapeRegExp('(group)')).toBe('\\(group\\)');
    });

    it('should escape pipe and backslash', () => {
      expect(escapeRegExp('a|b')).toBe('a\\|b');
      expect(escapeRegExp('path\\to\\file')).toBe('path\\\\to\\\\file');
    });

    it('should return strings without special chars unchanged', () => {
      expect(escapeRegExp('hello')).toBe('hello');
      expect(escapeRegExp('openai:gpt-4')).toBe('openai:gpt-4');
      expect(escapeRegExp('simple_test')).toBe('simple_test');
    });

    it('should handle empty strings', () => {
      expect(escapeRegExp('')).toBe('');
    });

    it('should produce strings safe for regex construction', () => {
      const userInput = 'openai:gpt-4.0';
      const escaped = escapeRegExp(userInput);
      const regex = new RegExp(escaped);
      expect(regex.test('openai:gpt-4.0')).toBe(true);
      expect(regex.test('openai:gpt-4X0')).toBe(false); // "." should not match any char
    });
  });

  describe('validateProviderId', () => {
    it('should accept valid provider:model format', () => {
      expect(() => validateProviderId('echo')).not.toThrow();
      expect(() => validateProviderId('custom-provider')).not.toThrow();
      expect(() => validateProviderId('openai:gpt-4')).not.toThrow();
      expect(() => validateProviderId('anthropic:claude-3')).not.toThrow();
      expect(() => validateProviderId('azure:gpt-4o')).not.toThrow();
      expect(() => validateProviderId('openai:chat:gpt-5.4-2026-03-05')).not.toThrow();
      expect(() => validateProviderId('bedrock:us.anthropic.claude-opus-4-6-v1:0')).not.toThrow();
      expect(() =>
        validateProviderId('bedrock:arn:aws:bedrock:us-east-2::inference-profile/model'),
      ).not.toThrow();
      expect(() =>
        validateProviderId('cloudflare-ai:chat:@cf/meta/llama-3.1-8b-instruct'),
      ).not.toThrow();
      expect(() =>
        validateProviderId('promptfoo://provider/12345678-1234-1234-1234-123456789abc'),
      ).not.toThrow();
    });

    it('should accept file path providers', () => {
      expect(() => validateProviderId('providers/custom.js')).not.toThrow();
      expect(() => validateProviderId('my-provider.cjs')).not.toThrow();
      expect(() => validateProviderId('my-provider.ts')).not.toThrow();
      expect(() => validateProviderId('script.py')).not.toThrow();
      expect(() => validateProviderId('module.mjs')).not.toThrow();
      expect(() => validateProviderId('file://evaluation/main.go:CallApi')).not.toThrow();
      expect(() => validateProviderId('file://echo_provider.rb')).not.toThrow();
      expect(() => validateProviderId('file://my_provider.rb:Providers::Chat.call')).not.toThrow();
      expect(() => validateProviderId('file://providers.yaml')).not.toThrow();
      expect(() => validateProviderId('file://providers.json')).not.toThrow();
      expect(() => validateProviderId('file://providers/custom.js')).not.toThrow();
      expect(() => validateProviderId('file://script.py:getProvider')).not.toThrow();
    });

    it('should reject prefixed script providers outside the workspace', () => {
      expect(() =>
        validateProviderId(`python:${path.join(path.dirname(process.cwd()), 'evil.py')}`),
      ).toThrow(ConfigurationError);
      expect(() =>
        validateProviderId(`golang:${path.join(path.dirname(process.cwd()), 'evil.go')}`),
      ).toThrow(ConfigurationError);
      expect(() =>
        validateProviderId(`ruby:${path.join(path.dirname(process.cwd()), 'evil.rb')}`),
      ).toThrow(ConfigurationError);
    });

    it('should render env provider paths before containment checks', () => {
      const outsideWorkspace = path.join(path.dirname(process.cwd()), 'templated-provider.py');

      expect(() =>
        validateProviderId('file://{{ env.MCP_PROVIDER_DIR }}/templated-provider.py', {
          MCP_PROVIDER_DIR: path.dirname(outsideWorkspace),
        }),
      ).toThrow(ConfigurationError);
      expect(() =>
        validateProviderId('file://{{ env.UNRESOLVED_PROVIDER_DIR }}/templated-provider.py'),
      ).toThrow(ConfigurationError);
    });

    it('should reject nested provider paths outside the workspace in provider config files', () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-mcp-security-'));
      const workspace = path.join(tempRoot, 'workspace');
      const outside = path.join(tempRoot, 'outside');
      fs.mkdirSync(workspace);
      fs.mkdirSync(outside);
      fs.writeFileSync(
        path.join(workspace, 'provider.json'),
        JSON.stringify({ id: `file://${path.join(outside, 'evil.py')}` }),
      );
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(workspace);

      try {
        expect(() => validateProviderId('file://provider.json')).toThrow(ConfigurationError);
      } finally {
        cwdSpy.mockRestore();
        fs.rmSync(tempRoot, { force: true, recursive: true });
      }
    });

    it('should apply outer env overrides while validating nested provider config files', () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-mcp-security-'));
      const workspace = path.join(tempRoot, 'workspace');
      const outside = path.join(tempRoot, 'outside');
      fs.mkdirSync(workspace);
      fs.mkdirSync(outside);
      fs.writeFileSync(
        path.join(workspace, 'inner.json'),
        JSON.stringify({
          id: 'file://{{ env.DIR }}/evil.py',
          env: { DIR: workspace },
        }),
      );
      fs.writeFileSync(
        path.join(workspace, 'outer.json'),
        JSON.stringify({
          id: 'file://inner.json',
          env: { DIR: outside },
        }),
      );
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(workspace);

      try {
        expect(() => validateProviderId('file://outer.json')).toThrow(ConfigurationError);
      } finally {
        cwdSpy.mockRestore();
        fs.rmSync(tempRoot, { force: true, recursive: true });
      }
    });

    it('should reject provider map keys and option file references outside the workspace', () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-mcp-security-'));
      const workspace = path.join(tempRoot, 'workspace');
      const outside = path.join(tempRoot, 'outside');
      fs.mkdirSync(workspace);
      fs.mkdirSync(outside);
      const outsideProvider = `file://${path.join(outside, 'evil.py')}`;
      fs.writeFileSync(
        path.join(workspace, 'provider-map.json'),
        JSON.stringify({ [outsideProvider]: {} }),
      );
      fs.writeFileSync(
        path.join(workspace, 'provider-options.json'),
        JSON.stringify({
          id: 'http://localhost:8080',
          config: { transformRequest: `file://${path.join(outside, 'evil.js')}` },
        }),
      );
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(workspace);

      try {
        expect(() => validateProviderId('file://provider-map.json')).toThrow(ConfigurationError);
        expect(() => validateProviderId('file://provider-options.json')).toThrow(
          ConfigurationError,
        );
      } finally {
        cwdSpy.mockRestore();
        fs.rmSync(tempRoot, { force: true, recursive: true });
      }
    });

    it('should validate file references in direct provider options', () => {
      expect(() =>
        validateProviderReference({
          id: 'http://localhost:8080',
          config: {
            transformResponse: `file://${path.join(path.dirname(process.cwd()), 'evil.js')}`,
          },
        }),
      ).toThrow(ConfigurationError);
    });

    it('should allow exec providers with in-workspace script arguments', () => {
      expect(() => validateProviderId('exec:node scripts/provider.js --format json')).not.toThrow();
      expect(() =>
        validateProviderId(`exec:node ${path.join(path.dirname(process.cwd()), 'evil.js')}`),
      ).toThrow(ConfigurationError);
    });

    it('should reject exec providers that run inline code instead of workspace scripts', () => {
      expect(() => validateProviderId('exec:bash -c id')).toThrow(ConfigurationError);
      expect(() => validateProviderId('exec:node --eval "console.log(process.env)"')).toThrow(
        ConfigurationError,
      );
      expect(() => validateProviderId('exec:python -c "print(1)"')).toThrow(ConfigurationError);
    });

    it('should validate paths embedded in exec option assignments', () => {
      const outsideModule = path.join(path.dirname(process.cwd()), 'evil.js');

      expect(() =>
        validateProviderId(`exec:node --require=${outsideModule} scripts/provider.js`),
      ).toThrow(ConfigurationError);
      expect(() =>
        validateProviderId('exec:node --require=scripts/bootstrap.js scripts/provider.js'),
      ).not.toThrow();
    });

    it('should reject MCP provider server command configs', () => {
      expect(() =>
        validateProviderReference({
          id: 'mcp',
          config: {
            server: {
              command: 'node',
              args: ['scripts/server.js'],
            },
          },
        }),
      ).toThrow(ConfigurationError);
    });

    it('should validate MCP provider server paths against the workspace', () => {
      expect(() =>
        validateProviderReference({
          id: 'mcp',
          config: { server: { path: 'scripts/mcp-server.js' } },
        }),
      ).not.toThrow();

      expect(() =>
        validateProviderReference({
          id: 'mcp',
          config: { server: { path: path.join(path.dirname(process.cwd()), 'server.js') } },
        }),
      ).toThrow(ConfigurationError);
    });

    it('should validate nested MCP configs on other providers', () => {
      expect(() =>
        validateProviderReference({
          id: 'openai:gpt-4o',
          config: {
            mcp: {
              servers: [{ path: path.join(path.dirname(process.cwd()), 'server.py') }],
            },
          },
        }),
      ).toThrow(ConfigurationError);
    });

    it('should accept HTTP providers', () => {
      expect(() => validateProviderId('http://localhost:8080/api')).not.toThrow();
      expect(() => validateProviderId('https://api.example.com/v1')).not.toThrow();
    });

    it('should reject invalid formats', () => {
      expect(() => validateProviderId('invalid provider')).toThrow(ConfigurationError);
      expect(() => validateProviderId('')).toThrow(ConfigurationError);
      expect(() => validateProviderId('openai:\nmalformed')).toThrow(ConfigurationError);
      expect(() => validateProviderId('file://not-a-provider.txt')).toThrow(ConfigurationError);
      expect(() => validateProviderId('../providers/custom.js')).toThrow(ConfigurationError);
      expect(() => validateProviderId('openai:../../secret')).toThrow(ConfigurationError);
      expect(() =>
        validateProviderId(`file://${path.join(path.dirname(process.cwd()), 'evil.py')}`),
      ).toThrow(ConfigurationError);
      expect(() =>
        validateProviderId(`file://${path.join(path.dirname(process.cwd()), 'evil.yaml')}`),
      ).toThrow(ConfigurationError);
    });
  });

  describe('validateMcpConfigFile', () => {
    it('should reject file references in static configuration before resolution', () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-mcp-security-'));
      const workspace = path.join(tempRoot, 'workspace');
      const outside = path.join(tempRoot, 'outside');
      fs.mkdirSync(workspace);
      fs.mkdirSync(outside);
      fs.writeFileSync(
        path.join(workspace, 'promptfooconfig.json'),
        JSON.stringify({
          prompts: ['hello'],
          providers: [
            {
              id: 'http://localhost:8080',
              config: { transformResponse: `file://${path.join(outside, 'evil.js')}` },
            },
          ],
        }),
      );
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(workspace);

      try {
        expect(() => validateMcpConfigFile('promptfooconfig.json')).toThrow(ConfigurationError);
      } finally {
        cwdSpy.mockRestore();
        fs.rmSync(tempRoot, { force: true, recursive: true });
      }
    });

    it('should reject external JSON-schema refs before config dereferencing', () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-mcp-security-'));
      const workspace = path.join(tempRoot, 'workspace');
      const outside = path.join(tempRoot, 'outside');
      fs.mkdirSync(workspace);
      fs.mkdirSync(outside);
      fs.writeFileSync(
        path.join(workspace, 'promptfooconfig.yaml'),
        [
          'prompts:',
          '  - hello',
          'providers:',
          `  - $ref: ${path.join(outside, 'provider.yaml')}`,
          '',
        ].join('\n'),
      );
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(workspace);

      try {
        expect(() => validateMcpConfigFile('promptfooconfig.yaml')).toThrow(ConfigurationError);
      } finally {
        cwdSpy.mockRestore();
        fs.rmSync(tempRoot, { force: true, recursive: true });
      }
    });

    it('should allow internal JSON-schema refs', () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-mcp-security-'));
      const workspace = path.join(tempRoot, 'workspace');
      fs.mkdirSync(workspace);
      fs.writeFileSync(
        path.join(workspace, 'promptfooconfig.yaml'),
        [
          'prompts:',
          '  - hello',
          'providers:',
          '  - $ref: "#/defs/provider"',
          'defs:',
          '  provider: echo',
          '',
        ].join('\n'),
      );
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(workspace);

      try {
        expect(() => validateMcpConfigFile('promptfooconfig.yaml')).not.toThrow();
      } finally {
        cwdSpy.mockRestore();
        fs.rmSync(tempRoot, { force: true, recursive: true });
      }
    });

    it('should validate the contents of local JSON-schema refs', () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-mcp-security-'));
      const workspace = path.join(tempRoot, 'workspace');
      const outside = path.join(tempRoot, 'outside');
      fs.mkdirSync(workspace);
      fs.mkdirSync(outside);
      fs.writeFileSync(
        path.join(workspace, 'provider.yaml'),
        `id: file://${path.join(outside, 'evil.py')}\n`,
      );
      fs.writeFileSync(
        path.join(workspace, 'promptfooconfig.yaml'),
        ['prompts: [hello]', 'providers:', '  - $ref: ./provider.yaml', ''].join('\n'),
      );
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(workspace);

      try {
        expect(() => validateMcpConfigFile('promptfooconfig.yaml')).toThrow(ConfigurationError);
      } finally {
        cwdSpy.mockRestore();
        fs.rmSync(tempRoot, { force: true, recursive: true });
      }
    });

    it('should reject dynamic config files before importing them', () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-mcp-security-'));
      const workspace = path.join(tempRoot, 'workspace');
      fs.mkdirSync(workspace);
      fs.writeFileSync(
        path.join(workspace, 'promptfooconfig.js'),
        'export default { prompts: ["hello"], providers: ["echo"] };\n',
      );
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(workspace);

      try {
        expect(() => validateMcpConfigFile('promptfooconfig.js')).toThrow(
          /Dynamic JavaScript and TypeScript config files are not allowed/,
        );
      } finally {
        cwdSpy.mockRestore();
        fs.rmSync(tempRoot, { force: true, recursive: true });
      }
    });

    it('should validate every config matched by a glob', () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-mcp-security-'));
      const workspace = path.join(tempRoot, 'workspace');
      const configs = path.join(workspace, 'configs');
      const outside = path.join(tempRoot, 'outside');
      fs.mkdirSync(workspace);
      fs.mkdirSync(configs);
      fs.mkdirSync(outside);
      fs.writeFileSync(
        path.join(configs, 'unsafe.yaml'),
        `prompts: [hello]\nproviders: [file://${path.join(outside, 'evil.py')}]\n`,
      );
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(workspace);

      try {
        expect(() => validateMcpConfigFile('configs/*.yaml')).toThrow(ConfigurationError);
      } finally {
        cwdSpy.mockRestore();
        fs.rmSync(tempRoot, { force: true, recursive: true });
      }
    });

    it('should validate prompt map keys and defaultTest paths', () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-mcp-security-'));
      const workspace = path.join(tempRoot, 'workspace');
      const outside = path.join(tempRoot, 'outside');
      fs.mkdirSync(workspace);
      fs.mkdirSync(outside);
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(workspace);

      try {
        fs.writeFileSync(
          path.join(workspace, 'promptfooconfig.yaml'),
          ['prompts:', `  ${path.join(outside, 'evil.py')}: unsafe`, 'providers: [echo]', ''].join(
            '\n',
          ),
        );
        expect(() => validateMcpConfigFile('promptfooconfig.yaml')).toThrow(ConfigurationError);

        fs.writeFileSync(
          path.join(workspace, 'promptfooconfig.yaml'),
          [
            'prompts: [hello]',
            'providers: [echo]',
            `defaultTest: ${path.join(outside, 'default.yaml')}`,
            '',
          ].join('\n'),
        );
        expect(() => validateMcpConfigFile('promptfooconfig.yaml')).toThrow(ConfigurationError);
      } finally {
        cwdSpy.mockRestore();
        fs.rmSync(tempRoot, { force: true, recursive: true });
      }
    });

    it('should render env templates before classifying bare local references', () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-mcp-security-'));
      const workspace = path.join(tempRoot, 'workspace');
      const outside = path.join(tempRoot, 'outside');
      fs.mkdirSync(workspace);
      fs.mkdirSync(outside);
      fs.writeFileSync(
        path.join(workspace, 'promptfooconfig.yaml'),
        [
          'env:',
          `  PROMPT_PATH: ${path.join(outside, 'evil.py')}`,
          'prompts: "{{ env.PROMPT_PATH }}"',
          'providers: [echo]',
          '',
        ].join('\n'),
      );
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(workspace);

      try {
        expect(() => validateMcpConfigFile('promptfooconfig.yaml')).toThrow(ConfigurationError);
      } finally {
        cwdSpy.mockRestore();
        fs.rmSync(tempRoot, { force: true, recursive: true });
      }
    });

    it('should reject bare local file references outside the workspace', () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-mcp-security-'));
      const workspace = path.join(tempRoot, 'workspace');
      const outside = path.join(tempRoot, 'outside');
      fs.mkdirSync(workspace);
      fs.mkdirSync(outside);
      fs.writeFileSync(
        path.join(workspace, 'promptfooconfig.json'),
        JSON.stringify({
          outputPath: path.join(outside, 'results.json'),
          prompts: [path.join(outside, 'prompt.py')],
          providers: ['echo'],
          tests: path.join(outside, 'tests.yaml'),
        }),
      );
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(workspace);

      try {
        expect(() => validateMcpConfigFile('promptfooconfig.json')).toThrow(ConfigurationError);
      } finally {
        cwdSpy.mockRestore();
        fs.rmSync(tempRoot, { force: true, recursive: true });
      }
    });

    it('should reject executable prompts that run inline code', () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-mcp-security-'));
      const workspace = path.join(tempRoot, 'workspace');
      fs.mkdirSync(workspace);
      fs.writeFileSync(
        path.join(workspace, 'promptfooconfig.json'),
        JSON.stringify({
          prompts: ['exec:bash -c id'],
          providers: ['echo'],
        }),
      );
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(workspace);

      try {
        expect(() => validateMcpConfigFile('promptfooconfig.json')).toThrow(ConfigurationError);
      } finally {
        cwdSpy.mockRestore();
        fs.rmSync(tempRoot, { force: true, recursive: true });
      }
    });
  });
});
