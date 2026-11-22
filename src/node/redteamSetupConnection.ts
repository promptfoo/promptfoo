import { getEnvBool, getEnvOverrides, isTemplateProcessEnvDisabled } from '../envars';
import { isSetupReplyPath, type SetupConnection } from '../types/api/redteamSetup';
import { fetchWithProxy, readBoundedText } from '../util/fetch/index';
import { isSecretField, looksLikeSecret } from '../util/sanitizer';

// Catch common accidental pastes before sending free text to a hosted model.
export function containsConnectionDetails(value: string): boolean {
  const endpoint =
    /(?:https?|wss?|file):\/\/|\bcurl\s+-|\b(?:localhost|[\w.-]+\.internal):\d+|\{[{%#]|\$\{/i;
  const credential =
    /\bbearer\s+[\w.+/=-]{8,}|\b(?:api[-_ ]?key|password|(?:access[-_ ]?)?token|authorization)\b["']?\s*(?:[:=]\s*\S+|is\s+\S{12,})/i;
  return (
    endpoint.test(value) || credential.test(value) || value.split(/[\s"':=]+/).some(looksLikeSecret)
  );
}

const maxBytes = 256 * 1024;
const failure = (message: string) => ({ success: false, message });

function httpError(status: number, connection: SetupConnection) {
  let hint = 'Check your endpoint and try again.';
  if (status >= 300 && status < 400) {
    hint = 'Your endpoint redirected the request. Use the final URL directly.';
  } else if (status === 401 || status === 403) {
    hint = connection.authEnv
      ? `Check that ${connection.authHeader ?? 'Authorization'} is the right header and ${connection.authEnv} has access to this endpoint.`
      : 'Does this endpoint need an API key or bearer token?';
  } else if (status === 400 || status === 422 || status === 415) {
    hint =
      Array.isArray(connection.body.messages) && !connection.body.model
        ? 'Check whether your API needs a model name. You can add it in chat and test again.'
        : 'Check the JSON request body and the field your API expects.';
  } else if (status === 404 || status === 405) {
    hint = 'Check the URL and whether it accepts POST requests.';
  } else if (status === 429) {
    hint = 'Your endpoint is rate limited. Wait before testing again.';
  }
  return failure(`HTTP ${status}. ${hint}`);
}

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

// Return field names only. Never put response values, headers or credentials into the chat.
function replyPaths(json: unknown, token?: string) {
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
          (token && key.includes(token))
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
    .sort((a, b) => Number(likelyReply.test(b)) - Number(likelyReply.test(a)))
    .slice(0, 4);
}

function inspectReply(text: string, status: number, path: string | undefined, token?: string) {
  const received = `HTTP ${status}.`;
  if (!text.trim()) {
    return failure(received + ' The response was empty. Check the request body.');
  }
  if (/^\s*<(?:!doctype html|html)\b/i.test(text)) {
    return failure(
      received + ' The endpoint returned a web page. Check the API URL and authentication.',
    );
  }
  if (path === '') {
    return { success: true, message: received + ' I received a non-empty text reply.' };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return {
      success: path === undefined,
      message:
        received + ' The response wasn’t JSON. Use plain text if the whole response is the reply.',
      paths: ['Plain text'],
    };
  }
  if (path) {
    const value = readPath(json, path);
    if (typeof value === 'string' && value.trim()) {
      return { success: true, message: received + ` I read a non-empty reply at ${path}.` };
    }
  }
  const paths = replyPaths(json, token);
  const problem = path ? ` I couldn’t read text at ${path}.` : '';
  return {
    success: path === undefined && paths.length > 0,
    message:
      received +
      problem +
      (paths.length
        ? ' Which field holds the reply?'
        : ' I couldn’t find a text field. Check the request body or enter the reply path.'),
    paths,
  };
}

export async function testSetupConnection(connection: SetupConnection, signal: AbortSignal) {
  if (getEnvBool('PROMPTFOO_DISABLE_TEMPLATING')) {
    return failure(
      'Templates are disabled on this server. Enable them to send a prompt in the request body.',
    );
  }
  const { url, body, authEnv, responsePath } = connection;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-promptfoo-silent': 'true',
  };
  let token: string | undefined;
  if (authEnv) {
    if (isTemplateProcessEnvDisabled()) {
      return failure('Environment variables are disabled for templates on this server.');
    }
    const target = new URL(url);
    if (
      target.protocol !== 'https:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
    ) {
      return failure('Use HTTPS to send credentials outside localhost.');
    }
    token = getEnvOverrides('file')?.[authEnv] ?? process.env[authEnv];
    if (!token) {
      return failure(
        `Set ${authEnv} where Promptfoo runs, then restart Promptfoo and test again. No message was sent.`,
      );
    }
    const header = connection.authHeader ?? 'Authorization';
    headers[header] = header.toLowerCase() === 'authorization' ? 'Bearer ' + token : token;
  }

  // A single, uncached request. Do not evaluate templates, load providers, or invoke Cloud grading.
  const response = await fetchWithProxy(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
      .replaceAll('{{prompt}}', 'Hello')
      .replaceAll('{{sessionId}}', crypto.randomUUID()),
    redirect: 'manual',
    disableTransientRetries: true,
    skipCloudAuthInjection: true,
    signal,
  });
  if (!response.ok) {
    await response.body?.cancel();
    return httpError(response.status, connection);
  }
  const text = await readBoundedText(response, maxBytes + 1);
  if (Buffer.byteLength(text) > maxBytes) {
    return failure('The reply is too large to inspect here. Try a smaller response.');
  }
  return inspectReply(text, response.status, responsePath, token);
}
