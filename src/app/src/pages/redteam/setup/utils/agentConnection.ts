import {
  looksLikeCredentialValue,
  looksLikeRequestCredentialParameter,
} from '@app/stores/evalConfig';
import { isSetupReplyPath } from '@promptfoo/types/api/redteamSetup';
import { readConnectionSlots } from './agentConnectionLanguage';

import type { ProviderOptions } from '../types';

export interface ConnectionDraft {
  url?: string;
  body?: Record<string, unknown>;
  responsePath?: string;
  authEnv?: string;
  model?: string;
}
type Field = 'url' | 'body' | 'responsePath' | 'authEnv';

const prompt = '{{prompt}}';
const key = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const reserved = /^(?:__proto__|prototype|constructor)$/;
const unsafe = /\{[{%#]|\$\{|file:\/\//i;
const secretError = 'Leave out secrets. For bearer auth, give the environment variable name only.';
const pathError =
  'Give the JSON field that holds the reply, like result.answer or choices[0].message.content, or say “plain text”.';
const bodyError =
  'Give the input field name or paste a JSON object with {{prompt}} where the message goes.';
const curlError =
  'Use a POST cURL with a JSON body, or enter the URL alone. For other methods or custom headers, use manual setup.';

function modelId(value: string): boolean {
  // Only text model providers. Never interpret file, executable or coding agent IDs.
  return /^(?:openai:(?:(?:chat|responses):)?(?:gpt-|o[134]\b|chatgpt-)[\w.-]*|anthropic:(?:messages:)?claude-(?!code\b|agent\b)[\w.-]+|google:gemini-[\w.-]+|ollama:(?:chat:)?[\w.-]+(?:[/:][\w.-]+)*)$/.test(
    value,
  );
}

function endpoint(value: string): string {
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
  const path = value.replace(/^(?:json|\$)\./, '');
  // The HTTP provider evaluates transformResponse. Accept property reads only.
  if (!isSetupReplyPath(path)) {
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
  if (!/^[A-Z_][A-Z0-9_]*$/.test(name) || looksLikeCredentialValue(name)) {
    throw new Error(
      'Enter the bearer token’s environment variable name, like APP_TOKEN, or say “no auth”. Never paste the token.',
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
    if (/^https?:/i.test(token) && !draft.url) {
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
        /^authorization:\s*bearer\s+(\$\w+|\$\{\w+\}|\{\{\s*env\.\w+\s*\}\})$/i,
      );
      if (!auth || draft.authEnv) {
        throw new Error(
          'Only JSON and bearer environment variable headers are supported here. Remove any secrets or use manual setup.',
        );
      }
      draft.authEnv = authEnv(auth[1]);
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
  const value = answer.trim();
  if (/^curl\s/i.test(value)) {
    return parseCurl(value);
  }
  const model =
    value.match(
      /^(?:actually[, ]+)?(?:use|switch to|try|the model is) (\S+?)(?: instead)?[.!]?$/i,
    )?.[1] ?? value;
  if (modelId(model)) {
    return { model };
  }
  const slots = connectionSlots(value, field);
  const url = slots.url ? endpoint(slots.url) : draft.url;
  // Keep answers given before the URL, but never send a previous host's
  // credentials or request body to a different origin.
  const replacing =
    draft.model || (draft.url && url && new URL(url).origin !== new URL(draft.url).origin);
  const next: ConnectionDraft = replacing ? {} : { ...draft };
  if (url) {
    next.url = url;
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
  return next;
}

function connectionSlots(value: string, field: Field): Partial<Record<Field, string | null>> {
  // Keep standalone values intact, particularly JSON, expressions and URLs.
  // The prose reader must never turn a rejected expression into a valid field.
  if (/^https?:\/\/\S+$/i.test(value)) {
    return { url: value };
  }
  if (/^(?:plain|raw) text$/i.test(value)) {
    return { responsePath: value };
  }
  if (value.startsWith('{') && !value.startsWith('{{') && value.endsWith('}')) {
    return field === 'responsePath' ? { responsePath: value } : { body: value };
  }
  if (!/\s/.test(value)) {
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
    draft.authEnv === undefined
  ) {
    return undefined;
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (draft.authEnv) {
    headers.Authorization = 'Bearer {{env.' + authEnv(draft.authEnv) + '}}';
  }
  return {
    id: 'http',
    label: new URL(draft.url).host,
    config: {
      url: draft.url,
      method: 'POST',
      headers,
      body: draft.body,
      transformResponse: draft.responsePath
        ? 'json.' + responsePath('json.' + draft.responsePath)
        : 'text',
    },
  };
}
