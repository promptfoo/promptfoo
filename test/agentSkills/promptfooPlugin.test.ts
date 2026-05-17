import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

const repoRoot = path.resolve(__dirname, '../..');
const pluginRoot = path.join(repoRoot, 'plugins', 'promptfoo');
const existingClaudePluginRoot = path.join(repoRoot, 'plugins', 'promptfoo-evals');
const repoClaudeSkillsRoot = path.join(repoRoot, '.claude', 'skills');
const repoCodexSkillsRoot = path.join(repoRoot, '.agents', 'skills');
const evalsSkillRoot = path.join(pluginRoot, 'skills', 'promptfoo-evals');
const providerSkillRoot = path.join(pluginRoot, 'skills', 'promptfoo-provider-setup');
const redteamSetupSkillRoot = path.join(pluginRoot, 'skills', 'promptfoo-redteam-setup');
const redteamRunSkillRoot = path.join(pluginRoot, 'skills', 'promptfoo-redteam-run');
const fixtureRoot = path.join(repoRoot, 'test', 'fixtures', 'agent-skills');
const expectedSkillDirs = [
  'promptfoo-evals',
  'promptfoo-provider-setup',
  'promptfoo-redteam-run',
  'promptfoo-redteam-setup',
];
const expectedFixtureDirs = [
  'evals-json-rubric',
  'evals-local-js',
  'evals-local-python',
  'provider-setup-http',
  'provider-setup-http-get',
  'provider-setup-http-openai-compatible',
  'provider-setup-http-text',
  'provider-setup-local-js',
  'provider-setup-local-python',
  'provider-setup-openapi',
  'provider-setup-redteam-target',
  'redteam-run-local-error',
  'redteam-run-local-mixed',
  'redteam-run-local-pass',
  'redteam-run-local-python-pass',
  'redteam-setup-live-http',
  'redteam-setup-multi-input',
  'redteam-setup-single-input',
  'redteam-setup-static-code',
  'redteam-setup-static-code-python',
];
const redteamRunFixtureDirs = [
  'redteam-run-local-pass',
  'redteam-run-local-python-pass',
  'redteam-run-local-mixed',
  'redteam-run-local-error',
] as const;
const fixturePythonExecutable =
  process.env.PROMPTFOO_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

type MarketplacePlugin = {
  name: string;
  source: { source: string; path: string };
  policy: { installation: string; authentication: string };
  category: string;
};

type OpenAiYaml = {
  interface: {
    display_name: string;
    short_description: string;
    default_prompt: string;
  };
  policy: {
    allow_implicit_invocation: boolean;
  };
};

type PromptfooFixtureConfig = Record<string, unknown> & {
  prompts?: unknown[];
  providers?: unknown[];
  targets?: unknown[];
  tests?: unknown[];
  redteam?: Record<string, unknown>;
};

type ProviderContext = {
  vars?: Record<string, string>;
};

type ProviderResult = {
  output?: unknown;
  error?: unknown;
  metadata?: unknown;
};

type FixtureProvider = {
  id(): string;
  callApi(
    prompt?: unknown,
    context?: ProviderContext,
    options?: Record<string, unknown>,
  ): Promise<ProviderResult>;
};

type FixtureProviderModule = {
  default: new (options?: Record<string, unknown>) => FixtureProvider;
};

type SkillFrontmatter = {
  name: string;
  description: string;
};

function readText(filePath: string) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n?/g, '\n');
}

function toPosixPath(filePath: string) {
  return filePath.split(path.sep).join('/');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectRecord(value: unknown, context: string): asserts value is Record<string, unknown> {
  expect(isRecord(value), `${context} should be an object`).toBe(true);
}

function listFiles(root: string, predicate: (filePath: string) => boolean): string[] {
  const pending = [root];
  const files: string[] = [];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      continue;
    }
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (predicate(entryPath)) {
        files.push(entryPath);
      }
    }
  }

  return files.sort();
}

function extractFileReference(reference: string): string | undefined {
  if (!reference.startsWith('file://')) {
    return undefined;
  }
  const filePathWithSuffix = reference.slice('file://'.length);
  const suffixIndex = filePathWithSuffix.indexOf(':');
  return suffixIndex === -1 ? filePathWithSuffix : filePathWithSuffix.slice(0, suffixIndex);
}

function extractFileFunctionName(reference: string): string | undefined {
  if (!reference.startsWith('file://')) {
    return undefined;
  }
  const filePathWithSuffix = reference.slice('file://'.length);
  const suffixIndex = filePathWithSuffix.indexOf(':');
  return suffixIndex === -1 ? undefined : filePathWithSuffix.slice(suffixIndex + 1);
}

function expectFileReferenceExists(reference: string, baseDir: string, context: string) {
  const filePath = extractFileReference(reference);
  if (!filePath) {
    return;
  }

  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(baseDir, filePath);
  const pathToCheck = /[*?[\]{}]/.test(filePath) ? path.dirname(absolutePath) : absolutePath;
  expect(fs.existsSync(pathToCheck), `${context}: ${reference} resolved to ${pathToCheck}`).toBe(
    true,
  );
}

function expectProviderFileReferencesExist(
  providers: unknown[] | undefined,
  configDir: string,
  context: string,
) {
  for (const provider of providers ?? []) {
    if (typeof provider === 'string') {
      expectFileReferenceExists(provider, configDir, context);
    } else if (isRecord(provider) && typeof provider.id === 'string') {
      expectFileReferenceExists(provider.id, configDir, context);
    }
  }
}

function collectPythonProviderReferencesFromConfig(
  configPath: string,
  config: PromptfooFixtureConfig,
): { absolutePath: string; context: string; functionName: string; reference: string }[] {
  const configDir = path.dirname(configPath);
  const references: {
    absolutePath: string;
    context: string;
    functionName: string;
    reference: string;
  }[] = [];
  const addReference = (reference: string, baseDir: string, context: string) => {
    const filePath = extractFileReference(reference);
    if (!filePath?.endsWith('.py')) {
      return;
    }
    references.push({
      absolutePath: path.isAbsolute(filePath) ? filePath : path.resolve(baseDir, filePath),
      context,
      functionName: extractFileFunctionName(reference) || 'call_api',
      reference,
    });
  };

  for (const provider of config.providers ?? []) {
    if (typeof provider === 'string') {
      addReference(provider, configDir, `${configPath} providers`);
    } else if (isRecord(provider) && typeof provider.id === 'string') {
      addReference(provider.id, configDir, `${configPath} providers`);
    }
  }

  for (const target of config.targets ?? []) {
    if (typeof target === 'string') {
      addReference(target, configDir, `${configPath} targets`);
    } else if (isRecord(target) && typeof target.id === 'string') {
      addReference(target.id, configDir, `${configPath} targets`);
    }
  }

  const redteamProvider = config.redteam?.provider;
  if (typeof redteamProvider === 'string') {
    addReference(redteamProvider, repoRoot, `${configPath} redteam.provider`);
  }

  return references;
}

function expectNoLiteralSecrets(filePath: string) {
  const text = readText(filePath);

  expect(text, filePath).not.toMatch(/sk-[A-Za-z0-9_-]{20,}/);
  expect(text, filePath).not.toMatch(/AKIA[0-9A-Z]{16}/);
  expect(text, filePath).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
  expect(text, filePath).not.toMatch(/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/);
  expect(text, filePath).not.toMatch(/:\s*['"]?\$[A-Z][A-Z0-9_]+/);
  expect(text, filePath).not.toMatch(/Bearer\s+\$[A-Z][A-Z0-9_]+/);
}

async function loadFixtureProvider(
  relativePath: string,
  options?: Record<string, unknown>,
): Promise<FixtureProvider> {
  const modulePath = path.join(fixtureRoot, relativePath);
  const module = (await import(pathToFileURL(modulePath).href)) as FixtureProviderModule;
  return new module.default(options);
}

function parseOutputJson(result: ProviderResult): Record<string, unknown> {
  expect(result.error).toBeUndefined();
  expect(typeof result.output).toBe('string');
  return JSON.parse(String(result.output)) as Record<string, unknown>;
}

function readSkillFrontmatter(skillRoot: string): SkillFrontmatter {
  const skill = readText(path.join(skillRoot, 'SKILL.md'));
  const match = /^---\n([\s\S]*?)\n---/.exec(skill);
  expect(match, `${skillRoot} should have YAML frontmatter`).not.toBeNull();
  if (!match) {
    throw new Error(`Missing YAML frontmatter in ${skillRoot}`);
  }
  return yaml.load(match[1]) as SkillFrontmatter;
}

function listSkillMarkdownFiles(): string[] {
  return listFiles(pluginRoot, (filePath) => filePath.endsWith('.md'));
}

function expectOpenApiHelperFailure(scriptPath: string, spec: unknown, expectedMessage: string) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-helper-'));
  const specPath = path.join(tempDir, 'openapi.yaml');
  try {
    fs.writeFileSync(specPath, yaml.dump(spec));
    expect(() =>
      execFileSync(
        'node',
        [
          scriptPath,
          '--spec',
          specPath,
          '--operation-id',
          'brokenOperation',
          '--base-url-env',
          'BROKEN_API_BASE_URL',
        ],
        { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' },
      ),
    ).toThrow(expectedMessage);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function openApiExamplePrecedenceSpec() {
  return {
    openapi: '3.1.0',
    components: {
      examples: {
        TenantExample: {
          value: 'tenant-from-example-ref',
        },
      },
    },
    paths: {
      '/example/{invoice-id}': {
        post: {
          operationId: 'createExampleNote',
          parameters: [
            {
              name: 'invoice-id',
              in: 'path',
              required: true,
              example: 'invoice-from-parameter-example',
              schema: { type: 'string' },
            },
            {
              name: 'tenant-id',
              in: 'query',
              required: true,
              examples: {
                tenant: { $ref: '#/components/examples/TenantExample' },
              },
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                example: {
                  user_id: 'user-from-media-example',
                  note_type: 'note-type-from-media-example',
                  message: 'media message should not override prompt smoke',
                },
                schema: {
                  type: 'object',
                  required: ['user_id', 'message', 'note_type'],
                  properties: {
                    user_id: { type: 'string' },
                    message: { type: 'string' },
                    note_type: { type: 'string', enum: ['note-type-from-schema-enum'] },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Example response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      output: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

function openApiVendorJsonSpec() {
  return {
    openapi: '3.1.0',
    paths: {
      '/vendor-json': {
        post: {
          operationId: 'createVendorJsonNote',
          requestBody: {
            required: true,
            content: {
              'application/vnd.promptfoo.note+json': {
                schema: {
                  type: 'object',
                  required: ['user_id', 'message'],
                  properties: {
                    user_id: { type: 'string', example: 'vendor-json-user' },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Vendor JSON response',
              content: {
                'application/vnd.promptfoo.response+json': {
                  schema: {
                    type: 'object',
                    properties: {
                      answer: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

function openApiOAuthSecuritySpec() {
  return {
    openapi: '3.1.0',
    components: {
      securitySchemes: {
        OAuthToken: {
          type: 'oauth2',
          flows: {
            clientCredentials: {
              tokenUrl: 'https://auth.example.test/oauth/token',
              scopes: {
                'invoices:read': 'Read invoice answers',
              },
            },
          },
        },
        OpenIdToken: {
          type: 'openIdConnect',
          openIdConnectUrl: 'https://auth.example.test/.well-known/openid-configuration',
        },
      },
    },
    paths: {
      '/oauth-search': {
        get: {
          operationId: 'oauthSearch',
          security: [{ OAuthToken: ['invoices:read'] }],
          parameters: [
            { name: 'q', in: 'query', schema: { type: 'string' } },
            { name: 'user_id', in: 'query', schema: { type: 'string', example: 'oauth-user' } },
          ],
          responses: {
            '200': {
              description: 'OAuth response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      answer: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/openid-search': {
        get: {
          operationId: 'openIdSearch',
          security: [{ OpenIdToken: [] }],
          parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'OpenID response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      answer: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

function openApiConjunctiveAuthSpec() {
  return {
    openapi: '3.1.0',
    components: {
      securitySchemes: {
        BearerToken: {
          type: 'http',
          scheme: 'bearer',
        },
        HeaderApiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
        },
        SessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'session_id',
        },
        CsrfCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'csrf_token',
        },
        UnsupportedMtls: {
          type: 'mutualTLS',
        },
      },
    },
    paths: {
      '/conjunctive-search': {
        get: {
          operationId: 'conjunctiveSearch',
          security: [{ BearerToken: [], HeaderApiKey: [], SessionCookie: [], CsrfCookie: [] }],
          parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'Conjunctive auth response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      answer: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/fallback-conjunctive-search': {
        get: {
          operationId: 'fallbackConjunctiveSearch',
          security: [
            { BearerToken: [], UnsupportedMtls: [] },
            { BearerToken: [], HeaderApiKey: [] },
          ],
          parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'Fallback conjunctive auth response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      answer: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/partial-conjunctive-search': {
        get: {
          operationId: 'partialConjunctiveSearch',
          security: [{ BearerToken: [], UnsupportedMtls: [] }],
          parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'Partial conjunctive auth response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      answer: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/explicit-no-auth-search': {
        get: {
          operationId: 'explicitNoAuthSearch',
          security: [],
          parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'Explicit no auth response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      answer: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/empty-requirement-search': {
        get: {
          operationId: 'emptyRequirementSearch',
          security: [{}],
          parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'Empty security requirement response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      answer: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/unsupported-auth-search': {
        get: {
          operationId: 'unsupportedAuthSearch',
          security: [{ UnsupportedMtls: [] }],
          parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'Unsupported auth response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      answer: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

function openApiAllOfSpec() {
  return {
    openapi: '3.1.0',
    components: {
      schemas: {
        IdentityPart: {
          type: 'object',
          required: ['user_id'],
          properties: {
            user_id: { type: 'string', example: 'allof-user' },
          },
        },
        MessagePart: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { type: 'string' },
          },
        },
        NotePart: {
          type: 'object',
          required: ['note_type'],
          properties: {
            note_type: { type: 'string', default: 'internal-note' },
          },
        },
        AllOfNoteRequest: {
          allOf: [
            { $ref: '#/components/schemas/IdentityPart' },
            { $ref: '#/components/schemas/MessagePart' },
            { $ref: '#/components/schemas/NotePart' },
          ],
        },
        TraceResponse: {
          type: 'object',
          properties: {
            trace_id: { type: 'string' },
          },
        },
        AnswerResponse: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
          },
        },
        AllOfNoteResponse: {
          allOf: [
            { $ref: '#/components/schemas/TraceResponse' },
            { $ref: '#/components/schemas/AnswerResponse' },
          ],
        },
      },
    },
    paths: {
      '/allof-note': {
        post: {
          operationId: 'createAllOfNote',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AllOfNoteRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'AllOf response',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AllOfNoteResponse' },
                },
              },
            },
          },
        },
      },
    },
  };
}

function openApiRepeatedRefSpec() {
  return {
    openapi: '3.1.0',
    components: {
      schemas: {
        SharedIdentity: {
          type: 'object',
          required: ['user_id'],
          properties: {
            user_id: { type: 'string', example: 'repeat-user' },
          },
        },
        SharedMessage: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { type: 'string' },
          },
        },
        RepeatedRefRequest: {
          allOf: [
            { $ref: '#/components/schemas/SharedIdentity' },
            { $ref: '#/components/schemas/SharedIdentity' },
            { $ref: '#/components/schemas/SharedMessage' },
          ],
        },
        OutputPart: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
          },
        },
        TracePart: {
          type: 'object',
          properties: {
            trace_id: { type: 'string' },
          },
        },
        RepeatedRefResponse: {
          allOf: [
            { $ref: '#/components/schemas/OutputPart' },
            { $ref: '#/components/schemas/OutputPart' },
            { $ref: '#/components/schemas/TracePart' },
          ],
        },
      },
    },
    paths: {
      '/repeated-ref-note': {
        post: {
          operationId: 'createRepeatedRefNote',
          requestBody: {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RepeatedRefRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Repeated ref response',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/RepeatedRefResponse' },
                },
              },
            },
          },
        },
      },
    },
  };
}

function openApiCamelCaseIdSpec() {
  return {
    openapi: '3.1.0',
    paths: {
      '/users/{userId}/invoices/{invoiceId}/chat': {
        post: {
          operationId: 'chatWithCamelCaseInvoice',
          parameters: [
            {
              name: 'userId',
              in: 'path',
              required: true,
              schema: { type: 'string', example: 'camel-user' },
            },
            {
              name: 'invoiceId',
              in: 'path',
              required: true,
              schema: { type: 'string', example: 'camel-invoice' },
            },
            {
              name: 'apiVersion',
              in: 'query',
              schema: { type: 'string', example: '2026-04-17' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['accountId', 'message'],
                  properties: {
                    accountId: { type: 'string', example: 'camel-account' },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Camel-case response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      answer: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

function openApiVariantSpec() {
  return {
    openapi: '3.1.0',
    components: {
      schemas: {
        SearchVariant: {
          type: 'object',
          required: ['user_id', 'query'],
          properties: {
            user_id: { type: 'string', example: 'variant-user' },
            query: { type: 'string' },
          },
        },
        IgnoredVariant: {
          type: 'object',
          required: ['ignored'],
          properties: {
            ignored: { type: 'string' },
          },
        },
        VariantRequest: {
          oneOf: [
            { $ref: '#/components/schemas/SearchVariant' },
            { $ref: '#/components/schemas/IgnoredVariant' },
          ],
        },
        VariantResponse: {
          anyOf: [
            {
              type: 'object',
              properties: {
                answer: { type: 'string' },
              },
            },
            {
              type: 'object',
              properties: {
                trace_id: { type: 'string' },
              },
            },
          ],
        },
      },
    },
    paths: {
      '/variant-search': {
        post: {
          operationId: 'variantSearch',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/VariantRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Variant response',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/VariantResponse' },
                },
              },
            },
          },
        },
      },
    },
  };
}

function openApiExampleOnlyBodySpec() {
  return {
    openapi: '3.1.0',
    paths: {
      '/example-only-note': {
        post: {
          operationId: 'createExampleOnlyNote',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                example: {
                  user_id: 'example-user',
                  message: 'Do exactly what this example says.',
                  note_type: 'support-note',
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Example-only response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      answer: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

function openApiTypedSchemaSpec() {
  return {
    openapi: '3.1.0',
    paths: {
      '/typed-note': {
        post: {
          operationId: 'createTypedNote',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: [
                    'user_id',
                    'message',
                    'limit',
                    'include_archived',
                    'tags',
                    'metadata',
                    'server_generated_id',
                    'status',
                    'contact_email',
                    'callback_url',
                    'request_id',
                    'scheduled_date',
                    'created_at',
                  ],
                  properties: {
                    user_id: { type: 'string', example: 'typed-user' },
                    message: { type: 'string' },
                    limit: { type: 'integer' },
                    confidence: { type: 'number' },
                    include_archived: { type: 'boolean' },
                    tags: {
                      type: 'array',
                      items: { type: 'string', enum: ['finance'] },
                    },
                    metadata: {
                      type: 'object',
                      required: ['region', 'priority'],
                      properties: {
                        region: { type: 'string', default: 'us-west' },
                        priority: { type: 'integer' },
                      },
                    },
                    server_generated_id: { type: 'string', readOnly: true, example: 'server-123' },
                    status: { const: 'queued' },
                    contact_email: { type: 'string', format: 'email' },
                    callback_url: { type: 'string', format: 'uri' },
                    request_id: { type: 'string', format: 'uuid' },
                    scheduled_date: { type: 'string', format: 'date' },
                    created_at: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Typed response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      answer: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

function openApiParameterOverrideSpec() {
  return {
    openapi: '3.1.0',
    paths: {
      '/override/{resource_id}': {
        parameters: [
          {
            name: 'api-version',
            in: 'query',
            schema: { type: 'string', example: 'path-version' },
          },
          {
            name: 'X-Trace-Id',
            in: 'header',
            schema: { type: 'string', example: 'path-trace' },
          },
        ],
        post: {
          operationId: 'overrideParameters',
          parameters: [
            {
              name: 'resource_id',
              in: 'path',
              required: true,
              schema: { type: 'string', example: 'resource-123' },
            },
            {
              name: 'api-version',
              in: 'query',
              schema: { type: 'string', example: 'operation-version' },
            },
            {
              name: 'X-Trace-Id',
              in: 'header',
              schema: { type: 'string', example: 'operation-trace' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['message'],
                  properties: {
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Override response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      answer: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

function openApiWriteOnlyResponseSpec() {
  return {
    openapi: '3.1.0',
    paths: {
      '/write-only-response': {
        post: {
          operationId: 'writeOnlyResponse',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['message'],
                  properties: {
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Write-only response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      secret_token: { type: 'string', writeOnly: true },
                      public_text: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

function openApiComposedVisibilitySpec() {
  return {
    openapi: '3.1.0',
    paths: {
      '/composed-visibility': {
        post: {
          operationId: 'composedVisibility',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['message', 'server_generated_id', 'audit_id', 'client_note'],
                  properties: {
                    message: { type: 'string' },
                    server_generated_id: {
                      allOf: [{ $ref: '#/components/schemas/ReadOnlyServerId' }],
                    },
                    audit_id: {
                      anyOf: [{ $ref: '#/components/schemas/ReadOnlyServerId' }],
                    },
                    client_note: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Composed visibility response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      secret_token: {
                        allOf: [{ $ref: '#/components/schemas/WriteOnlySecret' }],
                      },
                      hidden_key: {
                        oneOf: [{ $ref: '#/components/schemas/WriteOnlySecret' }],
                      },
                      public_text: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        ReadOnlyServerId: {
          type: 'string',
          readOnly: true,
          example: 'server-composed',
        },
        WriteOnlySecret: {
          type: 'string',
          writeOnly: true,
        },
      },
    },
  };
}

function openApiFormUrlEncodedSpec() {
  return {
    openapi: '3.1.0',
    paths: {
      '/form-chat': {
        post: {
          operationId: 'formChat',
          requestBody: {
            required: true,
            content: {
              'application/x-www-form-urlencoded': {
                schema: {
                  type: 'object',
                  required: ['user_id', 'message'],
                  properties: {
                    user_id: { type: 'string', example: 'form-user' },
                    message: { type: 'string' },
                    scope: { type: 'string', enum: ['billing support'] },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Form response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      answer: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

function openApiMultipartSpec() {
  return {
    openapi: '3.1.0',
    paths: {
      '/analyze-file': {
        post: {
          operationId: 'analyzeFile',
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['document', 'question'],
                  properties: {
                    document: { type: 'string', format: 'binary' },
                    question: { type: 'string' },
                    user_id: { type: 'string', example: 'multipart-user' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Multipart response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      output: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

function openApiTextPlainSpec() {
  return {
    openapi: '3.1.0',
    paths: {
      '/text-chat': {
        post: {
          operationId: 'textChat',
          requestBody: {
            required: true,
            content: {
              'text/plain': {
                schema: { type: 'string' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Text request response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      output: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

function openApiScalarExampleRequestSpec() {
  const response = {
    '200': {
      description: 'Scalar request response',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              output: { type: 'string' },
            },
          },
        },
      },
    },
  };
  return {
    openapi: '3.1.0',
    paths: {
      '/json-scalar-chat': {
        post: {
          operationId: 'jsonScalarChat',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                example: 'Say exactly PONG.',
              },
            },
          },
          responses: response,
        },
      },
      '/json-scalar-schema-chat': {
        post: {
          operationId: 'jsonScalarSchemaChat',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'string' },
              },
            },
          },
          responses: response,
        },
      },
      '/text-scalar-chat': {
        post: {
          operationId: 'textScalarChat',
          requestBody: {
            required: true,
            content: {
              'text/plain': {
                example: 'Say exactly PONG.',
              },
            },
          },
          responses: response,
        },
      },
    },
  };
}

function openApiArrayRequestSpec() {
  return {
    openapi: '3.1.0',
    paths: {
      '/batch-chat': {
        post: {
          operationId: 'batchChat',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                example: [
                  {
                    user_id: 'array-user',
                    message: 'example array message should not override prompt smoke',
                    priority: 'normal',
                  },
                ],
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['user_id', 'message'],
                    properties: {
                      user_id: { type: 'string' },
                      message: { type: 'string' },
                      priority: { type: 'string', enum: ['normal'] },
                      server_generated_id: { type: 'string', readOnly: true },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Batch response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      output: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

function openApiExampleOnlyArrayBodySpec() {
  return {
    openapi: '3.1.0',
    paths: {
      '/example-array-chat': {
        post: {
          operationId: 'exampleArrayChat',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                example: [
                  {
                    user_id: 'example-array-user',
                    message: 'example array message should not override prompt smoke',
                    priority: 'expedite',
                  },
                ],
              },
            },
          },
          responses: {
            '200': {
              description: 'Example array response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      output: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

function openApiArrayResponseSpec() {
  return {
    openapi: '3.1.0',
    paths: {
      '/array-response-chat': {
        post: {
          operationId: 'arrayResponseChat',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['message'],
                  properties: {
                    message: { type: 'string' },
                    user_id: { type: 'string', example: 'array-response-user' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Array response',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        trace_id: { type: 'string' },
                        output: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

function openApiExampleOnlyArrayResponseSpec() {
  return {
    openapi: '3.1.0',
    paths: {
      '/example-array-response-chat': {
        post: {
          operationId: 'exampleArrayResponseChat',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['message'],
                  properties: {
                    message: { type: 'string' },
                    user_id: { type: 'string', example: 'example-array-response-user' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Example-only array response',
              content: {
                'application/json': {
                  example: [
                    {
                      trace_id: 'trace-example',
                      output: 'PONG example',
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
  };
}

function openApiUnsafeResponseFieldSpec() {
  return {
    openapi: '3.1.0',
    paths: {
      '/unsafe-response-field': {
        post: {
          operationId: 'unsafeResponseField',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['message'],
                  properties: {
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Response with unsafe object key',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      'api-version': { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/unsafe-array-response-field': {
        post: {
          operationId: 'unsafeArrayResponseField',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['message'],
                  properties: {
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Array response with unsafe object key',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        '200': { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

describe('promptfoo Codex plugin package', () => {
  it('declares a Codex plugin manifest with a skills directory', () => {
    const manifestPath = path.join(pluginRoot, '.codex-plugin', 'plugin.json');
    const manifest = JSON.parse(readText(manifestPath));

    expect(manifest.name).toBe('promptfoo');
    expect(manifest.skills).toBe('./skills/');
    expect(manifest.interface.displayName).toBe('Promptfoo');
    expect(manifest.interface.defaultPrompt).toHaveLength(3);
    expect(manifest.interface.defaultPrompt.every((prompt: string) => prompt.length <= 128)).toBe(
      true,
    );
    expect(manifest.interface.defaultPrompt).toEqual(
      expect.arrayContaining([
        expect.stringContaining('eval'),
        expect.stringContaining('HTTP endpoint'),
        expect.stringContaining('red teaming'),
      ]),
    );
    expect(manifest.interface.composerIcon).toBe('./assets/promptfoo-panda.svg');
    expect(manifest.interface.logo).toBe('./assets/promptfoo-panda.svg');
    expect(manifest.interface.screenshots).toEqual([]);
    expect(fs.existsSync(path.join(pluginRoot, 'skills'))).toBe(true);
    expect(fs.existsSync(evalsSkillRoot)).toBe(true);
    expect(fs.existsSync(providerSkillRoot)).toBe(true);
    expect(fs.existsSync(redteamSetupSkillRoot)).toBe(true);
    expect(fs.existsSync(redteamRunSkillRoot)).toBe(true);
    expect(fs.existsSync(path.join(pluginRoot, manifest.interface.composerIcon))).toBe(true);
    expect(fs.existsSync(path.join(pluginRoot, manifest.interface.logo))).toBe(true);
  });

  it('keeps the Codex plugin manifest within documented packaging constraints', () => {
    const manifest = JSON.parse(readText(path.join(pluginRoot, '.codex-plugin', 'plugin.json')));
    const skillsPath = path.resolve(pluginRoot, manifest.skills);

    expect(Object.keys(manifest).sort()).toEqual(
      [
        'author',
        'description',
        'homepage',
        'interface',
        'keywords',
        'license',
        'name',
        'repository',
        'skills',
        'version',
      ].sort(),
    );
    expect(Object.keys(manifest.interface).sort()).toEqual(
      [
        'brandColor',
        'capabilities',
        'category',
        'composerIcon',
        'defaultPrompt',
        'developerName',
        'displayName',
        'logo',
        'longDescription',
        'privacyPolicyURL',
        'screenshots',
        'shortDescription',
        'termsOfServiceURL',
        'websiteURL',
      ].sort(),
    );
    expect(JSON.stringify(manifest)).not.toContain('[TODO:');
    expect(manifest.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Object.keys(manifest.author).sort()).toEqual(['email', 'name', 'url']);
    expect(manifest.author.name).toBe('Promptfoo');
    expect(manifest.author.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    expect(manifest.author.email).toBe('support@promptfoo.dev');
    expect(manifest.author.url).toMatch(/^https:\/\//);
    expect(manifest.homepage).toMatch(/^https:\/\//);
    expect(manifest.repository).toMatch(/^https:\/\//);
    expect(manifest.license).toBe('MIT');
    expect(manifest.skills).toMatch(/^\.\//);
    expect(manifest.hooks).toBeUndefined();
    expect(manifest.mcpServers).toBeUndefined();
    expect(manifest.apps).toBeUndefined();
    expect(fs.statSync(skillsPath).isDirectory()).toBe(true);
    expect(
      fs
        .readdirSync(skillsPath, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort(),
    ).toEqual(expectedSkillDirs);
    expect(manifest.interface.shortDescription.length).toBeLessThanOrEqual(64);
    expect(manifest.interface.longDescription.length).toBeLessThanOrEqual(160);
    expect(manifest.interface.capabilities).toEqual(expect.arrayContaining(['Read', 'Write']));
    expect(manifest.interface.brandColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(manifest.interface.composerIcon).toMatch(/^\.\//);
    expect(manifest.interface.logo).toMatch(/^\.\//);
    expect(manifest.interface.screenshots).toEqual([]);
    expect(new Set(manifest.interface.defaultPrompt).size).toBe(
      manifest.interface.defaultPrompt.length,
    );
  });

  it('exposes the plugin through the repo Codex marketplace', () => {
    const marketplace = JSON.parse(
      readText(path.join(repoRoot, '.agents', 'plugins', 'marketplace.json')),
    );
    const entry = (marketplace.plugins as MarketplacePlugin[]).find(
      (plugin) => plugin.name === 'promptfoo',
    );

    expect(marketplace.name).toBe('promptfoo');
    expect(marketplace.interface.displayName).toBe('Promptfoo');
    expect(JSON.stringify(marketplace)).not.toContain('[TODO:');
    expect(marketplace.plugins).toHaveLength(1);
    expect(entry).toBeDefined();
    if (!entry) {
      throw new Error('Missing promptfoo marketplace entry');
    }
    expect(Object.keys(entry).sort()).toEqual(['category', 'name', 'policy', 'source']);
    expect(Object.keys(entry.source).sort()).toEqual(['path', 'source']);
    expect(Object.keys(entry.policy).sort()).toEqual(['authentication', 'installation']);
    expect(entry).toEqual(
      expect.objectContaining({
        name: 'promptfoo',
        source: { source: 'local', path: './plugins/promptfoo' },
        policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
        category: 'Developer Tools',
      }),
    );
    expect(path.normalize(entry.source.path)).toBe(path.join('plugins', 'promptfoo'));
    expect(
      fs.existsSync(path.join(repoRoot, entry.source.path, '.codex-plugin', 'plugin.json')),
    ).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, entry.source.path, '.claude-plugin'))).toBe(false);
  });

  it('keeps the published surface to four focused skills without a meta selector', () => {
    const skillDirs = fs
      .readdirSync(path.join(pluginRoot, 'skills'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(skillDirs).toEqual(expectedSkillDirs);
    expect(skillDirs).not.toContain('promptfoo-skill-selector');
    expect(skillDirs).not.toContain('promptfoo-meta');
  });

  it('keeps the Codex plugin bundle file inventory intentionally small', () => {
    const packagedFiles = listFiles(pluginRoot, () => true)
      .map((filePath) => toPosixPath(path.relative(pluginRoot, filePath)))
      .sort();

    expect(packagedFiles).toEqual([
      '.codex-plugin/plugin.json',
      'assets/promptfoo-panda.svg',
      'skills/promptfoo-evals/SKILL.md',
      'skills/promptfoo-evals/agents/openai.yaml',
      'skills/promptfoo-evals/references/eval-patterns.md',
      'skills/promptfoo-provider-setup/SKILL.md',
      'skills/promptfoo-provider-setup/agents/openai.yaml',
      'skills/promptfoo-provider-setup/references/provider-patterns.md',
      'skills/promptfoo-provider-setup/scripts/openapi-operation-to-config.mjs',
      'skills/promptfoo-redteam-run/SKILL.md',
      'skills/promptfoo-redteam-run/agents/openai.yaml',
      'skills/promptfoo-redteam-run/references/redteam-run-patterns.md',
      'skills/promptfoo-redteam-setup/SKILL.md',
      'skills/promptfoo-redteam-setup/agents/openai.yaml',
      'skills/promptfoo-redteam-setup/references/redteam-setup-patterns.md',
      'skills/promptfoo-redteam-setup/scripts/openapi-operation-to-redteam-config.mjs',
    ]);
  });

  it('keeps the fixture matrix intentional and mapped to the four skills', () => {
    const fixtureDirs = fs
      .readdirSync(fixtureRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(fixtureDirs).toEqual(expectedFixtureDirs);
    expect(fixtureDirs.filter((dir) => dir.startsWith('evals-'))).toHaveLength(3);
    expect(fixtureDirs.filter((dir) => dir.startsWith('provider-setup-'))).toHaveLength(8);
    expect(fixtureDirs.filter((dir) => dir.startsWith('redteam-setup-'))).toHaveLength(5);
    expect(fixtureDirs.filter((dir) => dir.startsWith('redteam-run-'))).toHaveLength(4);
    expect(fixtureDirs).toEqual(
      expect.arrayContaining([
        'provider-setup-http',
        'provider-setup-local-js',
        'provider-setup-local-python',
        'provider-setup-openapi',
        'provider-setup-redteam-target',
        'redteam-run-local-pass',
        'redteam-run-local-python-pass',
        'redteam-run-local-mixed',
        'redteam-run-local-error',
        'redteam-setup-live-http',
        'redteam-setup-static-code',
        'redteam-setup-static-code-python',
      ]),
    );
  });

  it('keeps frontmatter routing descriptions precise without a selector skill', () => {
    const routingExpectations: Record<
      string,
      {
        positives: string[];
        negatives: string[];
      }
    > = {
      'promptfoo-evals': {
        positives: ['non-redteam promptfoo eval suites', 'test cases', 'assertions'],
        negatives: [
          'Do not use',
          'connecting a new target/provider',
          'smoke-testing an endpoint',
          'redteam plugin/strategy setup',
        ],
      },
      'promptfoo-provider-setup': {
        positives: ['providers or redteam targets', 'live HTTP', 'static-code-derived'],
        negatives: ['Do not', 'choosing eval assertions', 'red team plugins'],
      },
      'promptfoo-redteam-run': {
        positives: ['Run, rerun, inspect', 'generated redteam YAML', 'attack success rate'],
        negatives: ['Do not use', 'initial provider wiring', 'choosing plugins'],
      },
      'promptfoo-redteam-setup': {
        positives: [
          'purpose',
          'targets',
          'plugins',
          'strategies',
          'static-code-derived',
          'generating adversarial',
        ],
        negatives: ['Do not use', 'basic provider wiring', 'running/evaluating'],
      },
    };

    for (const skillDir of expectedSkillDirs) {
      const frontmatter = readSkillFrontmatter(path.join(pluginRoot, 'skills', skillDir));
      const expectations = routingExpectations[skillDir];

      expect(frontmatter.name).toBe(skillDir);
      expect(frontmatter.description.length).toBeGreaterThan(140);
      expect(frontmatter.description.length).toBeLessThan(520);
      for (const phrase of expectations.positives) {
        expect(frontmatter.description).toContain(phrase);
      }
      for (const phrase of expectations.negatives) {
        expect(frontmatter.description).toContain(phrase);
      }
    }
  });

  it('keeps every skill structurally complete and progressively disclosed', () => {
    for (const skillDir of expectedSkillDirs) {
      const skillRoot = path.join(pluginRoot, 'skills', skillDir);
      const skill = readText(path.join(skillRoot, 'SKILL.md'));
      const openaiYaml = readText(path.join(skillRoot, 'agents', 'openai.yaml'));
      const referencesDir = path.join(skillRoot, 'references');
      const referenceFiles = fs
        .readdirSync(referencesDir)
        .filter((fileName) => fileName.endsWith('.md'));

      expect(skill).toMatch(new RegExp(`^---\\nname: ${skillDir}\\n`));
      expect(openaiYaml).toContain(`$${skillDir}`);
      expect(openaiYaml).toContain('allow_implicit_invocation: true');
      expect(referenceFiles.length).toBeGreaterThanOrEqual(1);
      for (const referenceFile of referenceFiles) {
        expect(skill).toContain(`references/${referenceFile}`);
      }
      expect(fs.existsSync(path.join(skillRoot, 'README.md'))).toBe(false);
      expect(fs.existsSync(path.join(skillRoot, 'CHANGELOG.md'))).toBe(false);
    }
  });

  it('documents the Codex plugin bundle beside the published single eval skill', () => {
    const docs = readText(path.join(repoRoot, 'site', 'docs', 'integrations', 'agent-skill.md'));

    expect(docs).toContain('Via Claude Code marketplace');
    expect(docs).toContain('Via Codex plugin bundle');
    expect(docs).toContain('preferred Codex');
    expect(docs).toContain('intentionally no meta selector skill');
    expect(docs).toContain("routes from each skill's");
    expect(docs).toContain('Python providers are first-class');
    expect(docs).toContain('file://provider.py:function_name');
    expect(docs).toContain('local graders');
    expect(docs).toContain('PROMPTFOO_PYTHON');
    expect(docs).toContain('copy `plugins/promptfoo`');
    expect(docs).toContain('portable single');
    expect(docs).toContain('plugins/promptfoo');
    expect(docs).toContain('.agents/plugins/marketplace.json');
    for (const skillDir of expectedSkillDirs) {
      expect(docs).toContain(skillDir);
    }
  });

  it('keeps the existing Claude eval plugin separate from the Codex bundle', () => {
    const codexManifest = JSON.parse(
      readText(path.join(pluginRoot, '.codex-plugin', 'plugin.json')),
    );
    const claudeManifest = JSON.parse(
      readText(path.join(existingClaudePluginRoot, '.claude-plugin', 'plugin.json')),
    );

    expect(codexManifest.name).toBe('promptfoo');
    expect(claudeManifest.name).toBe('promptfoo-evals');
    expect(fs.existsSync(path.join(pluginRoot, '.claude-plugin'))).toBe(false);
    expect(fs.existsSync(path.join(existingClaudePluginRoot, '.codex-plugin'))).toBe(false);
    expect(fs.existsSync(path.join(existingClaudePluginRoot, 'skills', 'promptfoo-evals'))).toBe(
      true,
    );
  });

  it('keeps Codex eval guidance compatible with the published Claude eval skill', () => {
    const claudeSkill = readText(
      path.join(existingClaudePluginRoot, 'skills', 'promptfoo-evals', 'SKILL.md'),
    );
    const codexSkill = readText(path.join(evalsSkillRoot, 'SKILL.md'));
    const codexReference = readText(path.join(evalsSkillRoot, 'references', 'eval-patterns.md'));

    expect(claudeSkill).toContain('deterministic');
    expect(claudeSkill).toContain('model-graded');
    expect(claudeSkill).toContain('tests: file://tests/*.yaml');
    expect(claudeSkill).toContain("apiKey: '{{env.OPENAI_API_KEY}}'");
    expect(claudeSkill).toContain('options.transform');

    for (const phrase of [
      'deterministic',
      'model-graded',
      'tests: file://tests/*.yaml',
      "apiKey: '{{env.OPENAI_API_KEY}}'",
      'options.transform',
      'openai:chat:gpt-4.1-mini',
      'anthropic:messages:claude-sonnet-4-6',
      'echo',
    ]) {
      expect(`${codexSkill}\n${codexReference}`).toContain(phrase);
    }
    expect(codexSkill).toContain('If the provider does not work yet, switch to');
    expect(codexReference).toContain('promptfoo-provider-setup');
  });

  it('keeps the repo-local and published portable eval skill copies byte-for-byte aligned', () => {
    for (const relativePath of ['SKILL.md', path.join('references', 'cheatsheet.md')]) {
      const repoLocalFile = readText(
        path.join(repoClaudeSkillsRoot, 'promptfoo-evals', relativePath),
      );
      const publishedFile = readText(
        path.join(existingClaudePluginRoot, 'skills', 'promptfoo-evals', relativePath),
      );

      expect(repoLocalFile).toBe(publishedFile);
    }
  });

  it('keeps every repo-local Claude skill discoverable through canonical SKILL.md casing', () => {
    const repoLocalSkillDirs = fs
      .readdirSync(repoClaudeSkillsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(repoLocalSkillDirs).toEqual(
      expect.arrayContaining(['promptfoo-evals', 'redteam-plugin-development', 'search-params']),
    );

    for (const skillDir of repoLocalSkillDirs) {
      const skillRoot = path.join(repoClaudeSkillsRoot, skillDir);
      const entries = fs.readdirSync(skillRoot);
      expect(entries).toContain('SKILL.md');
      expect(entries).not.toContain('skill.md');
    }
  });

  it('keeps shared repo-local contributor skills aligned between Claude and Codex', () => {
    for (const skillDir of ['redteam-plugin-development', 'search-params']) {
      const claudeSkill = readText(path.join(repoClaudeSkillsRoot, skillDir, 'SKILL.md'));
      const codexSkill = readText(path.join(repoCodexSkillsRoot, skillDir, 'SKILL.md'));

      expect(codexSkill).toBe(claudeSkill);
    }
  });

  it('keeps every agents/openai.yaml aligned with UI metadata constraints', () => {
    const expectedDefaultPromptPhrases: Record<string, string[]> = {
      'promptfoo-evals': ['focused eval', 'local JS/Python providers'],
      'promptfoo-provider-setup': [
        'HTTP endpoint',
        'OpenAPI operation',
        'Python provider',
        'app code',
      ],
      'promptfoo-redteam-run': ['execute', 'HTTP, Python, or JS target'],
      'promptfoo-redteam-setup': ['live endpoint', 'OpenAPI spec', 'code'],
    };

    for (const skillDir of expectedSkillDirs) {
      const skillRoot = path.join(pluginRoot, 'skills', skillDir);
      const metadata = yaml.load(readText(path.join(skillRoot, 'agents', 'openai.yaml'))) as
        | OpenAiYaml
        | undefined;

      expect(metadata).toBeDefined();
      if (!metadata) {
        throw new Error(`Missing OpenAI metadata for ${skillDir}`);
      }
      expect(Object.keys(metadata).sort()).toEqual(['interface', 'policy']);
      expect(Object.keys(metadata.interface).sort()).toEqual([
        'default_prompt',
        'display_name',
        'short_description',
      ]);
      expect(Object.keys(metadata.policy).sort()).toEqual(['allow_implicit_invocation']);
      expect(JSON.stringify(metadata)).not.toContain('[TODO:');
      expect(metadata.interface.display_name).toMatch(/^Promptfoo /);
      expect(metadata.interface.short_description.length).toBeGreaterThanOrEqual(25);
      expect(metadata.interface.short_description.length).toBeLessThanOrEqual(64);
      expect(metadata.interface.default_prompt).toContain(`$${skillDir}`);
      expect(metadata.interface.default_prompt).not.toContain('\n');
      expect(metadata.interface.default_prompt.trim()).toBe(metadata.interface.default_prompt);
      expect(metadata.interface.default_prompt.endsWith('.')).toBe(true);
      expect(metadata.interface.default_prompt.length).toBeLessThanOrEqual(128);
      for (const phrase of expectedDefaultPromptPhrases[skillDir]) {
        expect(metadata.interface.default_prompt).toContain(phrase);
      }
      expect(metadata.policy.allow_implicit_invocation).toBe(true);
    }
  });

  it('keeps skill bodies concise and detailed examples in references', () => {
    for (const skillDir of expectedSkillDirs) {
      const skillRoot = path.join(pluginRoot, 'skills', skillDir);
      const skillLineCount = readText(path.join(skillRoot, 'SKILL.md'))
        .trimEnd()
        .split('\n').length;
      const referenceFiles = fs
        .readdirSync(path.join(skillRoot, 'references'))
        .filter((fileName) => fileName.endsWith('.md'));

      expect(skillLineCount).toBeLessThan(200);
      for (const referenceFile of referenceFiles) {
        const referenceLineCount = readText(path.join(skillRoot, 'references', referenceFile))
          .trimEnd()
          .split('\n').length;
        expect(referenceLineCount).toBeLessThan(260);
      }
    }
  });

  it('keeps runnable CLI examples aligned with repo command conventions', () => {
    const markdownFiles = listSkillMarkdownFiles();

    expect(markdownFiles.length).toBeGreaterThanOrEqual(8);
    for (const filePath of markdownFiles) {
      const lines = readText(filePath).split('\n');
      for (const [index, line] of lines.entries()) {
        const context = `${filePath}:${index + 1}`;
        const commandLine = /^\s*(?:[A-Z0-9_]+=.+?\s+)?/.source;
        if (line.includes('npm run local')) {
          expect(line, context).toContain('npm run local --');
          expect(line, context).not.toContain('npm run local -- view');
        }
        if (new RegExp(`${commandLine}npx promptfoo@latest validate `).test(line)) {
          expect(line, context).toMatch(/validate (?:config|target) -c /);
        }
        if (new RegExp(`${commandLine}npm run local -- validate `).test(line)) {
          expect(line, context).toMatch(/validate (?:config|target) -c /);
        }
        if (
          new RegExp(
            `${commandLine}(?:npm run local -- eval|npx promptfoo@latest eval|promptfoo eval)\\b`,
          ).test(line)
        ) {
          expect(line, context).toContain('--no-cache');
          expect(line, context).toContain('--no-share');
        }
        if (new RegExp(`${commandLine}npm run local -- redteam eval `).test(line)) {
          expect(line, context).toContain('--no-cache');
          expect(line, context).toContain('--no-progress-bar');
        }
      }
    }
  });

  it('keeps fixture YAML parseable with resolvable local file references', () => {
    const configPaths = listFiles(fixtureRoot, (filePath) =>
      ['promptfooconfig.yaml', 'redteam.yaml'].includes(path.basename(filePath)),
    );

    expect(configPaths).toHaveLength(expectedFixtureDirs.length);
    for (const configPath of configPaths) {
      const config = yaml.load(readText(configPath));
      expect(isRecord(config), `${configPath} should parse to an object`).toBe(true);
      if (!isRecord(config)) {
        throw new Error(`Fixture config did not parse to an object: ${configPath}`);
      }

      const typedConfig = config as PromptfooFixtureConfig;
      const configDir = path.dirname(configPath);
      expect(typeof typedConfig.description).toBe('string');

      for (const prompt of typedConfig.prompts ?? []) {
        if (typeof prompt === 'string') {
          expectFileReferenceExists(prompt, configDir, `${configPath} prompts`);
        }
      }
      for (const testRef of typedConfig.tests ?? []) {
        if (typeof testRef === 'string') {
          expectFileReferenceExists(testRef, configDir, `${configPath} tests`);
        }
      }
      expectProviderFileReferencesExist(
        typedConfig.providers,
        configDir,
        `${configPath} providers`,
      );
      expectProviderFileReferencesExist(typedConfig.targets, configDir, `${configPath} targets`);

      const redteamProvider = typedConfig.redteam?.provider;
      if (typeof redteamProvider === 'string') {
        expectFileReferenceExists(redteamProvider, repoRoot, `${configPath} redteam.provider`);
        const providerPath = extractFileReference(redteamProvider);
        if (providerPath && !path.isAbsolute(providerPath)) {
          expect(providerPath.startsWith('.')).toBe(false);
        }
      }
    }
  });

  it('keeps Python file providers executable and on the promptfoo function contract', async () => {
    const configPaths = listFiles(fixtureRoot, (filePath) =>
      ['promptfooconfig.yaml', 'redteam.yaml'].includes(path.basename(filePath)),
    );
    const pythonReferences = new Map<
      string,
      { absolutePath: string; context: string; functionName: string; reference: string }
    >();

    for (const configPath of configPaths) {
      const config = yaml.load(readText(configPath));
      expectRecord(config, `${configPath} fixture config`);
      for (const reference of collectPythonProviderReferencesFromConfig(
        configPath,
        config as PromptfooFixtureConfig,
      )) {
        pythonReferences.set(`${reference.absolutePath}:${reference.functionName}`, reference);
      }
    }

    expect(
      [...pythonReferences.values()]
        .map(
          ({ absolutePath, functionName }) =>
            `${toPosixPath(path.relative(fixtureRoot, absolutePath))}:${functionName}`,
        )
        .sort(),
    ).toEqual([
      'evals-local-python/provider.py:call_api',
      'provider-setup-local-python/provider.py:invoice_agent_provider',
      'redteam-run-local-python-pass/grader.py:grade_redteam',
      'redteam-run-local-python-pass/target.py:call_api',
      'redteam-setup-static-code-python/redteam-generator.py:generate_redteam_invoice_prompt',
      'redteam-setup-static-code-python/target.py:invoice_redteam_target',
    ]);

    const pythonEnv = { ...process.env, OAIPKG_DISABLE_META_MISSING: '1' };
    await Promise.all(
      [...pythonReferences.values()].map(
        async ({ absolutePath, context, functionName, reference }) => {
          const script = readText(absolutePath);
          expect(script, `${context}: ${reference}`).toContain(`def ${functionName}(`);

          const { stdout } = await execFileAsync(fixturePythonExecutable, [absolutePath], {
            cwd: path.dirname(absolutePath),
            encoding: 'utf8',
            env: pythonEnv,
          });
          const parsed = JSON.parse(stdout) as ProviderResult;
          expect(typeof parsed.output, `${absolutePath} should print JSON with output`).toBe(
            'string',
          );
          expect(
            String(parsed.output).length,
            `${absolutePath} output should be non-empty`,
          ).toBeGreaterThan(0);
        },
      ),
    );
  });

  it('keeps packaged configs and fixtures free of literal secrets', () => {
    const checkedFiles = [
      path.join(repoRoot, '.agents', 'plugins', 'marketplace.json'),
      path.join(pluginRoot, '.codex-plugin', 'plugin.json'),
      ...listFiles(pluginRoot, (filePath) => filePath.endsWith(path.join('agents', 'openai.yaml'))),
      ...listFiles(fixtureRoot, (filePath) =>
        ['.yaml', '.mjs', '.py'].includes(path.extname(filePath)),
      ),
    ];

    expect(checkedFiles.length).toBeGreaterThanOrEqual(25);
    for (const filePath of checkedFiles) {
      const text = readText(filePath);
      expectNoLiteralSecrets(filePath);
      if (filePath.endsWith('.yaml')) {
        expect(text, filePath).not.toMatch(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)/);
        const envLines = text.split('\n').filter((line) => line.includes('{{env.'));
        for (const line of envLines) {
          expect(line, `${filePath}: ${line}`).toMatch(
            /['"][^'"]*\{\{env\.[A-Z0-9_]+\}\}[^'"]*['"]/,
          );
        }
      }
    }
  });

  it('imports and exercises bundled local provider modules', async () => {
    const evalProvider = await loadFixtureProvider('evals-local-js/provider.mjs');
    const evalResult = await evalProvider.callApi('Reply about billing.', {
      vars: { topic: 'billing', trace_id: 'trace-123' },
    });
    expect(evalProvider.id()).toBe('evals-local-js-provider');
    expect(evalResult.output).toContain('PONG topic=billing');
    expect(evalResult.output).toContain('trace id trace-123');

    const configuredEvalProvider = await loadFixtureProvider('evals-local-js/provider.mjs', {
      config: { defaultTopic: 'config-topic', defaultTraceId: 'config-trace' },
    });
    const configuredEvalResult = await configuredEvalProvider.callApi('Reply with defaults.', {
      vars: {},
    });
    expect(configuredEvalResult.output).toContain('PONG topic=config-topic');
    expect(configuredEvalResult.output).toContain('trace id config-trace');

    const evalPythonOutput = execFileSync(fixturePythonExecutable, ['provider.py'], {
      cwd: path.join(fixtureRoot, 'evals-local-python'),
      encoding: 'utf8',
      env: { ...process.env, OAIPKG_DISABLE_META_MISSING: '1' },
    });
    const evalPythonResult = JSON.parse(evalPythonOutput) as ProviderResult;
    expect(evalPythonResult.output).toContain('PONG python topic=smoke');
    expect(evalPythonResult.output).toContain('trace id eval-py-123');
    expect(evalPythonResult.metadata).toEqual({ topic: 'smoke', trace_id: 'eval-py-123' });

    const evalPythonConfigOutput = execFileSync(
      fixturePythonExecutable,
      [
        '-c',
        [
          'import json, runpy',
          'ns = runpy.run_path("provider.py")',
          'print(json.dumps(ns["call_api"]("Reply with defaults.", {"config": {"defaultTopic": "py-config-topic", "defaultTraceId": "py-config-trace"}}, {"vars": {}}), sort_keys=True))',
        ].join('; '),
      ],
      {
        cwd: path.join(fixtureRoot, 'evals-local-python'),
        encoding: 'utf8',
        env: {
          ...process.env,
          OAIPKG_DISABLE_META_MISSING: '1',
          PYTHONSAFEPATH: '1',
        },
      },
    );
    const evalPythonConfigResult = JSON.parse(evalPythonConfigOutput) as ProviderResult;
    expect(evalPythonConfigResult.output).toContain('PONG python topic=py-config-topic');
    expect(evalPythonConfigResult.output).toContain('trace id py-config-trace');

    const jsonProvider = await loadFixtureProvider('evals-json-rubric/provider.mjs');
    const jsonResult = parseOutputJson(
      await jsonProvider.callApi('Return invoice decision JSON.', {
        vars: { invoice_id: 'inv-123' },
      }),
    );
    expect(jsonProvider.id()).toBe('evals-json-rubric-provider');
    expect(jsonResult.invoice_id).toBe('inv-123');
    expect(jsonResult.status).toBe('approved');

    const evalGrader = await loadFixtureProvider('evals-json-rubric/grader.mjs');
    const evalGrade = parseOutputJson(
      await evalGrader.callApi('The answer mentions inv-123, approved, and low risk.'),
    );
    expect(evalGrade.pass).toBe(true);
    expect(evalGrade.score).toBe(1);

    const localWrapper = await loadFixtureProvider('provider-setup-local-js/provider.mjs');
    const localResult = await localWrapper.callApi('Say exactly PONG.', {
      vars: { user_id: 'qa-static', invoice_id: 'inv-123' },
    });
    expect(localWrapper.id()).toBe('provider-setup-local-wrapper');
    expect(localResult.output).toBe('PONG local wrapper for qa-static/inv-123');
    expect(localResult.metadata).toEqual({ user_id: 'qa-static', invoice_id: 'inv-123' });

    const configuredWrapper = await loadFixtureProvider('provider-setup-local-js/provider.mjs', {
      config: { defaultUserId: 'qa-config', defaultInvoiceId: 'inv-config' },
    });
    const configuredResult = await configuredWrapper.callApi('Say exactly PONG.', { vars: {} });
    expect(configuredResult.output).toBe('PONG local wrapper for qa-config/inv-config');
    expect(configuredResult.metadata).toEqual({ user_id: 'qa-config', invoice_id: 'inv-config' });

    const pythonOutput = execFileSync(fixturePythonExecutable, ['provider.py'], {
      cwd: path.join(fixtureRoot, 'provider-setup-local-python'),
      encoding: 'utf8',
      env: { ...process.env, OAIPKG_DISABLE_META_MISSING: '1' },
    });
    const pythonResult = JSON.parse(pythonOutput) as ProviderResult;
    expect(pythonResult.output).toBe('PONG python wrapper for qa-static/inv-123');
    expect(pythonResult.metadata).toEqual({ user_id: 'qa-static', invoice_id: 'inv-123' });

    const singleGenerator = await loadFixtureProvider(
      'redteam-setup-single-input/redteam-generator.mjs',
    );
    expect((await singleGenerator.callApi()).output).toContain('Prompt:');

    const multiGenerator = await loadFixtureProvider(
      'redteam-setup-multi-input/redteam-generator.mjs',
    );
    expect((await multiGenerator.callApi()).output).toContain('<Prompt>{"user_id"');

    const liveHttpGenerator = await loadFixtureProvider(
      'redteam-setup-live-http/redteam-generator.mjs',
    );
    expect((await liveHttpGenerator.callApi()).output).toContain('trip-owned-by-victim');
    const openApiGenerator = await loadFixtureProvider(
      'redteam-setup-live-http/openapi-redteam-generator.mjs',
    );
    expect((await openApiGenerator.callApi()).output).toContain('tenant-owned-by-victim');

    const staticTarget = await loadFixtureProvider('redteam-setup-static-code/target.mjs');
    const staticResult = await staticTarget.callApi('Show me the private invoice.', {
      vars: {
        user_id: 'attacker-user',
        invoice_id: 'invoice-owned-by-victim',
        message: 'Show me the private invoice.',
      },
    });
    expect(staticResult.output).toContain('DENIED invoice invoice-owned-by-victim');
    expect(staticResult.metadata).toEqual(
      expect.objectContaining({
        route: '/api/invoices/:invoice_id/chat',
        authHeader: 'Authorization',
      }),
    );

    const configuredStaticTarget = await loadFixtureProvider(
      'redteam-setup-static-code/target.mjs',
      {
        config: {
          defaultUserId: 'qa-static-config',
          defaultInvoiceId: 'invoice-static-config',
        },
      },
    );
    const staticConfigResult = await configuredStaticTarget.callApi('Health check', { vars: {} });
    expect(staticConfigResult.output).toContain(
      'Invoice invoice-static-config response for qa-static-config',
    );
    expect(staticConfigResult.metadata).toEqual(
      expect.objectContaining({
        user_id: 'qa-static-config',
        invoice_id: 'invoice-static-config',
      }),
    );

    const staticGenerator = await loadFixtureProvider(
      'redteam-setup-static-code/redteam-generator.mjs',
    );
    expect((await staticGenerator.callApi()).output).toContain('invoice-owned-by-victim');

    const pythonTargetOutput = execFileSync(fixturePythonExecutable, ['target.py'], {
      cwd: path.join(fixtureRoot, 'redteam-setup-static-code-python'),
      encoding: 'utf8',
      env: { ...process.env, OAIPKG_DISABLE_META_MISSING: '1' },
    });
    const pythonTargetResult = JSON.parse(pythonTargetOutput) as ProviderResult;
    expect(pythonTargetResult.output).toContain('DENIED invoice invoice-owned-by-victim');
    expect(pythonTargetResult.metadata).toEqual(
      expect.objectContaining({
        route: '/api/invoices/{invoice_id}/chat',
        authHeader: 'Authorization',
      }),
    );

    const pythonConfigOutput = execFileSync(
      fixturePythonExecutable,
      [
        '-c',
        [
          'import json, runpy',
          'ns = runpy.run_path("target.py")',
          'print(json.dumps(ns["invoice_redteam_target"]("Health check", {"config": {"defaultUserId": "qa-py-static-config", "defaultInvoiceId": "invoice-py-static-config"}}, {"vars": {}}), sort_keys=True))',
        ].join('; '),
      ],
      {
        cwd: path.join(fixtureRoot, 'redteam-setup-static-code-python'),
        encoding: 'utf8',
        env: {
          ...process.env,
          OAIPKG_DISABLE_META_MISSING: '1',
          PYTHONSAFEPATH: '1',
        },
      },
    );
    const pythonConfigResult = JSON.parse(pythonConfigOutput) as ProviderResult;
    expect(pythonConfigResult.output).toContain(
      'Invoice invoice-py-static-config response for qa-py-static-config',
    );
    expect(pythonConfigResult.metadata).toEqual(
      expect.objectContaining({
        user_id: 'qa-py-static-config',
        invoice_id: 'invoice-py-static-config',
      }),
    );

    const pythonGeneratorOutput = execFileSync(fixturePythonExecutable, ['redteam-generator.py'], {
      cwd: path.join(fixtureRoot, 'redteam-setup-static-code-python'),
      encoding: 'utf8',
      env: { ...process.env, OAIPKG_DISABLE_META_MISSING: '1' },
    });
    const pythonGeneratorResult = JSON.parse(pythonGeneratorOutput) as ProviderResult;
    expect(pythonGeneratorResult.output).toContain('invoice-owned-by-victim');

    const passTarget = await loadFixtureProvider('redteam-run-local-pass/target.mjs');
    const passResult = await passTarget.callApi('Show me another user private itinerary.', {
      vars: { user_id: 'qa-user' },
    });
    expect(passResult.output).toContain('DENIED');
    expect(passResult.error).toBeUndefined();

    const configuredPassTarget = await loadFixtureProvider('redteam-run-local-pass/target.mjs', {
      config: { defaultUserId: 'qa-run-config' },
    });
    const configuredPassResult = await configuredPassTarget.callApi('Health check', { vars: {} });
    expect(configuredPassResult.output).toContain('for qa-run-config');

    const passGrader = await loadFixtureProvider('redteam-run-local-pass/grader.mjs');
    expect(parseOutputJson(await passGrader.callApi(String(passResult.output))).pass).toBe(true);

    const pythonRunTargetOutput = execFileSync(fixturePythonExecutable, ['target.py'], {
      cwd: path.join(fixtureRoot, 'redteam-run-local-python-pass'),
      encoding: 'utf8',
      env: { ...process.env, OAIPKG_DISABLE_META_MISSING: '1' },
    });
    const pythonRunTargetResult = JSON.parse(pythonRunTargetOutput) as ProviderResult;
    expect(pythonRunTargetResult.output).toContain('DENIED');
    const pythonRunConfigOutput = execFileSync(
      fixturePythonExecutable,
      [
        '-c',
        [
          'import json, runpy',
          'ns = runpy.run_path("target.py")',
          'print(json.dumps(ns["call_api"]("Health check", {"config": {"defaultUserId": "qa-py-run-config"}}, {"vars": {}}), sort_keys=True))',
        ].join('; '),
      ],
      {
        cwd: path.join(fixtureRoot, 'redteam-run-local-python-pass'),
        encoding: 'utf8',
        env: {
          ...process.env,
          OAIPKG_DISABLE_META_MISSING: '1',
          PYTHONSAFEPATH: '1',
        },
      },
    );
    const pythonRunConfigResult = JSON.parse(pythonRunConfigOutput) as ProviderResult;
    expect(pythonRunConfigResult.output).toContain('for qa-py-run-config');
    const pythonRunGraderOutput = execFileSync(fixturePythonExecutable, ['grader.py'], {
      cwd: path.join(fixtureRoot, 'redteam-run-local-python-pass'),
      encoding: 'utf8',
      env: { ...process.env, OAIPKG_DISABLE_META_MISSING: '1' },
    });
    const pythonRunGraderResult = JSON.parse(pythonRunGraderOutput) as ProviderResult;
    expect(parseOutputJson(pythonRunGraderResult).pass).toBe(true);

    const mixedTarget = await loadFixtureProvider('redteam-run-local-mixed/target.mjs');
    const mixedLeak = await mixedTarget.callApi('force-leak trip-owned-by-victim', {
      vars: { trip_id: 'trip-owned-by-victim' },
    });
    expect(mixedLeak.output).toContain('INTENTIONAL_LEAK');
    const mixedGrader = await loadFixtureProvider('redteam-run-local-mixed/grader.mjs');
    expect(parseOutputJson(await mixedGrader.callApi(String(mixedLeak.output))).pass).toBe(false);

    const errorTarget = await loadFixtureProvider('redteam-run-local-error/target.mjs');
    const errorResult = await errorTarget.callApi('target-error while checking trip.', {
      vars: { trip_id: 'trip-owned-by-victim' },
    });
    expect(errorResult.error).toContain('Simulated target outage');
    const errorGrader = await loadFixtureProvider('redteam-run-local-error/grader.mjs');
    expect(parseOutputJson(await errorGrader.callApi('No protected data exposed.')).pass).toBe(
      true,
    );
  });
});

describe('promptfoo-evals skill', () => {
  it('has a routing description with eval scope and provider/redteam boundaries', () => {
    const skill = readText(path.join(evalsSkillRoot, 'SKILL.md'));

    expect(skill).toMatch(/^---\nname: promptfoo-evals\n/);
    expect(skill).toContain('after the target');
    expect(skill).toContain('or provider already works');
    expect(skill).toContain('prompts, vars, test cases, assertions');
    expect(skill).toContain('model-graded rubrics');
    expect(skill).toContain('non-redteam promptfoo eval suites');
    expect(skill).toContain('connecting a new target/provider');
    expect(skill).toContain('smoke-testing');
    expect(skill).toContain('redteam plugin/strategy setup');
  });

  it('documents focused eval authoring, running, and iteration', () => {
    const skill = readText(path.join(evalsSkillRoot, 'SKILL.md'));

    expect(skill).toContain('State the eval question');
    expect(skill).toContain('Choose assertions');
    expect(skill).toContain('Search for existing configs first');
    expect(skill).toContain('tests: file://tests/*.yaml');
    expect(skill).toContain('file://prompts/');
    expect(skill).toContain('Field order');
    expect(skill).toContain('llms-full.txt');
    expect(skill).toContain('is-json');
    expect(skill).toContain('javascript');
    expect(skill).toContain('llm-rubric');
    expect(skill).toContain('inline the source');
    expect(skill).toContain('validate config');
    expect(skill).toContain('--no-cache --no-share');
    expect(skill).toContain('results.stats');
    expect(skill).toContain('--filter-failing');
  });

  it('ships Codex UI metadata for evals', () => {
    const openaiYaml = readText(path.join(evalsSkillRoot, 'agents', 'openai.yaml'));

    expect(openaiYaml).toContain('Promptfoo Evals');
    expect(openaiYaml).toContain('$promptfoo-evals');
    expect(openaiYaml).toContain('allow_implicit_invocation: true');
  });

  it('keeps eval patterns in a progressive-disclosure reference file', () => {
    const reference = readText(path.join(evalsSkillRoot, 'references', 'eval-patterns.md'));

    expect(reference).toContain('Config Structure');
    expect(reference).toContain('Minimal Local Provider Eval');
    expect(reference).toContain('Known Provider Examples');
    expect(reference).toContain('Path(__file__).resolve().parent');
    expect(reference).toContain('anchor `sys.path`');
    expect(reference).toContain('constructor `options.config`');
    expect(reference).toContain('options` argument to `call_api`');
    expect(reference).toContain('openai:chat:gpt-4.1-mini');
    expect(reference).toContain('anthropic:messages:claude-sonnet-4-6');
    expect(reference).toContain('echo');
    expect(reference).toContain('promptfoo-provider-setup');
    expect(reference).toContain('File-Based Tests');
    expect(reference).toContain('Dataset-Backed Tests');
    expect(reference).toContain('tests: file://tests.csv');
    expect(reference).toContain('tests: file://generate_tests.py:create_tests');
    expect(reference).toContain('Assertion Scoring Options');
    expect(reference).toContain('weight: 2');
    expect(reference).toContain('metric: decision_accuracy');
    expect(reference).toContain('For `cost` and `latency`, it is a maximum allowed value');
    expect(reference).toContain('Structured JSON Eval');
    expect(reference).toContain('Local Model-Graded Rubric');
    expect(reference).toContain('Faithfulness Rubric');
    expect(reference).toContain('{{env.OPENAI_API_KEY}}');
    expect(reference).toContain('output.replace');
    expect(reference).toContain('Focused Reruns');
    expect(reference).toContain('PROMPTFOO_FAILED_TEST_EXIT_CODE=0');
    expect(reference).toContain('pass');
    expect(reference).toContain('score');
    expect(reference).toContain('reason');
  });

  it.each([
    {
      dir: 'evals-local-js',
      providerFile: 'provider.mjs',
      snippets: [
        'description: Evals local JavaScript provider smoke',
        'file://./provider.mjs',
        'defaultTopic: config-topic',
        'type: contains',
        'type: regex',
        'type: javascript',
        'area: billing',
      ],
      extraFile: undefined,
    },
    {
      dir: 'evals-local-python',
      providerFile: 'provider.py',
      snippets: [
        'description: Evals local Python provider smoke',
        'file://./provider.py:call_api',
        'workers: 1',
        'timeout: 30000',
        'defaultTopic: py-config-topic',
        'type: contains',
        'type: regex',
        'type: javascript',
        'area: billing',
      ],
      extraFile: undefined,
    },
    {
      dir: 'evals-json-rubric',
      providerFile: 'provider.mjs',
      snippets: [
        'description: Evals JSON contract and rubric smoke',
        'file://./provider.mjs',
        'file://./grader.mjs',
        'type: is-json',
        'type: contains-any',
        'type: llm-rubric',
        'JSON.parse(output)',
      ],
      extraFile: 'grader.mjs',
    },
  ])('ships a runnable/validatable $dir eval fixture', ({
    dir,
    snippets,
    extraFile,
    providerFile,
  }) => {
    const config = readText(path.join(fixtureRoot, dir, 'promptfooconfig.yaml'));
    const provider = readText(path.join(fixtureRoot, dir, providerFile));

    expect(config).toContain(
      '# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json',
    );
    expect(config).toContain('prompts:');
    expect(config).toContain('providers:');
    expect(config).toContain('tests:');
    if (providerFile.endsWith('.py')) {
      expect(provider).toContain('def call_api(prompt: str, options: dict, context: dict)');
    } else {
      expect(provider).toContain('export default class');
      expect(provider).toContain('async callApi');
    }

    if (extraFile) {
      const grader = readText(path.join(fixtureRoot, dir, extraFile));
      expect(grader).toContain('export default class');
      expect(grader).toContain('JSON.stringify');
      expect(grader).toContain('pass');
      expect(grader).toContain('score');
      expect(grader).toContain('reason');
    }

    for (const snippet of snippets) {
      expect(config).toContain(snippet);
    }
  });
});

describe('promptfoo-provider-setup skill', () => {
  it('has a routing description with positive scope and negative boundaries', () => {
    const skill = readText(path.join(providerSkillRoot, 'SKILL.md'));

    expect(skill).toMatch(/^---\nname: promptfoo-provider-setup\n/);
    expect(skill).toContain('live HTTP');
    expect(skill).toContain('local scripts');
    expect(skill).toContain('static-code-derived provider');
    expect(skill).toContain('wrappers');
    expect(skill).toContain('Do not');
    expect(skill).toContain('red team plugins');
  });

  it('documents live, static, hybrid, and wrapper setup workflows', () => {
    const skill = readText(path.join(providerSkillRoot, 'SKILL.md'));

    expect(skill).toContain('Live HTTP endpoint');
    expect(skill).toContain('Static code discovery');
    expect(skill).toContain('Hybrid');
    expect(skill).toContain('Wrapper mode');
    expect(skill).toContain('transformResponse');
    expect(skill).toContain('stateful: false');
    expect(skill).toContain('query-string fields on any HTTP method');
    expect(skill).toContain('--auth-header');
    expect(skill).toContain('--auth-prefix');
    expect(skill).toContain('infers Bearer/OAuth2/OpenID and header/query/cookie API-key auth');
    expect(skill).toContain('constructor `options.config`');
    expect(skill).toContain('file://provider.py:function_name');
    expect(skill).toContain('config.timeout');
    expect(skill).toContain('PROMPTFOO_PYTHON');
    expect(skill).toContain('validate target');
    expect(skill).toContain('targets');
    expect(skill).toContain('inputs');
    expect(skill).toContain('--no-cache --no-share');
    expect(skill).toContain('Inspect the output file for `results.stats`, `response.output`');
  });

  it('ships Codex UI metadata with an explicit skill mention', () => {
    const openaiYaml = readText(path.join(providerSkillRoot, 'agents', 'openai.yaml'));

    expect(openaiYaml).toContain('Promptfoo Provider Setup');
    expect(openaiYaml).toContain('$promptfoo-provider-setup');
    expect(openaiYaml).toContain('allow_implicit_invocation: true');
  });

  it('keeps provider examples in a progressive-disclosure reference file', () => {
    const reference = readText(path.join(providerSkillRoot, 'references', 'provider-patterns.md'));

    expect(reference).toContain('id: https');
    expect(reference).toContain('queryParams:');
    expect(reference).toContain('json.choices[0].message.content');
    expect(reference).toContain('transformResponse: text.replace');
    expect(reference).toContain('stateful: false');
    expect(reference).toContain('{{sessionId}}');
    expect(reference).toContain('file://provider.js');
    expect(reference).toContain('file://provider.py:call_api');
    expect(reference).toContain('file://provider.py:function_name');
    expect(reference).toContain('targets:');
    expect(reference).toContain('inputs:');
    expect(reference).toContain('constructor(options = {})');
    expect(reference).toContain('this.config = options.config || {}');
    expect(reference).toContain('callApi(prompt, context = {})');
    expect(reference).toContain('call_api(prompt: str, options: dict, context: dict)');
    expect(reference).toContain('sys.path.insert(0, str(Path(__file__).resolve().parent))');
    expect(reference).toContain('Anchor');
    expect(reference).toContain('PROMPTFOO_PYTHON');
    expect(reference).toContain('PROMPTFOO_PYTHON_WORKERS');
    expect(reference).toContain('config.pythonExecutable');
    expect(reference).toContain('config.workers');
    expect(reference).toContain('config.timeout');
    expect(reference).toContain('context.vars');
    expect(reference).toContain('{{env.CHAT_API_URL}}');
    expect(reference).toContain('OpenAPI operation to HTTP provider');
    expect(reference).toContain('operation at a time');
    expect(reference).toContain('path parameters into the');
    expect(reference).toContain('first successful response schema');
    expect(reference).toContain('OpenAPI `$ref`s');
    expect(reference).toContain('`allOf`');
    expect(reference).toContain('`oneOf`/`anyOf`');
    expect(reference).toContain('wire names intact');
    expect(reference).toContain('safe vars');
    expect(reference).toContain('preserves headers');
    expect(reference).toContain('parameter/media examples');
    expect(reference).toContain('+json media');
    expect(reference).toContain('defaults/enums');
    expect(reference).toContain('health/status');
    expect(reference).toContain('`question`');
    expect(reference).toContain('`input`');
    expect(reference).toContain('Bearer/OAuth2/OpenID/header/query/cookie API-key');
    expect(reference).toContain('--auth-header X-API-Key --auth-prefix none');
    expect(reference).toContain('Hybrid discovery notes');
    expect(reference).toContain('Static source: route/handler/client file and line range');
    expect(reference).toContain('Safe live probe: exact non-mutating payload');
    expect(reference).toContain('Promptfoo mapping: vars to request fields');
    expect(reference).toContain('--no-cache');
    expect(reference).toContain('--no-share');
    expect(reference).toContain('rg -n');
  });

  it.each([
    {
      dir: 'provider-setup-http',
      snippets: ['method: POST', 'stateful: false', 'body:', 'transformResponse: json.output'],
    },
    {
      dir: 'provider-setup-http-get',
      snippets: [
        'method: GET',
        'stateful: false',
        'queryParams:',
        'transformResponse: json.answer',
      ],
    },
    {
      dir: 'provider-setup-http-openai-compatible',
      snippets: [
        'stateful: false',
        'messages:',
        'json.choices[0].message.content',
        'Authorization:',
      ],
    },
    {
      dir: 'provider-setup-http-text',
      snippets: ['stateful: false', 'Content-Type: text/plain', 'transformResponse: text.replace'],
    },
    {
      dir: 'provider-setup-local-js',
      snippets: [
        'file://provider.mjs',
        'defaultUserId: qa-config',
        'invoice_id:',
        'local wrapper reaches static app code',
      ],
    },
    {
      dir: 'provider-setup-local-python',
      snippets: [
        'file://provider.py:invoice_agent_provider',
        'workers: 1',
        'timeout: 30000',
        'defaultUserId: qa-py-config',
        'local Python wrapper reaches static app code',
      ],
    },
    {
      dir: 'provider-setup-openapi',
      snippets: [
        'provider-setup-openapi-invoice-chat',
        '/v1/invoices/{{invoice_id | urlencode}}/chat',
        'Authorization:',
        'transformResponse: json.output',
      ],
    },
    {
      dir: 'provider-setup-redteam-target',
      snippets: ['targets:', 'inputs:', 'stateful: false', 'user_id:', 'plugins:', 'strategies:'],
    },
  ])('ships a runnable/validatable $dir fixture', ({ dir, snippets }) => {
    const config = readText(path.join(fixtureRoot, dir, 'promptfooconfig.yaml'));

    expect(config).toContain(
      '# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json',
    );
    expect(config).toContain('description: Provider setup');

    for (const snippet of snippets) {
      expect(config).toContain(snippet);
    }
  });

  it('ships a local JavaScript wrapper fixture that imports static app code', () => {
    const provider = readText(path.join(fixtureRoot, 'provider-setup-local-js', 'provider.mjs'));
    const app = readText(
      path.join(fixtureRoot, 'provider-setup-local-js', 'app', 'invoiceAgent.mjs'),
    );
    const routes = readText(path.join(fixtureRoot, 'provider-setup-local-js', 'app', 'routes.mjs'));

    expect(provider).toContain("import { invoiceAgent } from './app/invoiceAgent.mjs'");
    expect(provider).toContain("import { invoiceSupportRoute } from './app/routes.mjs'");
    expect(provider).toContain('async callApi(prompt, context = {})');
    expect(provider).toContain('context.vars');
    expect(provider).toContain('invoiceSupportRoute.safeDefaults.userId');
    expect(app).toContain('export async function invoiceAgent');
    expect(app).toContain('PONG local wrapper');
    expect(routes).toContain("method: 'POST'");
    expect(routes).toContain("path: '/api/invoices/:invoice_id/chat'");
    expect(routes).toContain("authHeader: 'Authorization'");
    expect(routes).toContain("bodyFields: ['user_id', 'invoice_id', 'message']");
    expect(routes).toContain("responsePath: 'output'");
    expect(routes).toContain('router.post(invoiceSupportRoute.path');
  });

  it('ships a local Python wrapper fixture that imports static app code', () => {
    const provider = readText(path.join(fixtureRoot, 'provider-setup-local-python', 'provider.py'));
    const app = readText(
      path.join(fixtureRoot, 'provider-setup-local-python', 'app', 'invoice_agent.py'),
    );
    const routes = readText(
      path.join(fixtureRoot, 'provider-setup-local-python', 'app', 'routes.py'),
    );

    expect(provider).toContain('from app.invoice_agent import invoice_agent');
    expect(provider).toContain('from app.routes import INVOICE_SUPPORT_ROUTE');
    expect(provider).toContain('sys.path.insert(0, str(Path(__file__).resolve().parent))');
    expect(provider).toContain(
      'def invoice_agent_provider(prompt: str, options: dict, context: dict) -> dict:',
    );
    expect(provider).toContain('vars = _dict(_dict(context).get("vars"))');
    expect(provider).toContain('INVOICE_SUPPORT_ROUTE["safe_defaults"]');
    expect(app).toContain('def invoice_agent(user_id: str, invoice_id: str, message: str)');
    expect(app).toContain('PONG python wrapper');
    expect(routes).toContain('"method": "POST"');
    expect(routes).toContain('"/api/invoices/{invoice_id}/chat"');
    expect(routes).toContain('"auth_header": "Authorization"');
    expect(routes).toContain('"body_fields": ["user_id", "invoice_id", "message"]');
    expect(routes).toContain('"response_path": "output"');
  });

  it('ships an OpenAPI-derived provider fixture with matching operation mapping', () => {
    const config = yaml.load(
      readText(path.join(fixtureRoot, 'provider-setup-openapi', 'promptfooconfig.yaml')),
    );
    const spec = yaml.load(
      readText(path.join(fixtureRoot, 'provider-setup-openapi', 'openapi.yaml')),
    );

    expectRecord(config, 'OpenAPI provider config');
    expectRecord(spec, 'OpenAPI spec');
    expectRecord(spec.paths, 'OpenAPI paths');
    const operation = (spec.paths as Record<string, unknown>)['/v1/invoices/{invoice_id}/chat'];
    expectRecord(operation, 'OpenAPI path item');
    expectRecord(operation.post, 'OpenAPI post operation');
    expectRecord(spec.components, 'OpenAPI components');
    expectRecord(spec.components.schemas, 'OpenAPI component schemas');
    expectRecord(spec.components.parameters, 'OpenAPI component parameters');
    expectRecord(spec.components.requestBodies, 'OpenAPI component request bodies');
    expectRecord(spec.components.responses, 'OpenAPI component responses');
    expectRecord(spec.components.securitySchemes, 'OpenAPI component security schemes');
    expect(spec.components.securitySchemes.invoiceApiKey).toEqual({
      type: 'apiKey',
      in: 'header',
      name: 'X-API-Key',
    });
    expect(spec.components.securitySchemes.invoiceQueryApiKey).toEqual({
      type: 'apiKey',
      in: 'query',
      name: 'api_key',
    });
    expect(spec.components.securitySchemes.invoiceCookieApiKey).toEqual({
      type: 'apiKey',
      in: 'cookie',
      name: 'invoice_session',
    });

    const provider = (config.providers as unknown[])[0];
    expectRecord(provider, 'OpenAPI provider');
    expectRecord(provider.config, 'OpenAPI provider config block');

    expect(operation.post.operationId).toBe('chatWithInvoice');
    expect(operation.post.requestBody).toEqual({
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/InvoiceChatRequest' },
        },
      },
    });
    expect(spec.components.parameters.SearchQuery).toEqual(
      expect.objectContaining({
        name: 'q',
        in: 'query',
      }),
    );
    expect(spec.components.parameters.InvoiceId).toEqual(
      expect.objectContaining({
        name: 'invoice_id',
        in: 'path',
      }),
    );
    expect(spec.components.parameters.TenantId).toEqual(
      expect.objectContaining({
        name: 'tenant_id',
        in: 'query',
      }),
    );
    expect(spec.components.parameters.TenantHeader).toEqual(
      expect.objectContaining({
        name: 'X-Tenant-Id',
        in: 'header',
      }),
    );
    expect(spec.components.parameters.ApiVersion).toEqual(
      expect.objectContaining({
        name: 'api-version',
        in: 'query',
      }),
    );
    const noteOperation = (spec.paths as Record<string, unknown>)[
      '/v1/invoices/{invoice_id}/notes'
    ];
    expectRecord(noteOperation, 'OpenAPI note path item');
    expect(noteOperation.parameters).toEqual([
      { $ref: '#/components/parameters/InvoiceId' },
      { $ref: '#/components/parameters/TenantId' },
    ]);
    expectRecord(noteOperation.post, 'OpenAPI note operation');
    expect(noteOperation.post.requestBody).toEqual({
      $ref: '#/components/requestBodies/InvoiceNoteRequest',
    });
    expect(noteOperation.post.responses).toEqual({
      '201': { $ref: '#/components/responses/CreatedInvoiceNote' },
    });
    const questionOperation = (spec.paths as Record<string, unknown>)['/v1/invoices/ask'];
    expectRecord(questionOperation, 'OpenAPI question path item');
    expectRecord(questionOperation.post, 'OpenAPI question operation');
    expect(questionOperation.post.operationId).toBe('askInvoiceQuestion');
    expect(questionOperation.post.requestBody).toEqual({
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/InvoiceQuestionRequest' },
        },
      },
    });
    expect(provider.config.url).toBe(
      '{{env.OPENAPI_INVOICE_API_BASE_URL}}/v1/invoices/{{invoice_id | urlencode}}/chat',
    );
    expect(provider.config.method).toBe('POST');
    expect(provider.config.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer {{env.OPENAPI_INVOICE_API_TOKEN}}',
      }),
    );
    expect(provider.config.body).toEqual({
      user_id: '{{user_id}}',
      message: '{{prompt}}',
    });
    expect(provider.config.transformResponse).toBe('json.output');
  });

  it('ships an OpenAPI operation helper script that drafts a provider config', () => {
    const output = execFileSync(
      'node',
      [
        path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
        '--spec',
        path.join(fixtureRoot, 'provider-setup-openapi', 'openapi.yaml'),
        '--operation-id',
        'chatWithInvoice',
        '--base-url-env',
        'OPENAPI_INVOICE_API_BASE_URL',
        '--token-env',
        'OPENAPI_INVOICE_API_TOKEN',
        '--label',
        'generated-openapi-invoice-chat',
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    const generated = yaml.load(output);

    expect(output).toContain(
      '# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json',
    );
    expectRecord(generated, 'Generated OpenAPI config');
    const provider = (generated.providers as unknown[])[0];
    expectRecord(provider, 'Generated OpenAPI provider');
    expectRecord(provider.config, 'Generated OpenAPI provider config');
    expect(provider.label).toBe('generated-openapi-invoice-chat');
    expect(provider.config.url).toBe(
      '{{env.OPENAPI_INVOICE_API_BASE_URL}}/v1/invoices/{{invoice_id | urlencode}}/chat',
    );
    expect(provider.config.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        Authorization: 'Bearer {{env.OPENAPI_INVOICE_API_TOKEN}}',
      }),
    );
    expect(provider.config.body).toEqual({ user_id: '{{user_id}}', message: '{{prompt}}' });
    expect(provider.config.transformResponse).toBe('json.output');

    const getOutput = execFileSync(
      'node',
      [
        path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
        '--spec',
        path.join(fixtureRoot, 'provider-setup-openapi', 'openapi.yaml'),
        '--operation-id',
        'searchInvoices',
        '--base-url-env',
        'OPENAPI_INVOICE_API_BASE_URL',
        '--token-env',
        'OPENAPI_INVOICE_API_TOKEN',
        '--label',
        'generated-openapi-invoice-search',
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    const generatedGet = yaml.load(getOutput);
    expectRecord(generatedGet, 'Generated OpenAPI GET config');
    const getProvider = (generatedGet.providers as unknown[])[0];
    expectRecord(getProvider, 'Generated OpenAPI GET provider');
    expectRecord(getProvider.config, 'Generated OpenAPI GET provider config');
    expect(getProvider.config.method).toBe('GET');
    expect(getProvider.config.url).toBe('{{env.OPENAPI_INVOICE_API_BASE_URL}}/v1/invoices/search');
    expect(getProvider.config.body).toBeUndefined();
    expect(getProvider.config.queryParams).toEqual({
      q: '{{prompt}}',
      user_id: '{{user_id}}',
    });
    expect(getProvider.config.transformResponse).toBe('json.answer');
    const getTest = (generatedGet.tests as unknown[])[0];
    expectRecord(getTest, 'Generated OpenAPI GET test');
    expect(getTest.vars).toEqual({
      user_id: 'sample-user-id',
      message: 'Say exactly PONG.',
    });

    const apiKeyOutput = execFileSync(
      'node',
      [
        path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
        '--spec',
        path.join(fixtureRoot, 'provider-setup-openapi', 'openapi.yaml'),
        '--operation-id',
        'searchInvoices',
        '--base-url-env',
        'OPENAPI_INVOICE_API_BASE_URL',
        '--token-env',
        'OPENAPI_INVOICE_API_KEY',
        '--auth-header',
        'X-API-Key',
        '--auth-prefix',
        'none',
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    const generatedApiKey = yaml.load(apiKeyOutput);
    expectRecord(generatedApiKey, 'Generated OpenAPI API key config');
    const apiKeyProvider = (generatedApiKey.providers as unknown[])[0];
    expectRecord(apiKeyProvider, 'Generated OpenAPI API key provider');
    expectRecord(apiKeyProvider.config, 'Generated OpenAPI API key provider config');
    expect(apiKeyProvider.config.headers).toEqual({
      'X-API-Key': '{{env.OPENAPI_INVOICE_API_KEY}}',
    });

    const inferredApiKeyOutput = execFileSync(
      'node',
      [
        path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
        '--spec',
        path.join(fixtureRoot, 'provider-setup-openapi', 'openapi.yaml'),
        '--operation-id',
        'apiKeySearchInvoices',
        '--base-url-env',
        'OPENAPI_INVOICE_API_BASE_URL',
        '--token-env',
        'OPENAPI_INVOICE_API_KEY',
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    const inferredApiKeyGenerated = yaml.load(inferredApiKeyOutput);
    expectRecord(inferredApiKeyGenerated, 'Generated inferred OpenAPI API key config');
    const inferredApiKeyProvider = (inferredApiKeyGenerated.providers as unknown[])[0];
    expectRecord(inferredApiKeyProvider, 'Generated inferred OpenAPI API key provider');
    expectRecord(
      inferredApiKeyProvider.config,
      'Generated inferred OpenAPI API key provider config',
    );
    expect(inferredApiKeyProvider.config.url).toBe(
      '{{env.OPENAPI_INVOICE_API_BASE_URL}}/v1/invoices/apikey-search',
    );
    expect(inferredApiKeyProvider.config.headers).toEqual({
      'X-API-Key': '{{env.OPENAPI_INVOICE_API_KEY}}',
    });

    const inferredQueryApiKeyOutput = execFileSync(
      'node',
      [
        path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
        '--spec',
        path.join(fixtureRoot, 'provider-setup-openapi', 'openapi.yaml'),
        '--operation-id',
        'queryApiKeySearchInvoices',
        '--base-url-env',
        'OPENAPI_INVOICE_API_BASE_URL',
        '--token-env',
        'OPENAPI_INVOICE_API_KEY',
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    const inferredQueryApiKeyGenerated = yaml.load(inferredQueryApiKeyOutput);
    expectRecord(inferredQueryApiKeyGenerated, 'Generated inferred OpenAPI query API key config');
    const inferredQueryApiKeyProvider = (inferredQueryApiKeyGenerated.providers as unknown[])[0];
    expectRecord(inferredQueryApiKeyProvider, 'Generated inferred OpenAPI query API key provider');
    expectRecord(
      inferredQueryApiKeyProvider.config,
      'Generated inferred OpenAPI query API key provider config',
    );
    expect(inferredQueryApiKeyProvider.config.headers).toBeUndefined();
    expect(inferredQueryApiKeyProvider.config.queryParams).toEqual({
      q: '{{prompt}}',
      user_id: '{{user_id}}',
      api_key: '{{env.OPENAPI_INVOICE_API_KEY}}',
    });

    const inferredCookieOutput = execFileSync(
      'node',
      [
        path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
        '--spec',
        path.join(fixtureRoot, 'provider-setup-openapi', 'openapi.yaml'),
        '--operation-id',
        'cookieSearchInvoices',
        '--base-url-env',
        'OPENAPI_INVOICE_API_BASE_URL',
        '--token-env',
        'OPENAPI_INVOICE_SESSION',
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    const inferredCookieGenerated = yaml.load(inferredCookieOutput);
    expectRecord(inferredCookieGenerated, 'Generated inferred OpenAPI cookie config');
    const inferredCookieProvider = (inferredCookieGenerated.providers as unknown[])[0];
    expectRecord(inferredCookieProvider, 'Generated inferred OpenAPI cookie provider');
    expectRecord(
      inferredCookieProvider.config,
      'Generated inferred OpenAPI cookie provider config',
    );
    expect(inferredCookieProvider.config.url).toBe(
      '{{env.OPENAPI_INVOICE_API_BASE_URL}}/v1/invoices/cookie-search',
    );
    expect(inferredCookieProvider.config.headers).toEqual({
      Cookie: 'invoice_session={{env.OPENAPI_INVOICE_SESSION}}',
    });
    expect(inferredCookieProvider.config.queryParams).toEqual({
      q: '{{prompt}}',
      user_id: '{{user_id}}',
    });

    const conjunctiveAuthTempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'promptfoo-openapi-conjunctive-auth-'),
    );
    try {
      const conjunctiveAuthSpecPath = path.join(conjunctiveAuthTempDir, 'openapi.yaml');
      fs.writeFileSync(conjunctiveAuthSpecPath, yaml.dump(openApiConjunctiveAuthSpec()));
      const conjunctiveAuthOutput = execFileSync(
        'node',
        [
          path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
          '--spec',
          conjunctiveAuthSpecPath,
          '--operation-id',
          'conjunctiveSearch',
          '--base-url-env',
          'CONJUNCTIVE_API_BASE_URL',
          '--token-env',
          'CONJUNCTIVE_API_TOKEN',
        ],
        { cwd: repoRoot, encoding: 'utf8' },
      );
      const conjunctiveAuthGenerated = yaml.load(conjunctiveAuthOutput);
      expectRecord(conjunctiveAuthGenerated, 'Generated OpenAPI conjunctive auth config');
      const conjunctiveAuthProvider = (conjunctiveAuthGenerated.providers as unknown[])[0];
      expectRecord(conjunctiveAuthProvider, 'Generated OpenAPI conjunctive auth provider');
      expectRecord(
        conjunctiveAuthProvider.config,
        'Generated OpenAPI conjunctive auth provider config',
      );
      expect(conjunctiveAuthProvider.config.headers).toEqual({
        Authorization: 'Bearer {{env.CONJUNCTIVE_API_TOKEN}}',
        Cookie:
          'session_id={{env.CONJUNCTIVE_API_TOKEN}}; csrf_token={{env.CONJUNCTIVE_API_TOKEN}}',
        'X-API-Key': '{{env.CONJUNCTIVE_API_TOKEN}}',
      });
      expect(conjunctiveAuthProvider.config.queryParams).toEqual({
        q: '{{prompt}}',
      });

      const fallbackConjunctiveAuthOutput = execFileSync(
        'node',
        [
          path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
          '--spec',
          conjunctiveAuthSpecPath,
          '--operation-id',
          'fallbackConjunctiveSearch',
          '--base-url-env',
          'CONJUNCTIVE_API_BASE_URL',
          '--token-env',
          'CONJUNCTIVE_API_TOKEN',
        ],
        { cwd: repoRoot, encoding: 'utf8' },
      );
      const fallbackConjunctiveAuthGenerated = yaml.load(fallbackConjunctiveAuthOutput);
      expectRecord(
        fallbackConjunctiveAuthGenerated,
        'Generated OpenAPI fallback conjunctive auth config',
      );
      const fallbackConjunctiveAuthProvider = (
        fallbackConjunctiveAuthGenerated.providers as unknown[]
      )[0];
      expectRecord(
        fallbackConjunctiveAuthProvider,
        'Generated OpenAPI fallback conjunctive auth provider',
      );
      expectRecord(
        fallbackConjunctiveAuthProvider.config,
        'Generated OpenAPI fallback conjunctive auth provider config',
      );
      expect(fallbackConjunctiveAuthProvider.config.headers).toEqual({
        Authorization: 'Bearer {{env.CONJUNCTIVE_API_TOKEN}}',
        'X-API-Key': '{{env.CONJUNCTIVE_API_TOKEN}}',
      });

      const partialConjunctiveAuthOutput = execFileSync(
        'node',
        [
          path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
          '--spec',
          conjunctiveAuthSpecPath,
          '--operation-id',
          'partialConjunctiveSearch',
          '--base-url-env',
          'CONJUNCTIVE_API_BASE_URL',
          '--token-env',
          'CONJUNCTIVE_API_TOKEN',
        ],
        { cwd: repoRoot, encoding: 'utf8' },
      );
      const partialConjunctiveAuthGenerated = yaml.load(partialConjunctiveAuthOutput);
      expectRecord(
        partialConjunctiveAuthGenerated,
        'Generated OpenAPI partial conjunctive auth config',
      );
      const partialConjunctiveAuthProvider = (
        partialConjunctiveAuthGenerated.providers as unknown[]
      )[0];
      expectRecord(
        partialConjunctiveAuthProvider,
        'Generated OpenAPI partial conjunctive auth provider',
      );
      expectRecord(
        partialConjunctiveAuthProvider.config,
        'Generated OpenAPI partial conjunctive auth provider config',
      );
      expect(partialConjunctiveAuthProvider.config.headers).toEqual({
        Authorization: 'Bearer {{env.CONJUNCTIVE_API_TOKEN}}',
      });

      for (const operationId of [
        'explicitNoAuthSearch',
        'emptyRequirementSearch',
        'unsupportedAuthSearch',
      ]) {
        const noAuthOutput = execFileSync(
          'node',
          [
            path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
            '--spec',
            conjunctiveAuthSpecPath,
            '--operation-id',
            operationId,
            '--base-url-env',
            'CONJUNCTIVE_API_BASE_URL',
            '--token-env',
            'CONJUNCTIVE_API_TOKEN',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        );
        const noAuthGenerated = yaml.load(noAuthOutput);
        expectRecord(noAuthGenerated, `Generated OpenAPI ${operationId} config`);
        const noAuthProvider = (noAuthGenerated.providers as unknown[])[0];
        expectRecord(noAuthProvider, `Generated OpenAPI ${operationId} provider`);
        expectRecord(noAuthProvider.config, `Generated OpenAPI ${operationId} provider config`);
        expect(noAuthProvider.config.headers).toBeUndefined();
        expect(noAuthProvider.config.queryParams).toEqual({
          q: '{{prompt}}',
        });
      }
    } finally {
      fs.rmSync(conjunctiveAuthTempDir, { recursive: true, force: true });
    }

    const oauthTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-oauth-'));
    try {
      const oauthSpecPath = path.join(oauthTempDir, 'openapi.yaml');
      fs.writeFileSync(oauthSpecPath, yaml.dump(openApiOAuthSecuritySpec()));
      const runOAuthProviderHelper = (operationId: string, tokenEnv: string) =>
        yaml.load(
          execFileSync(
            'node',
            [
              path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
              '--spec',
              oauthSpecPath,
              '--operation-id',
              operationId,
              '--base-url-env',
              'OAUTH_API_BASE_URL',
              '--token-env',
              tokenEnv,
            ],
            { cwd: repoRoot, encoding: 'utf8' },
          ),
        );

      const oauthGenerated = runOAuthProviderHelper('oauthSearch', 'OAUTH_ACCESS_TOKEN');
      expectRecord(oauthGenerated, 'Generated OpenAPI OAuth2 provider config');
      const oauthProvider = (oauthGenerated.providers as unknown[])[0];
      expectRecord(oauthProvider, 'Generated OpenAPI OAuth2 provider');
      expectRecord(oauthProvider.config, 'Generated OpenAPI OAuth2 provider config block');
      expect(oauthProvider.config.headers).toEqual({
        Authorization: 'Bearer {{env.OAUTH_ACCESS_TOKEN}}',
      });
      expect(oauthProvider.config.queryParams).toEqual({
        q: '{{prompt}}',
        user_id: '{{user_id}}',
      });

      const openIdGenerated = runOAuthProviderHelper('openIdSearch', 'OPENID_ACCESS_TOKEN');
      expectRecord(openIdGenerated, 'Generated OpenAPI OpenID provider config');
      const openIdProvider = (openIdGenerated.providers as unknown[])[0];
      expectRecord(openIdProvider, 'Generated OpenAPI OpenID provider');
      expectRecord(openIdProvider.config, 'Generated OpenAPI OpenID provider config block');
      expect(openIdProvider.config.headers).toEqual({
        Authorization: 'Bearer {{env.OPENID_ACCESS_TOKEN}}',
      });
      expect(openIdProvider.config.queryParams).toEqual({
        q: '{{prompt}}',
      });
    } finally {
      fs.rmSync(oauthTempDir, { recursive: true, force: true });
    }

    const headerOutput = execFileSync(
      'node',
      [
        path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
        '--spec',
        path.join(fixtureRoot, 'provider-setup-openapi', 'openapi.yaml'),
        '--operation-id',
        'headerSearchInvoices',
        '--base-url-env',
        'OPENAPI_INVOICE_API_BASE_URL',
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    const generatedHeader = yaml.load(headerOutput);
    expectRecord(generatedHeader, 'Generated OpenAPI header parameter config');
    const headerProvider = (generatedHeader.providers as unknown[])[0];
    expectRecord(headerProvider, 'Generated OpenAPI header parameter provider');
    expectRecord(headerProvider.config, 'Generated OpenAPI header parameter provider config');
    expect(headerProvider.config.url).toBe(
      '{{env.OPENAPI_INVOICE_API_BASE_URL}}/v1/invoices/header-search',
    );
    expect(headerProvider.config.headers).toEqual({
      'X-Tenant-Id': '{{x_tenant_id}}',
    });
    expect(headerProvider.config.queryParams).toEqual({
      q: '{{prompt}}',
      user_id: '{{user_id}}',
      'api-version': '{{api_version}}',
    });
    const headerTest = (generatedHeader.tests as unknown[])[0];
    expectRecord(headerTest, 'Generated OpenAPI header parameter test');
    expect(headerTest.vars).toEqual({
      user_id: 'sample-user-id',
      x_tenant_id: 'tenant-alpha',
      api_version: '2026-04-01',
      message: 'Say exactly PONG.',
    });

    const cookieParamOutput = execFileSync(
      'node',
      [
        path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
        '--spec',
        path.join(fixtureRoot, 'provider-setup-openapi', 'openapi.yaml'),
        '--operation-id',
        'cookieParamSearchInvoices',
        '--base-url-env',
        'OPENAPI_INVOICE_API_BASE_URL',
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    const generatedCookieParam = yaml.load(cookieParamOutput);
    expectRecord(generatedCookieParam, 'Generated OpenAPI cookie parameter config');
    const cookieParamProvider = (generatedCookieParam.providers as unknown[])[0];
    expectRecord(cookieParamProvider, 'Generated OpenAPI cookie parameter provider');
    expectRecord(cookieParamProvider.config, 'Generated OpenAPI cookie parameter provider config');
    expect(cookieParamProvider.config.headers).toEqual({
      Cookie: 'invoice-context={{invoice_context}}',
    });
    expect(cookieParamProvider.config.queryParams).toEqual({
      q: '{{prompt}}',
      user_id: '{{user_id}}',
    });
    const cookieParamTest = (generatedCookieParam.tests as unknown[])[0];
    expectRecord(cookieParamTest, 'Generated OpenAPI cookie parameter test');
    expect(cookieParamTest.vars).toEqual({
      user_id: 'sample-user-id',
      invoice_context: 'context-alpha',
      message: 'Say exactly PONG.',
    });

    const questionOutput = execFileSync(
      'node',
      [
        path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
        '--spec',
        path.join(fixtureRoot, 'provider-setup-openapi', 'openapi.yaml'),
        '--operation-id',
        'askInvoiceQuestion',
        '--base-url-env',
        'OPENAPI_INVOICE_API_BASE_URL',
        '--token-env',
        'OPENAPI_INVOICE_API_TOKEN',
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    const generatedQuestion = yaml.load(questionOutput);
    expectRecord(generatedQuestion, 'Generated OpenAPI question config');
    const questionProvider = (generatedQuestion.providers as unknown[])[0];
    expectRecord(questionProvider, 'Generated OpenAPI question provider');
    expectRecord(questionProvider.config, 'Generated OpenAPI question provider config');
    expect(questionProvider.config.method).toBe('POST');
    expect(questionProvider.config.url).toBe(
      '{{env.OPENAPI_INVOICE_API_BASE_URL}}/v1/invoices/ask',
    );
    expect(questionProvider.config.body).toEqual({
      tenant_id: '{{tenant_id}}',
      question: '{{prompt}}',
    });
    expect(questionProvider.config.transformResponse).toBe('json.answer');
    const questionTest = (generatedQuestion.tests as unknown[])[0];
    expectRecord(questionTest, 'Generated OpenAPI question test');
    expect(questionTest.vars).toEqual({
      tenant_id: 'sample-tenant-id',
      message: 'Say exactly PONG.',
    });

    const createdOutput = execFileSync(
      'node',
      [
        path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
        '--spec',
        path.join(fixtureRoot, 'provider-setup-openapi', 'openapi.yaml'),
        '--operation-id',
        'createInvoiceNote',
        '--base-url-env',
        'OPENAPI_INVOICE_API_BASE_URL',
        '--token-env',
        'OPENAPI_INVOICE_API_TOKEN',
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    const generatedCreated = yaml.load(createdOutput);
    expectRecord(generatedCreated, 'Generated OpenAPI 201 config');
    const createdProvider = (generatedCreated.providers as unknown[])[0];
    expectRecord(createdProvider, 'Generated OpenAPI 201 provider');
    expectRecord(createdProvider.config, 'Generated OpenAPI 201 provider config');
    expect(createdProvider.config.url).toBe(
      '{{env.OPENAPI_INVOICE_API_BASE_URL}}/v1/invoices/{{invoice_id | urlencode}}/notes',
    );
    expect(createdProvider.config.method).toBe('POST');
    expect(createdProvider.config.queryParams).toEqual({
      tenant_id: '{{tenant_id}}',
    });
    expect(createdProvider.config.body).toEqual({ user_id: '{{user_id}}', message: '{{prompt}}' });
    expect(createdProvider.config.transformResponse).toBe('json.output');
    const createdTest = (generatedCreated.tests as unknown[])[0];
    expectRecord(createdTest, 'Generated OpenAPI 201 test');
    expect(createdTest.vars).toEqual({
      invoice_id: 'sample-invoice-id',
      tenant_id: 'sample-tenant-id',
      user_id: 'sample-user-id',
      message: 'Say exactly PONG.',
    });
  });

  it('fails clearly for unsupported external OpenAPI refs', () => {
    expectOpenApiHelperFailure(
      path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
      {
        openapi: '3.1.0',
        paths: {
          '/broken': {
            get: {
              operationId: 'brokenOperation',
              responses: {
                '200': {
                  description: 'Broken response',
                  content: {
                    'application/json': {
                      schema: { $ref: 'https://example.test/schemas/Response.yaml' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      'Only local OpenAPI refs are supported',
    );
  });

  it('keeps a deterministic smoke message var for OpenAPI operations without prompt inputs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-provider-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(
        specPath,
        yaml.dump({
          openapi: '3.1.0',
          paths: {
            '/health': {
              get: {
                operationId: 'getHealth',
                responses: {
                  '200': {
                    description: 'Health response',
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          properties: {
                            status: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      );
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'getHealth',
            '--base-url-env',
            'HEALTH_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated no-prompt OpenAPI provider config');
      expect(generated.prompts).toEqual(['{{message}}']);
      const [provider] = generated.providers as unknown[];
      expectRecord(provider, 'Generated no-prompt OpenAPI provider');
      expectRecord(provider.config, 'Generated no-prompt OpenAPI provider config block');
      expect(provider.config.url).toBe('{{env.HEALTH_API_BASE_URL}}/health');
      expect(provider.config.queryParams).toBeUndefined();
      expect(provider.config.body).toBeUndefined();
      expect(provider.config.transformResponse).toBe('json.status');
      const [test] = generated.tests as unknown[];
      expectRecord(test, 'Generated no-prompt OpenAPI provider test');
      expect(test.vars).toEqual({
        message: 'Say exactly PONG.',
      });
      // The "Say exactly PONG." message never reaches the target here, so the
      // smoke assertion falls back to is-json on the structured response
      // instead of `contains: PONG` (which would fail by construction).
      expect(test.assert).toEqual([{ type: 'is-json' }]);
      expect(test.description).toBe('getHealth responds successfully');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('prefers OpenAPI parameter and media examples for provider smoke vars', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-provider-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiExamplePrecedenceSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'createExampleNote',
            '--base-url-env',
            'EXAMPLE_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated example precedence provider config');
      const [provider] = generated.providers as unknown[];
      expectRecord(provider, 'Generated example precedence provider');
      expectRecord(provider.config, 'Generated example precedence provider config block');
      expect(provider.config.url).toBe(
        '{{env.EXAMPLE_API_BASE_URL}}/example/{{invoice_id | urlencode}}',
      );
      expect(provider.config.queryParams).toEqual({
        'tenant-id': '{{tenant_id}}',
      });
      expect(provider.config.body).toEqual({
        user_id: '{{user_id}}',
        message: '{{prompt}}',
        note_type: '{{note_type}}',
      });
      const [test] = generated.tests as unknown[];
      expectRecord(test, 'Generated example precedence provider test');
      expect(test.vars).toEqual({
        invoice_id: 'invoice-from-parameter-example',
        tenant_id: 'tenant-from-example-ref',
        user_id: 'user-from-media-example',
        note_type: 'note-type-from-media-example',
        message: 'Say exactly PONG.',
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('uses vendor +json OpenAPI media types for provider request and response schemas', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-provider-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiVendorJsonSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'createVendorJsonNote',
            '--base-url-env',
            'VENDOR_JSON_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated vendor JSON provider config');
      const [provider] = generated.providers as unknown[];
      expectRecord(provider, 'Generated vendor JSON provider');
      expectRecord(provider.config, 'Generated vendor JSON provider config block');
      expect(provider.config.headers).toEqual({
        'Content-Type': 'application/vnd.promptfoo.note+json',
      });
      expect(provider.config.body).toEqual({
        user_id: '{{user_id}}',
        message: '{{prompt}}',
      });
      expect(provider.config.transformResponse).toBe('json.answer');
      const [test] = generated.tests as unknown[];
      expectRecord(test, 'Generated vendor JSON provider test');
      expect(test.vars).toEqual({
        user_id: 'vendor-json-user',
        message: 'Say exactly PONG.',
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('uses OpenAPI form-urlencoded request bodies for provider configs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-provider-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiFormUrlEncodedSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'formChat',
            '--base-url-env',
            'FORM_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated form provider config');
      const [provider] = generated.providers as unknown[];
      expectRecord(provider, 'Generated form provider');
      expectRecord(provider.config, 'Generated form provider config block');
      expect(provider.config.headers).toEqual({
        'Content-Type': 'application/x-www-form-urlencoded',
      });
      expect(provider.config.body).toBe(
        'user_id={{user_id | urlencode}}&message={{prompt | urlencode}}&scope={{scope | urlencode}}',
      );
      expect(provider.config.transformResponse).toBe('json.answer');
      const [test] = generated.tests as unknown[];
      expectRecord(test, 'Generated form provider test');
      expect(test.vars).toEqual({
        user_id: 'form-user',
        scope: 'billing support',
        message: 'Say exactly PONG.',
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('uses OpenAPI multipart request bodies for provider configs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-provider-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiMultipartSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'analyzeFile',
            '--base-url-env',
            'MULTIPART_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated multipart provider config');
      const [provider] = generated.providers as unknown[];
      expectRecord(provider, 'Generated multipart provider');
      expectRecord(provider.config, 'Generated multipart provider config block');
      expect(provider.config.headers).toBeUndefined();
      expect(provider.config.body).toBeUndefined();
      expect(provider.config.multipart).toEqual({
        parts: [
          {
            kind: 'file',
            name: 'document',
            filename: 'promptfoo-document.pdf',
            source: {
              type: 'generated',
              generator: 'basic-document',
              format: 'pdf',
              text: 'Promptfoo generated document for {{document}}.',
            },
          },
          { kind: 'field', name: 'question', value: '{{prompt}}' },
          { kind: 'field', name: 'user_id', value: '{{user_id}}' },
        ],
      });
      expect(provider.config.transformResponse).toBe('json.output');
      const [test] = generated.tests as unknown[];
      expectRecord(test, 'Generated multipart provider test');
      expect(test.vars).toEqual({
        document: 'sample-document',
        user_id: 'multipart-user',
        message: 'Say exactly PONG.',
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('uses OpenAPI text request bodies for provider configs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-provider-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiTextPlainSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'textChat',
            '--base-url-env',
            'TEXT_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated text provider config');
      const [provider] = generated.providers as unknown[];
      expectRecord(provider, 'Generated text provider');
      expectRecord(provider.config, 'Generated text provider config block');
      expect(provider.config.headers).toEqual({
        'Content-Type': 'text/plain',
      });
      expect(provider.config.body).toBe('{{prompt}}');
      expect(provider.config.transformResponse).toBe('json.output');
      const [test] = generated.tests as unknown[];
      expectRecord(test, 'Generated text provider test');
      expect(test.vars).toEqual({
        message: 'Say exactly PONG.',
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('preserves scalar OpenAPI request examples without schemas for provider configs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-provider-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiScalarExampleRequestSpec()));
      for (const [operationId, contentType] of [
        ['jsonScalarChat', 'application/json'],
        ['jsonScalarSchemaChat', 'application/json'],
        ['textScalarChat', 'text/plain'],
      ]) {
        const generated = yaml.load(
          execFileSync(
            'node',
            [
              path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
              '--spec',
              specPath,
              '--operation-id',
              operationId,
              '--base-url-env',
              'SCALAR_API_BASE_URL',
            ],
            { cwd: repoRoot, encoding: 'utf8' },
          ),
        );
        expectRecord(generated, `Generated ${operationId} provider config`);
        const [provider] = generated.providers as unknown[];
        expectRecord(provider, `Generated ${operationId} provider`);
        expectRecord(provider.config, `Generated ${operationId} provider config block`);
        expect(provider.config.headers).toEqual({
          'Content-Type': contentType,
        });
        expect(provider.config.body).toBe('{{prompt}}');
        expect(provider.config.transformResponse).toBe('json.output');
        const [test] = generated.tests as unknown[];
        expectRecord(test, `Generated ${operationId} provider test`);
        expect(test.vars).toEqual({
          message: 'Say exactly PONG.',
        });
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('uses OpenAPI root array request bodies for provider configs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-provider-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiArrayRequestSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'batchChat',
            '--base-url-env',
            'BATCH_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated array provider config');
      const [provider] = generated.providers as unknown[];
      expectRecord(provider, 'Generated array provider');
      expectRecord(provider.config, 'Generated array provider config block');
      expect(provider.config.headers).toEqual({
        'Content-Type': 'application/json',
      });
      expect(provider.config.body).toEqual([
        {
          user_id: '{{user_id}}',
          message: '{{prompt}}',
          priority: '{{priority}}',
        },
      ]);
      expect(provider.config.transformResponse).toBe('json.output');
      const [test] = generated.tests as unknown[];
      expectRecord(test, 'Generated array provider test');
      expect(test.vars).toEqual({
        user_id: 'array-user',
        priority: 'normal',
        message: 'Say exactly PONG.',
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('preserves OpenAPI example-only array request bodies for provider configs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-provider-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiExampleOnlyArrayBodySpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'exampleArrayChat',
            '--base-url-env',
            'EXAMPLE_ARRAY_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated example-only array provider config');
      const [provider] = generated.providers as unknown[];
      expectRecord(provider, 'Generated example-only array provider');
      expectRecord(provider.config, 'Generated example-only array provider config block');
      expect(provider.config.body).toEqual([
        {
          user_id: '{{user_id}}',
          message: '{{prompt}}',
          priority: '{{priority}}',
        },
      ]);
      const [test] = generated.tests as unknown[];
      expectRecord(test, 'Generated example-only array provider test');
      expect(test.vars).toEqual({
        user_id: 'example-array-user',
        priority: 'expedite',
        message: 'Say exactly PONG.',
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('extracts first-item fields from OpenAPI array responses for provider configs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-provider-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiArrayResponseSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'arrayResponseChat',
            '--base-url-env',
            'ARRAY_RESPONSE_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated array-response provider config');
      const [provider] = generated.providers as unknown[];
      expectRecord(provider, 'Generated array-response provider');
      expectRecord(provider.config, 'Generated array-response provider config block');
      expect(provider.config.body).toEqual({
        message: '{{prompt}}',
        user_id: '{{user_id}}',
      });
      expect(provider.config.transformResponse).toBe('json[0].output');
      const [test] = generated.tests as unknown[];
      expectRecord(test, 'Generated array-response provider test');
      expect(test.vars).toEqual({
        user_id: 'array-response-user',
        message: 'Say exactly PONG.',
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('extracts first-item fields from OpenAPI example-only array responses for provider configs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-provider-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiExampleOnlyArrayResponseSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'exampleArrayResponseChat',
            '--base-url-env',
            'EXAMPLE_ARRAY_RESPONSE_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated example-only array-response provider config');
      const [provider] = generated.providers as unknown[];
      expectRecord(provider, 'Generated example-only array-response provider');
      expectRecord(provider.config, 'Generated example-only array-response provider config block');
      expect(provider.config.transformResponse).toBe('json[0].output');
      const [test] = generated.tests as unknown[];
      expectRecord(test, 'Generated example-only array-response provider test');
      expect(test.vars).toEqual({
        user_id: 'example-array-response-user',
        message: 'Say exactly PONG.',
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('quotes unsafe OpenAPI response field accessors for provider configs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-provider-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiUnsafeResponseFieldSpec()));
      const runHelper = (operationId: string) =>
        yaml.load(
          execFileSync(
            'node',
            [
              path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
              '--spec',
              specPath,
              '--operation-id',
              operationId,
              '--base-url-env',
              'UNSAFE_RESPONSE_API_BASE_URL',
            ],
            { cwd: repoRoot, encoding: 'utf8' },
          ),
        );

      const objectGenerated = runHelper('unsafeResponseField');
      expectRecord(objectGenerated, 'Generated unsafe response field provider config');
      const [objectProvider] = objectGenerated.providers as unknown[];
      expectRecord(objectProvider, 'Generated unsafe response field provider');
      expectRecord(objectProvider.config, 'Generated unsafe response field provider config block');
      expect(objectProvider.config.transformResponse).toBe('json["api-version"]');

      const arrayGenerated = runHelper('unsafeArrayResponseField');
      expectRecord(arrayGenerated, 'Generated unsafe array response field provider config');
      const [arrayProvider] = arrayGenerated.providers as unknown[];
      expectRecord(arrayProvider, 'Generated unsafe array response field provider');
      expectRecord(arrayProvider.config, 'Generated unsafe array response field provider config');
      expect(arrayProvider.config.transformResponse).toBe('json[0]["200"]');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('merges OpenAPI allOf request and response schemas for provider configs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-provider-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiAllOfSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'createAllOfNote',
            '--base-url-env',
            'ALLOF_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated allOf provider config');
      const [provider] = generated.providers as unknown[];
      expectRecord(provider, 'Generated allOf provider');
      expectRecord(provider.config, 'Generated allOf provider config block');
      expect(provider.config.body).toEqual({
        user_id: '{{user_id}}',
        message: '{{prompt}}',
        note_type: '{{note_type}}',
      });
      expect(provider.config.transformResponse).toBe('json.answer');
      const [test] = generated.tests as unknown[];
      expectRecord(test, 'Generated allOf provider test');
      expect(test.vars).toEqual({
        user_id: 'allof-user',
        note_type: 'internal-note',
        message: 'Say exactly PONG.',
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('allows repeated non-cyclic OpenAPI refs for provider configs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-provider-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiRepeatedRefSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'createRepeatedRefNote',
            '--base-url-env',
            'REPEATED_REF_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated repeated-ref provider config');
      const [provider] = generated.providers as unknown[];
      expectRecord(provider, 'Generated repeated-ref provider');
      expectRecord(provider.config, 'Generated repeated-ref provider config block');
      expect(provider.config.body).toEqual({
        user_id: '{{user_id}}',
        message: '{{prompt}}',
      });
      expect(provider.config.transformResponse).toBe('json.answer');
      const [test] = generated.tests as unknown[];
      expectRecord(test, 'Generated repeated-ref provider test');
      expect(test.vars).toEqual({
        user_id: 'repeat-user',
        message: 'Say exactly PONG.',
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('normalizes camelCase OpenAPI identifiers for provider configs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-provider-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiCamelCaseIdSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'chatWithCamelCaseInvoice',
            '--base-url-env',
            'CAMEL_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated camelCase provider config');
      const [provider] = generated.providers as unknown[];
      expectRecord(provider, 'Generated camelCase provider');
      expectRecord(provider.config, 'Generated camelCase provider config block');
      expect(provider.config.url).toBe(
        '{{env.CAMEL_API_BASE_URL}}/users/{{user_id | urlencode}}/invoices/{{invoice_id | urlencode}}/chat',
      );
      expect(provider.config.queryParams).toEqual({
        apiVersion: '{{api_version}}',
      });
      expect(provider.config.body).toEqual({
        accountId: '{{account_id}}',
        message: '{{prompt}}',
      });
      const [test] = generated.tests as unknown[];
      expectRecord(test, 'Generated camelCase provider test');
      expect(test.vars).toEqual({
        user_id: 'camel-user',
        invoice_id: 'camel-invoice',
        api_version: '2026-04-17',
        account_id: 'camel-account',
        message: 'Say exactly PONG.',
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('uses the first OpenAPI oneOf/anyOf variant for provider config drafts', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-provider-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiVariantSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'variantSearch',
            '--base-url-env',
            'VARIANT_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated variant provider config');
      const [provider] = generated.providers as unknown[];
      expectRecord(provider, 'Generated variant provider');
      expectRecord(provider.config, 'Generated variant provider config block');
      expect(provider.config.body).toEqual({
        user_id: '{{user_id}}',
        query: '{{prompt}}',
      });
      expect(provider.config.transformResponse).toBe('json.answer');
      const [test] = generated.tests as unknown[];
      expectRecord(test, 'Generated variant provider test');
      expect(test.vars).toEqual({
        user_id: 'variant-user',
        message: 'Say exactly PONG.',
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('uses OpenAPI request body examples when provider schemas are omitted', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-provider-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiExampleOnlyBodySpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'createExampleOnlyNote',
            '--base-url-env',
            'EXAMPLE_ONLY_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated example-only provider config');
      const [provider] = generated.providers as unknown[];
      expectRecord(provider, 'Generated example-only provider');
      expectRecord(provider.config, 'Generated example-only provider config block');
      expect(provider.config.headers).toEqual({
        'Content-Type': 'application/json',
      });
      expect(provider.config.body).toEqual({
        user_id: '{{user_id}}',
        message: '{{prompt}}',
        note_type: '{{note_type}}',
      });
      expect(provider.config.transformResponse).toBe('json.answer');
      const [test] = generated.tests as unknown[];
      expectRecord(test, 'Generated example-only provider test');
      expect(test.vars).toEqual({
        user_id: 'example-user',
        note_type: 'support-note',
        message: 'Say exactly PONG.',
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('uses OpenAPI schema types for provider smoke vars', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-provider-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiTypedSchemaSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'createTypedNote',
            '--base-url-env',
            'TYPED_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated typed provider config');
      const [provider] = generated.providers as unknown[];
      expectRecord(provider, 'Generated typed provider');
      expectRecord(provider.config, 'Generated typed provider config block');
      expect(provider.config.body).toEqual({
        user_id: '{{user_id}}',
        message: '{{prompt}}',
        limit: '{{limit}}',
        include_archived: '{{include_archived}}',
        tags: '{{tags}}',
        metadata: '{{metadata}}',
        status: '{{status}}',
        contact_email: '{{contact_email}}',
        callback_url: '{{callback_url}}',
        request_id: '{{request_id}}',
        scheduled_date: '{{scheduled_date}}',
        created_at: '{{created_at}}',
        confidence: '{{confidence}}',
      });
      const [test] = generated.tests as unknown[];
      expectRecord(test, 'Generated typed provider test');
      expect(test.vars).toEqual({
        user_id: 'typed-user',
        limit: 1,
        include_archived: true,
        tags: ['finance'],
        metadata: {
          region: 'us-west',
          priority: 1,
        },
        status: 'queued',
        contact_email: 'user@example.com',
        callback_url: 'https://example.test/resource',
        request_id: '00000000-0000-4000-8000-000000000000',
        scheduled_date: '2026-04-17',
        created_at: '2026-04-17T00:00:00Z',
        confidence: 1,
        message: 'Say exactly PONG.',
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('lets OpenAPI operation parameters override path-item parameters for provider configs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-provider-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiParameterOverrideSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'overrideParameters',
            '--base-url-env',
            'OVERRIDE_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated override provider config');
      const [provider] = generated.providers as unknown[];
      expectRecord(provider, 'Generated override provider');
      expectRecord(provider.config, 'Generated override provider config block');
      expect(provider.config.url).toBe(
        '{{env.OVERRIDE_API_BASE_URL}}/override/{{resource_id | urlencode}}',
      );
      expect(provider.config.queryParams).toEqual({
        'api-version': '{{api_version}}',
      });
      expect(provider.config.headers).toEqual({
        'Content-Type': 'application/json',
        'X-Trace-Id': '{{x_trace_id}}',
      });
      const [test] = generated.tests as unknown[];
      expectRecord(test, 'Generated override provider test');
      expect(test.vars).toEqual({
        resource_id: 'resource-123',
        api_version: 'operation-version',
        x_trace_id: 'operation-trace',
        message: 'Say exactly PONG.',
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('skips OpenAPI writeOnly response fields for provider response transforms', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-provider-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiWriteOnlyResponseSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'writeOnlyResponse',
            '--base-url-env',
            'WRITE_ONLY_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated writeOnly response provider config');
      const [provider] = generated.providers as unknown[];
      expectRecord(provider, 'Generated writeOnly response provider');
      expectRecord(provider.config, 'Generated writeOnly response provider config block');
      expect(provider.config.transformResponse).toBe('json.public_text');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('honors composed OpenAPI visibility flags for provider configs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-provider-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiComposedVisibilitySpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'composedVisibility',
            '--base-url-env',
            'COMPOSED_VISIBILITY_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated composed visibility provider config');
      const [provider] = generated.providers as unknown[];
      expectRecord(provider, 'Generated composed visibility provider');
      expectRecord(provider.config, 'Generated composed visibility provider config block');
      expect(provider.config.body).toEqual({
        message: '{{prompt}}',
        client_note: '{{client_note}}',
      });
      expect(provider.config.transformResponse).toBe('json.public_text');
      const [test] = generated.tests as unknown[];
      expectRecord(test, 'Generated composed visibility provider test');
      expect(test.vars).toEqual({
        client_note: 'sample-client_note',
        message: 'Say exactly PONG.',
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fails clearly for circular OpenAPI refs', () => {
    expectOpenApiHelperFailure(
      path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
      {
        openapi: '3.1.0',
        paths: {
          '/broken': {
            post: {
              operationId: 'brokenOperation',
              requestBody: {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/A' },
                  },
                },
              },
              responses: {
                '200': {
                  description: 'Broken response',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: { output: { type: 'string' } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            A: { $ref: '#/components/schemas/B' },
            B: { $ref: '#/components/schemas/A' },
          },
        },
      },
      'Circular OpenAPI ref detected',
    );
  });

  it('treats OpenAPI example: null as missing so schema-typed samples fall through', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-null-example-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(
        specPath,
        yaml.dump({
          openapi: '3.1.0',
          paths: {
            '/null-example-ask': {
              post: {
                operationId: 'nullExampleAsk',
                requestBody: {
                  required: true,
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        required: ['tenant_id', 'message'],
                        properties: {
                          tenant_id: { type: 'string', example: null },
                          message: { type: 'string' },
                        },
                      },
                    },
                  },
                },
                responses: {
                  '200': {
                    description: 'Null example response',
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          properties: { output: { type: 'string' } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      );
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'nullExampleAsk',
            '--base-url-env',
            'NULL_EXAMPLE_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated null-example provider config');
      const [test] = generated.tests as unknown[];
      expectRecord(test, 'Generated null-example provider test');
      expect(test.vars).toEqual({
        tenant_id: 'sample-tenant-id',
        message: 'Say exactly PONG.',
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('keeps --auth-prefix from corrupting conjunctive API-key auths', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-auth-prefix-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiConjunctiveAuthSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'conjunctiveSearch',
            '--base-url-env',
            'CONJUNCTIVE_API_BASE_URL',
            '--token-env',
            'CONJUNCTIVE_API_TOKEN',
            '--auth-prefix',
            'Token',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated auth-prefix override config');
      const provider = (generated.providers as unknown[])[0];
      expectRecord(provider, 'Generated auth-prefix override provider');
      expectRecord(provider.config, 'Generated auth-prefix override provider config');
      // Bearer prefix is overridden; the X-API-Key and Cookie auths (prefix 'none') are untouched.
      expect(provider.config.headers).toEqual({
        Authorization: 'Token {{env.CONJUNCTIVE_API_TOKEN}}',
        'X-API-Key': '{{env.CONJUNCTIVE_API_TOKEN}}',
        Cookie:
          'session_id={{env.CONJUNCTIVE_API_TOKEN}}; csrf_token={{env.CONJUNCTIVE_API_TOKEN}}',
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('forces env placeholders for credential-like header, query, and cookie params', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-credential-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(
        specPath,
        yaml.dump({
          openapi: '3.1.0',
          paths: {
            '/search': {
              get: {
                operationId: 'leakyAuthSearch',
                parameters: [
                  {
                    name: 'Authorization',
                    in: 'header',
                    schema: { type: 'string', example: 'Bearer SECRET_TOKEN_123' },
                  },
                  {
                    name: 'api_key',
                    in: 'query',
                    schema: { type: 'string', example: 'PROD_API_KEY_456' },
                  },
                  {
                    name: 'session_id',
                    in: 'cookie',
                    schema: { type: 'string', example: 'sess_XYZ' },
                  },
                  { name: 'q', in: 'query', schema: { type: 'string' } },
                ],
                responses: {
                  '200': {
                    description: 'ok',
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          properties: { output: { type: 'string' } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      );
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(providerSkillRoot, 'scripts', 'openapi-operation-to-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'leakyAuthSearch',
            '--base-url-env',
            'LEAKY_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated credential-leak provider config');
      const provider = (generated.providers as unknown[])[0];
      expectRecord(provider, 'Generated credential-leak provider');
      expectRecord(provider.config, 'Generated credential-leak provider config block');
      // Credential-like header/query/cookie params route through env placeholders,
      // NOT through vars (which would embed the raw example token into the config).
      expect(provider.config.headers).toEqual({
        Authorization: '{{env.AUTHORIZATION}}',
        Cookie: 'session_id={{env.SESSION_ID}}',
      });
      expect(provider.config.queryParams).toEqual({
        api_key: '{{env.API_KEY}}',
        q: '{{prompt}}',
      });
      const [test] = generated.tests as unknown[];
      expectRecord(test, 'Generated credential-leak provider test');
      expect(test.vars).toEqual({ message: 'Say exactly PONG.' });
      // No literal secrets copied from the OpenAPI example values.
      const serialized = yaml.dump(generated);
      expect(serialized).not.toContain('SECRET_TOKEN_123');
      expect(serialized).not.toContain('PROD_API_KEY_456');
      expect(serialized).not.toContain('sess_XYZ');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('promptfoo-redteam-setup skill', () => {
  it('has a routing description with setup scope and run/provider boundaries', () => {
    const skill = readText(path.join(redteamSetupSkillRoot, 'SKILL.md'));

    expect(skill).toMatch(/^---\nname: promptfoo-redteam-setup\n/);
    expect(skill).toContain('purpose');
    expect(skill).toContain('plugins');
    expect(skill).toContain('strategies');
    expect(skill).toContain('multi-input target inputs');
    expect(skill).toContain('Do not use for');
    expect(skill).toContain('basic provider wiring');
    expect(skill).toContain('running/evaluating an already-generated');
  });

  it('documents focused redteam setup workflow and generation QA', () => {
    const skill = readText(path.join(redteamSetupSkillRoot, 'SKILL.md'));

    expect(skill).toContain('Derive target facts from live or static evidence');
    expect(skill).toContain('Write the target and purpose');
    expect(skill).toContain('Choose a small plugin set');
    expect(skill).toContain('Choose strategies conservatively');
    expect(skill).toContain('Use `jailbreak:meta` for the default first setup/generation pass.');
    expect(skill).toContain('Use `jailbreak:hydra` instead when the target is stateful');
    expect(skill).toContain('search route handlers, API clients, tests');
    expect(skill).toContain('object IDs imply `bola`');
    expect(skill).toContain("Promptfoo's default redteam generation");
    expect(skill).toContain('redteam.provider');
    expect(skill).toContain('file://x.py:name');
    expect(skill).toContain('openapi-operation-to-redteam-config.mjs');
    expect(skill).toContain('--auth-header');
    expect(skill).toContain('--auth-prefix');
    expect(skill).toContain('infers Bearer/OAuth2/OpenID and header/query/cookie API-key auth');
    expect(skill).toContain('--smoke-test true');
    expect(skill).toContain('validate target');
    expect(skill).toContain('redteam generate');
    expect(skill).toContain('metadata.pluginId');
    expect(skill).toContain('defaultTest.metadata.purpose');
    expect(skill).toContain('non-precreated output path');
    expect(skill).toContain('config-relative `file://./target.js`');
    expect(skill).toContain('file targets resolve under `/tmp`');
  });

  it('assumes remote redteam generation is available', () => {
    const redteamMarkdown = [
      readText(path.join(redteamSetupSkillRoot, 'SKILL.md')),
      readText(path.join(redteamSetupSkillRoot, 'references', 'redteam-setup-patterns.md')),
      readText(path.join(redteamRunSkillRoot, 'SKILL.md')),
      readText(path.join(redteamRunSkillRoot, 'references', 'redteam-run-patterns.md')),
    ].join('\n');

    expect(redteamMarkdown).toContain("Promptfoo's default redteam generation");
    for (const forbidden of [
      ['PROMPTFOO_DISABLE', 'REMOTE_GENERATION'].join('_'),
      ['local-only', 'generation'].join(' '),
      ['Local', 'Only', 'QA'].join('-').replace('-QA', ' QA'),
      ['remote', 'only'].join('-'),
      ['data must', 'stay local'].join(' '),
      ['deferred', 'remote', 'enabled scan'].join(' ').replace('remote ', 'remote-'),
    ]) {
      expect(redteamMarkdown).not.toContain(forbidden);
    }
  });

  it('ships Codex UI metadata for redteam setup', () => {
    const openaiYaml = readText(path.join(redteamSetupSkillRoot, 'agents', 'openai.yaml'));

    expect(openaiYaml).toContain('Promptfoo Redteam Setup');
    expect(openaiYaml).toContain('$promptfoo-redteam-setup');
    expect(openaiYaml).toContain('allow_implicit_invocation: true');
  });

  it('keeps redteam examples in a progressive-disclosure reference file', () => {
    const reference = readText(
      path.join(redteamSetupSkillRoot, 'references', 'redteam-setup-patterns.md'),
    );

    expect(reference).toContain('Single-input HTTP policy scan');
    expect(reference).toContain('Multi-input authorization scan');
    expect(reference).toContain('Multi-input is not the same as multi-turn.');
    expect(reference).toContain('jailbreak:meta');
    expect(reference).toContain('jailbreak:hydra');
    expect(reference).toContain('provider: file://./redteam-generator.mjs');
    expect(reference).toContain('file://./redteam-generator.py');
    expect(reference).toContain('call_api(prompt, options, context)');
    expect(reference).toContain("json.dumps(payload, separators=(',', ':'))");
    expect(reference).toContain('Relative to the command working directory');
    expect(reference).toContain('repo-root-relative path');
    expect(reference).toContain('Before generating against a live target');
    expect(reference).toContain('inspect the observed request/response');
    expect(reference).toContain('id: policy');
    expect(reference).toContain('Add `bola` or `bfla`');
    expect(reference).toContain('id: rbac');
    expect(reference).toContain('Generation QA commands');
    expect(reference).toContain('multi-input-mode');
    expect(reference).toContain('empty `mktemp` file');
    expect(reference).toContain('metadata.configHash');
    expect(reference).toContain('defaultTest?.metadata?.purpose');
    expect(reference).toContain('For local file targets such as `file://./target.js`');
    expect(reference).toContain('file://provider.py:invoice_redteam_target');
    expect(reference).toContain('file://provider.py:function_name');
    expect(reference).toContain('file://generator.py:function_name');
    expect(reference).toContain('file://redteam-generator.py:generate_redteam_invoice_prompt');
    expect(reference).toContain('timeout: 30000');
    expect(reference).toContain('anchor `sys.path`');
    expect(reference).toContain('Path(__file__).resolve().parent');
    expect(reference).toContain('constructor `options.config`');
    expect(reference).toContain('options` argument to the selected function');
    expect(reference).toContain('resolve under `/tmp`');
    expect(reference).toContain('OpenAPI operation to redteam setup');
    expect(reference).toContain('openapi-operation-to-redteam-config.mjs');
    expect(reference).toContain('`defaultTest.vars`');
    expect(reference).toContain('`allOf`');
    expect(reference).toContain('`oneOf`/`anyOf`');
    expect(reference).toContain('parameter/media examples');
    expect(reference).toContain('+json media');
    expect(reference).toContain('defaults/enums');
    expect(reference).toContain('safe target `inputs`');
    expect(reference).toContain('header/query fields to `headers`/`queryParams`');
    expect(reference).toContain('Use `--policy`');
    expect(reference).toContain('`--num-tests`');
    expect(reference).toContain('Bearer/OAuth2/OpenID/header/query/cookie');
    expect(reference).toContain('--auth-header X-API-Key --auth-prefix');
    expect(reference).toContain('--smoke-test true');
    expect(reference).toContain('--smoke-assert');
    expect(reference).toContain('empty connectivity vars');
    expect(reference).toContain('`policy` plus `rbac`');
    expect(reference).toContain('Static code to redteam setup');
    expect(reference).toContain('Route evidence: file path, method, path');
    expect(reference).toContain('POST /api/invoices/:invoice_id/chat');
    expect(reference).toContain('Authorization');
    expect(reference).toContain('id: bola');
    expect(reference).toContain('Use it directly');
    expect(reference).toContain('target has identity or object fields to attack');
  });

  it.each([
    {
      dir: 'redteam-setup-single-input',
      snippets: [
        'prompts:',
        'targets:',
        'redteam:',
        'redteam-generator.mjs',
        'id: policy',
        'frameworks:',
        'strategies:',
        'jailbreak:meta',
      ],
    },
    {
      dir: 'redteam-setup-multi-input',
      snippets: [
        'targets:',
        'inputs:',
        'user_id:',
        'trip_id:',
        'redteam-generator.mjs',
        'id: rbac',
        'jailbreak:meta',
      ],
    },
    {
      dir: 'redteam-setup-live-http',
      snippets: [
        'targets:',
        'inputs:',
        "url: '{{env.REDTEAM_SETUP_LIVE_HTTP_URL}}'",
        'Authorization:',
        'Bearer {{env.REDTEAM_SETUP_LIVE_HTTP_TOKEN}}',
        'redteam-generator.mjs',
        'id: policy',
        'id: rbac',
        'jailbreak:meta',
      ],
    },
    {
      dir: 'redteam-setup-static-code',
      snippets: [
        'file://./target.mjs',
        'defaultUserId: qa-static-config',
        'inputs:',
        'invoice_id:',
        'redteam-generator.mjs',
        'id: policy',
        'id: rbac',
        'jailbreak:meta',
      ],
    },
    {
      dir: 'redteam-setup-static-code-python',
      snippets: [
        'file://./target.py:invoice_redteam_target',
        'workers: 1',
        'timeout: 30000',
        'defaultUserId: qa-py-static-config',
        'inputs:',
        'invoice_id:',
        'redteam-generator.py',
        'id: policy',
        'id: rbac',
        'jailbreak:meta',
      ],
    },
  ])('ships a validatable $dir redteam setup fixture', ({ dir, snippets }) => {
    const config = readText(path.join(fixtureRoot, dir, 'promptfooconfig.yaml'));
    const generatorPath =
      ['redteam-generator.mjs', 'redteam-generator.py']
        .map((fileName) => path.join(fixtureRoot, dir, fileName))
        .find((filePath) => fs.existsSync(filePath)) ?? '';
    const generator = readText(generatorPath);

    expect(config).toContain(
      '# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json',
    );
    expect(config).toContain('description: Redteam setup');
    if (generatorPath.endsWith('.mjs')) {
      expect(generator).toContain('export default class');
      expect(generator).toContain('async callApi');
    } else if (dir === 'redteam-setup-static-code-python') {
      expect(generator).toContain(
        'def generate_redteam_invoice_prompt(prompt: str, options: dict, context: dict)',
      );
    } else {
      expect(generator).toContain('def call_api(prompt: str, options: dict, context: dict)');
    }
    expect(generator).toContain('Prompt');

    for (const snippet of snippets) {
      expect(config).toContain(snippet);
    }
  });

  it('ships a static-code-derived redteam setup fixture with route evidence', () => {
    const config = readText(
      path.join(fixtureRoot, 'redteam-setup-static-code', 'promptfooconfig.yaml'),
    );
    const target = readText(path.join(fixtureRoot, 'redteam-setup-static-code', 'target.mjs'));
    const app = readText(
      path.join(fixtureRoot, 'redteam-setup-static-code', 'app', 'invoiceAgent.mjs'),
    );
    const routes = readText(
      path.join(fixtureRoot, 'redteam-setup-static-code', 'app', 'routes.mjs'),
    );

    expect(config).toContain('description: Redteam setup static-code-derived invoice smoke');
    expect(config).toContain('label: redteam-setup-static-invoice-target');
    expect(config).toContain('defaultUserId: qa-static-config');
    expect(config).toContain('user_id: Signed-in user identifier');
    expect(config).toContain('invoice_id: Invoice object being requested');
    expect(config).toContain('The assistant must not disclose or modify invoices');
    expect(config).not.toContain('id: bola');
    expect(target).toContain("import { invoiceAgent } from './app/invoiceAgent.mjs'");
    expect(target).toContain("import { invoiceChatRoute } from './app/routes.mjs'");
    expect(target).toContain('invoiceChatRoute.safeDefaults.userId');
    expect(target).toContain('route: invoiceChatRoute.path');
    expect(app).toContain('invoiceOwners');
    expect(app).toContain('DENIED invoice');
    expect(routes).toContain("path: '/api/invoices/:invoice_id/chat'");
    expect(routes).toContain("authHeader: 'Authorization'");
    expect(routes).toContain("ownershipCheck: 'invoice.owner_user_id === body.user_id'");
    expect(routes).toContain("plugins: ['policy', 'rbac', 'bola']");
  });

  it('ships a static-code-derived Python redteam setup fixture with route evidence', () => {
    const config = readText(
      path.join(fixtureRoot, 'redteam-setup-static-code-python', 'promptfooconfig.yaml'),
    );
    const target = readText(
      path.join(fixtureRoot, 'redteam-setup-static-code-python', 'target.py'),
    );
    const app = readText(
      path.join(fixtureRoot, 'redteam-setup-static-code-python', 'app', 'invoice_agent.py'),
    );
    const routes = readText(
      path.join(fixtureRoot, 'redteam-setup-static-code-python', 'app', 'routes.py'),
    );

    expect(config).toContain('description: Redteam setup static-code-derived Python invoice smoke');
    expect(config).toContain('label: redteam-setup-static-python-invoice-target');
    expect(config).toContain('file://./target.py:invoice_redteam_target');
    expect(config).toContain('redteam-generator.py:generate_redteam_invoice_prompt');
    expect(config).toContain('workers: 1');
    expect(config).toContain('timeout: 30000');
    expect(config).toContain('defaultUserId: qa-py-static-config');
    expect(config).toContain('user_id: Signed-in user identifier');
    expect(config).toContain('invoice_id: Invoice object being requested');
    expect(config).toContain('The assistant must not disclose or modify invoices');
    expect(config).not.toContain('id: bola');
    expect(target).toContain('sys.path.insert(0, str(Path(__file__).resolve().parent))');
    expect(target).toContain('from app.invoice_agent import invoice_agent');
    expect(target).toContain('from app.routes import INVOICE_CHAT_ROUTE');
    expect(target).toContain(
      'def invoice_redteam_target(prompt: str, options: dict, context: dict) -> dict:',
    );
    expect(target).toContain('INVOICE_CHAT_ROUTE["safe_defaults"]');
    expect(target).toContain('"route": INVOICE_CHAT_ROUTE["path"]');
    expect(app).toContain('INVOICE_OWNERS');
    expect(app).toContain('DENIED invoice');
    expect(routes).toContain('"/api/invoices/{invoice_id}/chat"');
    expect(routes).toContain('"auth_header": "Authorization"');
    expect(routes).toContain('"ownership_check": "invoice.owner_user_id == body.user_id"');
    expect(routes).toContain('"plugins": ["policy", "rbac", "bola"]');
  });

  it('ships a live-HTTP redteam setup fixture with auth and multi-input mapping', () => {
    const config = yaml.load(
      readText(path.join(fixtureRoot, 'redteam-setup-live-http', 'promptfooconfig.yaml')),
    );
    expectRecord(config, 'live HTTP redteam setup config');

    const [target] = config.targets as unknown[];
    expectRecord(target, 'live HTTP redteam target');
    expect(target.id).toBe('https');
    expect(target.label).toBe('redteam-setup-live-http-trip-agent');
    expect(target.inputs).toEqual({
      user_id: 'Signed-in user identifier.',
      trip_id: 'Trip identifier being requested.',
      message: 'User message to the assistant.',
    });
    expectRecord(target.config, 'live HTTP target config');
    expect(target.config.url).toBe('{{env.REDTEAM_SETUP_LIVE_HTTP_URL}}');
    expect(target.config.method).toBe('POST');
    expect(target.config.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer {{env.REDTEAM_SETUP_LIVE_HTTP_TOKEN}}',
      }),
    );
    expect(target.config.body).toEqual({
      user_id: '{{user_id}}',
      trip_id: '{{trip_id}}',
      message: '{{message}}',
    });
    expect(target.config.transformResponse).toBe('json.output');

    expectRecord(config.redteam, 'live HTTP redteam block');
    expect(config.redteam.provider).toBe(
      'file://test/fixtures/agent-skills/redteam-setup-live-http/redteam-generator.mjs',
    );
    expect(config.redteam.plugins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'policy' }),
        { id: 'rbac', numTests: 1 },
      ]),
    );
  });

  it('ships an OpenAPI helper script that drafts a redteam setup config', () => {
    const script = readText(
      path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
    );
    expect(script).toContain('--generator-provider file://redteam-generator.mjs');
    expect(script).not.toContain('--generator-provider file://grader.mjs');

    const runHelper = (operationId: string, extraArgs: string[] = []) =>
      execFileSync(
        'node',
        [
          path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
          '--spec',
          path.join(fixtureRoot, 'provider-setup-openapi', 'openapi.yaml'),
          '--operation-id',
          operationId,
          '--base-url-env',
          'OPENAPI_INVOICE_API_BASE_URL',
          '--token-env',
          'OPENAPI_INVOICE_API_TOKEN',
          '--generator-provider',
          'file://test/fixtures/agent-skills/redteam-setup-live-http/openapi-redteam-generator.mjs',
          ...extraArgs,
        ],
        { cwd: repoRoot, encoding: 'utf8' },
      );

    const output = runHelper('createInvoiceNote', ['--label', 'generated-openapi-redteam-note']);
    const generated = yaml.load(output);
    expect(output).toContain(
      '# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json',
    );
    expectRecord(generated, 'Generated OpenAPI redteam config');

    const [target] = generated.targets as unknown[];
    expectRecord(target, 'Generated OpenAPI redteam target');
    expect(target.id).toBe('https');
    expect(target.label).toBe('generated-openapi-redteam-note');
    expect(target.inputs).toEqual({
      invoice_id: 'Object identifier being requested: invoice_id.',
      tenant_id: 'Caller identity or tenancy field: tenant_id.',
      user_id: 'Caller identity or tenancy field: user_id.',
      message: 'User-controlled message or instruction to the target.',
    });
    expectRecord(target.config, 'Generated OpenAPI redteam target config');
    expect(target.config.url).toBe(
      '{{env.OPENAPI_INVOICE_API_BASE_URL}}/v1/invoices/{{invoice_id | urlencode}}/notes',
    );
    expect(target.config.method).toBe('POST');
    expect(target.config.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        Authorization: 'Bearer {{env.OPENAPI_INVOICE_API_TOKEN}}',
      }),
    );
    expect(target.config.queryParams).toEqual({ tenant_id: '{{tenant_id}}' });
    expect(target.config.body).toEqual({ user_id: '{{user_id}}', message: '{{message}}' });
    expect(target.config.transformResponse).toBe('json.output');

    expect(generated.defaultTest).toEqual({
      vars: {
        invoice_id: 'sample-invoice-id',
        tenant_id: 'sample-tenant-id',
        user_id: 'sample-user-id',
        message: 'Say exactly PONG.',
      },
    });

    expectRecord(generated.redteam, 'Generated OpenAPI redteam block');
    expect(generated.redteam.provider).toBe(
      'file://test/fixtures/agent-skills/redteam-setup-live-http/openapi-redteam-generator.mjs',
    );
    expect(generated.redteam.purpose).toContain('createInvoiceNote');
    expect(generated.redteam.plugins).toEqual([
      expect.objectContaining({ id: 'policy', numTests: 1 }),
      { id: 'rbac', numTests: 1 },
      { id: 'bola', numTests: 1 },
    ]);
    expect(generated.redteam.strategies).toEqual(['jailbreak:meta']);
    const [policyPlugin] = generated.redteam.plugins as unknown[];
    expectRecord(policyPlugin, 'Generated OpenAPI redteam policy plugin');
    expectRecord(policyPlugin.config, 'Generated OpenAPI redteam policy config');
    expect(policyPlugin.config.policy).toContain('invoice_id');

    const searchGenerated = yaml.load(runHelper('searchInvoices'));
    expectRecord(searchGenerated, 'Generated OpenAPI redteam GET config');
    const [searchTarget] = searchGenerated.targets as unknown[];
    expectRecord(searchTarget, 'Generated OpenAPI redteam GET target');
    expectRecord(searchTarget.config, 'Generated OpenAPI redteam GET target config');
    expect(searchTarget.config.method).toBe('GET');
    expect(searchTarget.config.url).toBe('{{env.OPENAPI_INVOICE_API_BASE_URL}}/v1/invoices/search');
    expect(searchTarget.config.body).toBeUndefined();
    expect(searchTarget.config.queryParams).toEqual({
      q: '{{q}}',
      user_id: '{{user_id}}',
    });
    expect(searchTarget.config.headers).toEqual({
      Authorization: 'Bearer {{env.OPENAPI_INVOICE_API_TOKEN}}',
    });
    expect(searchTarget.config.transformResponse).toBe('json.answer');
    expect(searchTarget.inputs).toEqual({
      q: 'User-controlled message or instruction to the target.',
      user_id: 'Caller identity or tenancy field: user_id.',
    });
    expect(searchGenerated.defaultTest).toEqual({
      vars: {
        q: 'Say exactly PONG.',
        user_id: 'sample-user-id',
      },
    });

    const questionGenerated = yaml.load(runHelper('askInvoiceQuestion'));
    expectRecord(questionGenerated, 'Generated OpenAPI redteam question config');
    const [questionTarget] = questionGenerated.targets as unknown[];
    expectRecord(questionTarget, 'Generated OpenAPI redteam question target');
    expectRecord(questionTarget.config, 'Generated OpenAPI redteam question target config');
    expect(questionTarget.config.method).toBe('POST');
    expect(questionTarget.config.url).toBe('{{env.OPENAPI_INVOICE_API_BASE_URL}}/v1/invoices/ask');
    expect(questionTarget.config.body).toEqual({
      tenant_id: '{{tenant_id}}',
      question: '{{question}}',
    });
    expect(questionTarget.config.transformResponse).toBe('json.answer');
    expect(questionTarget.inputs).toEqual({
      tenant_id: 'Caller identity or tenancy field: tenant_id.',
      question: 'User-controlled message or instruction to the target.',
    });
    expect(questionGenerated.defaultTest).toEqual({
      vars: {
        tenant_id: 'sample-tenant-id',
        question: 'Say exactly PONG.',
      },
    });

    const apiKeyGenerated = yaml.load(
      runHelper('searchInvoices', ['--auth-header', 'X-API-Key', '--auth-prefix', 'none']),
    );
    expectRecord(apiKeyGenerated, 'Generated OpenAPI redteam API key config');
    const [apiKeyTarget] = apiKeyGenerated.targets as unknown[];
    expectRecord(apiKeyTarget, 'Generated OpenAPI redteam API key target');
    expectRecord(apiKeyTarget.config, 'Generated OpenAPI redteam API key target config');
    expect(apiKeyTarget.config.headers).toEqual({
      'X-API-Key': '{{env.OPENAPI_INVOICE_API_TOKEN}}',
    });

    const inferredApiKeyGenerated = yaml.load(
      runHelper('apiKeySearchInvoices', ['--token-env', 'OPENAPI_INVOICE_API_KEY']),
    );
    expectRecord(inferredApiKeyGenerated, 'Generated inferred OpenAPI redteam API key config');
    const [inferredApiKeyTarget] = inferredApiKeyGenerated.targets as unknown[];
    expectRecord(inferredApiKeyTarget, 'Generated inferred OpenAPI redteam API key target');
    expectRecord(
      inferredApiKeyTarget.config,
      'Generated inferred OpenAPI redteam API key target config',
    );
    expect(inferredApiKeyTarget.config.url).toBe(
      '{{env.OPENAPI_INVOICE_API_BASE_URL}}/v1/invoices/apikey-search',
    );
    expect(inferredApiKeyTarget.config.headers).toEqual({
      'X-API-Key': '{{env.OPENAPI_INVOICE_API_KEY}}',
    });

    const inferredQueryApiKeyGenerated = yaml.load(
      runHelper('queryApiKeySearchInvoices', ['--token-env', 'OPENAPI_INVOICE_API_KEY']),
    );
    expectRecord(
      inferredQueryApiKeyGenerated,
      'Generated inferred OpenAPI redteam query API key config',
    );
    const [inferredQueryApiKeyTarget] = inferredQueryApiKeyGenerated.targets as unknown[];
    expectRecord(
      inferredQueryApiKeyTarget,
      'Generated inferred OpenAPI redteam query API key target',
    );
    expectRecord(
      inferredQueryApiKeyTarget.config,
      'Generated inferred OpenAPI redteam query API key target config',
    );
    expect(inferredQueryApiKeyTarget.config.headers).toBeUndefined();
    expect(inferredQueryApiKeyTarget.config.queryParams).toEqual({
      q: '{{q}}',
      user_id: '{{user_id}}',
      api_key: '{{env.OPENAPI_INVOICE_API_KEY}}',
    });
    expect(inferredQueryApiKeyTarget.inputs).toEqual({
      q: 'User-controlled message or instruction to the target.',
      user_id: 'Caller identity or tenancy field: user_id.',
    });

    const inferredCookieGenerated = yaml.load(
      runHelper('cookieSearchInvoices', ['--token-env', 'OPENAPI_INVOICE_SESSION']),
    );
    expectRecord(inferredCookieGenerated, 'Generated inferred OpenAPI redteam cookie config');
    const [inferredCookieTarget] = inferredCookieGenerated.targets as unknown[];
    expectRecord(inferredCookieTarget, 'Generated inferred OpenAPI redteam cookie target');
    expectRecord(
      inferredCookieTarget.config,
      'Generated inferred OpenAPI redteam cookie target config',
    );
    expect(inferredCookieTarget.config.headers).toEqual({
      Cookie: 'invoice_session={{env.OPENAPI_INVOICE_SESSION}}',
    });
    expect(inferredCookieTarget.config.queryParams).toEqual({
      q: '{{q}}',
      user_id: '{{user_id}}',
    });
    expect(inferredCookieTarget.inputs).toEqual({
      q: 'User-controlled message or instruction to the target.',
      user_id: 'Caller identity or tenancy field: user_id.',
    });

    const conjunctiveAuthTempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'promptfoo-openapi-conjunctive-auth-'),
    );
    try {
      const conjunctiveAuthSpecPath = path.join(conjunctiveAuthTempDir, 'openapi.yaml');
      fs.writeFileSync(conjunctiveAuthSpecPath, yaml.dump(openApiConjunctiveAuthSpec()));
      const conjunctiveAuthGenerated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
            '--spec',
            conjunctiveAuthSpecPath,
            '--operation-id',
            'conjunctiveSearch',
            '--base-url-env',
            'CONJUNCTIVE_API_BASE_URL',
            '--token-env',
            'CONJUNCTIVE_API_TOKEN',
            '--generator-provider',
            'file://test/fixtures/agent-skills/redteam-setup-live-http/openapi-redteam-generator.mjs',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(conjunctiveAuthGenerated, 'Generated OpenAPI conjunctive auth redteam config');
      const [conjunctiveAuthTarget] = conjunctiveAuthGenerated.targets as unknown[];
      expectRecord(conjunctiveAuthTarget, 'Generated OpenAPI conjunctive auth redteam target');
      expectRecord(
        conjunctiveAuthTarget.config,
        'Generated OpenAPI conjunctive auth redteam target config',
      );
      expect(conjunctiveAuthTarget.config.headers).toEqual({
        Authorization: 'Bearer {{env.CONJUNCTIVE_API_TOKEN}}',
        Cookie:
          'session_id={{env.CONJUNCTIVE_API_TOKEN}}; csrf_token={{env.CONJUNCTIVE_API_TOKEN}}',
        'X-API-Key': '{{env.CONJUNCTIVE_API_TOKEN}}',
      });
      expect(conjunctiveAuthTarget.config.queryParams).toEqual({
        q: '{{q}}',
      });
      expect(conjunctiveAuthTarget.inputs).toEqual({
        q: 'User-controlled message or instruction to the target.',
      });

      const fallbackConjunctiveAuthGenerated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
            '--spec',
            conjunctiveAuthSpecPath,
            '--operation-id',
            'fallbackConjunctiveSearch',
            '--base-url-env',
            'CONJUNCTIVE_API_BASE_URL',
            '--token-env',
            'CONJUNCTIVE_API_TOKEN',
            '--generator-provider',
            'file://test/fixtures/agent-skills/redteam-setup-live-http/openapi-redteam-generator.mjs',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(
        fallbackConjunctiveAuthGenerated,
        'Generated OpenAPI fallback conjunctive auth redteam config',
      );
      const [fallbackConjunctiveAuthTarget] = fallbackConjunctiveAuthGenerated.targets as unknown[];
      expectRecord(
        fallbackConjunctiveAuthTarget,
        'Generated OpenAPI fallback conjunctive auth redteam target',
      );
      expectRecord(
        fallbackConjunctiveAuthTarget.config,
        'Generated OpenAPI fallback conjunctive auth redteam target config',
      );
      expect(fallbackConjunctiveAuthTarget.config.headers).toEqual({
        Authorization: 'Bearer {{env.CONJUNCTIVE_API_TOKEN}}',
        'X-API-Key': '{{env.CONJUNCTIVE_API_TOKEN}}',
      });

      const partialConjunctiveAuthGenerated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
            '--spec',
            conjunctiveAuthSpecPath,
            '--operation-id',
            'partialConjunctiveSearch',
            '--base-url-env',
            'CONJUNCTIVE_API_BASE_URL',
            '--token-env',
            'CONJUNCTIVE_API_TOKEN',
            '--generator-provider',
            'file://test/fixtures/agent-skills/redteam-setup-live-http/openapi-redteam-generator.mjs',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(
        partialConjunctiveAuthGenerated,
        'Generated OpenAPI partial conjunctive auth redteam config',
      );
      const [partialConjunctiveAuthTarget] = partialConjunctiveAuthGenerated.targets as unknown[];
      expectRecord(
        partialConjunctiveAuthTarget,
        'Generated OpenAPI partial conjunctive auth redteam target',
      );
      expectRecord(
        partialConjunctiveAuthTarget.config,
        'Generated OpenAPI partial conjunctive auth redteam target config',
      );
      expect(partialConjunctiveAuthTarget.config.headers).toEqual({
        Authorization: 'Bearer {{env.CONJUNCTIVE_API_TOKEN}}',
      });
      expect(partialConjunctiveAuthTarget.inputs).toEqual({
        q: 'User-controlled message or instruction to the target.',
      });

      for (const operationId of [
        'explicitNoAuthSearch',
        'emptyRequirementSearch',
        'unsupportedAuthSearch',
      ]) {
        const noAuthGenerated = yaml.load(
          execFileSync(
            'node',
            [
              path.join(
                redteamSetupSkillRoot,
                'scripts',
                'openapi-operation-to-redteam-config.mjs',
              ),
              '--spec',
              conjunctiveAuthSpecPath,
              '--operation-id',
              operationId,
              '--base-url-env',
              'CONJUNCTIVE_API_BASE_URL',
              '--token-env',
              'CONJUNCTIVE_API_TOKEN',
              '--generator-provider',
              'file://test/fixtures/agent-skills/redteam-setup-live-http/openapi-redteam-generator.mjs',
            ],
            { cwd: repoRoot, encoding: 'utf8' },
          ),
        );
        expectRecord(noAuthGenerated, `Generated OpenAPI ${operationId} redteam config`);
        const [noAuthTarget] = noAuthGenerated.targets as unknown[];
        expectRecord(noAuthTarget, `Generated OpenAPI ${operationId} redteam target`);
        expectRecord(noAuthTarget.config, `Generated OpenAPI ${operationId} redteam target config`);
        expect(noAuthTarget.config.headers).toBeUndefined();
        expect(noAuthTarget.config.queryParams).toEqual({
          q: '{{q}}',
        });
        expect(noAuthTarget.inputs).toEqual({
          q: 'User-controlled message or instruction to the target.',
        });
      }
    } finally {
      fs.rmSync(conjunctiveAuthTempDir, { recursive: true, force: true });
    }

    const oauthTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-oauth-'));
    try {
      const oauthSpecPath = path.join(oauthTempDir, 'openapi.yaml');
      fs.writeFileSync(oauthSpecPath, yaml.dump(openApiOAuthSecuritySpec()));
      const runOAuthRedteamHelper = (operationId: string, tokenEnv: string) =>
        yaml.load(
          execFileSync(
            'node',
            [
              path.join(
                redteamSetupSkillRoot,
                'scripts',
                'openapi-operation-to-redteam-config.mjs',
              ),
              '--spec',
              oauthSpecPath,
              '--operation-id',
              operationId,
              '--base-url-env',
              'OAUTH_API_BASE_URL',
              '--token-env',
              tokenEnv,
              '--generator-provider',
              'file://test/fixtures/agent-skills/redteam-setup-live-http/openapi-redteam-generator.mjs',
            ],
            { cwd: repoRoot, encoding: 'utf8' },
          ),
        );

      const oauthGenerated = runOAuthRedteamHelper('oauthSearch', 'OAUTH_ACCESS_TOKEN');
      expectRecord(oauthGenerated, 'Generated OpenAPI OAuth2 redteam config');
      const [oauthTarget] = oauthGenerated.targets as unknown[];
      expectRecord(oauthTarget, 'Generated OpenAPI OAuth2 redteam target');
      expectRecord(oauthTarget.config, 'Generated OpenAPI OAuth2 redteam target config block');
      expect(oauthTarget.config.headers).toEqual({
        Authorization: 'Bearer {{env.OAUTH_ACCESS_TOKEN}}',
      });
      expect(oauthTarget.config.queryParams).toEqual({
        q: '{{q}}',
        user_id: '{{user_id}}',
      });
      expect(oauthTarget.inputs).toEqual({
        q: 'User-controlled message or instruction to the target.',
        user_id: 'Caller identity or tenancy field: user_id.',
      });

      const openIdGenerated = runOAuthRedteamHelper('openIdSearch', 'OPENID_ACCESS_TOKEN');
      expectRecord(openIdGenerated, 'Generated OpenAPI OpenID redteam config');
      const [openIdTarget] = openIdGenerated.targets as unknown[];
      expectRecord(openIdTarget, 'Generated OpenAPI OpenID redteam target');
      expectRecord(openIdTarget.config, 'Generated OpenAPI OpenID redteam target config block');
      expect(openIdTarget.config.headers).toEqual({
        Authorization: 'Bearer {{env.OPENID_ACCESS_TOKEN}}',
      });
      expect(openIdTarget.config.queryParams).toEqual({
        q: '{{q}}',
      });
      expect(openIdTarget.inputs).toEqual({
        q: 'User-controlled message or instruction to the target.',
      });
    } finally {
      fs.rmSync(oauthTempDir, { recursive: true, force: true });
    }

    const headerGenerated = yaml.load(runHelper('headerSearchInvoices'));
    expectRecord(headerGenerated, 'Generated OpenAPI redteam header parameter config');
    const [headerTarget] = headerGenerated.targets as unknown[];
    expectRecord(headerTarget, 'Generated OpenAPI redteam header parameter target');
    expectRecord(headerTarget.config, 'Generated OpenAPI redteam header parameter target config');
    expect(headerTarget.config.headers).toEqual({
      'X-Tenant-Id': '{{x_tenant_id}}',
      Authorization: 'Bearer {{env.OPENAPI_INVOICE_API_TOKEN}}',
    });
    expect(headerTarget.config.queryParams).toEqual({
      q: '{{q}}',
      user_id: '{{user_id}}',
      'api-version': '{{api_version}}',
    });
    expect(headerTarget.inputs).toEqual({
      q: 'User-controlled message or instruction to the target.',
      user_id: 'Caller identity or tenancy field: user_id.',
      api_version: 'Target input field: api_version.',
      x_tenant_id: 'Caller identity or tenancy field: x_tenant_id.',
    });
    expect(headerGenerated.defaultTest).toEqual({
      vars: {
        q: 'Say exactly PONG.',
        user_id: 'sample-user-id',
        api_version: '2026-04-01',
        x_tenant_id: 'tenant-alpha',
      },
    });
    expect(headerGenerated.tests).toBeUndefined();

    const cookieParamGenerated = yaml.load(runHelper('cookieParamSearchInvoices'));
    expectRecord(cookieParamGenerated, 'Generated OpenAPI redteam cookie parameter config');
    const [cookieParamTarget] = cookieParamGenerated.targets as unknown[];
    expectRecord(cookieParamTarget, 'Generated OpenAPI redteam cookie parameter target');
    expectRecord(
      cookieParamTarget.config,
      'Generated OpenAPI redteam cookie parameter target config',
    );
    expect(cookieParamTarget.config.headers).toEqual({
      Cookie: 'invoice-context={{invoice_context}}',
      Authorization: 'Bearer {{env.OPENAPI_INVOICE_API_TOKEN}}',
    });
    expect(cookieParamTarget.config.queryParams).toEqual({
      q: '{{q}}',
      user_id: '{{user_id}}',
    });
    expect(cookieParamTarget.inputs).toEqual({
      q: 'User-controlled message or instruction to the target.',
      user_id: 'Caller identity or tenancy field: user_id.',
      invoice_context: 'Target input field: invoice_context.',
    });
    expect(cookieParamGenerated.defaultTest).toEqual({
      vars: {
        q: 'Say exactly PONG.',
        user_id: 'sample-user-id',
        invoice_context: 'context-alpha',
      },
    });

    const headerSmokeGenerated = yaml.load(
      runHelper('headerSearchInvoices', ['--smoke-test', 'true', '--smoke-assert', 'PONG']),
    );
    expectRecord(headerSmokeGenerated, 'Generated OpenAPI redteam smoke config');
    expect(headerSmokeGenerated.tests).toEqual([
      {
        description: 'headerSearchInvoices smoke test',
        vars: {
          q: 'Say exactly PONG.',
          user_id: 'sample-user-id',
          api_version: '2026-04-01',
          x_tenant_id: 'tenant-alpha',
        },
        assert: [{ type: 'contains', value: 'PONG' }],
      },
    ]);

    const tunedGenerated = yaml.load(
      runHelper('createInvoiceNote', [
        '--policy',
        'Custom invoice policy: only authorized users may create invoice notes.',
        '--num-tests',
        '3',
      ]),
    );
    expectRecord(tunedGenerated, 'Generated OpenAPI tuned redteam config');
    expectRecord(tunedGenerated.redteam, 'Generated OpenAPI tuned redteam block');
    expect(tunedGenerated.redteam.purpose).toBe(
      'Custom invoice policy: only authorized users may create invoice notes.',
    );
    expect(tunedGenerated.redteam.numTests).toBe(3);
    expect(tunedGenerated.redteam.plugins).toEqual([
      expect.objectContaining({
        id: 'policy',
        numTests: 3,
        config: {
          policy: 'Custom invoice policy: only authorized users may create invoice notes.',
        },
      }),
      { id: 'rbac', numTests: 3 },
      { id: 'bola', numTests: 3 },
    ]);
  });

  it('fails clearly for invalid redteam OpenAPI helper num-tests values', () => {
    expect(() =>
      execFileSync(
        'node',
        [
          path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
          '--spec',
          path.join(fixtureRoot, 'provider-setup-openapi', 'openapi.yaml'),
          '--operation-id',
          'createInvoiceNote',
          '--base-url-env',
          'OPENAPI_INVOICE_API_BASE_URL',
          '--num-tests',
          '0',
        ],
        { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' },
      ),
    ).toThrow('--num-tests must be a positive integer');
  });

  it('keeps redteam OpenAPI helper plugin inference conservative without identity fields', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-redteam-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(
        specPath,
        yaml.dump({
          openapi: '3.1.0',
          paths: {
            '/moderate': {
              post: {
                operationId: 'moderateText',
                requestBody: {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        required: ['text'],
                        properties: {
                          text: { type: 'string' },
                        },
                      },
                    },
                  },
                },
                responses: {
                  '200': {
                    description: 'Moderation response',
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          properties: {
                            output: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      );
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'moderateText',
            '--base-url-env',
            'MODERATION_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated no-identity redteam config');
      const [target] = generated.targets as unknown[];
      expectRecord(target, 'Generated no-identity redteam target');
      expect(target.inputs).toEqual({
        text: 'User-controlled message or instruction to the target.',
      });
      expectRecord(target.config, 'Generated no-identity target config');
      expect(target.config.body).toEqual({ text: '{{text}}' });
      expect(generated.defaultTest).toEqual({ vars: { text: 'Say exactly PONG.' } });
      expectRecord(generated.redteam, 'Generated no-identity redteam block');
      expect(generated.redteam.plugins).toEqual([
        expect.objectContaining({
          id: 'policy',
          numTests: 1,
        }),
      ]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('prefers OpenAPI parameter and media examples for redteam default vars', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-redteam-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiExamplePrecedenceSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'createExampleNote',
            '--base-url-env',
            'EXAMPLE_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated example precedence redteam config');
      const [target] = generated.targets as unknown[];
      expectRecord(target, 'Generated example precedence redteam target');
      expectRecord(target.config, 'Generated example precedence redteam target config');
      expect(target.config.url).toBe(
        '{{env.EXAMPLE_API_BASE_URL}}/example/{{invoice_id | urlencode}}',
      );
      expect(target.config.queryParams).toEqual({
        'tenant-id': '{{tenant_id}}',
      });
      expect(target.config.body).toEqual({
        user_id: '{{user_id}}',
        message: '{{message}}',
        note_type: '{{note_type}}',
      });
      expect(target.inputs).toEqual({
        invoice_id: 'Object identifier being requested: invoice_id.',
        tenant_id: 'Caller identity or tenancy field: tenant_id.',
        user_id: 'Caller identity or tenancy field: user_id.',
        message: 'User-controlled message or instruction to the target.',
        note_type: 'Target input field: note_type.',
      });
      expect(generated.defaultTest).toEqual({
        vars: {
          invoice_id: 'invoice-from-parameter-example',
          tenant_id: 'tenant-from-example-ref',
          user_id: 'user-from-media-example',
          message: 'Say exactly PONG.',
          note_type: 'note-type-from-media-example',
        },
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('uses vendor +json OpenAPI media types for redteam request and response schemas', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-redteam-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiVendorJsonSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'createVendorJsonNote',
            '--base-url-env',
            'VENDOR_JSON_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated vendor JSON redteam config');
      const [target] = generated.targets as unknown[];
      expectRecord(target, 'Generated vendor JSON redteam target');
      expectRecord(target.config, 'Generated vendor JSON redteam target config');
      expect(target.config.headers).toEqual({
        'Content-Type': 'application/vnd.promptfoo.note+json',
      });
      expect(target.config.body).toEqual({
        user_id: '{{user_id}}',
        message: '{{message}}',
      });
      expect(target.config.transformResponse).toBe('json.answer');
      expect(generated.defaultTest).toEqual({
        vars: {
          user_id: 'vendor-json-user',
          message: 'Say exactly PONG.',
        },
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('uses OpenAPI form-urlencoded request bodies for redteam configs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-redteam-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiFormUrlEncodedSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'formChat',
            '--base-url-env',
            'FORM_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated form redteam config');
      const [target] = generated.targets as unknown[];
      expectRecord(target, 'Generated form redteam target');
      expectRecord(target.config, 'Generated form redteam target config');
      expect(target.config.headers).toEqual({
        'Content-Type': 'application/x-www-form-urlencoded',
      });
      expect(target.config.body).toBe(
        'user_id={{user_id | urlencode}}&message={{message | urlencode}}&scope={{scope | urlencode}}',
      );
      expect(target.config.transformResponse).toBe('json.answer');
      expect(target.inputs).toEqual({
        user_id: 'Caller identity or tenancy field: user_id.',
        message: 'User-controlled message or instruction to the target.',
        scope: 'Target input field: scope.',
      });
      expect(generated.defaultTest).toEqual({
        vars: {
          user_id: 'form-user',
          message: 'Say exactly PONG.',
          scope: 'billing support',
        },
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('uses OpenAPI multipart request bodies for redteam configs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-redteam-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiMultipartSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'analyzeFile',
            '--base-url-env',
            'MULTIPART_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated multipart redteam config');
      const [target] = generated.targets as unknown[];
      expectRecord(target, 'Generated multipart redteam target');
      expectRecord(target.config, 'Generated multipart redteam target config');
      expect(target.config.headers).toBeUndefined();
      expect(target.config.body).toBeUndefined();
      expect(target.config.multipart).toEqual({
        parts: [
          {
            kind: 'file',
            name: 'document',
            filename: 'promptfoo-document.pdf',
            source: {
              type: 'generated',
              generator: 'basic-document',
              format: 'pdf',
              text: 'Promptfoo generated document for {{document}}.',
            },
          },
          { kind: 'field', name: 'question', value: '{{question}}' },
          { kind: 'field', name: 'user_id', value: '{{user_id}}' },
        ],
      });
      expect(target.config.transformResponse).toBe('json.output');
      expect(target.inputs).toEqual({
        document: 'Target input field: document.',
        question: 'User-controlled message or instruction to the target.',
        user_id: 'Caller identity or tenancy field: user_id.',
      });
      expect(generated.defaultTest).toEqual({
        vars: {
          document: 'sample-document',
          question: 'Say exactly PONG.',
          user_id: 'multipart-user',
        },
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('uses OpenAPI text request bodies for redteam configs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-redteam-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiTextPlainSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'textChat',
            '--base-url-env',
            'TEXT_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated text redteam config');
      const [target] = generated.targets as unknown[];
      expectRecord(target, 'Generated text redteam target');
      expectRecord(target.config, 'Generated text redteam target config');
      expect(target.config.headers).toEqual({
        'Content-Type': 'text/plain',
      });
      expect(target.config.body).toBe('{{message}}');
      expect(target.config.transformResponse).toBe('json.output');
      expect(target.inputs).toEqual({
        message: 'User-controlled message or instruction to the target.',
      });
      expect(generated.defaultTest).toEqual({
        vars: {
          message: 'Say exactly PONG.',
        },
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('preserves scalar OpenAPI request examples without schemas for redteam configs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-redteam-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiScalarExampleRequestSpec()));
      for (const [operationId, contentType] of [
        ['jsonScalarChat', 'application/json'],
        ['jsonScalarSchemaChat', 'application/json'],
        ['textScalarChat', 'text/plain'],
      ]) {
        const generated = yaml.load(
          execFileSync(
            'node',
            [
              path.join(
                redteamSetupSkillRoot,
                'scripts',
                'openapi-operation-to-redteam-config.mjs',
              ),
              '--spec',
              specPath,
              '--operation-id',
              operationId,
              '--base-url-env',
              'SCALAR_API_BASE_URL',
            ],
            { cwd: repoRoot, encoding: 'utf8' },
          ),
        );
        expectRecord(generated, `Generated ${operationId} redteam config`);
        const [target] = generated.targets as unknown[];
        expectRecord(target, `Generated ${operationId} redteam target`);
        expectRecord(target.config, `Generated ${operationId} redteam target config`);
        expect(target.config.headers).toEqual({
          'Content-Type': contentType,
        });
        expect(target.config.body).toBe('{{message}}');
        expect(target.config.transformResponse).toBe('json.output');
        expect(target.inputs).toEqual({
          message: 'User-controlled message or instruction to the target.',
        });
        expect(generated.defaultTest).toEqual({
          vars: {
            message: 'Say exactly PONG.',
          },
        });
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('uses OpenAPI root array request bodies for redteam configs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-redteam-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiArrayRequestSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'batchChat',
            '--base-url-env',
            'BATCH_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated array redteam config');
      const [target] = generated.targets as unknown[];
      expectRecord(target, 'Generated array redteam target');
      expectRecord(target.config, 'Generated array redteam target config');
      expect(target.config.headers).toEqual({
        'Content-Type': 'application/json',
      });
      expect(target.config.body).toEqual([
        {
          user_id: '{{user_id}}',
          message: '{{message}}',
          priority: '{{priority}}',
        },
      ]);
      expect(target.config.transformResponse).toBe('json.output');
      expect(target.inputs).toEqual({
        user_id: 'Caller identity or tenancy field: user_id.',
        message: 'User-controlled message or instruction to the target.',
        priority: 'Target input field: priority.',
      });
      expect(generated.defaultTest).toEqual({
        vars: {
          user_id: 'array-user',
          message: 'Say exactly PONG.',
          priority: 'normal',
        },
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('preserves OpenAPI example-only array request bodies for redteam configs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-redteam-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiExampleOnlyArrayBodySpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'exampleArrayChat',
            '--base-url-env',
            'EXAMPLE_ARRAY_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated example-only array redteam config');
      const [target] = generated.targets as unknown[];
      expectRecord(target, 'Generated example-only array redteam target');
      expectRecord(target.config, 'Generated example-only array redteam target config');
      expect(target.config.body).toEqual([
        {
          user_id: '{{user_id}}',
          message: '{{message}}',
          priority: '{{priority}}',
        },
      ]);
      expect(target.inputs).toEqual({
        user_id: 'Caller identity or tenancy field: user_id.',
        message: 'User-controlled message or instruction to the target.',
        priority: 'Target input field: priority.',
      });
      expect(generated.defaultTest).toEqual({
        vars: {
          user_id: 'example-array-user',
          message: 'Say exactly PONG.',
          priority: 'expedite',
        },
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('extracts first-item fields from OpenAPI array responses for redteam configs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-redteam-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiArrayResponseSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'arrayResponseChat',
            '--base-url-env',
            'ARRAY_RESPONSE_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated array-response redteam config');
      const [target] = generated.targets as unknown[];
      expectRecord(target, 'Generated array-response redteam target');
      expectRecord(target.config, 'Generated array-response redteam target config');
      expect(target.config.body).toEqual({
        message: '{{message}}',
        user_id: '{{user_id}}',
      });
      expect(target.config.transformResponse).toBe('json[0].output');
      expect(target.inputs).toEqual({
        message: 'User-controlled message or instruction to the target.',
        user_id: 'Caller identity or tenancy field: user_id.',
      });
      expect(generated.defaultTest).toEqual({
        vars: {
          message: 'Say exactly PONG.',
          user_id: 'array-response-user',
        },
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('extracts first-item fields from OpenAPI example-only array responses for redteam configs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-redteam-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiExampleOnlyArrayResponseSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'exampleArrayResponseChat',
            '--base-url-env',
            'EXAMPLE_ARRAY_RESPONSE_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated example-only array-response redteam config');
      const [target] = generated.targets as unknown[];
      expectRecord(target, 'Generated example-only array-response redteam target');
      expectRecord(target.config, 'Generated example-only array-response redteam target config');
      expect(target.config.transformResponse).toBe('json[0].output');
      expect(target.inputs).toEqual({
        message: 'User-controlled message or instruction to the target.',
        user_id: 'Caller identity or tenancy field: user_id.',
      });
      expect(generated.defaultTest).toEqual({
        vars: {
          message: 'Say exactly PONG.',
          user_id: 'example-array-response-user',
        },
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('quotes unsafe OpenAPI response field accessors for redteam configs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-redteam-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiUnsafeResponseFieldSpec()));
      const runHelper = (operationId: string) =>
        yaml.load(
          execFileSync(
            'node',
            [
              path.join(
                redteamSetupSkillRoot,
                'scripts',
                'openapi-operation-to-redteam-config.mjs',
              ),
              '--spec',
              specPath,
              '--operation-id',
              operationId,
              '--base-url-env',
              'UNSAFE_RESPONSE_API_BASE_URL',
            ],
            { cwd: repoRoot, encoding: 'utf8' },
          ),
        );

      const objectGenerated = runHelper('unsafeResponseField');
      expectRecord(objectGenerated, 'Generated unsafe response field redteam config');
      const [objectTarget] = objectGenerated.targets as unknown[];
      expectRecord(objectTarget, 'Generated unsafe response field redteam target');
      expectRecord(objectTarget.config, 'Generated unsafe response field redteam config block');
      expect(objectTarget.config.transformResponse).toBe('json["api-version"]');

      const arrayGenerated = runHelper('unsafeArrayResponseField');
      expectRecord(arrayGenerated, 'Generated unsafe array response field redteam config');
      const [arrayTarget] = arrayGenerated.targets as unknown[];
      expectRecord(arrayTarget, 'Generated unsafe array response field redteam target');
      expectRecord(
        arrayTarget.config,
        'Generated unsafe array response field redteam config block',
      );
      expect(arrayTarget.config.transformResponse).toBe('json[0]["200"]');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('merges OpenAPI allOf request and response schemas for redteam configs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-redteam-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiAllOfSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'createAllOfNote',
            '--base-url-env',
            'ALLOF_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated allOf redteam config');
      const [target] = generated.targets as unknown[];
      expectRecord(target, 'Generated allOf redteam target');
      expectRecord(target.config, 'Generated allOf redteam target config');
      expect(target.config.body).toEqual({
        user_id: '{{user_id}}',
        message: '{{message}}',
        note_type: '{{note_type}}',
      });
      expect(target.config.transformResponse).toBe('json.answer');
      expect(target.inputs).toEqual({
        user_id: 'Caller identity or tenancy field: user_id.',
        message: 'User-controlled message or instruction to the target.',
        note_type: 'Target input field: note_type.',
      });
      expect(generated.defaultTest).toEqual({
        vars: {
          user_id: 'allof-user',
          message: 'Say exactly PONG.',
          note_type: 'internal-note',
        },
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('allows repeated non-cyclic OpenAPI refs for redteam configs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-redteam-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiRepeatedRefSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'createRepeatedRefNote',
            '--base-url-env',
            'REPEATED_REF_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated repeated-ref redteam config');
      const [target] = generated.targets as unknown[];
      expectRecord(target, 'Generated repeated-ref redteam target');
      expectRecord(target.config, 'Generated repeated-ref redteam target config');
      expect(target.config.body).toEqual({
        user_id: '{{user_id}}',
        message: '{{message}}',
      });
      expect(target.config.transformResponse).toBe('json.answer');
      expect(target.inputs).toEqual({
        user_id: 'Caller identity or tenancy field: user_id.',
        message: 'User-controlled message or instruction to the target.',
      });
      expect(generated.defaultTest).toEqual({
        vars: {
          user_id: 'repeat-user',
          message: 'Say exactly PONG.',
        },
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('normalizes camelCase OpenAPI identifiers for redteam RBAC inference', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-redteam-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiCamelCaseIdSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'chatWithCamelCaseInvoice',
            '--base-url-env',
            'CAMEL_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated camelCase redteam config');
      const [target] = generated.targets as unknown[];
      expectRecord(target, 'Generated camelCase redteam target');
      expectRecord(target.config, 'Generated camelCase redteam target config');
      expect(target.config.url).toBe(
        '{{env.CAMEL_API_BASE_URL}}/users/{{user_id | urlencode}}/invoices/{{invoice_id | urlencode}}/chat',
      );
      expect(target.config.queryParams).toEqual({
        apiVersion: '{{api_version}}',
      });
      expect(target.config.body).toEqual({
        accountId: '{{account_id}}',
        message: '{{message}}',
      });
      expect(target.inputs).toEqual({
        user_id: 'Caller identity or tenancy field: user_id.',
        invoice_id: 'Object identifier being requested: invoice_id.',
        api_version: 'Target input field: api_version.',
        account_id: 'Caller identity or tenancy field: account_id.',
        message: 'User-controlled message or instruction to the target.',
      });
      expect(generated.defaultTest).toEqual({
        vars: {
          user_id: 'camel-user',
          invoice_id: 'camel-invoice',
          api_version: '2026-04-17',
          account_id: 'camel-account',
          message: 'Say exactly PONG.',
        },
      });
      expectRecord(generated.redteam, 'Generated camelCase redteam block');
      expect(generated.redteam.plugins).toEqual([
        expect.objectContaining({ id: 'policy', numTests: 1 }),
        { id: 'rbac', numTests: 1 },
        { id: 'bola', numTests: 1 },
      ]);
      const [policyPlugin] = generated.redteam.plugins as unknown[];
      expectRecord(policyPlugin, 'Generated camelCase policy plugin');
      expectRecord(policyPlugin.config, 'Generated camelCase policy config');
      expect(policyPlugin.config.policy).toContain('user_id');
      expect(policyPlugin.config.policy).toContain('invoice_id');
      expect(policyPlugin.config.policy).toContain('account_id');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('uses the first OpenAPI oneOf/anyOf variant for redteam config drafts', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-redteam-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiVariantSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'variantSearch',
            '--base-url-env',
            'VARIANT_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated variant redteam config');
      const [target] = generated.targets as unknown[];
      expectRecord(target, 'Generated variant redteam target');
      expectRecord(target.config, 'Generated variant redteam target config');
      expect(target.config.body).toEqual({
        user_id: '{{user_id}}',
        query: '{{query}}',
      });
      expect(target.config.transformResponse).toBe('json.answer');
      expect(target.inputs).toEqual({
        user_id: 'Caller identity or tenancy field: user_id.',
        query: 'User-controlled message or instruction to the target.',
      });
      expect(generated.defaultTest).toEqual({
        vars: {
          user_id: 'variant-user',
          query: 'Say exactly PONG.',
        },
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('uses OpenAPI request body examples when redteam schemas are omitted', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-redteam-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiExampleOnlyBodySpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'createExampleOnlyNote',
            '--base-url-env',
            'EXAMPLE_ONLY_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated example-only redteam config');
      const [target] = generated.targets as unknown[];
      expectRecord(target, 'Generated example-only redteam target');
      expectRecord(target.config, 'Generated example-only redteam target config');
      expect(target.config.headers).toEqual({
        'Content-Type': 'application/json',
      });
      expect(target.config.body).toEqual({
        user_id: '{{user_id}}',
        message: '{{message}}',
        note_type: '{{note_type}}',
      });
      expect(target.config.transformResponse).toBe('json.answer');
      expect(target.inputs).toEqual({
        user_id: 'Caller identity or tenancy field: user_id.',
        message: 'User-controlled message or instruction to the target.',
        note_type: 'Target input field: note_type.',
      });
      expect(generated.defaultTest).toEqual({
        vars: {
          user_id: 'example-user',
          message: 'Say exactly PONG.',
          note_type: 'support-note',
        },
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('uses OpenAPI schema types for redteam default vars', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-redteam-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiTypedSchemaSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'createTypedNote',
            '--base-url-env',
            'TYPED_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated typed redteam config');
      const [target] = generated.targets as unknown[];
      expectRecord(target, 'Generated typed redteam target');
      expectRecord(target.config, 'Generated typed redteam target config');
      expect(target.config.body).toEqual({
        user_id: '{{user_id}}',
        message: '{{message}}',
        limit: '{{limit}}',
        include_archived: '{{include_archived}}',
        tags: '{{tags}}',
        metadata: '{{metadata}}',
        status: '{{status}}',
        contact_email: '{{contact_email}}',
        callback_url: '{{callback_url}}',
        request_id: '{{request_id}}',
        scheduled_date: '{{scheduled_date}}',
        created_at: '{{created_at}}',
        confidence: '{{confidence}}',
      });
      expect(generated.defaultTest).toEqual({
        vars: {
          user_id: 'typed-user',
          message: 'Say exactly PONG.',
          limit: 1,
          include_archived: true,
          tags: ['finance'],
          metadata: {
            region: 'us-west',
            priority: 1,
          },
          status: 'queued',
          contact_email: 'user@example.com',
          callback_url: 'https://example.test/resource',
          request_id: '00000000-0000-4000-8000-000000000000',
          scheduled_date: '2026-04-17',
          created_at: '2026-04-17T00:00:00Z',
          confidence: 1,
        },
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('lets OpenAPI operation parameters override path-item parameters for redteam configs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-redteam-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiParameterOverrideSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'overrideParameters',
            '--base-url-env',
            'OVERRIDE_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated override redteam config');
      const [target] = generated.targets as unknown[];
      expectRecord(target, 'Generated override redteam target');
      expectRecord(target.config, 'Generated override redteam target config');
      expect(target.config.url).toBe(
        '{{env.OVERRIDE_API_BASE_URL}}/override/{{resource_id | urlencode}}',
      );
      expect(target.config.queryParams).toEqual({
        'api-version': '{{api_version}}',
      });
      expect(target.config.headers).toEqual({
        'Content-Type': 'application/json',
        'X-Trace-Id': '{{x_trace_id}}',
      });
      expect(target.inputs).toEqual({
        resource_id: 'Object identifier being requested: resource_id.',
        api_version: 'Target input field: api_version.',
        message: 'User-controlled message or instruction to the target.',
        x_trace_id: 'Target input field: x_trace_id.',
      });
      expect(generated.defaultTest).toEqual({
        vars: {
          resource_id: 'resource-123',
          api_version: 'operation-version',
          message: 'Say exactly PONG.',
          x_trace_id: 'operation-trace',
        },
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('skips OpenAPI writeOnly response fields for redteam response transforms', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-redteam-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiWriteOnlyResponseSpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'writeOnlyResponse',
            '--base-url-env',
            'WRITE_ONLY_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated writeOnly response redteam config');
      const [target] = generated.targets as unknown[];
      expectRecord(target, 'Generated writeOnly response redteam target');
      expectRecord(target.config, 'Generated writeOnly response redteam target config');
      expect(target.config.transformResponse).toBe('json.public_text');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('honors composed OpenAPI visibility flags for redteam configs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-redteam-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(specPath, yaml.dump(openApiComposedVisibilitySpec()));
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'composedVisibility',
            '--base-url-env',
            'COMPOSED_VISIBILITY_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated composed visibility redteam config');
      const [target] = generated.targets as unknown[];
      expectRecord(target, 'Generated composed visibility redteam target');
      expectRecord(target.config, 'Generated composed visibility redteam target config');
      expect(target.config.body).toEqual({
        message: '{{message}}',
        client_note: '{{client_note}}',
      });
      expect(target.config.transformResponse).toBe('json.public_text');
      expect(target.inputs).toEqual({
        message: 'User-controlled message or instruction to the target.',
        client_note: 'Target input field: client_note.',
      });
      expect(generated.defaultTest).toEqual({
        vars: {
          message: 'Say exactly PONG.',
          client_note: 'sample-client_note',
        },
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fails clearly for unsupported external OpenAPI refs in the redteam helper', () => {
    expectOpenApiHelperFailure(
      path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
      {
        openapi: '3.1.0',
        paths: {
          '/broken': {
            get: {
              operationId: 'brokenOperation',
              responses: {
                '200': {
                  description: 'Broken response',
                  content: {
                    'application/json': {
                      schema: { $ref: 'https://example.test/schemas/Response.yaml' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      'Only local OpenAPI refs are supported',
    );
  });

  it('fails clearly for circular OpenAPI refs in the redteam helper', () => {
    expectOpenApiHelperFailure(
      path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
      {
        openapi: '3.1.0',
        paths: {
          '/broken': {
            post: {
              operationId: 'brokenOperation',
              requestBody: {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/A' },
                  },
                },
              },
              responses: {
                '200': {
                  description: 'Broken response',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: { output: { type: 'string' } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            A: { $ref: '#/components/schemas/B' },
            B: { $ref: '#/components/schemas/A' },
          },
        },
      },
      'Circular OpenAPI ref detected',
    );
  });

  it('does not misclassify non-_id user-like fields as identity fields for RBAC', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-non-id-identity-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(
        specPath,
        yaml.dump({
          openapi: '3.1.0',
          paths: {
            '/profile/update': {
              post: {
                operationId: 'updateProfile',
                requestBody: {
                  required: true,
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        required: ['user_name', 'message'],
                        properties: {
                          user_name: { type: 'string' },
                          user_agent: { type: 'string' },
                          org_name: { type: 'string' },
                          message: { type: 'string' },
                        },
                      },
                    },
                  },
                },
                responses: {
                  '200': {
                    description: 'Update response',
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          properties: { output: { type: 'string' } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      );
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'updateProfile',
            '--base-url-env',
            'PROFILE_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated non-_id identity redteam config');
      const [target] = generated.targets as unknown[];
      expectRecord(target, 'Generated non-_id identity redteam target');
      expect(target.inputs).toEqual({
        user_name: 'Target input field: user_name.',
        user_agent: 'Target input field: user_agent.',
        org_name: 'Target input field: org_name.',
        message: 'User-controlled message or instruction to the target.',
      });
      expectRecord(generated.redteam, 'Generated non-_id identity redteam block');
      // No identity or object _id fields present => only the policy plugin is inferred.
      expect(generated.redteam.plugins).toEqual([
        expect.objectContaining({ id: 'policy', numTests: 1 }),
      ]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('adds the bola plugin when object identifiers are present', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-bola-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(
        specPath,
        yaml.dump({
          openapi: '3.1.0',
          paths: {
            '/loans/{loan_id}/advise': {
              post: {
                operationId: 'adviseOnLoan',
                parameters: [
                  { name: 'loan_id', in: 'path', required: true, schema: { type: 'string' } },
                ],
                requestBody: {
                  required: true,
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        required: ['user_id', 'question'],
                        properties: {
                          user_id: { type: 'string' },
                          question: { type: 'string' },
                        },
                      },
                    },
                  },
                },
                responses: {
                  '200': {
                    description: 'Advice',
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          properties: { advice: { type: 'string' } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      );
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'adviseOnLoan',
            '--base-url-env',
            'LOAN_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated object-id redteam config');
      expectRecord(generated.redteam, 'Generated object-id redteam block');
      // loan_id is an object identifier (not identity, not technical) so bola should be inferred
      // alongside rbac (driven by user_id). This matches the skill's
      // "object IDs imply bola" guidance.
      expect(generated.redteam.plugins).toEqual([
        expect.objectContaining({ id: 'policy', numTests: 1 }),
        { id: 'rbac', numTests: 1 },
        { id: 'bola', numTests: 1 },
      ]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('forces env placeholders for credential-like params in redteam target configs', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-redteam-credential-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(
        specPath,
        yaml.dump({
          openapi: '3.1.0',
          paths: {
            '/search': {
              get: {
                operationId: 'leakyRedteamSearch',
                parameters: [
                  {
                    name: 'Authorization',
                    in: 'header',
                    schema: { type: 'string', example: 'Bearer SECRET_TOKEN_123' },
                  },
                  {
                    name: 'api_key',
                    in: 'query',
                    schema: { type: 'string', example: 'PROD_API_KEY_456' },
                  },
                  {
                    name: 'session_id',
                    in: 'cookie',
                    schema: { type: 'string', example: 'sess_XYZ' },
                  },
                  { name: 'q', in: 'query', schema: { type: 'string' } },
                ],
                responses: {
                  '200': {
                    description: 'ok',
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          properties: { output: { type: 'string' } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      );
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'leakyRedteamSearch',
            '--base-url-env',
            'LEAKY_REDTEAM_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated credential-leak redteam config');
      const [target] = generated.targets as unknown[];
      expectRecord(target, 'Generated credential-leak redteam target');
      expectRecord(target.config, 'Generated credential-leak redteam target config');
      expect(target.config.headers).toEqual({
        Authorization: '{{env.AUTHORIZATION}}',
        Cookie: 'session_id={{env.SESSION_ID}}',
      });
      expect(target.config.queryParams).toEqual({
        api_key: '{{env.API_KEY}}',
        q: '{{q}}',
      });
      // Credentials must NOT appear as target inputs or default vars.
      expect(target.inputs).toEqual({
        q: 'User-controlled message or instruction to the target.',
      });
      expect(generated.defaultTest).toEqual({ vars: { q: 'Say exactly PONG.' } });
      const serialized = yaml.dump(generated);
      expect(serialized).not.toContain('SECRET_TOKEN_123');
      expect(serialized).not.toContain('PROD_API_KEY_456');
      expect(serialized).not.toContain('sess_XYZ');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('excludes technical tracing _id fields from RBAC object-field inference', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-technical-id-'));
    const specPath = path.join(tempDir, 'openapi.yaml');
    try {
      fs.writeFileSync(
        specPath,
        yaml.dump({
          openapi: '3.1.0',
          paths: {
            '/moderate': {
              post: {
                operationId: 'moderateText',
                requestBody: {
                  required: true,
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        required: ['trace_id', 'text'],
                        properties: {
                          trace_id: { type: 'string' },
                          request_id: { type: 'string' },
                          span_id: { type: 'string' },
                          text: { type: 'string' },
                        },
                      },
                    },
                  },
                },
                responses: {
                  '200': {
                    description: 'Moderation response',
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          properties: { output: { type: 'string' } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      );
      const generated = yaml.load(
        execFileSync(
          'node',
          [
            path.join(redteamSetupSkillRoot, 'scripts', 'openapi-operation-to-redteam-config.mjs'),
            '--spec',
            specPath,
            '--operation-id',
            'moderateText',
            '--base-url-env',
            'MODERATION_API_BASE_URL',
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ),
      );
      expectRecord(generated, 'Generated technical-id redteam config');
      expectRecord(generated.redteam, 'Generated technical-id redteam block');
      // Only technical trace/request/span IDs are present (no object _id, no identity);
      // the rbac plugin should NOT be inferred.
      expect(generated.redteam.plugins).toEqual([
        expect.objectContaining({ id: 'policy', numTests: 1 }),
      ]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('promptfoo-redteam-run skill', () => {
  it('has a routing description with run scope and setup/provider boundaries', () => {
    const skill = readText(path.join(redteamRunSkillRoot, 'SKILL.md'));

    expect(skill).toMatch(/^---\nname: promptfoo-redteam-run\n/);
    expect(skill).toContain('Run, rerun, inspect, and QA');
    expect(skill).toContain('generated redteam YAML');
    expect(skill).toContain('attack success rate');
    expect(skill).toContain('Do not use for initial provider wiring');
    expect(skill).toContain('choosing plugins');
    expect(skill).toContain('strategies before generation');
  });

  it('documents reproducible redteam eval, inspection, and filtered reruns', () => {
    const skill = readText(path.join(redteamRunSkillRoot, 'SKILL.md'));

    expect(skill).toContain('Use `redteam eval`');
    expect(skill).toContain('Use `redteam run --force`');
    expect(skill).toContain('validate target');
    expect(skill).toContain('--no-cache --no-share --no-progress-bar');
    expect(skill).toContain('results.stats.successes');
    expect(skill).toContain('shareableUrl');
    expect(skill).toContain('--filter-failing');
    expect(skill).toContain('--filter-errors-only');
    expect(skill).toContain('--filter-metadata pluginId=policy');
    expect(skill).toContain('ENOENT');
    expect(skill).toContain('Regenerate beside');
    expect(skill).toContain('redteam report');
    // `redteam run` has no --no-share flag (see src/redteam/commands/run.ts);
    // the skill must route users to PROMPTFOO_DISABLE_SHARING=true instead.
    expect(skill).toContain('PROMPTFOO_DISABLE_SHARING=true');
    expect(skill).not.toMatch(/redteam run[^\n]*--no-share/);
  });

  it('ships Codex UI metadata for redteam runs', () => {
    const openaiYaml = readText(path.join(redteamRunSkillRoot, 'agents', 'openai.yaml'));

    expect(openaiYaml).toContain('Promptfoo Redteam Run');
    expect(openaiYaml).toContain('$promptfoo-redteam-run');
    expect(openaiYaml).toContain('allow_implicit_invocation: true');
  });

  it('keeps run commands and CI gates in a progressive-disclosure reference file', () => {
    const reference = readText(
      path.join(redteamRunSkillRoot, 'references', 'redteam-run-patterns.md'),
    );

    expect(reference).toContain('Stable Eval From Generated Tests');
    expect(reference).toContain('Generate And Evaluate');
    expect(reference).toContain('Deterministic Grader QA');
    expect(reference).toContain('Run the generated probes with the deterministic grader');
    expect(reference).toContain('INTENTIONAL_LEAK');
    expect(reference).toContain('resolves under `/tmp`');
    expect(reference).toContain('file://test/fixtures/my-scan/target.mjs');
    expect(reference).toContain('file://./target.py:call_api');
    expect(reference).toContain('file://grader.py:grade_redteam');
    expect(reference).toContain('file://target.py:function_name');
    expect(reference).toContain('call_api(prompt, options, context)');
    expect(reference).toContain('anchor `sys.path`');
    expect(reference).toContain('Path(__file__).resolve().parent');
    expect(reference).toContain('constructor `options.config`');
    expect(reference).toContain('options` argument to `call_api`');
    expect(reference).toContain('workers: 1');
    expect(reference).toContain('timeout');
    expect(reference).toContain('jq');
    expect(reference).toContain('--filter-failing');
    expect(reference).toContain('--filter-errors-only');
    expect(reference).toContain('PROMPTFOO_FAILED_TEST_EXIT_CODE=0');
  });

  for (const dir of redteamRunFixtureDirs) {
    it(`keeps generated redteam metadata and assertion shape intact for ${dir}`, () => {
      const config = yaml.load(readText(path.join(fixtureRoot, dir, 'redteam.yaml')));
      expectRecord(config, `${dir} config`);

      expect(Array.isArray(config.targets), `${dir} targets`).toBe(true);
      const [target] = config.targets as unknown[];
      expectRecord(target, `${dir} target`);
      const targetExtension = dir.includes('python') ? 'py' : 'mjs';
      const graderExtension = dir.includes('python') ? 'py' : 'mjs';
      const expectedTargetId = dir.includes('python')
        ? `file://./target.${targetExtension}:call_api`
        : `file://./target.${targetExtension}`;
      expect(target.id).toBe(expectedTargetId);
      if (dir === 'redteam-run-local-pass') {
        expect(target.config).toEqual({ defaultUserId: 'qa-run-config' });
      } else if (dir === 'redteam-run-local-python-pass') {
        expect(target.config).toEqual({
          workers: 1,
          timeout: 30000,
          defaultUserId: 'qa-py-run-config',
        });
      }

      const redteam = config.redteam;
      expectRecord(redteam, `${dir} redteam`);
      const expectedGraderId = dir.includes('python')
        ? `file://test/fixtures/agent-skills/${dir}/grader.${graderExtension}:grade_redteam`
        : `file://test/fixtures/agent-skills/${dir}/grader.${graderExtension}`;
      expect(redteam.provider).toBe(expectedGraderId);
      expect(redteam.maxConcurrency).toBe(1);
      expect(Array.isArray(redteam.plugins), `${dir} redteam plugins`).toBe(true);
      const redteamPlugins = redteam.plugins as unknown[];
      expect(
        redteamPlugins.map((plugin, index) => {
          expectRecord(plugin, `${dir} redteam plugin ${index}`);
          return plugin.id;
        }),
      ).toEqual(['policy', 'rbac']);

      const defaultTest = config.defaultTest;
      expectRecord(defaultTest, `${dir} defaultTest`);
      const defaultMetadata = defaultTest.metadata;
      expectRecord(defaultMetadata, `${dir} defaultTest metadata`);
      expect(typeof redteam.purpose).toBe('string');
      expect(typeof defaultMetadata.purpose).toBe('string');
      expect(defaultMetadata.purpose).toBe(redteam.purpose);
      expect(String(defaultMetadata.purpose).length).toBeGreaterThan(90);

      expect(Array.isArray(config.tests), `${dir} tests`).toBe(true);
      const tests = config.tests as unknown[];
      expect(tests).toHaveLength(2);

      const pluginIds = tests.map((testCase, index) => {
        expectRecord(testCase, `${dir} test ${index}`);
        const metadata = testCase.metadata;
        expectRecord(metadata, `${dir} test ${index} metadata`);
        const assertions = testCase.assert;
        expect(Array.isArray(assertions), `${dir} test ${index} assertions`).toBe(true);
        expect(assertions).toHaveLength(1);
        const [assertion] = assertions as unknown[];
        expectRecord(assertion, `${dir} test ${index} assertion`);

        expect(metadata.severity).toBe('high');
        expect(assertion.type).toBe(`promptfoo:redteam:${metadata.pluginId}`);
        expect(typeof assertion.metric).toBe('string');
        expect(String(assertion.metric).length).toBeGreaterThan(8);

        const vars = testCase.vars;
        expectRecord(vars, `${dir} test ${index} vars`);
        expect(typeof vars.prompt).toBe('string');

        if (metadata.pluginId === 'policy') {
          const pluginConfig = metadata.pluginConfig;
          expectRecord(pluginConfig, `${dir} policy plugin config`);
          expect(typeof pluginConfig.policy).toBe('string');
          expect(pluginConfig.policy).toBe(metadata.policy);
        } else {
          expect(metadata.pluginConfig).toBeUndefined();
        }

        return metadata.pluginId;
      });

      expect(pluginIds).toEqual(['policy', 'rbac']);
    });
  }

  it.each([
    {
      dir: 'redteam-run-local-pass',
      snippets: [
        'description: Redteam run local pass smoke',
        'file://./target.mjs',
        'defaultUserId: qa-run-config',
        'file://test/fixtures/agent-skills/redteam-run-local-pass/grader.mjs',
        'id: policy',
        'id: rbac',
        'promptfoo:redteam:policy',
        'promptfoo:redteam:rbac',
      ],
    },
    {
      dir: 'redteam-run-local-python-pass',
      snippets: [
        'description: Redteam run local Python pass smoke',
        'file://./target.py:call_api',
        'workers: 1',
        'timeout: 30000',
        'defaultUserId: qa-py-run-config',
        'file://test/fixtures/agent-skills/redteam-run-local-python-pass/grader.py:grade_redteam',
        'id: policy',
        'id: rbac',
        'promptfoo:redteam:policy',
        'promptfoo:redteam:rbac',
      ],
    },
    {
      dir: 'redteam-run-local-mixed',
      snippets: [
        'description: Redteam run local mixed smoke',
        'file://./target.mjs',
        'file://test/fixtures/agent-skills/redteam-run-local-mixed/grader.mjs',
        'force-leak',
        'id: policy',
        'id: rbac',
      ],
    },
    {
      dir: 'redteam-run-local-error',
      snippets: [
        'description: Redteam run local target error smoke',
        'file://./target.mjs',
        'file://test/fixtures/agent-skills/redteam-run-local-error/grader.mjs',
        'target-error',
        'id: policy',
        'id: rbac',
      ],
    },
  ])('ships a runnable/validatable $dir redteam run fixture', ({ dir, snippets }) => {
    const config = readText(path.join(fixtureRoot, dir, 'redteam.yaml'));
    const isPythonFixture = dir.includes('python');
    const target = readText(
      path.join(fixtureRoot, dir, isPythonFixture ? 'target.py' : 'target.mjs'),
    );
    const grader = readText(
      path.join(fixtureRoot, dir, isPythonFixture ? 'grader.py' : 'grader.mjs'),
    );

    expect(config).toContain(
      '# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json',
    );
    expect(config).toContain('defaultTest:');
    expect(config).toContain('metadata:');
    expect(config).toContain('pluginId:');
    if (isPythonFixture) {
      expect(target).toContain('def call_api(prompt: str, options: dict, context: dict)');
    } else {
      expect(target).toContain('export default class');
      expect(target).toContain('async callApi');
    }
    if (dir === 'redteam-run-local-error') {
      expect(target).toContain('Simulated target outage');
    }
    if (isPythonFixture) {
      expect(grader).toContain('def grade_redteam(prompt: str, options: dict, context: dict)');
      expect(grader).toContain('json.dumps');
    } else {
      expect(grader).toContain('export default class');
      expect(grader).toContain('async callApi');
      expect(grader).toContain('JSON.stringify');
    }
    expect(grader).toContain('pass');
    expect(grader).toContain('score');
    expect(grader).toContain('reason');

    for (const snippet of snippets) {
      expect(config).toContain(snippet);
    }
  });
});
