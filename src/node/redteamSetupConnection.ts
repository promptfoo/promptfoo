import { STATUS_CODES } from 'node:http';

import { getEnvBool, getEnvOverrides, isTemplateProcessEnvDisabled } from '../envars';
import { maybeFilePath } from '../prompts/utils';
import {
  headerVariable,
  isSetupModelConfig,
  isSetupReplyPath,
  type SetupConnection,
  SetupConnectionTest,
  setupHttpTarget,
  setupReplyPath,
} from '../types/api/redteamSetup';
import { fetchWithProxy, readBoundedText } from '../util/fetch/index';
import { renderVarsInObject } from '../util/render';
import { isSecretField, looksLikeSecret } from '../util/sanitizer';

function credentialField(name: string) {
  return (
    /(?:^|[-_])(?:key|token|secret|password|passwd|authorization|auth|credential|cookie|access|jwt)$/i.test(
      name,
    ) ||
    /(?:apikey|accesskey|privatekey|secretkey|clientsecret|passphrase|password|token)$/i.test(name)
  );
}

// Best-effort paste protection before forwarding free text. The agent never has
// access to the environment. Only the local target test resolves a variable.
export function containsSetupSecret(input: string, source: 'assistant' | 'user' = 'user'): boolean {
  const value = input
    .replace(/\\+"/g, '"')
    .replace(
      /\{\{\s*(?:env(?:\.[A-Za-z_]\w*|\[["'][A-Za-z_]\w*["']\])|[A-Za-z_]\w*)(?:\s*\|\s*[A-Za-z_]\w*)*\s*\}\}|\$\{[A-Za-z_]\w*\}|(?:\$|\bprocess\.env\.)[A-Za-z_]\w*/g,
      '<token>',
    );
  if (
    /:\/\/[^/\s?#]*@|\b(?:sk-[\w-]{8,}|gh[pousr]_\w{12,}|github_pat_\w+|eyJ[\w-]+\.[\w-]+\.[\w-]+)|-----BEGIN [\w ]*PRIVATE KEY-----/i.test(
      value,
    ) ||
    value.split(/[\s"':=]+/).some(looksLikeSecret)
  ) {
    return true;
  }
  for (const [url] of value.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
    if (URL.canParse(url)) {
      for (const [name, credential] of new URL(url).searchParams) {
        if (credential && credentialField(name)) {
          return true;
        }
      }
    }
  }
  // The agent never sees resolved credentials. Its troubleshooting examples
  // need no paste heuristics. Always screen configs and user turns in full.
  if (source === 'assistant') {
    return false;
  }
  // Explanations often quote a header example in Markdown. Exempt only a
  // complete reference or placeholder, never a credential next to one.
  const reference = (s: string) =>
    /^[\x60*]*[A-Z_][A-Z0-9_]*[\x60*).!?]*$/.test(s) ||
    /^[\x60*]*(?:\.{3}|…|<(?:your[-_])?(?:token|(?:api[-_]?)?key|secret|password)>)[\x60*).!?]*$/i.test(
      s,
    );
  // Older clients can send quoted literals without first replacing them locally.
  for (const [, , raw] of value.matchAll(
    /\b(?:key|token|password|secret)\s+is\s+(["'`])([^"'\n`]+)\1/gi,
  )) {
    if (!reference(raw)) {
      return true;
    }
  }
  const assignments = /\b([\w-]+)["']?\s*[:=]\s*["']?([^\s"',;}&]+)/gi;
  for (const [, name, supplied] of value.matchAll(assignments)) {
    if (
      credentialField(name) &&
      !/^(?:prompt_cache_key|idempotency[-_]key)$/i.test(name) &&
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
    if (!reference(raw) && !/^(?:or|with|for|from|using|and)$/i.test(raw)) {
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

// A bare public host needs a path to distinguish it from filenames and
// dotted config keys. Never infer plaintext HTTP for a public destination.
const hostPath = /^((?:[a-z0-9-]+\.)+[a-z]{2,63})(?::\d+)?\//i;

function endpoints(input: string) {
  return literals(input).flatMap((word) => {
    const host = hostPath.exec(word)?.[1].toLowerCase();
    const value = loopback.test(word)
      ? 'http://' + word
      : host && !/\.(?:ya?ml|jsonl?|[cm]?[jt]s|py|md|txt|csv)$/.test(host)
        ? 'https://' + word
        : word;
    return /^https?:\/\//i.test(value) && URL.canParse(value) ? [new URL(value)] : [];
  });
}

function namesVariable(input: string, variable: string) {
  // Only standalone names or explicit environment references are grants.
  // Seeing a variable-shaped segment in a URL or model ID is not sufficient.
  const words = literals(
    input
      .replace(/\{\{\s*env(?:\.([A-Za-z_]\w*)|\[['"]([A-Za-z_]\w*)['"]\])\s*\}\}/g, '$$$1$2')
      .replace(/(["'])\$?[A-Za-z_]\w*\1(?=\s*:)/g, ''),
  );
  return words.some((word) => {
    // Compact header assignments count, but never split arbitrary URLs, model
    // identifiers or property paths at their colons or equals signs.
    const match = /^([\w-]+)[:=](.+)$/.exec(word);
    const name = match && (credentialField(match[1]) || /^x-/i.test(match[1])) ? match[2] : word;
    return (
      (name === variable && /^[A-Z_][A-Z0-9_]*$/.test(variable)) ||
      name === '$' + variable ||
      name === '${' + variable + '}' ||
      name === 'process.env.' + variable
    );
  });
}

function modelIssue(
  target: Record<string, unknown>,
  id: string,
  userTurns: string[],
  previous?: unknown,
) {
  const config = record(target.config);
  if (
    (target.config !== undefined && config !== target.config) ||
    Object.keys(target).some(
      (key) => !['id', 'config', 'label', 'delay', 'prompts'].includes(key),
    ) ||
    privilegedField(target) ||
    !isSetupModelConfig(id, config)
  ) {
    return review(unsupported);
  }
  // A direct provider can use ambient API credentials. Require the user's choice
  // of service, without matching a particular model spelling or version.
  const provider = id.split(':')[0];
  const priorId = typeof previous === 'string' ? previous : record(previous).id;
  const switching = typeof priorId === 'string' && !priorId.startsWith(provider + ':');
  const turns = switching ? userTurns.slice(-1) : userTurns;
  // A model name supplied for an HTTP payload doesn't authorize switching to
  // the model vendor's own API. Look for an explicit choice of service.
  const gateway = switching && /^https?(?::\/\/|$)/.test(priorId);
  const aliases: Record<string, RegExp> = {
    openai: /^(?:chatgpt|gpt)(?:-|$)|^o[134](?:-|$)/,
    anthropic: /^claude(?:-|$)/,
    google: /^gemini(?:-|$)/,
  };
  const chosen = turns.some((turn) =>
    literals(turn.toLowerCase()).some(
      (word) =>
        word === provider ||
        word.startsWith(provider + ':') ||
        (!gateway && aliases[provider]?.test(word)),
    ),
  );
  if (!chosen) {
    return repair(
      'Ask which model provider the user wants to test directly before using its credentials.',
    );
  }
}

// Key bindings span the whole draft. Target order can change between edits.
export function credentialOrigins(targets: unknown[]) {
  const bindings = new Map<string, Set<string>>();
  for (const target of targets) {
    const parsed = setupHttpTarget.safeParse(target);
    if (!parsed.success) {
      continue;
    }
    const { id, config } = parsed.data;
    const origin = new URL(config.url ?? id).origin;
    for (const value of Object.values(config.headers ?? {})) {
      const name = headerVariable(value);
      if (name) {
        const origins = bindings.get(name) ?? new Set<string>();
        origins.add(origin);
        bindings.set(name, origins);
      }
    }
  }
  return bindings;
}

// Conversation history is the evidence of consent. A previous draft can itself
// be review-only, so it cannot authorize a destination or a variable.
function credentialGrant(
  turns: string[],
  origins: Set<string>[],
  variable: string,
  origin: string,
  transfer: boolean,
) {
  // An old message naming multiple destinations cannot authorize a new
  // pairing. Require a fresh assignment to one destination for a transfer.
  if (
    !transfer &&
    turns.some((turn, i) => origins[i].has(origin) && namesVariable(turn, variable))
  ) {
    return true;
  }
  const index = turns.map((turn) => namesVariable(turn, variable)).lastIndexOf(true);
  if (index < 0 || (transfer && index !== turns.length - 1)) {
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

function httpIssue(
  connection: SetupConnection,
  turns: string[],
  previous: unknown,
  bindings?: Map<string, Set<string>>,
) {
  const { config } = connection;
  const url = new URL(config.url ?? connection.id);
  const prior = typeof previous === 'string' ? { id: previous } : record(previous);
  const priorUrl = record(prior.config).url ?? prior.id;
  const changedOrigin =
    typeof priorUrl === 'string' &&
    URL.canParse(priorUrl) &&
    new URL(priorUrl).origin !== url.origin;
  const urls = turns.map(endpoints);
  const destinations = urls.flat().filter((item) => item.origin === url.origin);
  const origins = urls.map((list) => new Set(list.map((item) => item.origin)));
  const paths = destinations
    .filter((item) => item.pathname !== '/' || item.search)
    .map((item) => item.pathname + item.search);
  let current: Set<string> | undefined;
  for (const [index, turn] of turns.entries()) {
    if (origins[index].size) {
      current = origins[index];
    }
    if (current?.size === 1 && current.has(url.origin)) {
      paths.push(
        ...literals(turn).filter((word) => word.startsWith('/') && !word.startsWith('//')),
      );
    }
  }
  if (
    url.href === 'https://customer-service-chatbot-example.promptfoo.app/' &&
    turns.some((turn) => /\bdemo\b/i.test(turn)) &&
    !Object.values(config.headers ?? {}).some(headerVariable)
  ) {
    return;
  }
  if (!destinations.length || (paths.length && !paths.includes(url.pathname + url.search))) {
    return repair('Confirm the endpoint before changing the destination or path.');
  }
  for (const value of Object.values(config.headers ?? {})) {
    const variable = headerVariable(value);
    if (!variable) {
      continue;
    }
    const priorOrigins = bindings?.get(variable);
    const transfer = priorOrigins ? !priorOrigins.has(url.origin) : changedOrigin;
    if (!credentialGrant(turns, origins, variable, url.origin, transfer)) {
      return repair(
        'Ask the user to name the endpoint URL and its environment variable together. Never guess or transfer a credential to a different origin.',
      );
    }
  }
}

export function targetExecutionIssue(
  target: unknown,
  userTurns: string[],
  previousTarget?: unknown,
  bindings?: Map<string, Set<string>>,
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
    return modelIssue(value, value.id, userTurns, previousTarget);
  }
  if (/"__proto__":/.test(JSON.stringify(value))) {
    return review(unsupported);
  }
  if (containsSetupSecret(JSON.stringify(value))) {
    return review('Credentials must be referenced through environment variables.');
  }
  const config = record(value.config);
  if (!config.request && !config.url && !value.id.includes('://')) {
    return review('Add the HTTP endpoint URL to test or run this target.');
  }
  if (
    !config.request &&
    !config.multipart &&
    config.body === undefined &&
    config.method !== 'GET'
  ) {
    return review('Add a request body or specify GET to test or run this target.');
  }
  const headers = record(config.headers);
  if (
    Object.values(headers).some((v) => typeof v === 'string' && headerVariable(v)) &&
    config.redirect === undefined &&
    setupHttpTarget.safeParse({ ...value, config: { ...config, redirect: 'error' } }).success
  ) {
    return repair(
      'Set redirect: error on credentialed targets to keep every key at its intended destination.',
    );
  }
  const parsed = setupHttpTarget.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.code === 'unrecognized_keys' ? issue.keys[0] : issue.path[1];
    return review(
      typeof field === 'string' && /^[a-zA-Z_]\w{0,47}$/.test(field)
        ? 'Review ' + field + ' locally before running. Chat cannot safely reproduce this setting.'
        : 'This HTTP request cannot be verified safely in chat. Check the method, URL, headers, body and transforms locally before running.',
    );
  }
  return httpIssue(parsed.data, userTurns, previousTarget, bindings);
}

const methodOf = (config: SetupConnection['config']) =>
  config.method ?? (config.multipart ? 'POST' : 'GET');

function probeVariables(
  config: SetupConnection['config'],
  prompt: string,
  sessionId = crypto.randomUUID(),
) {
  return {
    prompt,
    sessionId,
    tools: JSON.stringify(config.tools),
    tool_choice:
      typeof config.tool_choice === 'string'
        ? config.tool_choice
        : JSON.stringify(config.tool_choice),
  };
}

function probeUrl({ id, config }: SetupConnection, vars: ReturnType<typeof probeVariables>) {
  const url = new URL(config.url ?? id);
  for (const [key, value] of Object.entries(renderVarsInObject(config.queryParams ?? {}, vars))) {
    url.searchParams.append(key, value);
  }
  return url.href;
}

// A repair may correct header spelling, but cannot swap two keys, add a
// credential or change the effective URL (including rendered parameters).
export function sameProbeScope(prior: unknown, next: unknown): boolean {
  // Compare the two requests with the same inputs, including session variables.
  const sessionId = crypto.randomUUID();
  // A fixed sample (e.g. Hello) could match a literal query value even when
  // the real prompt is different. Distinguish trim and URL encoding too.
  const marker = ' ' + crypto.randomUUID() + ' +';
  const scope = (target: unknown) => {
    const parsed = SetupConnectionTest.Request.safeParse(target);
    if (!parsed.success) {
      return;
    }
    const { config } = parsed.data;
    const headers = new Map<string, string>();
    for (const [name, value] of Object.entries(config.headers ?? {})) {
      const key = headerVariable(value);
      if (key) {
        headers.set(name.toLowerCase(), key);
      }
    }
    return {
      url: probeUrl(parsed.data, probeVariables(config, marker, sessionId)),
      method: methodOf(config),
      headers,
      keys: JSON.stringify([...headers.values()].sort()),
    };
  };
  const a = scope(prior);
  const b = scope(next);
  return (
    !!a &&
    !!b &&
    a.url === b.url &&
    a.method === b.method &&
    a.keys === b.keys &&
    [...a.headers].every(([header, key]) => !b.headers.has(header) || b.headers.get(header) === key)
  );
}

const maxBytes = 256 * 1024;
const failure = (message: string) => ({ success: false, message });

function readPath(json: unknown, path: string) {
  let value = json;
  for (const key of path.match(/[\w$-]+/g) ?? []) {
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
const sessionTransform = '{ ...vars, sessionId: context.uuid }';

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

function providerOverride(value: unknown, ids: string[], test = false) {
  if (value === undefined) {
    return false;
  }
  if (!value || typeof value !== 'object') {
    return true;
  }
  const overrides = Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => key !== 'prefix' && key !== 'suffix' && !(test && inlineTestOptions.has(key)),
    ),
  );
  return ids.some((id) => !isSetupModelConfig(id, overrides));
}

function inlineTest(test: unknown, ids: string[]) {
  if (!test || typeof test !== 'object' || 'path' in test) {
    return false;
  }
  // A string or array in vars loads files even without a file:// prefix.
  return (
    !('vars' in test && (typeof test.vars === 'string' || Array.isArray(test.vars))) &&
    !('options' in test && providerOverride(test.options, ids, true))
  );
}

export function localReviewField(config: Record<string, unknown>): string | undefined {
  const { targets, providers, ...rest } = config;
  const ids = [targets ?? providers]
    .flat()
    .map((t) => (typeof t === 'string' ? t : String(record(t).id)));
  const safeTest = (test: unknown) => inlineTest(test, ids);
  const privileged = privilegedField(rest);
  if (privileged) {
    return privileged;
  }
  // Bare paths/globs also load executable prompt and test files. Only inline
  // prompts and test cases are eligible for an agent-initiated browser run.
  const prompts =
    config.prompts === undefined
      ? []
      : Array.isArray(config.prompts)
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
      providerOverride(item?.config, ids)
    ) {
      return 'prompts';
    }
  }
  if (config.defaultTest && !safeTest(config.defaultTest)) {
    return 'defaultTest';
  }
  if (config.tests && (!Array.isArray(config.tests) || !config.tests.every(safeTest))) {
    return 'tests';
  }
  if (
    Array.isArray(config.scenarios) &&
    config.scenarios.some(
      (scenario) =>
        !Array.isArray(scenario?.config) ||
        !scenario.config.every(safeTest) ||
        !Array.isArray(scenario.tests) ||
        !scenario.tests.every(safeTest),
    )
  ) {
    return 'scenarios';
  }
}

// Return field names only. Never put response values, headers or credentials into the chat.
function replyPaths(json: unknown, secrets: string[]) {
  const paths: string[] = [];
  let remaining = SetupConnectionTest.pathBudget - 2; // brackets around the array
  let truncated = false;
  function visit(value: unknown, path: string) {
    // The maximum path length also bounds recursion into nested responses.
    if (path && (!isSetupReplyPath(path) || secrets.some((token) => path.includes(token)))) {
      return;
    }
    if (typeof value === 'string' && value.trim() && path) {
      const size = JSON.stringify(path).length + (paths.length ? 1 : 0);
      if (size > remaining) {
        truncated = true;
        return;
      }
      remaining -= size;
      paths.push(path);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((child, i) => visit(child, path + '[' + i + ']'));
      return;
    }
    for (const [key, child] of Object.entries(record(value))) {
      if (isSecretField(key) || credentialField(key) || looksLikeSecret(key)) {
        continue;
      }
      const childPath = /^[a-z_$][\w$]*$/i.test(key)
        ? (path ? path + '.' : '') + key
        : path + '[' + JSON.stringify(key) + ']';
      visit(child, childPath);
    }
  }
  visit(json, '');
  return { paths, truncated };
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
      ...(transform !== undefined && { retryable: true }),
      message: received + ' Received plain text instead of JSON.',
      paths: ['Plain text'],
    };
  }
  if (transform === 'json') {
    return json
      ? { success: true, message: received + ' Received JSON.' }
      : failure(received + ' Received empty JSON.');
  }
  const path = transform && setupReplyPath(transform);
  if (path) {
    const value = readPath(json, path);
    if (typeof value === 'string' && value.trim()) {
      return { success: true, message: received + ` Found text at ${path}.` };
    }
  }
  const { paths, truncated } = replyPaths(json, secrets);
  const problem = path ? ` No text at ${path}.` : '';
  return {
    success: path === undefined && paths.length > 0,
    ...(path && paths.length > 0 && { retryable: true }),
    message:
      received +
      problem +
      (paths.length ? ' Found candidate text fields.' : ' No readable text field found.') +
      (truncated ? ' More fields omitted.' : ''),
    paths,
  };
}

function probeBody(
  config: SetupConnection['config'],
  headers: Record<string, string>,
  vars: ReturnType<typeof probeVariables>,
) {
  let body: string | FormData | undefined;
  if (config.multipart) {
    delete headers['content-type'];
    body = new FormData();
    for (const part of config.multipart.parts) {
      if (part.kind !== 'field') {
        throw new Error('Unsupported file upload');
      }
      body.append(
        renderVarsInObject(part.name, vars),
        renderVarsInObject(String(part.value), vars),
      );
    }
  } else if (config.body !== undefined) {
    const json = headers['content-type']?.includes('application/json') ?? false;
    const payload = json && typeof config.body === 'string' ? JSON.parse(config.body) : config.body;
    const rendered = renderVarsInObject(payload, vars);
    // Like HttpProvider.processJsonBody, expand serialized nested objects and
    // arrays. Do not recursively interpret strings inside an already parsed value.
    function expand(value: unknown): unknown {
      if (typeof value === 'string' && /^\s*[\[{]/.test(value)) {
        try {
          return JSON.parse(value);
        } catch {}
      }
      if (Array.isArray(value)) {
        return value.map(expand);
      }
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expand(item)]));
      }
      return value;
    }
    body =
      typeof rendered === 'string'
        ? json
          ? rendered
          : rendered.trim()
        : JSON.stringify(expand(rendered));
  }
  return body;
}

export async function testSetupConnection(
  connection: SetupConnection,
  signal: AbortSignal,
  testPrompt?: string,
) {
  if (getEnvBool('PROMPTFOO_DISABLE_TEMPLATING')) {
    return failure('Templates are disabled on this server. Enable them to send a test message.');
  }
  if (containsSetupSecret(JSON.stringify(connection))) {
    return failure('Reference secrets with environment variables.');
  }
  const { config } = connection;
  if (testPrompt !== undefined && !SetupConnectionTest.usesPrompt(config)) {
    return failure(
      'No request sent. Add {{prompt}} to the payload or query to send a custom message, or test the static request as configured.',
    );
  }
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
  const vars = probeVariables(config, testPrompt ?? 'Hello');
  const url = probeUrl(connection, vars);
  const body = probeBody(config, headers, vars);
  const transform = config.transformResponse ?? config.responseParser;
  // One uncached request using the provider's variable renderer, without instantiating
  // a provider, evaluating JavaScript, loading files or following redirects.
  const response = await fetchWithProxy(url, {
    method: methodOf(config),
    headers,
    body,
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
    return {
      ...failure(`HTTP ${response.status} ${STATUS_CODES[response.status] ?? 'Request failed'}.`),
      ...([400, 401, 403, 404, 406, 415, 422].includes(response.status) && { retryable: true }),
    };
  }
  const text = await readBoundedText(response, maxBytes + 1);
  if (Buffer.byteLength(text) > maxBytes) {
    return failure('The reply is too large to inspect here.');
  }
  return inspectReply(text, response.status, transform, secrets);
}
