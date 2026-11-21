import { PrivateRangeBlockedError } from './fetch/guardContext';

const TEMPLATE_OPENER = /\{[{%#]/;

/**
 * True when the value still carries Nunjucks template syntax: a `{{ ... }}`
 * interpolation, a `{% ... %}` block tag, or a `{# ... #}` comment. Any of
 * these can change the effective target when the value is rendered at call
 * time, so a preflight that only looks for `{{` can be bypassed with a
 * block tag that renders a private host into the URL.
 */
export function containsTemplateSyntax(value: string): boolean {
  return TEMPLATE_OPENER.test(value);
}

/**
 * Guarded diagnostics accept only scalar values from their own call context.
 * A replacement is data and is never parsed again as template source.
 * With no variables, validate the same grammar during route preflight.
 */
export function renderGuardedTemplate(template: string, vars?: Record<string, unknown>): string {
  return template.replace(
    /\{\{\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*\}\}|\{[{%#]/g,
    (token, path?: string) => {
      if (!path || path === 'env' || path.startsWith('env.')) {
        throw new PrivateRangeBlockedError(
          'PROMPTFOO_BLOCK_PRIVATE_RANGES is set: guarded templates support only named data variables',
        );
      }
      if (!vars) {
        return token;
      }
      let value: unknown = vars;
      for (const key of path.split('.')) {
        if (value === null || typeof value !== 'object') {
          return '';
        }
        value = Object.getOwnPropertyDescriptor(value, key)?.value;
      }
      return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : '';
    },
  );
}

export function assertLiteralGuardedFilePath(path: string): void {
  if (TEMPLATE_OPENER.test(path)) {
    throw new PrivateRangeBlockedError(
      'PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing a templated file reference',
    );
  }
}

export function renderGuardedRawRequest(template: string, vars?: Record<string, unknown>): string {
  const separator = /\r?\n\r?\n/.exec(template);
  const bodyStart = separator ? separator.index + separator[0].length : template.length;
  const headers = template.slice(0, bodyStart);
  if (TEMPLATE_OPENER.test(headers)) {
    throw new PrivateRangeBlockedError(
      'PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing provider raw request with an unresolved template in the request line or headers',
    );
  }
  return headers + renderGuardedTemplate(template.slice(bodyStart), vars);
}
