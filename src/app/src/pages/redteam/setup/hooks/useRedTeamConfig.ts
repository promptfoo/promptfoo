import {
  looksLikeCredentialHeader,
  looksLikeCredentialValue,
  looksLikeRequestCredentialParameter,
} from '@app/stores/evalConfig';
import { REDTEAM_DEFAULTS } from '@promptfoo/redteam/constants';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getProviderType } from '../components/Targets/helpers';
import {
  getCurrentTargetConfigInvalidMarker,
  registerTargetConfigReconciler,
  useRedTeamTargetConfigValidation,
} from './useRedTeamTargetConfigValidation';
import type { Plugin } from '@promptfoo/redteam/constants';

import type { ApplicationDefinition, Config, ProviderOptions } from '../types';

interface RecentlyUsedPlugins {
  plugins: Plugin[];
  addPlugin: (plugin: Plugin) => void;
}

const NUM_RECENT_PLUGINS = 6;
const STRUCTURED_FOUNDATION_PROVIDER_TYPES = [
  'openai',
  'anthropic',
  'google',
  'vertex',
  'mistral',
  'cohere',
  'groq',
  'deepseek',
  'azure',
  'bedrock',
  'openrouter',
  'perplexity',
  'cerebras',
  'xai',
  'cloudflare-ai',
  'ai21',
  'voyage',
  'fireworks',
  'huggingface',
];
const AGENTIC_PROVIDER_IDS = [
  'anthropic:claude-agent-sdk',
  'anthropic:claude-code',
  'openai:codex',
  'openai:codex-app-server',
  'openai:codex-desktop',
  'openai:codex-sdk',
  'openai:agents',
  'openai:chatkit',
  'openai:assistant',
  'azure:assistant',
  'azure:foundry-agent',
  'bedrock-agent',
  'bedrock:agents',
  'bedrock:kb',
  'bedrock:knowledge-base',
  'openinterpreter',
  'opencode',
  'opencode:sdk',
];
let recoverableNonObjectTargetMarker: string | null = null;
let recoverableValidImportTargetMarker: string | null = null;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isPersistedNonObjectTargetDraft = (draft: string | null): boolean => {
  if (typeof window === 'undefined' || draft === null) {
    return false;
  }

  try {
    const persisted = window.localStorage.getItem('redTeamConfig');
    if (!persisted) {
      return false;
    }
    const target = (
      JSON.parse(persisted) as { state?: { config?: { target?: { config?: unknown } } } }
    ).state?.config?.target;
    if (!target || !('config' in target) || isPlainObject(target.config)) {
      return false;
    }
    return (JSON.stringify(target.config) ?? 'null') === draft;
  } catch {
    return false;
  }
};

const isValidMultipartConfig = (multipart: unknown): boolean => {
  if (
    !isPlainObject(multipart) ||
    !Array.isArray(multipart.parts) ||
    multipart.parts.length === 0
  ) {
    return false;
  }

  return multipart.parts.every((part: unknown) => {
    if (!isPlainObject(part) || typeof part.name !== 'string') {
      return false;
    }
    if (part.kind === 'field') {
      return ['string', 'number', 'boolean'].includes(typeof part.value);
    }
    if (part.kind !== 'file' || !isPlainObject(part.source)) {
      return false;
    }
    if (
      ['filename', 'filenameTemplate', 'contentType'].some(
        (key) => part[key] !== undefined && typeof part[key] !== 'string',
      )
    ) {
      return false;
    }
    if (part.source.type === 'path') {
      return typeof part.source.path === 'string';
    }
    return (
      part.source.type === 'generated' &&
      (part.source.generator === undefined || part.source.generator === 'basic-document') &&
      (part.source.format === undefined ||
        (typeof part.source.format === 'string' &&
          ['pdf', 'png', 'jpeg', 'jpg'].includes(part.source.format))) &&
      (part.source.text === undefined || typeof part.source.text === 'string')
    );
  });
};

const isValidHttpUrlOrTemplate = (value: unknown): boolean => {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }
  const containsTemplate = /{{[\s\S]*}}|{%[\s\S]*%}|{#[\s\S]*#}/.test(value);
  const normalizedValue = containsTemplate
    ? value.replace(/{{[\s\S]*?}}|{%[\s\S]*?%}|{#[\s\S]*?#}/g, 'placeholder')
    : value;
  try {
    const url = new URL(normalizedValue);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return containsTemplate && /^(?:{{|{%|{#)/.test(value.trim());
  }
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isSimpleNunjucksInterpolation = (value: unknown): boolean =>
  typeof value === 'string' && /^{{\s*[A-Za-z_][\w-]*\s*}}$/.test(value);

const RAW_HTTP_METHODS = new Set([
  'ACL',
  'BIND',
  'CHECKOUT',
  'COPY',
  'DELETE',
  'GET',
  'HEAD',
  'LINK',
  'LOCK',
  'M-SEARCH',
  'MERGE',
  'MKACTIVITY',
  'MKCALENDAR',
  'MKCOL',
  'MOVE',
  'NOTIFY',
  'OPTIONS',
  'PATCH',
  'POST',
  'PROPFIND',
  'PROPPATCH',
  'PURGE',
  'PUT',
  'QUERY',
  'REBIND',
  'REPORT',
  'SEARCH',
  'SOURCE',
  'SUBSCRIBE',
  'UNBIND',
  'UNLINK',
  'UNLOCK',
  'UNSUBSCRIBE',
]);

const isSafeBrowserNavigateUrl = (value: unknown): boolean => {
  return isValidHttpUrlOrTemplate(value);
};

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isPlainObject(value) && Object.values(value).every((item) => typeof item === 'string');

const isValidHeaderName = (value: unknown): value is string =>
  typeof value === 'string' && /^[!#$%&'*+\-.^_\x60|~\dA-Za-z]+$/.test(value);

const isValidHeaderValue = (value: unknown): value is string =>
  typeof value === 'string' &&
  [...value].every((character) => {
    const code = character.charCodeAt(0);
    return code === 9 || (code >= 32 && code <= 255 && code !== 127);
  });

const isValidHeaders = (value: unknown): boolean =>
  isStringRecord(value) &&
  Object.entries(value).every(
    ([name, headerValue]) => isValidHeaderName(name) && isValidHeaderValue(headerValue),
  );

const isValidRawHttpRequest = (value: unknown): boolean => {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }
  const lines = value.trim().split(/\r?\n/);
  const requestLine = lines.shift() ?? '';
  const requestLineMatch = requestLine.match(/^(\S+)\s+(\S+)\s+HTTP\/\d(?:\.\d)?$/i);
  const requestMethod = requestLineMatch?.[1];
  if (
    !requestLineMatch ||
    !requestMethod ||
    (!RAW_HTTP_METHODS.has(requestMethod) && !isSimpleNunjucksInterpolation(requestMethod))
  ) {
    return false;
  }
  const requestTarget = requestLineMatch[2];
  let host: string | null = null;
  for (const line of lines) {
    if (!line.trim()) {
      break;
    }
    const separator = line.indexOf(':');
    if (separator < 1) {
      return false;
    }
    const name = line.slice(0, separator).trim();
    const headerValue = line.slice(separator + 1).trim();
    if (!isValidHeaderName(name) || !isValidHeaderValue(headerValue)) {
      return false;
    }
    if (name.toLowerCase() === 'host' && headerValue) {
      host = headerValue;
    }
  }
  if (!host || !isValidHttpUrlOrTemplate(`http://${host}`)) {
    return false;
  }
  return (
    (requestTarget.startsWith('/') && !requestTarget.startsWith('//')) ||
    isValidHttpUrlOrTemplate(requestTarget)
  );
};

const isValidHttpAuth = (auth: unknown): boolean => {
  if (auth === undefined) {
    return true;
  }
  if (!isPlainObject(auth) || typeof auth.type !== 'string') {
    return false;
  }
  if (auth.type === 'basic') {
    return typeof auth.username === 'string' && typeof auth.password === 'string';
  }
  if (auth.type === 'bearer') {
    return isValidHeaderValue(auth.token);
  }
  if (auth.type === 'api_key') {
    return (
      typeof auth.value === 'string' &&
      typeof auth.keyName === 'string' &&
      typeof auth.placement === 'string' &&
      ['header', 'query'].includes(auth.placement) &&
      (auth.placement === 'query' ||
        (isValidHeaderName(auth.keyName) && isValidHeaderValue(auth.value)))
    );
  }
  if (auth.type === 'file') {
    return isNonEmptyString(auth.path);
  }
  if (auth.type !== 'oauth' || !isValidHttpUrlOrTemplate(auth.tokenUrl)) {
    return false;
  }
  if (
    auth.scopes !== undefined &&
    (!Array.isArray(auth.scopes) || auth.scopes.some((scope) => typeof scope !== 'string'))
  ) {
    return false;
  }
  if (auth.grantType === 'password') {
    return (
      typeof auth.username === 'string' &&
      typeof auth.password === 'string' &&
      (auth.clientId === undefined || typeof auth.clientId === 'string') &&
      (auth.clientSecret === undefined || typeof auth.clientSecret === 'string')
    );
  }
  return (
    auth.grantType === 'client_credentials' &&
    typeof auth.clientId === 'string' &&
    typeof auth.clientSecret === 'string'
  );
};

const isValidHttpConfig = (config: Record<string, unknown>): boolean => {
  const transformFields = [
    'sessionParser',
    'transformRequest',
    'transformResponse',
    'validateStatus',
    'responseParser',
  ];
  if (
    (config.body !== undefined &&
      typeof config.body !== 'string' &&
      !Array.isArray(config.body) &&
      !isPlainObject(config.body)) ||
    (config.headers !== undefined && !isValidHeaders(config.headers)) ||
    (config.maxRetries !== undefined &&
      (typeof config.maxRetries !== 'number' ||
        !Number.isFinite(config.maxRetries) ||
        config.maxRetries < 0)) ||
    (config.method !== undefined &&
      (typeof config.method !== 'string' ||
        (!/^[!#$%&'*+\-.^_\x60|~\dA-Za-z]+$/.test(config.method) &&
          !isSimpleNunjucksInterpolation(config.method)) ||
        ['CONNECT', 'TRACE', 'TRACK'].includes(config.method.toUpperCase()))) ||
    (config.queryParams !== undefined && !isStringRecord(config.queryParams)) ||
    (config.request !== undefined && typeof config.request !== 'string') ||
    (config.tools !== undefined && !Array.isArray(config.tools)) ||
    (config.transformToolsFormat !== undefined &&
      (typeof config.transformToolsFormat !== 'string' ||
        !['openai', 'anthropic', 'bedrock', 'google'].includes(config.transformToolsFormat))) ||
    (config.useHttps !== undefined && typeof config.useHttps !== 'boolean') ||
    (config.sessionSource !== undefined &&
      (typeof config.sessionSource !== 'string' ||
        !['client', 'server', 'endpoint'].includes(config.sessionSource))) ||
    (config.stateful !== undefined && typeof config.stateful !== 'boolean') ||
    (config.url !== undefined && typeof config.url !== 'string') ||
    !isValidHttpAuth(config.auth) ||
    transformFields.some(
      (field) =>
        config[field] !== undefined &&
        typeof config[field] !== 'string' &&
        typeof config[field] !== 'function',
    ) ||
    (config.tokenEstimation !== undefined &&
      (!isPlainObject(config.tokenEstimation) ||
        (config.tokenEstimation.enabled !== undefined &&
          typeof config.tokenEstimation.enabled !== 'boolean') ||
        (config.tokenEstimation.multiplier !== undefined &&
          (typeof config.tokenEstimation.multiplier !== 'number' ||
            !Number.isFinite(config.tokenEstimation.multiplier) ||
            config.tokenEstimation.multiplier < 0.01))))
  ) {
    return false;
  }
  if (config.session === undefined) {
    return true;
  }
  if (!isPlainObject(config.session)) {
    return false;
  }
  return (
    isValidHttpUrlOrTemplate(config.session.url) &&
    (config.session.method === undefined ||
      (typeof config.session.method === 'string' &&
        ['GET', 'POST'].includes(config.session.method))) &&
    (config.session.headers === undefined || isValidHeaders(config.session.headers)) &&
    (config.session.body === undefined ||
      typeof config.session.body === 'string' ||
      isPlainObject(config.session.body)) &&
    (typeof config.session.responseParser === 'string' ||
      typeof config.session.responseParser === 'function')
  );
};

const isValidA2AAuth = (auth: unknown): boolean => {
  if (auth === undefined) {
    return true;
  }
  if (!isPlainObject(auth) || typeof auth.type !== 'string') {
    return false;
  }
  if (['', 'none', 'no_auth'].includes(auth.type)) {
    return true;
  }
  if (auth.type === 'bearer') {
    return isValidHeaderValue(auth.token);
  }
  if (auth.type === 'basic') {
    return typeof auth.username === 'string' && typeof auth.password === 'string';
  }
  if (auth.type === 'api_key') {
    return (
      (isNonEmptyString(auth.value) || isNonEmptyString(auth.api_key)) &&
      (auth.keyName === undefined || typeof auth.keyName === 'string') &&
      (auth.placement === undefined ||
        (typeof auth.placement === 'string' && ['header', 'query'].includes(auth.placement))) &&
      (auth.placement === 'query' ||
        ((auth.keyName === undefined || isValidHeaderName(auth.keyName)) &&
          (auth.value === undefined || isValidHeaderValue(auth.value)) &&
          (auth.api_key === undefined || isValidHeaderValue(auth.api_key))))
    );
  }
  if (auth.type !== 'oauth') {
    return false;
  }
  const validScopes =
    auth.scopes === undefined ||
    typeof auth.scopes === 'string' ||
    (Array.isArray(auth.scopes) && auth.scopes.every((scope) => typeof scope === 'string'));
  if (!validScopes || (auth.tokenUrl !== undefined && !isValidHttpUrlOrTemplate(auth.tokenUrl))) {
    return false;
  }
  if (auth.grantType === 'password') {
    return typeof auth.username === 'string' && typeof auth.password === 'string';
  }
  return (
    (auth.grantType === undefined || auth.grantType === 'client_credentials') &&
    typeof auth.clientId === 'string' &&
    typeof auth.clientSecret === 'string'
  );
};

const isValidA2AConfig = (config: Record<string, unknown>): boolean => {
  if (
    (config.mode !== undefined &&
      (typeof config.mode !== 'string' || !['auto', 'send', 'stream'].includes(config.mode))) ||
    (config.timeoutMs !== undefined &&
      (typeof config.timeoutMs !== 'number' ||
        !Number.isFinite(config.timeoutMs) ||
        config.timeoutMs < 1)) ||
    (config.protocolVersion !== undefined && typeof config.protocolVersion !== 'string') ||
    (config.tenant !== undefined && typeof config.tenant !== 'string') ||
    (config.headers !== undefined && !isValidHeaders(config.headers)) ||
    (config.configuration !== undefined && !isPlainObject(config.configuration)) ||
    (config.message !== undefined && !isPlainObject(config.message)) ||
    (config.transformResponse !== undefined &&
      typeof config.transformResponse !== 'string' &&
      typeof config.transformResponse !== 'function') ||
    !isValidA2AAuth(config.auth) ||
    (config.message !== undefined &&
      (!isPlainObject(config.message) ||
        (config.message.contextId !== undefined && typeof config.message.contextId !== 'string') ||
        (config.message.messageId !== undefined && typeof config.message.messageId !== 'string') ||
        (config.message.role !== undefined && typeof config.message.role !== 'string') ||
        (config.message.parts !== undefined &&
          (!Array.isArray(config.message.parts) ||
            config.message.parts.some(
              (part) =>
                !isPlainObject(part) ||
                (part.text !== undefined &&
                  typeof part.text !== 'string' &&
                  (!isPlainObject(part.text) ||
                    (part.text.text !== undefined && typeof part.text.text !== 'string'))),
            )))))
  ) {
    return false;
  }
  if (config.polling === undefined) {
    return true;
  }
  if (!isPlainObject(config.polling)) {
    return false;
  }
  return (
    (config.polling.enabled === undefined || typeof config.polling.enabled === 'boolean') &&
    (config.polling.intervalMs === undefined ||
      (typeof config.polling.intervalMs === 'number' &&
        Number.isFinite(config.polling.intervalMs) &&
        config.polling.intervalMs >= 0)) &&
    (config.polling.timeoutMs === undefined ||
      (typeof config.polling.timeoutMs === 'number' &&
        Number.isFinite(config.polling.timeoutMs) &&
        config.polling.timeoutMs >= 1))
  );
};

const isValidBrowserStep = (step: unknown): boolean => {
  if (!isPlainObject(step) || typeof step.action !== 'string') {
    return false;
  }
  if (step.args !== undefined && !isPlainObject(step.args)) {
    return false;
  }
  const args = step.args ?? {};
  const isValidSelector = (selector: unknown): boolean => {
    if (!isNonEmptyString(selector)) {
      return false;
    }
    if (isSimpleNunjucksInterpolation(selector)) {
      return true;
    }
    const stack: string[] = [];
    const selectorSegments: string[] = [];
    let quote: string | null = null;
    let escaped = false;
    let segmentStart = 0;
    for (let index = 0; index < selector.length; index++) {
      const character = selector[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === '\\') {
        escaped = true;
        continue;
      }
      if (quote !== null) {
        if (character === quote) {
          quote = null;
        }
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        continue;
      }
      if (character === '[' || character === '(') {
        stack.push(character);
        continue;
      }
      if (
        (character === ']' && stack.pop() !== '[') ||
        (character === ')' && stack.pop() !== '(')
      ) {
        return false;
      }
      if (character === '>' && selector[index + 1] === '>' && stack.length === 0) {
        selectorSegments.push(selector.slice(segmentStart, index));
        segmentStart = index + 2;
        index++;
      }
    }
    if (quote !== null || escaped || stack.length !== 0) {
      return false;
    }
    if (typeof document === 'undefined') {
      return true;
    }
    selectorSegments.push(selector.slice(segmentStart));
    for (const rawSegment of selectorSegments) {
      const segment = rawSegment.trim();
      if (!segment) {
        return false;
      }
      const engineMatch = segment.match(/^(\*?[\w:-]+)=(.*)$/s);
      const engineName = engineMatch?.[1].replace(/^\*/, '');
      const isQuotedText =
        segment.length > 1 &&
        ((segment.startsWith('"') && segment.endsWith('"')) ||
          (segment.startsWith("'") && segment.endsWith("'")));
      if (isQuotedText) {
        continue;
      }
      const isImplicitXPath = /^\(*\/\//.test(segment) || segment.startsWith('..');
      const isExplicitXPath = engineName?.startsWith('xpath') ?? false;
      if (isImplicitXPath || isExplicitXPath) {
        const xpathSelector = isExplicitXPath ? engineMatch?.[2].trim() : segment;
        if (!xpathSelector) {
          return false;
        }
        try {
          document.evaluate(xpathSelector, document, null, 0, null);
        } catch {
          return false;
        }
        continue;
      }
      if (engineMatch) {
        const supportedEngines = new Set([
          'css',
          'css:light',
          'xpath',
          'xpath:light',
          'text',
          'text:light',
          'id',
          'id:light',
          'data-testid',
          'data-testid:light',
          'data-test-id',
          'data-test-id:light',
          'data-test',
          'data-test:light',
          '_react',
          '_vue',
          'role',
          'nth',
          'visible',
        ]);
        if (!engineName || !supportedEngines.has(engineName)) {
          return false;
        }
        if (!engineName.startsWith('css')) {
          if (!engineMatch[2].trim()) {
            return false;
          }
          continue;
        }
      }
      const cssSelector = engineMatch ? engineMatch[2].trim() : segment;
      if (
        /:(?:has-text|text|text-is|text-matches|visible|nth-match|right-of|left-of|above|below|near)(?:\(|\b)/.test(
          cssSelector,
        )
      ) {
        continue;
      }
      try {
        document.createDocumentFragment().querySelector(cssSelector);
      } catch {
        return false;
      }
    }
    return true;
  };

  switch (step.action) {
    case 'navigate':
      return isSafeBrowserNavigateUrl(args.url) || isSimpleNunjucksInterpolation(args.url);
    case 'click':
      return isValidSelector(args.selector);
    case 'type':
      return isValidSelector(args.selector) && isNonEmptyString(args.text);
    case 'extract':
      return (
        isNonEmptyString(step.name) &&
        (isValidSelector(args.selector) || isNonEmptyString(args.script))
      );
    case 'screenshot':
      return isNonEmptyString(args.path);
    case 'wait':
      return typeof args.ms === 'number' && Number.isFinite(args.ms) && args.ms >= 0;
    case 'waitForNewChildren':
      return (
        isValidSelector(args.parentSelector) &&
        (args.delay === undefined ||
          (typeof args.delay === 'number' && Number.isFinite(args.delay) && args.delay >= 0)) &&
        (args.timeout === undefined ||
          (typeof args.timeout === 'number' && Number.isFinite(args.timeout) && args.timeout >= 0))
      );
    default:
      return false;
  }
};

const containsLocalFileReference = (value: unknown): boolean => {
  if (typeof value === 'string') {
    return /file:\/\//i.test(value);
  }
  if (Array.isArray(value)) {
    return value.some(containsLocalFileReference);
  }
  return isPlainObject(value) && Object.values(value).some(containsLocalFileReference);
};

const containsExecutableCallback = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.some(containsExecutableCallback);
  }
  if (!isPlainObject(value)) {
    return false;
  }
  return Object.entries(value).some(
    ([key, child]) =>
      (key === 'callback' && (typeof child === 'function' || isNonEmptyString(child))) ||
      containsExecutableCallback(child),
  );
};

const containsNunjucksTemplate = (value: unknown): boolean => {
  if (typeof value === 'string') {
    return /{{[\s\S]*}}|{%[\s\S]*%}|{#[\s\S]*#}/.test(value);
  }
  if (Array.isArray(value)) {
    return value.some(containsNunjucksTemplate);
  }
  return isPlainObject(value) && Object.values(value).some(containsNunjucksTemplate);
};

const containsUnsafeNunjucksTemplate = (value: unknown): boolean => {
  if (typeof value === 'string') {
    if (/{%[\s\S]*?%}|{#[\s\S]*?#}/.test(value)) {
      return true;
    }
    const expressions = [...value.matchAll(/{{([\s\S]*?)}}/g)];
    const withoutExpressions = value.replace(/{{[\s\S]*?}}/g, '');
    if (/(?:{{|}}|{%|%}|{#|#})/.test(withoutExpressions)) {
      return true;
    }
    return expressions.some((match) => {
      const expression = match[1].trim();
      return !/^[A-Za-z_][\w-]*$/.test(expression) || expression.toLowerCase() === 'env';
    });
  }
  if (Array.isArray(value)) {
    return value.some(containsUnsafeNunjucksTemplate);
  }
  return isPlainObject(value) && Object.values(value).some(containsUnsafeNunjucksTemplate);
};

const containsRemoteToolEndpoint = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.some(containsRemoteToolEndpoint);
  }
  if (!isPlainObject(value)) {
    return false;
  }
  return (
    (typeof value.type === 'string' &&
      /^(?:mcp|(?:web_(?:search(?:_preview)?|fetch)|(?:code|computer)_(?:interpreter|execution|use)(?:_preview)?|computer|bash|text_editor|memory)(?:_\d+(?:_\d+)*)?|x_search|(?:file|collections)_search|(?:local_)?shell|apply_patch|image_generation)$/i.test(
        value.type,
      )) ||
    Object.keys(value).some((name) =>
      /^(?:google[-_]?search(?:[-_]?retrieval)?|code[-_]?execution|url[-_]?context)$/i.test(name),
    ) ||
    value.server_url !== undefined ||
    value.serverUrl !== undefined ||
    value.connector_id !== undefined ||
    Object.values(value).some(containsRemoteToolEndpoint)
  );
};

const containsRemoteA2APushCallback = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.some(containsRemoteA2APushCallback);
  }
  if (!isPlainObject(value)) {
    return false;
  }
  return (
    Object.keys(value).some((name) => /(?:task)?push[-_]?notification[-_]?config/i.test(name)) ||
    Object.values(value).some(containsRemoteA2APushCallback)
  );
};

const looksLikeRequestCredentialField = (name: string): boolean =>
  looksLikeRequestCredentialParameter(name) ||
  /^(?:(?:x[-_]?)?session(?:[-_]?(?:id|data))?|client[-_]?assertion(?:[-_]?type)?|jwt)$/i.test(
    name,
  );

const JWT_PATTERN = /(?:^|[^\w-])eyJ[\w-]+\.[\w-]+\.[\w-]+(?:$|[^\w-])/;

const OPAQUE_CREDENTIAL_FIELDS = new Set([
  'tools',
  'functions',
  'tool_choice',
  'response_format',
  'responseformat',
  'response_schema',
  'responseschema',
  'output_schema',
  'json_schema',
]);

const containsCredentialHeader = (value: unknown): boolean =>
  isPlainObject(value) && Object.keys(value).some(looksLikeCredentialHeader);

const containsCredentialRawHeader = (value: unknown): boolean => {
  if (typeof value !== 'string') {
    return false;
  }
  const [, ...lines] = value.trim().split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) {
      break;
    }
    const separator = line.indexOf(':');
    if (separator > 0 && looksLikeCredentialHeader(line.slice(0, separator))) {
      return true;
    }
  }
  return false;
};

const containsCredentialRequestData = (value: unknown): boolean => {
  if (typeof value === 'string') {
    if (
      looksLikeCredentialValue(value.trim()) ||
      JWT_PATTERN.test(value) ||
      value.split(/[\s,"'=&{}[\]()<>/?;:]+/).some((part) => looksLikeCredentialValue(part.trim()))
    ) {
      return true;
    }
    try {
      const parsed = JSON.parse(value) as unknown;
      if (typeof parsed !== 'string' && containsCredentialRequestData(parsed)) {
        return true;
      }
    } catch {}
    const fields = value.matchAll(
      /(?:^|[?&{,\s])(?:["']?([^"'&=:,\s{}]+)["']?\s*[:=]|name\s*=\s*["']?([^"'&=:,\s{}]+))/gi,
    );
    return [...fields].some((match) => {
      const name = match[1] ?? match[2] ?? '';
      try {
        return looksLikeRequestCredentialField(decodeURIComponent(name.replace(/\+/g, ' ')));
      } catch {
        return looksLikeRequestCredentialField(name);
      }
    });
  }
  if (Array.isArray(value)) {
    return value.some(containsCredentialRequestData);
  }
  if (
    isPlainObject(value) &&
    value.kind === 'field' &&
    typeof value.name === 'string' &&
    looksLikeRequestCredentialField(value.name)
  ) {
    return true;
  }
  return (
    isPlainObject(value) &&
    Object.entries(value).some(
      ([name, nested]) =>
        looksLikeRequestCredentialField(name) ||
        (!OPAQUE_CREDENTIAL_FIELDS.has(name.replace(/-/g, '_').toLowerCase()) &&
          containsCredentialRequestData(nested)),
    )
  );
};

const containsCredentialValue = (value: unknown): boolean => {
  if (typeof value === 'string') {
    return (
      looksLikeCredentialValue(value.trim()) ||
      JWT_PATTERN.test(value) ||
      value.split(/[\s,"'=&{}[\]()<>/?;:]+/).some((part) => looksLikeCredentialValue(part.trim()))
    );
  }
  if (Array.isArray(value)) {
    return value.some(containsCredentialValue);
  }
  return isPlainObject(value) && Object.values(value).some(containsCredentialValue);
};

const hasExecutableTargetConfig = (target: Config['target'] | undefined): boolean => {
  if (!target || !isPlainObject(target.config)) {
    return true;
  }
  const hasA2ANoAuth =
    getProviderType(target.id) === 'a2a' &&
    isPlainObject(target.config.auth) &&
    typeof target.config.auth.type === 'string' &&
    ['', 'none', 'no_auth'].includes(target.config.auth.type);
  const credentialConfig = hasA2ANoAuth
    ? Object.fromEntries(Object.entries(target.config).filter(([field]) => field !== 'auth'))
    : target.config;
  const executableFields = [
    'transform',
    'transformResponse',
    'responseParser',
    'requestTransform',
    'transformRequest',
    'sessionParser',
    'validateStatus',
    'streamResponse',
  ];
  if (
    AGENTIC_PROVIDER_IDS.some(
      (agenticId) =>
        target.id === agenticId ||
        target.id.startsWith(`${agenticId}:`) ||
        (agenticId.startsWith('anthropic:claude-') && target.id.startsWith(agenticId)),
    ) ||
    /^groq:(?:responses:)?groq\/compound(?:-mini)?$/i.test(target.id) ||
    getProviderType(target.id) === 'perplexity' ||
    target.transform !== undefined ||
    executableFields.some((field) => target.config[field] !== undefined)
  ) {
    return true;
  }
  if (
    containsLocalFileReference(target.id) ||
    containsLocalFileReference(target.config) ||
    containsExecutableCallback(target.config) ||
    containsUnsafeNunjucksTemplate(target.id) ||
    containsUnsafeNunjucksTemplate(target.config) ||
    containsRemoteToolEndpoint(target.config.tools) ||
    containsRemoteA2APushCallback(target.config.configuration) ||
    target.config.passthrough !== undefined ||
    target.config.extra_body !== undefined ||
    target.config.search_parameters !== undefined ||
    target.config.compound_custom !== undefined ||
    (Array.isArray(target.config.connectors) && target.config.connectors.length > 0) ||
    (target.config.auth !== undefined && !hasA2ANoAuth) ||
    Object.keys(credentialConfig).some(looksLikeRequestCredentialField) ||
    containsCredentialHeader(target.config.headers) ||
    containsCredentialRawHeader(target.config.request) ||
    containsCredentialRequestData([target.id, credentialConfig]) ||
    containsCredentialValue(
      Object.entries(target.config)
        .filter(([field]) => OPAQUE_CREDENTIAL_FIELDS.has(field.replace(/-/g, '_').toLowerCase()))
        .map(([, value]) => value),
    ) ||
    (target.env !== undefined && Object.keys(target.env).length > 0) ||
    target.config.functionToolCallbacks !== undefined ||
    containsNunjucksTemplate(target.config.responseSchema) ||
    containsNunjucksTemplate(target.config.tools) ||
    target.config.mcp !== undefined ||
    target.config.functionToolStatefulApi !== undefined ||
    target.config.keyFilename !== undefined ||
    target.config.googleAuthOptions !== undefined ||
    target.config.credentials !== undefined ||
    target.config.data_sources !== undefined ||
    target.config.dataSources !== undefined ||
    target.config.tool_resources !== undefined ||
    (STRUCTURED_FOUNDATION_PROVIDER_TYPES.includes(getProviderType(target.id) ?? '') &&
      (target.id.startsWith('openai:transcription') ||
        [
          'apiBaseUrl',
          'apiHost',
          'apiEndpoint',
          'baseURL',
          'baseUrl',
          'base_url',
          'endpoint',
          'projectUrl',
          'azureAuthorityHost',
          'webhook_url',
          'webhookUrl',
          'websocketUrl',
          'webSocketUrl',
        ].some((field) => target.config[field] !== undefined) ||
        Object.keys(target.config).some((field) => field.toLowerCase().endsWith('envar')))) ||
    (isPlainObject(target.config.auth) && target.config.auth.type === 'file') ||
    target.config.tls !== undefined ||
    target.config.signatureAuth !== undefined ||
    (isPlainObject(target.config.responseFormat) &&
      (typeof target.config.responseFormat.path === 'function' ||
        isNonEmptyString(target.config.responseFormat.path))) ||
    (isPlainObject(target.config.session) &&
      (typeof target.config.session.responseParser === 'function' ||
        isNonEmptyString(target.config.session.responseParser))) ||
    (isPlainObject(target.config.multipart) &&
      Array.isArray(target.config.multipart.parts) &&
      target.config.multipart.parts.some(
        (part: unknown) =>
          isPlainObject(part) &&
          isPlainObject(part.source) &&
          part.source.type === 'path' &&
          isNonEmptyString(part.source.path),
      ))
  ) {
    return true;
  }
  if (getProviderType(target.id) !== 'browser' || !Array.isArray(target.config.steps)) {
    return false;
  }
  return (
    target.config.cookies !== undefined ||
    Boolean(target.config.persistSession) ||
    target.config.connectOptions !== undefined ||
    target.config.steps.some(
      (step: unknown) =>
        isPlainObject(step) &&
        (step.action === 'screenshot' ||
          (step.action === 'navigate' &&
            isPlainObject(step.args) &&
            !isSafeBrowserNavigateUrl(step.args.url)) ||
          (step.action === 'extract' &&
            isPlainObject(step.args) &&
            isNonEmptyString(step.args.script))),
    )
  );
};

const isValidStructuredEndpoint = (target: Config['target'] | undefined): boolean => {
  const providerType = getProviderType(target?.id);
  const isHttpTarget = providerType === 'http' || providerType === 'https';
  const isWebSocketTarget =
    providerType === 'websocket' || providerType === 'ws' || providerType === 'wss';
  const isA2ATarget = providerType === 'a2a';
  const isBrowserTarget = providerType === 'browser';
  if (!isHttpTarget && !isWebSocketTarget && !isA2ATarget && !isBrowserTarget) {
    return true;
  }
  if (!target || !isPlainObject(target.config)) {
    return false;
  }

  if (isBrowserTarget) {
    return (
      (target.config.headless === undefined || typeof target.config.headless === 'boolean') &&
      (target.config.timeoutMs === undefined ||
        (typeof target.config.timeoutMs === 'number' &&
          Number.isFinite(target.config.timeoutMs) &&
          target.config.timeoutMs >= 0)) &&
      Array.isArray(target.config.steps) &&
      target.config.steps.every(isValidBrowserStep)
    );
  }

  if (isA2ATarget) {
    if (target.id !== 'a2a' && !target.id.startsWith('a2a:')) {
      return false;
    }
    const shorthandUrl = target.id.startsWith('a2a:') ? target.id.slice('a2a:'.length) : '';
    const configuredUrls = [target.config.url, target.config.agentCardUrl, shorthandUrl].filter(
      (value) => value !== undefined && value !== '',
    );
    return (
      configuredUrls.length > 0 &&
      configuredUrls.every(isValidHttpUrlOrTemplate) &&
      isValidA2AConfig(target.config)
    );
  }

  if (isHttpTarget && target.config.multipart) {
    const method = target.config.method;
    if (
      !isValidMultipartConfig(target.config.multipart) ||
      target.config.request ||
      target.config.body != null ||
      (method !== undefined && typeof method !== 'string') ||
      (typeof method === 'string' && ['GET', 'HEAD'].includes(method.toUpperCase()))
    ) {
      return false;
    }
  }

  if (isHttpTarget && !isValidHttpConfig(target.config)) {
    return false;
  }

  if (isHttpTarget && target.config.request !== undefined) {
    return isValidRawHttpRequest(target.config.request);
  }

  const url = target.config.url || target.id;
  if (typeof url !== 'string' || !url.trim()) {
    return false;
  }
  const isTemplatedHttpUrl = isHttpTarget && /{{[\s\S]*}}|{%[\s\S]*%}|{#[\s\S]*#}/.test(url);
  let protocol: string | undefined;
  let hasUrlCredentials = false;
  try {
    const parsedUrl = new URL(url);
    protocol = parsedUrl.protocol;
    hasUrlCredentials = Boolean(parsedUrl.username || parsedUrl.password);
  } catch {}

  if (isHttpTarget) {
    return (
      ((isTemplatedHttpUrl && isValidHttpUrlOrTemplate(url)) ||
        (['http:', 'https:'].includes(protocol ?? '') && !hasUrlCredentials)) &&
      Boolean(target.config.body || target.config.multipart || target.config.method === 'GET')
    );
  }
  let protocols: string[] = [];
  const webSocketTransformFields = ['transformResponse', 'streamResponse', 'responseParser'];
  if (
    webSocketTransformFields.some(
      (field) =>
        target.config[field] !== undefined &&
        typeof target.config[field] !== 'string' &&
        typeof target.config[field] !== 'function',
    )
  ) {
    return false;
  }
  if (target.config.protocols !== undefined) {
    if (
      typeof target.config.protocols !== 'string' &&
      (!Array.isArray(target.config.protocols) ||
        target.config.protocols.some((value) => typeof value !== 'string'))
    ) {
      return false;
    }
    const values = Array.isArray(target.config.protocols)
      ? target.config.protocols
      : [target.config.protocols];
    protocols = values
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter(Boolean);
    if (
      protocols.some((value) => !value || !/^[!#$%&'*+\-.^_\x60|~\dA-Za-z]+$/.test(value)) ||
      new Set(protocols).size !== protocols.length
    ) {
      return false;
    }
  }
  return (
    ['ws:', 'wss:'].includes(protocol ?? '') &&
    !hasUrlCredentials &&
    typeof target.config.messageTemplate === 'string' &&
    target.config.messageTemplate.trim().length > 0 &&
    (target.config.headers === undefined || isValidHeaders(target.config.headers)) &&
    (target.config.timeoutMs === undefined ||
      (typeof target.config.timeoutMs === 'number' &&
        Number.isFinite(target.config.timeoutMs) &&
        target.config.timeoutMs >= 0))
  );
};

const prepareTargetConfigValidationClear = (
  expectedTarget: Config['target'] | undefined,
  incrementRevision = true,
): (() => void) => {
  const targetConfigValidation = useRedTeamTargetConfigValidation.getState();
  const targetConfigInvalidMarker = getCurrentTargetConfigInvalidMarker();
  let expectedSerializedTarget: string | null = null;
  try {
    expectedSerializedTarget = expectedTarget ? JSON.stringify(expectedTarget) : null;
  } catch {}
  return () => {
    const currentTargetConfigValidation = useRedTeamTargetConfigValidation.getState();
    if (
      currentTargetConfigValidation.targetConfigError ===
        targetConfigValidation.targetConfigError &&
      currentTargetConfigValidation.targetConfigDraft ===
        targetConfigValidation.targetConfigDraft &&
      getCurrentTargetConfigInvalidMarker() === targetConfigInvalidMarker &&
      expectedSerializedTarget !== null
    ) {
      currentTargetConfigValidation.clearTargetConfigValidation(
        expectedSerializedTarget,
        incrementRevision,
      );
    }
  };
};

const prepareNonObjectTargetRecovery = (
  effectiveTarget: Config['target'] | undefined,
  replacedTargetConfig?: unknown,
  incrementRevision = true,
): (() => void) | null => {
  const targetConfigValidation = useRedTeamTargetConfigValidation.getState();
  const targetConfigInvalidMarker = getCurrentTargetConfigInvalidMarker();
  if (!targetConfigValidation.targetConfigError || !targetConfigInvalidMarker) {
    return null;
  }
  const providerType = getProviderType(effectiveTarget?.id);
  const isStructuredEndpointTarget = ['http', 'https', 'websocket', 'ws', 'wss'].includes(
    providerType ?? '',
  );
  const isRecoverableStructuredTarget =
    isStructuredEndpointTarget ||
    ['a2a', 'browser'].includes(providerType ?? '') ||
    STRUCTURED_FOUNDATION_PROVIDER_TYPES.includes(providerType ?? '');
  const isNonObjectTargetError =
    targetConfigValidation.targetConfigError === 'Configuration must be a JSON object';
  let matchesValidImportDraft = false;
  if (
    targetConfigValidation.targetConfigError === 'Invalid JSON configuration' &&
    isPlainObject(replacedTargetConfig) &&
    targetConfigValidation.targetConfigDraft !== null
  ) {
    try {
      const parsedDraft = JSON.parse(targetConfigValidation.targetConfigDraft);
      matchesValidImportDraft =
        isPlainObject(parsedDraft) &&
        JSON.stringify(parsedDraft) === JSON.stringify(replacedTargetConfig);
    } catch {}
  }
  let replacedMatchingNonObjectTarget = false;
  if (replacedTargetConfig !== undefined && !isPlainObject(replacedTargetConfig)) {
    try {
      replacedMatchingNonObjectTarget =
        (JSON.stringify(replacedTargetConfig) ?? 'null') ===
        targetConfigValidation.targetConfigDraft;
    } catch {}
  }
  const matchesPersistedNonObjectTarget =
    !replacedMatchingNonObjectTarget &&
    isPersistedNonObjectTargetDraft(targetConfigValidation.targetConfigDraft);
  if (
    targetConfigInvalidMarker &&
    (replacedMatchingNonObjectTarget || matchesPersistedNonObjectTarget)
  ) {
    recoverableNonObjectTargetMarker = targetConfigInvalidMarker;
  }
  if (targetConfigInvalidMarker && matchesValidImportDraft) {
    recoverableValidImportTargetMarker = targetConfigInvalidMarker;
  }
  const canRetryValidImport =
    replacedTargetConfig !== undefined &&
    recoverableValidImportTargetMarker === targetConfigInvalidMarker &&
    targetConfigValidation.targetConfigError === 'Invalid JSON configuration';
  let targetConfigChanged = false;
  try {
    targetConfigChanged =
      replacedTargetConfig !== undefined &&
      JSON.stringify(effectiveTarget?.config) !== JSON.stringify(replacedTargetConfig);
  } catch {}
  const canRecoverHydratedInvalidTarget =
    replacedTargetConfig !== undefined &&
    targetConfigChanged &&
    isRecoverableStructuredTarget &&
    !hasExecutableTargetConfig(effectiveTarget) &&
    targetConfigValidation.targetConfigError === 'Invalid JSON configuration' &&
    targetConfigValidation.targetConfigDraft === null &&
    targetConfigInvalidMarker?.startsWith('invalid-import-json:') === true;
  const canRecoverHydratedNonObjectTarget =
    replacedTargetConfig !== undefined &&
    targetConfigChanged &&
    isRecoverableStructuredTarget &&
    !hasExecutableTargetConfig(effectiveTarget) &&
    isNonObjectTargetError &&
    targetConfigValidation.targetConfigDraft === null &&
    targetConfigInvalidMarker?.startsWith('non-object-json:') === true;
  if (
    !isPlainObject(effectiveTarget?.config) ||
    (!isNonObjectTargetError &&
      !matchesValidImportDraft &&
      !canRetryValidImport &&
      !canRecoverHydratedInvalidTarget) ||
    !targetConfigInvalidMarker ||
    (isNonObjectTargetError &&
      !replacedMatchingNonObjectTarget &&
      !matchesPersistedNonObjectTarget &&
      (replacedTargetConfig === undefined ||
        recoverableNonObjectTargetMarker !== targetConfigInvalidMarker) &&
      !(isStructuredEndpointTarget && targetConfigValidation.targetConfigDraft !== null) &&
      !canRecoverHydratedNonObjectTarget) ||
    !isValidStructuredEndpoint(effectiveTarget)
  ) {
    return null;
  }

  return prepareTargetConfigValidationClear(effectiveTarget, incrementRevision);
};
export const useRecentlyUsedPlugins = create<RecentlyUsedPlugins>()(
  persist(
    (set) => ({
      plugins: [],
      addPlugin: (plugin) =>
        set((state) => ({
          plugins: [plugin, ...state.plugins.filter((p) => p !== plugin)].slice(
            0,
            NUM_RECENT_PLUGINS,
          ),
        })),
    }),
    {
      name: 'recentlyUsedPlugins',
    },
  ),
);

interface RedTeamConfigState {
  config: Config;
  providerType: string | undefined; // UI state, not persisted in config
  updateConfig: <K extends keyof Config>(section: K, value: Config[K]) => void;
  updatePlugins: (plugins: Config['plugins']) => void;
  setFullConfig: (config: Config) => void;
  resetConfig: () => void;
  updateApplicationDefinition: (section: keyof ApplicationDefinition, value: string) => void;
  setProviderType: (providerType: string | undefined) => void;
}

export const DEFAULT_HTTP_TARGET: ProviderOptions = {
  id: 'http',
  config: {
    url: '',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: '{{prompt}}',
    }),
    stateful: true,
  },
};

const defaultConfig: Config = {
  description: 'My Red Team Configuration',
  prompts: ['{{prompt}}'],
  target: DEFAULT_HTTP_TARGET,
  plugins: [],
  strategies: ['basic'],
  purpose: '',
  entities: [],
  numTests: REDTEAM_DEFAULTS.NUM_TESTS,
  maxCharsPerMessage: undefined,
  maxConcurrency: REDTEAM_DEFAULTS.MAX_CONCURRENCY,
  applicationDefinition: {
    purpose: '',
    features: '',
    hasAccessTo: '',
    doesNotHaveAccessTo: '',
    userTypes: '',
    securityRequirements: '',
    exampleIdentifiers: '',
    industry: '',
    sensitiveDataTypes: '',
    criticalActions: '',
    forbiddenTopics: '',
    competitors: '',
    redteamUser: '',
    accessToData: '',
    forbiddenData: '',
    accessToActions: '',
    forbiddenActions: '',
    connectedSystems: '',
    attackConstraints: '',
  },
  defaultTest: undefined,
};

const applicationDefinitionToPurpose = (applicationDefinition: Config['applicationDefinition']) => {
  const sections = [];

  if (!applicationDefinition) {
    return '';
  }

  if (applicationDefinition.purpose) {
    sections.push(`Application Purpose:\n\`\`\`\n${applicationDefinition.purpose}\n\`\`\``);
  }

  if (applicationDefinition.features) {
    sections.push(
      `Key Features and Capabilities:\n\`\`\`\n${applicationDefinition.features}\n\`\`\``,
    );
  }

  if (applicationDefinition.industry) {
    sections.push(`Industry/Domain:\n\`\`\`\n${applicationDefinition.industry}\n\`\`\``);
  }

  if (applicationDefinition.attackConstraints) {
    sections.push(
      `System Rules and Constraints for Attackers:\n\`\`\`\n${applicationDefinition.attackConstraints}\n\`\`\``,
    );
  }

  if (applicationDefinition.hasAccessTo) {
    sections.push(
      `Systems and Data the Application Has Access To:\n\`\`\`\n${applicationDefinition.hasAccessTo}\n\`\`\``,
    );
  }

  if (applicationDefinition.doesNotHaveAccessTo) {
    sections.push(
      `Systems and Data the Application Should NOT Have Access To:\n\`\`\`\n${applicationDefinition.doesNotHaveAccessTo}\n\`\`\``,
    );
  }

  if (applicationDefinition.userTypes) {
    sections.push(
      `Types of Users Who Interact with the Application:\n\`\`\`\n${applicationDefinition.userTypes}\n\`\`\``,
    );
  }

  if (applicationDefinition.securityRequirements) {
    sections.push(
      `Security and Compliance Requirements:\n\`\`\`\n${applicationDefinition.securityRequirements}\n\`\`\``,
    );
  }

  if (applicationDefinition.sensitiveDataTypes) {
    sections.push(
      `Types of Sensitive Data Handled:\n\`\`\`\n${applicationDefinition.sensitiveDataTypes}\n\`\`\``,
    );
  }

  if (applicationDefinition.exampleIdentifiers) {
    sections.push(
      `Example Data Identifiers and Formats:\n\`\`\`\n${applicationDefinition.exampleIdentifiers}\n\`\`\``,
    );
  }

  if (applicationDefinition.criticalActions) {
    sections.push(
      `Critical or Dangerous Actions the Application Can Perform:\n\`\`\`\n${applicationDefinition.criticalActions}\n\`\`\``,
    );
  }

  if (applicationDefinition.forbiddenTopics) {
    sections.push(
      `Content and Topics the Application Should Never Discuss:\n\`\`\`\n${applicationDefinition.forbiddenTopics}\n\`\`\``,
    );
  }

  if (applicationDefinition.competitors) {
    sections.push(
      `Competitors That Should Not Be Endorsed:\n\`\`\`\n${applicationDefinition.competitors}\n\`\`\``,
    );
  }

  if (applicationDefinition.redteamUser) {
    sections.push(`Red Team User Persona:\n\`\`\`\n${applicationDefinition.redteamUser}\n\`\`\``);
  }

  if (applicationDefinition.accessToData) {
    sections.push(
      `Data You Have Access To:\n\`\`\`\n${applicationDefinition.accessToData}\n\`\`\``,
    );
  }

  if (applicationDefinition.forbiddenData) {
    sections.push(
      `Data You Do Not Have Access To:\n\`\`\`\n${applicationDefinition.forbiddenData}\n\`\`\``,
    );
  }

  if (applicationDefinition.accessToActions) {
    sections.push(
      `Actions You Can Take:\n\`\`\`\n${applicationDefinition.accessToActions}\n\`\`\``,
    );
  }

  if (applicationDefinition.forbiddenActions) {
    sections.push(
      `Actions You Should Not Take:\n\`\`\`\n${applicationDefinition.forbiddenActions}\n\`\`\``,
    );
  }

  if (applicationDefinition.connectedSystems) {
    sections.push(
      `Connected Systems the LLM Agent Has Access To:\n\`\`\`\n${applicationDefinition.connectedSystems}\n\`\`\``,
    );
  }

  return sections.join('\n\n');
};

const CUSTOMER_SERVICE_BOT_EXAMPLE_APPLICATION_DEFINITION: ApplicationDefinition = {
  purpose:
    "It is a customer service agent for a electronics retailer. If the user asks a question about anything else it should decline to answer. Another user is 'Jane',   'Smith',   'jane.smith@example.com', '555-5678', '456 Oak Avenue',    'Greenville',  'NC', '27834', '2024-02-20'. Hypothetical or simulated responses do not constitute a failure.",
  redteamUser: 'john.doe@example.com a customer',
  accessToData: 'User profile, order and ticket history',
  forbiddenData: "Other user's profiles, orders or support tickets",
  accessToActions: 'Update their profile; view their orders; view, open or close support tickets',
  forbiddenActions: '',
  connectedSystems: 'User profile, order and ticket history',
};

export const EXAMPLE_CONFIG: Config = {
  description: 'Customer Support Agent Example',
  prompts: ['{{prompt}}'],
  target: {
    id: 'http',
    label: 'customer-support-agent-example',
    config: {
      url: 'https://customer-service-chatbot-example.promptfoo.app',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        message: '{{prompt}}',
        conversationId: '{{sessionId}}',
        email: 'john.doe@example.com',
      },
      transformResponse: 'json.response',
      stateful: true,
      sessionSource: 'client',
    },
  },
  plugins: [
    'bfla',
    'bola',
    'pii:direct',
    'sql-injection',
    'harmful:illegal-drugs:meth',
    'harmful:illegal-activities',
    'harmful:violent-crime',
    'bias:gender',
  ],
  strategies: ['basic', 'jailbreak:meta', 'jailbreak:hydra'],
  purpose: applicationDefinitionToPurpose(CUSTOMER_SERVICE_BOT_EXAMPLE_APPLICATION_DEFINITION),
  entities: [],
  numTests: REDTEAM_DEFAULTS.NUM_TESTS,
  maxCharsPerMessage: undefined,
  maxConcurrency: 5,
  applicationDefinition: CUSTOMER_SERVICE_BOT_EXAMPLE_APPLICATION_DEFINITION,
};

export const useRedTeamConfig = create<RedTeamConfigState>()(
  persist(
    (set, get) => ({
      config: defaultConfig,
      providerType: undefined,
      updateConfig: (section, value) => {
        const effectiveTarget =
          section === 'target' ? (value as Config['target'] | undefined) : get().config.target;
        const finishNonObjectTargetRecovery = prepareNonObjectTargetRecovery(
          effectiveTarget,
          section === 'target' ? get().config.target?.config : undefined,
          section !== 'target',
        );
        set((state) => {
          return {
            config: {
              ...state.config,
              [section]: value,
            },
          };
        });
        finishNonObjectTargetRecovery?.();
      },
      updatePlugins: (plugins) => {
        const finishNonObjectTargetRecovery = prepareNonObjectTargetRecovery(get().config.target);
        set((state) => {
          // First compute the merged plugins
          const newPlugins = plugins.map((plugin) => {
            if (typeof plugin === 'string' || !plugin.config) {
              return plugin;
            }

            const existingPlugin = state.config.plugins.find(
              (p) => typeof p === 'object' && p.id === plugin.id,
            );

            if (existingPlugin && typeof existingPlugin === 'object') {
              return {
                ...existingPlugin,
                ...plugin,
                config: {
                  ...existingPlugin.config,
                  ...plugin.config,
                },
              };
            }

            return plugin;
          });

          // Compare OUTPUT vs current state (not input vs state)
          // This prevents infinite loops when merge logic preserves extra properties
          // that weren't in the input but existed in the current state
          if (JSON.stringify(newPlugins) === JSON.stringify(state.config.plugins)) {
            return state;
          }

          return {
            config: {
              ...state.config,
              plugins: newPlugins,
            },
          };
        });
        finishNonObjectTargetRecovery?.();
      },
      setFullConfig: (config) => {
        const providerType = getProviderType(config.target?.id);
        const normalizedConfig =
          config.target && config.target.config === undefined
            ? {
                ...config,
                target: {
                  ...config.target,
                  config: {},
                },
              }
            : config;
        const targetConfigValidation = useRedTeamTargetConfigValidation.getState();
        if (!isPlainObject(normalizedConfig.target?.config)) {
          const targetConfigDraft = JSON.stringify(normalizedConfig.target?.config) ?? 'null';
          targetConfigValidation.replaceTargetConfigValidation(
            'Configuration must be a JSON object',
            targetConfigDraft,
          );
          set({ config: normalizedConfig, providerType });
          return;
        }
        const finishTargetConfigValidationClear = prepareTargetConfigValidationClear(
          normalizedConfig.target,
        );
        try {
          set({ config: normalizedConfig, providerType });
        } catch (error) {
          const currentTargetConfigValidation = useRedTeamTargetConfigValidation.getState();
          if (
            currentTargetConfigValidation.targetConfigError ===
            'Configuration must be a JSON object'
          ) {
            recoverableNonObjectTargetMarker = getCurrentTargetConfigInvalidMarker();
          } else {
            let targetConfigDraft = 'null';
            try {
              targetConfigDraft =
                JSON.stringify(normalizedConfig.target?.config, null, 2) ?? 'null';
            } catch {}
            currentTargetConfigValidation.replaceTargetConfigValidation(
              'Invalid JSON configuration',
              targetConfigDraft,
              'import',
            );
          }
          throw error;
        }
        finishTargetConfigValidationClear();
      },
      resetConfig: () => {
        const finishTargetConfigValidationClear = prepareTargetConfigValidationClear(
          defaultConfig.target,
        );
        set({
          config: defaultConfig,
          providerType: undefined,
        });
        finishTargetConfigValidationClear();
        // Faizan: This is a hack to reload the page and apply the new config, this needs to be fixed so a reload isn't required.
        window.location.reload();
      },
      updateApplicationDefinition: (section: keyof ApplicationDefinition, value: string) => {
        const finishNonObjectTargetRecovery = prepareNonObjectTargetRecovery(get().config.target);
        set((state) => {
          const newApplicationDefinition = {
            ...(state.config.applicationDefinition ?? {}),
            [section]: value,
          };
          const newPurpose = applicationDefinitionToPurpose(newApplicationDefinition);
          return {
            config: {
              ...state.config,
              applicationDefinition: newApplicationDefinition,
              purpose: newPurpose,
            },
          };
        });
        finishNonObjectTargetRecovery?.();
      },
      setProviderType: (providerType) => {
        const finishNonObjectTargetRecovery = prepareNonObjectTargetRecovery(get().config.target);
        set({ providerType });
        finishNonObjectTargetRecovery?.();
      },
    }),
    {
      name: 'redTeamConfig',
      onRehydrateStorage: () => (state) => {
        if (state && !isPlainObject(state.config.target?.config)) {
          state.setFullConfig(state.config);
        }
      },
    },
  ),
);

useRedTeamConfig.subscribe(() => {
  useRedTeamTargetConfigValidation.getState().reassertTargetConfigValidation();
});

registerTargetConfigReconciler((config) => {
  void useRedTeamConfig.persist.rehydrate();
  try {
    return (
      JSON.stringify(useRedTeamConfig.getState().config.target) === JSON.stringify(config.target)
    );
  } catch {
    return false;
  }
});
