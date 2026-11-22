import {
  looksLikeCredentialValue,
  looksLikeRequestCredentialParameter,
} from '@app/stores/evalConfig';
import {
  authHeaderName,
  type Field,
  readConnectionSlots,
  replyField,
  type Slots,
} from './agentConnectionLanguage';

import type { ProviderOptions } from '../types';

export interface ConnectionDraft {
  url?: string;
  body?: Record<string, unknown>;
  responsePath?: string;
  authEnv?: string;
  // null means the user requested a key but hasn't named the header.
  authHeader?: string | null;
  openai?: boolean;
  modelName?: string;
  model?: string;
}
const loopback = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:[/?#]|$)/i;

const prompt = '{{prompt}}';
const key = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const reserved = /^(?:__proto__|prototype|constructor)$/;
const unsafe = /\{[{%#]|\$\{|file:\/\//i;
const secretError = 'Leave out secrets. Give the environment variable name that holds your key.';
const pathError =
  'Give the JSON field that holds the reply, like result.answer or choices[0].message.content, or say “plain text”.';
const bodyError =
  'Give the input field name or paste a JSON object with {{prompt}} where the message goes.';
const curlError =
  'Use a POST cURL with a JSON body, or enter the URL alone. For other methods or non-authentication headers, use manual setup.';

function modelId(value: string): boolean {
  // Only text model providers. Never interpret file, executable or coding agent IDs.
  return /^(?:openai:(?:(?:chat|responses):)?(?:gpt-|o[134]\b|chatgpt-)[\w.-]*|anthropic:(?:messages:)?claude-(?!code\b|agent\b)[\w.-]+|google:gemini-[\w.-]+|ollama:(?:chat:)?[\w.-]+(?:[/:][\w.-]+)*)$/.test(
    value,
  );
}

function endpoint(value: string): string {
  if (loopback.test(value)) {
    value = 'http://' + value;
  }
  if (looksLikeCredentialValue(value)) {
    throw new Error(secretError);
  }
  if (
    !/^https?:\/\//i.test(value) ||
    unsafe.test(value) ||
    /[\s\\]/.test(value) ||
    !URL.canParse(value)
  ) {
    throw new Error(
      'Enter a full HTTP(S) URL, a POST cURL request, or a model ID like ollama:chat:llama3.',
    );
  }
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.hash ||
    [...url.searchParams.keys()].some(looksLikeRequestCredentialParameter)
  ) {
    throw new Error('Use an endpoint without embedded credentials or a fragment.');
  }
  return value;
}

function object(value: string, message: string): Record<string, unknown> {
  try {
    const result = JSON.parse(value);
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      return result;
    }
  } catch {}
  throw new Error(message);
}

// A valid but ambiguous example can be clarified without discarding other
// settings from the same message. Unsafe or malformed input still fails.
class AmbiguousExample extends Error {}

function requestBody(input: string): Record<string, unknown> {
  const fields = input.split('.');
  const body =
    fields.every((field) => key.test(field)) && fields.length <= 16
      ? fields.reduceRight<Record<string, unknown>>(
          (nested, field, index) => ({ [field]: index === fields.length - 1 ? prompt : nested }),
          {},
        )
      : object(input, bodyError);
  let hasPrompt = false;
  // JSON.stringify visits nested fields and arrays without evaluating user input.
  JSON.stringify(body, (name, value) => {
    if (name === '$ref') {
      throw new Error('Paste inline JSON. A $ref could load a file or URL when the scan runs.');
    }
    if (reserved.test(name) || unsafe.test(name)) {
      throw new Error(bodyError);
    }
    if (
      looksLikeRequestCredentialParameter(name) ||
      (typeof value === 'string' && looksLikeCredentialValue(value))
    ) {
      throw new Error(secretError);
    }
    if (typeof value === 'string') {
      if (unsafe.test(value.split(prompt).join(''))) {
        throw new Error('Use {{prompt}} as the only template in your request.');
      }
      hasPrompt ||= value.includes(prompt);
    }
    return value;
  });
  if (!hasPrompt) {
    let node = body;
    while (true) {
      const fields = Object.keys(node);
      if (fields.length !== 1) {
        throw new AmbiguousExample(bodyError);
      }
      const entry = node[fields[0]];
      if (typeof entry === 'string') {
        node[fields[0]] = prompt;
        break;
      }
      if (!entry || typeof entry !== 'object') {
        throw new AmbiguousExample(bodyError);
      }
      node = entry as Record<string, unknown>;
    }
  }
  return body;
}

function responsePath(answer: string): string {
  const value = answer;
  if (/^(?:plain\s*text|raw text)$/i.test(value)) {
    return '';
  }
  if (value.startsWith('{')) {
    let node: unknown = object(value, pathError);
    let path = 'json';
    while (node && typeof node === 'object') {
      const entries: [string, unknown][] = Object.entries(node);
      if (entries.length !== 1) {
        throw new AmbiguousExample(pathError);
      }
      const [field, next] = entries[0];
      if (Array.isArray(node)) {
        path += '[0]';
      } else if (key.test(field)) {
        path += '.' + field;
      } else {
        throw new Error(pathError);
      }
      node = next;
    }
    if (typeof node !== 'string') {
      throw new Error(pathError);
    }
    return responsePath(path);
  }
  const path = replyField(value);
  if (!path) {
    throw new Error(pathError);
  }
  return path;
}

function authEnv(value: string): string {
  if (
    /^(?:none|no(?: auth(?:entication)?| token)?|public)(?: (?:needed|required))?[.!]?$/i.test(
      value,
    )
  ) {
    return '';
  }
  const name = value
    .replace(/^(?:bearer(?: token (?:in|from))?\s+|env(?:ironment variable)?\s+)/i, '')
    .replace(/^(?:\$\{(\w+)\}|\{\{\s*env\.(\w+)\s*\}\}|\$(\w+))$/, '$1$2$3');
  if (!/^[A-Z_][A-Z0-9_]{0,127}$/.test(name) || looksLikeCredentialValue(name)) {
    throw new Error(
      'Enter the environment variable name, like APP_TOKEN, or say “no auth”. Never paste the key.',
    );
  }
  return name;
}

// Parse a small, explicit subset. Never execute a shell command or silently drop flags.
function parseCurl(input: string): ConnectionDraft {
  const tokens = input.replace(/\\\r?\n/g, ' ').match(/'[^']*'|"[^"]*"|[^\s]+/g) ?? [];
  const draft: ConnectionDraft = {};
  for (let i = 1; i < tokens.length; i++) {
    const token = unquote(tokens[i]);
    if ((/^https?:/i.test(token) || loopback.test(token)) && !draft.url) {
      draft.url = endpoint(token);
      continue;
    }
    const value = unquote(tokens[++i] ?? '');
    if (['-X', '--request'].includes(token) && value.toUpperCase() === 'POST') {
      continue;
    }
    if (['-d', '--data', '--data-raw', '--json', '--data-binary'].includes(token) && !draft.body) {
      draft.body = requestBody(value);
    } else if (['-H', '--header'].includes(token)) {
      if (/^content-type:\s*application\/json$/i.test(value)) {
        continue;
      }
      const auth = value.match(
        /^([\w-]+):\s*(bearer\s+)?(\$\w+|\$\{\w+\}|\{\{\s*env\.\w+\s*\}\})$/i,
      );
      const name = auth && authHeaderName(auth[1]);
      if (!auth || draft.authEnv || !name || (name === 'Authorization') !== Boolean(auth[2])) {
        throw new Error(
          'Use a single authentication header with an environment variable. Remove secrets or use manual setup.',
        );
      }
      if (!auth[2]) {
        draft.authHeader = name;
      }
      draft.authEnv = authEnv(auth[3]);
    } else {
      throw new Error(curlError);
    }
  }
  if (!draft.url || !draft.body) {
    throw new Error(curlError);
  }
  return { ...draft, authEnv: draft.authEnv ?? '' };
}

function unquote(value: string) {
  return value.replace(/^(['"])([\s\S]*)\1$/, '$2');
}

export function parseConnection(
  answer: string,
  draft: ConnectionDraft,
  field: Field,
): ConnectionDraft {
  const next = readConnection(answer.trim(), draft, field);
  if (next.url && next.authEnv) {
    const url = new URL(next.url);
    if (url.protocol !== 'https:' && !loopback.test(url.hostname)) {
      throw new Error('Use HTTPS to send credentials outside localhost. What is the secure URL?');
    }
  }
  return next;
}

function readConnection(value: string, draft: ConnectionDraft, field: Field): ConnectionDraft {
  if (/^curl\s/i.test(value)) {
    return parseCurl(value);
  }
  const model =
    value.match(
      /^(?:actually[, ]+)?(?:use|switch to|try|the model is) (\S+?)(?: instead)?[.!]?$/i,
    )?.[1] ?? value;
  if (modelId(model)) {
    const switchProvider = /^(?:actually[, ]+)?switch to /i.test(value);
    if (field === 'modelName' || (draft.openai && !switchProvider)) {
      const next = { ...draft };
      updateModelName(next, { modelName: model });
      return next;
    }
    return { model };
  }
  const slots = connectionSlots(
    field === 'modelName' && model !== value && !model.includes('://') ? model : value,
    field,
  );
  return applySlots(draft, slots);
}

function applySlots(draft: ConnectionDraft, slots: Slots): ConnectionDraft {
  const url = slots.url ? endpoint(slots.url) : draft.url;
  // Keep answers given before the URL, but never send a previous host's
  // credentials or request body to a different origin.
  const replacing =
    draft.model || (draft.url && url && new URL(url).origin !== new URL(draft.url).origin);
  const next: ConnectionDraft = replacing ? {} : { ...draft };
  if (url) {
    next.url = url;
  }
  if (slots.openai && !next.openai) {
    next.openai = true;
    next.body = { messages: [{ role: 'user', content: prompt }] };
    next.responsePath = 'choices[0].message.content';
  }
  for (const field of ['body', 'responsePath', 'authEnv'] as const) {
    const value = slots[field];
    if (value === undefined) {
      continue;
    }
    if (value === null) {
      delete next[field];
      continue;
    }
    try {
      if (field === 'body') {
        next.body = requestBody(value);
      } else {
        next[field] = field === 'authEnv' ? authEnv(value) : responsePath(value);
      }
    } catch (error) {
      if (!(error instanceof AmbiguousExample) || Object.keys(slots).length === 1) {
        throw error;
      }
      delete next[field];
    }
  }
  updateAuthHeader(next, slots);
  updateModelName(next, slots);
  return next;
}

function updateAuthHeader(next: ConnectionDraft, slots: Slots) {
  if (slots.authEnv !== undefined && next.authEnv === '') {
    delete next.authHeader;
    return;
  }
  const header = slots.authHeader;
  if (header === undefined) {
    return;
  }
  if (next.authEnv === '') {
    delete next.authEnv;
  }
  const name = header && authHeaderName(header);
  if (name === 'Authorization') {
    if (next.authHeader !== undefined || slots.authEnv === undefined || next.openai) {
      next.authHeader = 'Authorization';
    }
  } else if (header === null || name) {
    next.authHeader = header;
  } else {
    throw new Error(
      'Choose X-API-Key or Authorization: Bearer, or use manual setup for other headers. Never paste a key here.',
    );
  }
}

function updateModelName(next: ConnectionDraft, slots: Slots) {
  if (slots.body?.startsWith('{') && next.openai) {
    next.modelName = typeof next.body?.model === 'string' ? next.body.model : '';
  }
  const name = slots.modelName ?? next.modelName;
  if (name === undefined) {
    return;
  }
  if (
    name &&
    (!/^[a-z0-9][\w.:/-]{0,199}$/i.test(name) ||
      name.includes('://') ||
      /^sk-/i.test(name) ||
      looksLikeCredentialValue(name))
  ) {
    throw new Error('Give the model name without credentials, URLs, or templates.');
  }
  next.modelName = name;
  if (next.body) {
    next.body = { ...next.body };
    if (name) {
      next.body.model = name;
    } else {
      delete next.body.model;
    }
  }
}

function connectionSlots(value: string, field: Field): Slots {
  // Keep standalone values intact, particularly JSON, expressions and URLs.
  // The prose reader must never turn a rejected expression into a valid field.
  if (/^https?:\/\/\S+$/i.test(value) || (loopback.test(value) && !/\s/.test(value))) {
    return { url: value };
  }
  if (
    field === 'modelName' &&
    /^(?:skip|none|remove|omit|no)(?: (?:the )?model(?: name)?)?[.!]?$/i.test(value)
  ) {
    return { modelName: '' };
  }
  if (/^(?:plain|raw) text$/i.test(value)) {
    return { responsePath: value };
  }
  if (value.startsWith('{') && !value.startsWith('{{') && value.endsWith('}')) {
    return field === 'responsePath' ? { responsePath: value } : { body: value };
  }
  if (!/\s/.test(value)) {
    const header = /^bearer$/i.test(value) ? 'Authorization' : authHeaderName(value);
    if (header) {
      return { authHeader: header };
    }
    if (/^openai-(?:compatible|style|like)$/i.test(value)) {
      return { openai: true };
    }
    if (/^(?:[A-Z][A-Z0-9_]+_(?:TOKEN|KEY)|\$[A-Z_][A-Z0-9_]*)$/.test(value)) {
      return { authEnv: value };
    }
    return { [field]: value.replace(/^(['"`])([\w.\[\]]+)\1$/, '$2') };
  }
  const slots = readConnectionSlots(value, field);
  return Object.keys(slots).length ? slots : { [field]: value };
}

export function toTarget(draft: ConnectionDraft): ProviderOptions | undefined {
  if (draft.model && modelId(draft.model)) {
    return { id: draft.model, config: {} };
  }
  if (
    !draft.url ||
    !draft.body ||
    draft.responsePath === undefined ||
    draft.authEnv === undefined ||
    draft.authHeader === null
  ) {
    return undefined;
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (draft.authEnv) {
    const header = authHeaderName(draft.authHeader || 'Authorization');
    if (!header) {
      return undefined;
    }
    const variable = '{{env.' + authEnv(draft.authEnv) + '}}';
    if (header === 'Authorization') {
      headers.Authorization = 'Bearer ' + variable;
    } else {
      headers[header] = variable;
    }
  }
  return {
    id: 'http',
    label: new URL(draft.url).host,
    config: {
      url: draft.url,
      method: 'POST',
      headers,
      // Fetch forwards custom headers across origins on redirects.
      ...(draft.authEnv && !headers.Authorization && { redirect: 'error' as const }),
      body: draft.body,
      transformResponse: draft.responsePath
        ? 'json.' + responsePath('json.' + draft.responsePath)
        : 'text',
    },
  };
}
