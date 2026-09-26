import { z } from 'zod';

const Text = z.string().min(1);
const NullableText = Text.nullable();
const Count = z.number().int().nonnegative();
const Amount = z.number().finite().nonnegative();

/** Portable, provider-normalized evidence. Null means unreported, never zero. */
export const CodexSecurityResultSchema = z.object({
  version: z.literal(1),
  source: z.object({
    kind: z.enum(['sdk', 'saved-report']),
    file: Text.optional(),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    // Recorded evidence of mock execution; false does not authenticate an imported report.
    mocked: z.boolean(),
  }),
  operation: z
    .enum(['security-scan', 'deep-security-scan', 'security-diff-scan', 'validation'])
    .nullable(),
  status: z.enum(['completed', 'failed', 'canceled', 'interrupted', 'unknown']),
  error: NullableText,
  scanId: NullableText,
  model: NullableText,
  versions: z.object({ sdk: NullableText, plugin: NullableText }),
  coverage: z.object({
    completeness: z.enum(['complete', 'partial', 'unknown']),
    mode: NullableText,
  }),
  findings: z
    .object({
      total: Count,
      bySeverity: z.object({
        critical: Count,
        high: Count,
        medium: Count,
        low: Count,
        informational: Count,
        unknown: Count,
      }),
    })
    .nullable(),
  validation: z
    .object({ disposition: z.enum(['reportable', 'suppressed', 'not_applicable', 'deferred']) })
    .nullable(),
  cost: z
    .object({
      // API-equivalent short-context estimate, not actual billing or import cost.
      baselineUsd: Amount.nullable(),
      range: z.object({ minUsd: Amount, maxUsd: Amount.nullable() }).nullable(),
      pricing: z
        .object({
          source: NullableText,
          asOf: NullableText,
          serviceTier: NullableText,
          context: NullableText,
        })
        .nullable(),
    })
    .nullable(),
  // Whole operation duration from recorded start/end timestamps, never a turn or file-read timer.
  elapsedMs: Amount.nullable(),
  usage: z
    .object({
      input: Count.nullable(),
      output: Count.nullable(),
      cachedInput: Count.nullable(),
      cacheWriteInput: Count.nullable(),
      total: Count.nullable(),
    })
    .nullable(),
  target: z
    .object({
      kind: NullableText,
      id: NullableText,
      displayName: NullableText,
      revision: NullableText,
      baseRevision: NullableText,
      headRevision: NullableText,
      snapshotDigest: NullableText,
    })
    .nullable(),
  scope: z
    .object({
      includePaths: z.array(Text).nullable(),
      excludePaths: z.array(Text).nullable(),
      summary: NullableText,
      limitations: z.array(Text),
    })
    .nullable(),
  warnings: z.array(Text),
  artifacts: z.array(
    z.object({
      kind: z.enum([
        'scanDir',
        'outputDir',
        'reportPath',
        'manifestPath',
        'findingsPath',
        'coveragePath',
        'sarifPath',
        'artifactsDir',
      ]),
      path: Text,
    }),
  ),
});

export type CodexSecurityResult = z.infer<typeof CodexSecurityResultSchema>;
