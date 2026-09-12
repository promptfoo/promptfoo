import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigurationError } from '../../../../src/commands/mcp/lib/errors';
import {
  validateMcpConfigFile,
  validateMcpFilePath,
  validateMcpProviderPrompt,
  validateProviderId,
  validateProviderReference,
} from '../../../../src/commands/mcp/lib/security';
import { escapeRegExp } from '../../../../src/util/text';

describe('MCP Security', () => {
  describe('execution boundaries', () => {
    let root: string;
    let workspace: string;
    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-execution-'));
      workspace = path.join(root, 'workspace');
      fs.mkdirSync(path.join(workspace, 'sub'), { recursive: true });
      fs.writeFileSync(path.join(workspace, 'script.js'), 'console.log("fixture")');
      vi.spyOn(process, 'cwd').mockReturnValue(workspace);
    });
    afterEach(() => {
      vi.restoreAllMocks();
      fs.rmSync(root, { recursive: true, force: true });
    });

    it.each(['javascript', 'python', 'ruby'])(
      'rejects inline %s assertions before configuration loading',
      (type) => {
        fs.writeFileSync(
          path.join(workspace, 'config.json'),
          JSON.stringify({
            prompts: ['hello'],
            providers: ['echo'],
            tests: [{ assert: [{ type: 'assert-set', assert: [{ type, value: 'return true' }] }] }],
          }),
        );
        expect(() => validateMcpConfigFile('config.json')).toThrow(ConfigurationError);
      },
    );

    it.each([
      ['ws://localhost:1234', 'transformResponse'],
      ['ws://localhost:1234', 'responseParser'],
      ['a2a:http://localhost:1234', 'transformResponse'],
      ['mcp', 'transformResponse'],
      ['browser', 'responseParser'],
      ['n8n:http://localhost:1234', 'transformResponse'],
      ['n8n:http://localhost:1234', 'sessionParser'],
    ])('rejects inline %s %s code', (id, key) => {
      expect(() => validateProviderReference({ id, config: { [key]: 'process.cwd()' } })).toThrow(
        ConfigurationError,
      );
    });

    it('rejects inline transforms on provider options', () => {
      expect(() => validateProviderReference({ id: 'echo', transform: 'process.cwd()' })).toThrow(
        ConfigurationError,
      );
      expect(() =>
        validateProviderReference({ id: 'sagemaker:model', config: { transform: 'evil()' } }),
      ).toThrow(ConfigurationError);
    });

    it('rejects inline context transforms and runtime preload env', () => {
      fs.writeFileSync(
        path.join(workspace, 'config.json'),
        JSON.stringify({
          tests: [{ assert: [{ type: 'context-recall', contextTransform: 'process.cwd()' }] }],
        }),
      );
      expect(() => validateMcpConfigFile('config.json')).toThrow(ConfigurationError);
      expect(() =>
        validateProviderId('exec:env NODE_OPTIONS=--require=/tmp/evil.js node ./script.js'),
      ).toThrow(ConfigurationError);
      expect(() => validateProviderId('exec:env PYTHONPATH=/tmp/evil python ./script.py')).toThrow(
        ConfigurationError,
      );
    });

    it('rejects executable test options and HTTP certificate paths outside the workspace', () => {
      fs.writeFileSync(
        path.join(workspace, 'config.json'),
        JSON.stringify({ tests: [{ options: { transformVars: 'evil()' } }] }),
      );
      expect(() => validateMcpConfigFile('config.json')).toThrow(ConfigurationError);
      expect(() =>
        validateProviderReference({
          id: 'http://localhost:8080',
          config: { tls: { certPath: path.join(root, 'outside.pem') } },
        }),
      ).toThrow(ConfigurationError);
    });

    it('rejects inline callbacks and multipart path sources', () => {
      expect(() =>
        validateProviderReference({
          id: 'openai:assistant:fixture',
          config: { functionToolCallbacks: { lookup: 'process.cwd()' } },
        }),
      ).toThrow(ConfigurationError);
      expect(() =>
        validateProviderReference({
          id: 'http://localhost:8080',
          config: {
            multipart: { parts: [{ source: { type: 'path', path: path.join(root, 'outside') } }] },
          },
        }),
      ).toThrow(ConfigurationError);
    });

    it('allows inert path-shaped values and external test arrays', () => {
      expect(() =>
        validateProviderReference({
          id: 'http://localhost:8080',
          config: { body: { type: 'path', path: '/etc/passwd' } },
        }),
      ).not.toThrow();
      fs.writeFileSync(
        path.join(workspace, 'tests.json'),
        JSON.stringify([{ vars: { transform: 'uppercase this' } }]),
      );
      expect(() => validateMcpConfigFile('tests.json')).not.toThrow();
      fs.writeFileSync(
        path.join(workspace, 'metadata.json'),
        JSON.stringify({ metadata: { type: 'record', transform: 'literal value' } }),
      );
      expect(() => validateMcpConfigFile('metadata.json')).not.toThrow();
    });

    it('keeps the runtime provider base when following a nested schema reference', () => {
      fs.writeFileSync(path.join(workspace, 'sub', 'provider.yaml'), 'id: python:../outside.py\n');
      fs.writeFileSync(
        path.join(workspace, 'config.yaml'),
        'prompts: [hello]\nproviders:\n  - $ref: ./sub/provider.yaml\n',
      );
      expect(() => validateMcpConfigFile('config.yaml')).toThrow(ConfigurationError);
    });

    it('keeps provider config context when following a schema reference', () => {
      fs.writeFileSync(
        path.join(workspace, 'sub', 'provider-config.yaml'),
        'transformResponse: evil()\n',
      );
      fs.writeFileSync(
        path.join(workspace, 'config.yaml'),
        'prompts: [hello]\nproviders:\n  - id: http://localhost:8080\n    config:\n      $ref: ./sub/provider-config.yaml\n',
      );
      expect(() => validateMcpConfigFile('config.yaml')).toThrow(ConfigurationError);
    });

    it('keeps assertion context for file and schema references', () => {
      fs.writeFileSync(
        path.join(workspace, 'assertions.yaml'),
        '- type: javascript\n  value: return true\n',
      );
      fs.writeFileSync(
        path.join(workspace, 'config.yaml'),
        [
          'prompts: [hello]',
          'providers: [echo]',
          'tests:',
          '  - assert: [file://assertions.yaml]',
          '',
        ].join('\n'),
      );
      expect(() => validateMcpConfigFile('config.yaml')).toThrow(ConfigurationError);

      fs.writeFileSync(
        path.join(workspace, 'assertion-ref.yaml'),
        'type: javascript\nvalue: return true\n',
      );
      fs.writeFileSync(
        path.join(workspace, 'config.yaml'),
        'prompts: [hello]\nproviders: [echo]\ntests:\n  - assert:\n      - $ref: ./assertion-ref.yaml\n',
      );
      expect(() => validateMcpConfigFile('config.yaml')).toThrow(ConfigurationError);

      fs.writeFileSync(
        path.join(workspace, 'config.yaml'),
        [
          'prompts: [hello]',
          'providers: [echo]',
          'tests:',
          '  - assert:',
          '      - $ref: "#/defs/assertion"',
          'defs:',
          '  assertion:',
          '    type: javascript',
          '    value: return true',
          '',
        ].join('\n'),
      );
      expect(() => validateMcpConfigFile('config.yaml')).toThrow(ConfigurationError);
    });

    it('resolves nested schema reference paths relative to the containing file', () => {
      fs.writeFileSync(path.join(workspace, 'sub', 'provider.yaml'), '$ref: ./nested.yaml\n');
      fs.writeFileSync(path.join(workspace, 'sub', 'nested.yaml'), 'id: echo\n');
      fs.writeFileSync(
        path.join(workspace, 'config.yaml'),
        'prompts: [hello]\nproviders:\n  - $ref: ./sub/provider.yaml\n',
      );
      expect(() => validateMcpConfigFile('config.yaml')).not.toThrow();
    });

    it('rejects browser screenshot paths outside the workspace', () => {
      expect(() =>
        validateProviderReference({
          id: 'browser',
          config: {
            actions: [{ action: 'screenshot', args: { path: path.join(root, 'outside.png') } }],
          },
        }),
      ).toThrow(ConfigurationError);
    });

    it('rejects cloud provider references that bypass local config validation', () => {
      expect(() =>
        validateProviderId('promptfoo://provider/12345678-1234-1234-1234-123456789abc'),
      ).toThrow(ConfigurationError);
    });

    it.each(['-lc', '-xc'])('rejects bundled shell execution flag %s', (flag) => {
      expect(() => validateProviderId(`exec:bash ${flag} 'echo ./script.js' ./script.js`)).toThrow(
        ConfigurationError,
      );
    });

    it('requires an existing workspace script rather than a path-shaped argument', () => {
      expect(() => validateProviderId('exec:node missing.js')).toThrow(ConfigurationError);
      expect(() => validateProviderId('exec:node ./script.js')).not.toThrow();
      expect(() =>
        validateProviderId('exec:awk \'BEGIN { system("id") }\' ./package.json'),
      ).toThrow(ConfigurationError);
    });

    it('does not treat ordinary variable text as a provider reference', () => {
      fs.writeFileSync(
        path.join(workspace, 'config.json'),
        JSON.stringify({
          prompts: ['hello'],
          providers: ['echo'],
          tests: [{ vars: { snippet: 'python: print(1)' } }],
        }),
      );
      expect(() => validateMcpConfigFile('config.json')).not.toThrow();
    });

    it.each([
      'openai:transcription:gpt-transcribe',
      'elevenlabs:stt:fixture',
      'elevenlabs:isolation',
    ])('guards file prompts for %s', (id) => {
      expect(() => validateMcpProviderPrompt({ id }, path.join(root, 'outside.wav'))).toThrow(
        ConfigurationError,
      );
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
      'allows contained ../ paths but rejects dangling symlinks',
      () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-mcp-path-'));
        const workspace = path.join(root, 'workspace');
        fs.mkdirSync(path.join(workspace, 'nested'), { recursive: true });
        fs.symlinkSync(
          path.join(root, 'missing', 'outside.txt'),
          path.join(workspace, 'dangling.txt'),
        );
        const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(workspace);
        try {
          expect(() =>
            validateMcpFilePath('../inside.txt', path.join(workspace, 'nested')),
          ).not.toThrow();
          expect(() => validateMcpFilePath('dangling.txt')).toThrow(ConfigurationError);
          expect(() => validateMcpFilePath('../outside.txt')).toThrow(ConfigurationError);
        } finally {
          cwdSpy.mockRestore();
          fs.rmSync(root, { recursive: true, force: true });
        }
      },
    );

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
    });

    it.each([
      'anthropic:messages:claude-sonnet-4-6',
      'openai:chat:gpt-4.1-mini',
      'openai:chat:team/served-model:revision-1',
      'huggingface:chat:organization/model-name',
      'openrouter:organization/model-name',
      'openai:chat:ft:gpt-4.1-mini-2025-04-14:company-name::ID',
      'openai:responses:ft:gpt-4.1-nano-2025-04-14:openai::BTz2REMH',
      'openai:completion:ft:babbage-002:company-name::ID',
      'openai:chat:ft:gpt-4.1-mini-2025-04-14:company-name::ID:ckpt-step-2000',
      'openai:chat:team/served-model::revision-1',
      'bedrock:converse:arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-pro-v1:0',
      'ollama:chat:organization/model-name:latest',
      'openrouter:organization/model-name:free',
    ])('accepts model modes and namespaces: %s', (providerId) => {
      expect(() => validateProviderId(providerId)).not.toThrow();
    });

    it('rejects exec commands without a workspace script', () => {
      expect(() => validateProviderId('exec:script')).toThrow(ConfigurationError);
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
      for (const config of [
        { auth: { type: 'file', path: path.join(path.dirname(process.cwd()), 'auth.js') } },
        { transformRequest: '(request) => request' },
        { validateStatus: 'status => status < 500' },
      ]) {
        expect(() => validateProviderReference({ id: 'http://localhost:8080', config })).toThrow(
          ConfigurationError,
        );
      }
      expect(() =>
        validateProviderReference({
          id: 'http://localhost:8080',
          env: { MODULE: `file://${path.join(path.dirname(process.cwd()), 'transform.js')}` },
          config: { transformRequest: '{{ env.MODULE }}' },
        }),
      ).toThrow(ConfigurationError);
    });

    it('should allow exec providers with in-workspace script arguments', () => {
      expect(() =>
        validateProviderId('exec:node src/providers/scriptCompletion.ts --format json'),
      ).not.toThrow();
      expect(() =>
        validateProviderId(`exec:node ${path.join(path.dirname(process.cwd()), 'evil.js')}`),
      ).toThrow(ConfigurationError);
    });

    it('distinguishes scoped packages and HTTP URLs from local provider paths', () => {
      expect(() => validateProviderId('package:@scope/prompt-provider:Provider')).not.toThrow();
      expect(() => validateProviderId('package:/tmp/outside.mjs:Provider')).toThrow(
        ConfigurationError,
      );
      expect(() => validateProviderId('package:@scope/../outside:Provider')).toThrow(
        ConfigurationError,
      );
      expect(() => validateProviderId('https://example.test/~team/api')).not.toThrow();
      expect(() => validateProviderId('https://example.test/a/../api')).not.toThrow();
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
        validateProviderId(
          `exec:node --require=${outsideModule} src/providers/scriptCompletion.ts`,
        ),
      ).toThrow(ConfigurationError);
      expect(() =>
        validateProviderId(`exec:node -r${outsideModule} src/providers/scriptCompletion.ts`),
      ).toThrow(ConfigurationError);
      expect(() =>
        validateProviderId(
          'exec:node --require=src/constants.ts src/providers/scriptCompletion.ts',
        ),
      ).not.toThrow();
      expect(() =>
        validateProviderId(
          'exec:node --require src/constants.ts src/providers/scriptCompletion.ts',
        ),
      ).not.toThrow();
    });

    it('rejects exec options that can launch another command after a workspace path', () => {
      expect(() => validateProviderId('exec:tar ./script.js --checkpoint-action=exec=sh')).toThrow(
        ConfigurationError,
      );
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
    it('validates referenced scenario and JSONL test contents', () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-mcp-security-'));
      const workspace = path.join(tempRoot, 'workspace');
      const outside = path.join(tempRoot, 'outside.py');
      fs.mkdirSync(workspace);
      fs.writeFileSync(
        path.join(workspace, 'scenarios.yaml'),
        '- tests:\n    - provider: file://' + outside + '\n',
      );
      fs.writeFileSync(
        path.join(workspace, 'tests.jsonl'),
        JSON.stringify({ provider: 'file://' + outside }),
      );
      try {
        for (const config of [
          { prompts: ['hello'], providers: ['echo'], scenarios: 'scenarios.yaml' },
          { prompts: ['hello'], providers: ['echo'], tests: 'tests.jsonl' },
        ]) {
          fs.writeFileSync(path.join(workspace, 'config.json'), JSON.stringify(config));
          expect(() => validateMcpConfigFile('config.json', workspace)).toThrow(ConfigurationError);
        }
      } finally {
        fs.rmSync(tempRoot, { force: true, recursive: true });
      }
    });

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
      try {
        expect(() => validateMcpConfigFile('promptfooconfig.json', workspace)).toThrow(
          ConfigurationError,
        );
      } finally {
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
      try {
        expect(() => validateMcpConfigFile('promptfooconfig.yaml', workspace)).toThrow(
          ConfigurationError,
        );
      } finally {
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
      try {
        expect(() => validateMcpConfigFile('promptfooconfig.yaml', workspace)).not.toThrow();
      } finally {
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
      try {
        expect(() => validateMcpConfigFile('promptfooconfig.yaml', workspace)).toThrow(
          ConfigurationError,
        );
      } finally {
        fs.rmSync(tempRoot, { force: true, recursive: true });
      }
    });

    it('rejects remote test sources before resolution', () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-mcp-security-'));
      const workspace = path.join(tempRoot, 'workspace');
      fs.mkdirSync(workspace);
      fs.writeFileSync(
        path.join(workspace, 'promptfooconfig.yaml'),
        'prompts: [hello]\nproviders: [echo]\ntests: az://bucket/tests.yaml\n',
      );
      try {
        expect(() => validateMcpConfigFile('promptfooconfig.yaml', workspace)).toThrow(
          ConfigurationError,
        );
      } finally {
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

      try {
        expect(() => validateMcpConfigFile('promptfooconfig.js', workspace)).toThrow(
          /Dynamic JavaScript and TypeScript config files are not allowed/,
        );
      } finally {
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
      try {
        expect(() => validateMcpConfigFile('configs/*.yaml', workspace)).toThrow(
          ConfigurationError,
        );
        const links = path.join(workspace, 'links');
        fs.mkdirSync(links);
        fs.writeFileSync(path.join(outside, 'filter.mjs'), 'export default () => true;\n');
        fs.symlinkSync(path.join(outside, 'filter.mjs'), path.join(links, 'filter.mjs'));
        fs.writeFileSync(
          path.join(configs, 'safe.yaml'),
          JSON.stringify({
            prompts: ['hello'],
            providers: ['echo'],
            nunjucksFilters: { filter: '../links/*.mjs' },
          }),
        );
        expect(() => validateMcpConfigFile('configs/safe.yaml', workspace)).toThrow(
          ConfigurationError,
        );
      } finally {
        fs.rmSync(tempRoot, { force: true, recursive: true });
      }
    });

    it('should validate prompt map keys and defaultTest paths', () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-mcp-security-'));
      const workspace = path.join(tempRoot, 'workspace');
      const outside = path.join(tempRoot, 'outside');
      fs.mkdirSync(workspace);
      fs.mkdirSync(outside);
      try {
        fs.writeFileSync(
          path.join(workspace, 'promptfooconfig.yaml'),
          ['prompts:', `  ${path.join(outside, 'evil.py')}: unsafe`, 'providers: [echo]', ''].join(
            '\n',
          ),
        );
        expect(() => validateMcpConfigFile('promptfooconfig.yaml', workspace)).toThrow(
          ConfigurationError,
        );

        fs.writeFileSync(
          path.join(workspace, 'promptfooconfig.yaml'),
          [
            'prompts: [hello]',
            'providers: [echo]',
            `defaultTest: ${path.join(outside, 'default.yaml')}`,
            '',
          ].join('\n'),
        );
        expect(() => validateMcpConfigFile('promptfooconfig.yaml', workspace)).toThrow(
          ConfigurationError,
        );
      } finally {
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
      try {
        expect(() => validateMcpConfigFile('promptfooconfig.yaml', workspace)).toThrow(
          ConfigurationError,
        );
      } finally {
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
      try {
        expect(() => validateMcpConfigFile('promptfooconfig.json', workspace)).toThrow(
          ConfigurationError,
        );
      } finally {
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
      try {
        expect(() => validateMcpConfigFile('promptfooconfig.json', workspace)).toThrow(
          ConfigurationError,
        );
        fs.writeFileSync(
          path.join(workspace, 'promptfooconfig.json'),
          JSON.stringify({
            prompts: [`exec:node --require=${path.join(tempRoot, 'outside.js')} scripts/prompt.js`],
            providers: ['echo'],
          }),
        );
        expect(() => validateMcpConfigFile('promptfooconfig.json', workspace)).toThrow(
          ConfigurationError,
        );
      } finally {
        fs.rmSync(tempRoot, { force: true, recursive: true });
      }
    });

    it('checks nested prompt and test contents and prompt object raw paths', () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-mcp-nested-'));
      const workspace = path.join(root, 'workspace');
      fs.mkdirSync(workspace);
      const external = path.join(root, 'outside.txt');
      fs.writeFileSync(
        path.join(workspace, 'prompt.json'),
        JSON.stringify({ raw: `file://${external}` }),
      );
      fs.writeFileSync(
        path.join(workspace, 'tests.json'),
        JSON.stringify([{ provider: `file://${external}` }]),
      );
      fs.writeFileSync(external, 'MCP_FIXTURE=local\n');
      fs.symlinkSync(external, path.join(workspace, '.env'));
      try {
        for (const config of [
          { prompts: [{ raw: external }], providers: ['echo'] },
          { prompts: ['prompt.json'], providers: ['echo'] },
          { prompts: ['hello'], providers: ['echo'], tests: 'tests.json' },
          { prompts: ['hello'], providers: ['echo'], commandLineOptions: { envPath: external } },
          { prompts: ['hello'], providers: ['echo'], commandLineOptions: { envPath: '.env' } },
        ]) {
          fs.writeFileSync(path.join(workspace, 'promptfooconfig.json'), JSON.stringify(config));
          expect(() => validateMcpConfigFile('promptfooconfig.json', workspace)).toThrow(
            ConfigurationError,
          );
        }
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it('uses each referenced file and provider environment when scanning paths', () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-mcp-env-'));
      const workspace = path.join(root, 'workspace');
      fs.mkdirSync(workspace);
      fs.writeFileSync(
        path.join(workspace, 'sub.yaml'),
        `env:\n  P: ${root}/outside.txt\nprompts: '{{ env.P }}'\nproviders: [echo]\n`,
      );
      fs.writeFileSync(
        path.join(workspace, 'provider.json'),
        JSON.stringify({ id: 'file://{{ env.DIR }}/script.py' }),
      );
      try {
        fs.writeFileSync(
          path.join(workspace, 'promptfooconfig.yaml'),
          'providers:\n  - $ref: ./sub.yaml\n',
        );
        expect(() => validateMcpConfigFile('promptfooconfig.yaml', workspace)).toThrow(
          ConfigurationError,
        );

        fs.writeFileSync(
          path.join(workspace, 'promptfooconfig.yaml'),
          JSON.stringify({
            prompts: ['hello'],
            providers: [
              { id: 'file://provider.json', env: { DIR: workspace } },
              { id: 'file://provider.json', env: { DIR: root } },
            ],
          }),
        );
        expect(() => validateMcpConfigFile('promptfooconfig.yaml', workspace)).toThrow(
          ConfigurationError,
        );
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  });
});
