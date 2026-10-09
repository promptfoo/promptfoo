import { z } from 'zod';
import { SECRET_FIELD_NAMES } from '../validation/secretFieldNames';

// Use schema-emitting primitives for the complete template grammar, including
// authority syntax. A runtime-only URL refinement would leave editor validation
// accepting invalid ports and IP addresses. International hosts use punycode.
const maxFeedbackUrlLength = 8192;
// JSON Schema validators can continue after maxLength fails. Bound every emitted
// regex as well, so oversized inputs never reach the URL or credential grammar.
const lengthGuard = `(?=[\\s\\S]{1,${maxFeedbackUrlLength}}$(?![\\s\\S]))`;
const ipv4 = z.regexes.ipv4.source.slice(1, -1);
const ipv6 = z.regexes.ipv6.source.slice(1, -1);
const dnsLabel = '[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?';
// WHATWG treats a final numeric or hexadecimal label as IPv4. Only canonical
// dotted-decimal IPv4 is accepted, via the separate IPv4 alternative below.
const dnsHost = `(?!(?:${dnsLabel}\\.)*(?:[0-9]+|0[xX][0-9a-fA-F]+)\\.?(?=[:/?#]|$))${dnsLabel}(?:\\.${dnsLabel})*\\.?`;
const host = `(?:${ipv4}|\\[(?:${ipv6})\\]|${dnsHost})`;
const port = '(?:[0-5]?[0-9]{1,4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])';
const templatePattern = new RegExp(
  `^${lengthGuard}https://${host}(?::${port})?(?:[/?#](?:[^\\s{}\\\\]|\\{\\{(?:evalId|resultId|testCaseId|rating)\\}\\})*)?$(?![\\s\\S])`,
);
// Keep feedback links aligned with the sanitizer's credential vocabulary, with
// the additional generic and signed-URL names already forbidden by this feature.
const credentialNames = [
  ...SECRET_FIELD_NAMES,
  'key',
  'credential',
  'subscriptionkey',
  'xamzcredential',
  'xamzsignature',
  'xamzsecuritytoken',
];
const credentialKeys = credentialNames
  .map((name) => [...name].map((letter) => `[${letter}${letter.toUpperCase()}]`).join('[._+-]*'))
  .join('|');
// Require an equals sign in the same parameter before scanning its segments.
// Each prefix is scanned once, and separators never compete with an adjacent
// separator repetition. This also covers array/nested suffixes such as token[].
const noCredentialsPattern = new RegExp(
  `^${lengthGuard}(?![\\s\\S]*[?&#;](?=[^?&#;=]*=)(?:[^?&#;=]*[.\\[_+-])?(?:${credentialKeys})(?:[.\\[\\]_+-][^?&#;=]*)?=)[\\s\\S]*$`,
);
// Encoded parameter names can disguise a credential key from schema validators.
const noEncodedKeysPattern = new RegExp(
  `^${lengthGuard}(?![\\s\\S]*[?&#;][^?&#;=%]*%[^?&#;=]*=)[\\s\\S]*$`,
);

export const RatingFeedbackUrlSchema = z
  .string()
  .min(1)
  .max(maxFeedbackUrlLength, { abort: true })
  .regex(
    templatePattern,
    'Feedback URLs require HTTPS, no URL credentials, and supported placeholders outside the host',
  )
  .regex(noCredentialsPattern, 'Feedback URLs must not contain credential parameters')
  .regex(noEncodedKeysPattern, 'Feedback URL parameter names must not be percent-encoded');

// A union preserves the at-least-one-link requirement in generated JSON Schema.
export const RatingFeedbackSchema = z.union([
  z.object({ pass: RatingFeedbackUrlSchema, fail: RatingFeedbackUrlSchema.optional() }),
  z.object({ pass: RatingFeedbackUrlSchema.optional(), fail: RatingFeedbackUrlSchema }),
]);

/** Validate every authored feedback link before an evaluation can be saved or shared. */
export function validateRatingFeedback(config: {
  defaultTest?: unknown;
  tests?: unknown;
  scenarios?: unknown;
}): void {
  const validateTest = (test: unknown) => {
    if (test && typeof test === 'object' && 'feedback' in test && test.feedback !== undefined) {
      RatingFeedbackSchema.parse(test.feedback);
    }
  };
  const validateTests = (tests: unknown) => {
    if (Array.isArray(tests)) {
      tests.forEach(validateTest);
    }
  };
  validateTest(config.defaultTest);
  validateTests(config.tests);
  if (Array.isArray(config.scenarios)) {
    for (const scenario of config.scenarios) {
      validateTests(scenario?.config);
      validateTests(scenario?.tests);
    }
  }
}
