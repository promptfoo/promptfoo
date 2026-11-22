import { STATUS_CODES } from 'node:http';

import { getEnvBool, getEnvOverrides, isTemplateProcessEnvDisabled } from '../envars';
import { maybeFilePath } from '../prompts/utils';
import {
  headerVariable,
  isSetupReplyPath,
  type SetupConnection,
  SetupConnectionTest,
} from '../types/api/redteamSetup';
import { fetchWithProxy, readBoundedText } from '../util/fetch/index';
import { isCredentialHeader, isSecretField, looksLikeSecret } from '../util/sanitizer';

// Best-effort paste protection before forwarding free text. The agent never has
// access to the environment. Only the local target test resolves a variable.
export function containsSetupSecret(input: string): boolean {
  const value = input.replace(
    /\{\{\s*(?:env\.[A-Z_]\w*|prompt|sessionId)\s*\}\}|\$\{?[A-Z_][A-Z0-9_]*\}?/g,
    'ENV_REFERENCE',
  );
  if (
    /:\/\/[^/\s?#]*@|\b(?:sk-[\w-]{8,}|gh[pousr]_\w{12,}|github_pat_\w+|eyJ[\w-]+\.[\w-]+\.[\w-]+)|-----BEGIN [\w ]*PRIVATE KEY-----/i.test(
      value,
    ) ||
    value.split(/[\s"':=]+/).some(looksLikeSecret)
  ) {
    return true;
  }
  const reference = (s: string) => /^[A-Z_][A-Z0-9_]*$/.test(s);
  // Older clients can send quoted literals without first replacing them locally.
  for (const [, , raw] of value.matchAll(
    /\b(?:key|token|password|secret)\s+is\s+(["'`])([^"'\n`]+)\1/gi,
  )) {
    if (!reference(raw)) {
      return true;
    }
  }
  for (const [url] of value.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
    if (URL.canParse(url)) {
      for (const [name, credential] of new URL(url).searchParams) {
        if (credential && isCredentialHeader(name, '')) {
          return true;
        }
      }
    }
  }
  const assignments = /\b(header\s+)?([\w-]+)["']?\s*[:=]\s*["']?([^\s"',;}&]+)/gi;
  for (const [, header, name, supplied] of value.matchAll(assignments)) {
    if (
      ((header && !/^(?:accept|content-type|x-(?:org-id|tenant-id|api-version))$/i.test(name)) ||
        isCredentialHeader(name, '') ||
        /[-_]access$/i.test(name)) &&
      !/^(?:max(?:_[a-z]+)*_tokens|tokenEstimation|sessionId)$/i.test(name) &&
      supplied !== '{' &&
      !reference(supplied) &&
      !/^(?:bearer|basic|token|apikey)$/i.test(supplied)
    ) {
      return true;
    }
  }
  for (const [, raw] of value.matchAll(
    /\bauthorization["']?\s*[:=]\s*["']?(?:bearer|basic)\s+([^\s"',;]+)/gi,
  )) {
    // Auth scheme examples often end in an ellipsis inside Markdown.
    if (/^(?:\.{3}|…)[\x60*).!?]*$/.test(raw)) {
      continue;
    }
    if (!reference(raw.replace(/\.$/, '')) && !/^(?:or|with|for|from|using|and)$/i.test(raw)) {
      return true;
    }
  }
  const tokens = /\b(?:bearer\s+|(?:api[-_ ]?key|password|token|secret)\s+is\s+)([\w.+/=-]{12,})/gi;
  for (const [, token] of value.matchAll(tokens)) {
    if (!reference(token.replace(/\.$/, '')) && !/^[a-z]+\.?$/i.test(token)) {
      return true;
    }
  }
  return false;
}

const modelId =
  /^(?:openai:(?:(?:chat|responses):)?(?:gpt-|o[134]\b|chatgpt-)[\w.-]*|anthropic:(?:messages:)?claude-(?!code\b|agent\b)[\w.-]+|google:gemini-[\w.-]+|ollama:(?:chat:)?[\w.-]+(?:[/:][\w.-]+)*)$/;
const loopback = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:[/?]|$)/i;
const review = (message: string) => ({ message, repairable: false });
const repair = (message: string) => ({ message, repairable: true });
const unsupported = 'This target uses settings that need local review before running.';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function literals(input: string) {
  return input.split(/[\s"'\x60<>()]+/).flatMap((word) => [word, word.replace(/[.,;!?]+$/, '')]);
}

function endpoints(input: string) {
  return literals(input).flatMap((word) => {
    const value = loopback.test(word) ? 'http://' + word : word;
    return /^https?:\/\//i.test(value) && URL.canParse(value) ? [new URL(value)] : [];
  });
}

function namesVariable(input: string, variable: string) {
  // Only standalone names or explicit environment references are grants.
  // Seeing a variable-shaped segment in a URL or model ID is not sufficient.
  const words = literals(input.replace(/\{\{\s*env\.([A-Z_]\w*)\s*\}\}/g, '$$$1'));
  return words.some(
    (word) =>
      word === variable ||
      word === '$' + variable ||
      word === '${' + variable + '}' ||
      word === 'process.env.' + variable,
  );
}

const tuning = new Set([
  'temperature',
  'top_p',
  'max_tokens',
  'max_completion_tokens',
  'seed',
  'frequency_penalty',
  'presence_penalty',
]);

function isSetupTuningOption(key: string, value: unknown) {
  return tuning.has(key) && typeof value === 'number' && Number.isFinite(value);
}

function modelIssue(target: Record<string, unknown>, id: string, userTurns: string[]) {
  const config = record(target.config);
  if (
    (target.config !== undefined && config !== target.config) ||
    !modelId.test(id) ||
    Object.keys(target).some((key) => !['id', 'config', 'label'].includes(key)) ||
    Object.entries(config).some(([key, value]) => !isSetupTuningOption(key, value))
  ) {
    return review(unsupported);
  }
  const parts = literals(userTurns.join(' ').toLowerCase());
  const model = id.toLowerCase();
  const provider = model.split(':')[0];
  const name = model.replace(/^[^:]+:(?:(?:chat|responses|messages|completion):)?/, '');
  if (!parts.includes(model) && !(parts.includes(provider) && parts.includes(name))) {
    return repair(
      'Ask which provider and model to test directly. Never substitute a direct provider for the user’s app or guess a model ID.',
    );
  }
}

// Conversation history is the evidence of consent. A previous draft can itself
// be review-only, so it cannot authorize a destination or a variable.
function credentialGrant(
  turns: string[],
  origins: Set<string>[],
  variable: string,
  origin: string,
) {
  // The explicit test/run action discloses each origin and its variables.
  // A single message can describe multiple targets with different headers.
  if (turns.some((turn, i) => origins[i].has(origin) && namesVariable(turn, variable))) {
    return true;
  }
  const index = turns.map((turn) => namesVariable(turn, variable)).lastIndexOf(true);
  if (index < 0) {
    return false;
  }
  // Associate the name with the most recently stated origin, or the first
  // subsequent origin if the user supplied the variable before any address.
  const grant =
    origins
      .slice(0, index + 1)
      .reverse()
      .find((set) => set.size) || origins.slice(index + 1).find((set) => set.size);
  return grant?.size === 1 && grant.has(origin);
}

function httpIssue(connection: SetupConnection, turns: string[], previous?: unknown) {
  const { config } = connection;
  const url = new URL(config.url ?? connection.id);
  const prior = typeof previous === 'string' ? { id: previous } : record(previous);
  const priorUrl = record(prior.config).url ?? prior.id;
  const changedOrigin =
    typeof priorUrl === 'string' &&
    URL.canParse(priorUrl) &&
    new URL(priorUrl).origin !== url.origin;
  const urls = turns.map(endpoints);
  if (
    !urls.some((list) => list.some((item) => item.href === url.href)) &&
    !(
      urls.some((list) => list.some((item) => item.origin === url.origin)) &&
      turns.some((turn) => literals(turn).includes(url.pathname + url.search))
    )
  ) {
    return repair('Ask for the exact endpoint URL before setting or changing the destination.');
  }
  const origins = urls.map((list) => new Set(list.map((item) => item.origin)));
  for (const value of Object.values(config.headers ?? {})) {
    const variable = headerVariable(value);
    if (
      variable &&
      (!credentialGrant(turns, origins, variable, url.origin) ||
        (changedOrigin && !namesVariable(turns[turns.length - 1] ?? '', variable)))
    ) {
      return repair(
        'Ask the user to name the endpoint URL and its environment variable together. Never guess or transfer a credential to a different origin.',
      );
    }
  }
  if (
    ['PATCH', 'PUT'].includes(config.method) &&
    !turns.some((turn) => literals(turn).includes(config.method))
  ) {
    return repair('Confirm the HTTP method before sending requests that modify data.');
  }
}

export function targetExecutionIssue(
  target: unknown,
  userTurns: string[],
  previousTarget?: unknown,
) {
  const value = typeof target === 'string' ? { id: target } : record(target);
  if (
    typeof value.id !== 'string' ||
    (value.label !== undefined &&
      (typeof value.label !== 'string' || /\{[{%#]|\$\{|file:\/\//i.test(value.label)))
  ) {
    return review(unsupported);
  }
  if (!/^https?(?::\/\/|$)/.test(value.id)) {
    const priorId = typeof previousTarget === 'string' ? previousTarget : record(previousTarget).id;
    return modelIssue(
      value,
      value.id,
      priorId && priorId !== value.id ? userTurns.slice(-1) : userTurns,
    );
  }
  if (/"__proto__":/.test(JSON.stringify(value))) {
    return review(unsupported);
  }
  if (containsSetupSecret(JSON.stringify(value))) {
    return review('Credentials must be referenced through environment variables.');
  }
  const config = record(value.config);
  const headers = record(config.headers);
  if (
    Object.values(headers).some((v) => typeof v === 'string' && headerVariable(v)) &&
    config.redirect === undefined &&
    SetupConnectionTest.Request.safeParse({ ...value, config: { ...config, redirect: 'error' } })
      .success
  ) {
    return repair(
      'Set redirect: error on credentialed targets to keep every key at its intended destination.',
    );
  }
  const parsed = SetupConnectionTest.Request.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.code === 'unrecognized_keys' ? issue.keys[0] : issue.path[1];
    return review(
      typeof field === 'string' && /^[a-zA-Z_]\w{0,47}$/.test(field)
        ? 'Review ' + field + ' locally before running. Chat cannot safely reproduce this setting.'
        : 'This HTTP request cannot be verified safely in chat. Check the method, URL, headers, body and transforms locally before running.',
    );
  }
  return httpIssue(parsed.data, userTurns, previousTarget);
}

const maxBytes = 256 * 1024;
const failure = (message: string) => ({ success: false, message });

function readPath(json: unknown, path: string) {
  let value = json;
  for (const key of path.replace(/\[(\d+)\]/g, '.$1').split('.')) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) {
      return undefined;
    }
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

// Config validation must never resolve files, instantiate providers or evaluate
// templates. CLI configs can do all three. They can still be reviewed as YAML.
const privilegedFields = new Set([
  'env',
  'extensions',
  'nunjucksFilters',
  'derivedMetrics',
  'outputPath',
  'commandLineOptions',
  'tracing',
  'basePath',
  'provider',
  'redteamProvider',
  'providerBasePath',
  'grader',
  'transform',
  'transformVars',
  'contextTransform',
  'postprocess',
  'assertScoringFunction',
  'function',
  '$ref',
  'constructor',
  '__proto__',
  'prototype',
  'teamId',
]);

// This is the fixed session variable used by the manual red team editor.
export const sessionTransform = '{ ...vars, sessionId: context.uuid }';

function privilegedField(value: unknown, path = ''): string | undefined {
  if (typeof value === 'string') {
    // Allow simple prompt variables but never environment access or template
    // expressions outside a separately verified target header.
    const literal = value.replace(
      /\{\{\s*(?!(?:env|process|global|constructor|__proto__)\b)[a-z_]\w*\s*\}\}/gi,
      '',
    );
    if (/\{[{%#]|\$\{|file:\/\/|^(?:exec|package):/i.test(literal)) {
      return path;
    }
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      const field = path ? path + '.' + key : key;
      if (field === 'defaultTest.options.transformVars' && item === sessionTransform) {
        continue;
      }
      if (
        privilegedFields.has(key) ||
        /\{[{%#]|\$\{/.test(key) ||
        (key === 'sharing' && item !== false) ||
        (key === 'type' &&
          typeof item === 'string' &&
          /^(?:not-)?(?:javascript|python|ruby|webhook|agent-rubric)$/.test(item))
      ) {
        return field;
      }
      const found = privilegedField(item, field);
      if (found) {
        return found;
      }
    }
  }
}

// Prompt configs and extra test options can override the target after its
// URL and credentials were checked. Allow ordinary numeric tuning inline.
const inlineTestOptions = new Set([
  'prefix',
  'suffix',
  'storeOutputAs',
  'rubricPrompt',
  'factuality',
  'disableVarExpansion',
  'disableConversationVar',
  'disableDefaultAsserts',
  'runSerially',
  'repeat',
  'transformVars',
]);

function providerOverride(value: unknown, test = false) {
  if (value === undefined) {
    return false;
  }
  return (
    !value ||
    typeof value !== 'object' ||
    Object.entries(value).some(
      ([key, item]) => !(test && inlineTestOptions.has(key)) && !isSetupTuningOption(key, item),
    )
  );
}

function inlineTest(test: unknown) {
  if (!test || typeof test !== 'object' || 'path' in test) {
    return false;
  }
  // A string or array in vars loads files even without a file:// prefix.
  return (
    !('vars' in test && (typeof test.vars === 'string' || Array.isArray(test.vars))) &&
    !('options' in test && providerOverride(test.options, true))
  );
}

export function localReviewField(config: Record<string, unknown>): string | undefined {
  const { targets: _targets, providers: _providers, ...rest } = config;
  const privileged = privilegedField(rest);
  if (privileged) {
    return privileged;
  }
  // Bare paths/globs also load executable prompt and test files. Only inline
  // prompts and test cases are eligible for an agent-initiated browser run.
  const prompts = Array.isArray(config.prompts)
    ? config.prompts
    : config.prompts && typeof config.prompts === 'object'
      ? Object.keys(config.prompts)
      : [config.prompts];
  for (const item of prompts) {
    const raw = typeof item === 'object' && item ? item.raw || item.id : item;
    if (
      typeof raw !== 'string' ||
      maybeFilePath(raw) ||
      /^(?:exec:|[a-z]+:\/\/)/i.test(raw) ||
      providerOverride(item?.config)
    ) {
      return 'prompts';
    }
  }
  if (config.defaultTest && !inlineTest(config.defaultTest)) {
    return 'defaultTest';
  }
  if (config.tests && (!Array.isArray(config.tests) || !config.tests.every(inlineTest))) {
    return 'tests';
  }
  if (
    Array.isArray(config.scenarios) &&
    config.scenarios.some(
      (scenario) =>
        !Array.isArray(scenario?.config) ||
        !scenario.config.every(inlineTest) ||
        !Array.isArray(scenario.tests) ||
        !scenario.tests.every(inlineTest),
    )
  ) {
    return 'scenarios';
  }
}

// Return field names only. Never put response values, headers or credentials into the chat.
function replyPaths(json: unknown, secrets: string[]) {
  const paths: string[] = [];
  function visit(value: unknown, path: string, depth: number) {
    if (depth > 8 || paths.length >= 16) {
      return;
    }
    if (typeof value === 'string' && value.trim() && isSetupReplyPath(path)) {
      paths.push(path);
    } else if (Array.isArray(value)) {
      visit(value[0], path + '[0]', depth + 1);
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (
          !/^[a-z_]\w{0,63}$/i.test(key) ||
          isSecretField(key) ||
          looksLikeSecret(key) ||
          secrets.some((token) => key.includes(token))
        ) {
          continue;
        }
        visit(child, path ? path + '.' + key : key, depth + 1);
      }
    }
  }
  visit(json, '', 0);
  const likelyReply = /(?:^|\.)(?:answer|content|message|output|response|reply|text)$/i;
  return paths
    .filter((path) => !secrets.some((token) => path.includes(token)))
    .sort((a, b) => Number(likelyReply.test(b)) - Number(likelyReply.test(a)))
    .slice(0, 4);
}

function inspectReply(
  text: string,
  status: number,
  transform: string | undefined,
  secrets: string[],
) {
  const received = `HTTP ${status}.`;
  if (!text.trim()) {
    return failure(received + ' The response was empty.');
  }
  if (/^\s*<(?:!doctype html|html)\b/i.test(text)) {
    return failure(received + ' The endpoint returned a web page.');
  }
  if (transform === 'text') {
    return { success: true, message: received + ' Received a non-empty text reply.' };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return {
      success: transform === undefined,
      message: received + ' Received plain text instead of JSON.',
      paths: ['Plain text'],
    };
  }
  if (transform === 'json') {
    return json
      ? { success: true, message: received + ' Received JSON.' }
      : failure(received + ' Received empty JSON.');
  }
  const path = transform?.slice(5);
  if (path) {
    const value = readPath(json, path);
    if (typeof value === 'string' && value.trim()) {
      return { success: true, message: received + ` Found text at ${path}.` };
    }
  }
  const paths = replyPaths(json, secrets);
  const problem = path ? ` No text at ${path}.` : '';
  return {
    success: path === undefined && paths.length > 0,
    message:
      received +
      problem +
      (paths.length ? ' Found candidate text fields.' : ' No readable text field found.'),
    paths,
  };
}

export async function testSetupConnection(connection: SetupConnection, signal: AbortSignal) {
  if (getEnvBool('PROMPTFOO_DISABLE_TEMPLATING')) {
    return failure('Templates are disabled on this server. Enable them to send a test message.');
  }
  if (containsSetupSecret(JSON.stringify(connection))) {
    return failure('Reference secrets with environment variables.');
  }
  const { id, config } = connection;
  const url = new URL(config.url ?? id);
  const headers: Record<string, string> = {};
  if (config.body) {
    headers['content-type'] =
      typeof config.body === 'string' ? 'application/x-www-form-urlencoded' : 'application/json';
  }
  const secrets: string[] = [];
  for (const [name, value] of Object.entries(config.headers ?? {})) {
    const variable = headerVariable(value);
    if (!variable) {
      headers[name.toLowerCase()] = value;
      continue;
    }
    if (isTemplateProcessEnvDisabled()) {
      return failure('Environment variables are disabled for templates on this server.');
    }
    const token = getEnvOverrides('file')?.[variable] ?? process.env[variable];
    if (!token) {
      return failure(
        'Set ' +
          variable +
          ' where Promptfoo runs, then restart Promptfoo and test again. No message was sent.',
      );
    }
    if (/[\r\n]|\{[{%#]/.test(token)) {
      return failure(
        'An environment variable contains an unsafe header value. No message was sent.',
      );
    }
    secrets.push(token);
    headers[name.toLowerCase()] = value.replace(/\{\{.*\}\}/, () => token);
  }
  const sessionId = crypto.randomUUID();
  const render = (value: string) =>
    value.replace(/\{\{\s*prompt\s*\}\}/g, 'Hello').replace(/\{\{\s*sessionId\s*\}\}/g, sessionId);
  for (const [key, value] of Object.entries(config.queryParams ?? {})) {
    url.searchParams.append(key, render(value));
  }
  const transform = config.transformResponse ?? config.responseParser;
  // One uncached request. Never evaluate code, run a template engine, or load a provider.
  const response = await fetchWithProxy(url.href, {
    method: config.method,
    headers,
    body:
      typeof config.body === 'string'
        ? render(config.body).trim()
        : config.body &&
          JSON.stringify(config.body, (_key, value) => {
            if (typeof value !== 'string') {
              return value;
            }
            const rendered = render(value);
            // HttpProvider.processJsonBody parses serialized nested objects and arrays.
            if (/^\s*[\[{]/.test(rendered)) {
              try {
                return JSON.parse(rendered);
              } catch {}
            }
            return rendered;
          }),
    redirect: 'manual',
    disableTransientRetries: true,
    skipCloudAuthInjection: true,
    suppressLogging: true,
    signal,
  });

  if (!response.ok) {
    await response.body?.cancel();
    // Send evidence, not a diagnosis. The agent can interpret it using the conversation.
    // Don't forward statusText or the error body, which the endpoint controls.
    return failure(`HTTP ${response.status} ${STATUS_CODES[response.status] ?? 'Request failed'}.`);
  }
  const text = await readBoundedText(response, maxBytes + 1);
  if (Buffer.byteLength(text) > maxBytes) {
    return failure('The reply is too large to inspect here.');
  }
  return inspectReply(text, response.status, transform, secrets);
}
