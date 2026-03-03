/**
 * Rule: if a class list applies a visible border width, it must also include
 * an explicit border color utility.
 *
 * We deliberately operate on normalized utility tokens (modifiers removed),
 * so variants like `hover:border-primary` and `dark:border-border` count as
 * valid border color declarations.
 */

// Border style utilities (not color).
const BORDER_STYLE_TOKEN = /^(?:border(?:-[trblxy])?-(?:solid|dashed|dotted|double|hidden|none))$/;
// Table border layout utilities (not color).
const BORDER_LAYOUT_TOKEN = /^(?:border-(?:collapse|separate))$/;
// Width utilities that produce a visible border.
const BORDER_VISIBLE_WIDTH_TOKEN =
  /^(?:border(?:-(?:[trblxy]))?(?:-(?:[1-9]\d*|px|\[[^\]]+\]))?|border-(?:[trblxy]))$/;
// Explicitly non-visible width utilities.
const BORDER_ZERO_WIDTH_TOKEN = /^(?:border(?:-(?:[trblxy]))?-0)$/;
// Any width utility (including zero) used to disambiguate border-* classes.
const BORDER_WIDTH_TOKEN =
  /^(?:border(?:-(?:[trblxy]))?(?:-(?:\d+|px|\[[^\]]+\]))?|border-(?:[trblxy]))$/;

/**
 * Normalizes a Tailwind token by stripping variant prefixes and `!` important.
 *
 * Examples:
 * - `hover:border-primary` -> `border-primary`
 * - `dark:sm:!border-b` -> `border-b`
 * - `border-[hsl(var(--border))]` remains intact
 */
function splitModifiers(token: string): string {
  let bracketDepth = 0;
  let lastSeparator = -1;

  for (let i = 0; i < token.length; i++) {
    const char = token[i];
    if (char === '[') {
      bracketDepth++;
    } else if (char === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
    } else if (char === ':' && bracketDepth === 0) {
      lastSeparator = i;
    }
  }

  const utility = lastSeparator === -1 ? token : token.slice(lastSeparator + 1);
  return utility.startsWith('!') ? utility.slice(1) : utility;
}

/**
 * Determines whether a normalized utility token is a border color token.
 * Tokens like `border`, `border-b`, `border-2`, `border-dashed`, and
 * `border-collapse` are excluded because they control width/style/layout.
 */
function isBorderColorToken(utility: string): boolean {
  if (!utility.startsWith('border-')) {
    return false;
  }
  if (BORDER_WIDTH_TOKEN.test(utility)) {
    return false;
  }
  if (BORDER_STYLE_TOKEN.test(utility) || BORDER_LAYOUT_TOKEN.test(utility)) {
    return false;
  }
  if (utility === 'border') {
    return false;
  }
  return true;
}

/**
 * Returns a diagnostic message when a token set contains visible border width
 * without an explicit border color token; otherwise returns null.
 */
export function checkBorderRequiresColor(rawTokens: string[]): string | null {
  const utilities = rawTokens.map(splitModifiers);
  const hasVisibleBorderWidth = utilities.some(
    (utility) => BORDER_VISIBLE_WIDTH_TOKEN.test(utility) && !BORDER_ZERO_WIDTH_TOKEN.test(utility),
  );

  if (!hasVisibleBorderWidth) {
    return null;
  }

  const hasBorderColor = utilities.some((utility) => isBorderColorToken(utility));
  if (hasBorderColor) {
    return null;
  }

  return 'Border width utility requires an explicit border color utility (for example `border-border`).';
}
