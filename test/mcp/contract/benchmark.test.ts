import { describe, expect, it } from 'vitest';
import {
  buildServerContract,
  compareContracts,
  type CompatibilityStatus,
  type McpToolDefinition,
} from '../../../src/mcp/contract';

interface BenchmarkTestCase {
  id: string;
  category: string;
  expectedClassification: CompatibilityStatus;
  expectedBreaking: boolean;
  baseTools: McpToolDefinition[];
  currentTools: McpToolDefinition[];
}

/**
 * 25-Case Labelled Synthetic MCP Contract Change Corpus
 */
const BENCHMARK_CORPUS: BenchmarkTestCase[] = [
  // 1. Identical / Property re-ordering (Compatible)
  {
    id: 'TC-01',
    category: 'Property Order Permutation',
    expectedClassification: 'IDENTICAL',
    expectedBreaking: false,
    baseTools: [
      {
        name: 'calculate',
        description: 'Math op',
        inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'] },
      },
    ],
    currentTools: [
      {
        name: 'calculate',
        description: 'Math op',
        inputSchema: { type: 'object', properties: { b: { type: 'number' }, a: { type: 'number' } }, required: ['b', 'a'] },
      },
    ],
  },
  {
    id: 'TC-02',
    category: 'Enum Value Permutation',
    expectedClassification: 'IDENTICAL',
    expectedBreaking: false,
    baseTools: [
      {
        name: 'set_color',
        description: 'Color',
        inputSchema: { type: 'object', properties: { color: { enum: ['red', 'green', 'blue'] } } },
      },
    ],
    currentTools: [
      {
        name: 'set_color',
        description: 'Color',
        inputSchema: { type: 'object', properties: { color: { enum: ['blue', 'red', 'green'] } } },
      },
    ],
  },
  // 2. Added Tools (Compatible)
  {
    id: 'TC-03',
    category: 'Single Tool Addition',
    expectedClassification: 'NON_BREAKING',
    expectedBreaking: false,
    baseTools: [
      { name: 'tool_a', description: 'A', inputSchema: { type: 'object' } },
    ],
    currentTools: [
      { name: 'tool_a', description: 'A', inputSchema: { type: 'object' } },
      { name: 'tool_b', description: 'B', inputSchema: { type: 'object' } },
    ],
  },
  {
    id: 'TC-04',
    category: 'Multiple Tools Addition',
    expectedClassification: 'NON_BREAKING',
    expectedBreaking: false,
    baseTools: [
      { name: 'tool_a', description: 'A', inputSchema: { type: 'object' } },
    ],
    currentTools: [
      { name: 'tool_a', description: 'A', inputSchema: { type: 'object' } },
      { name: 'tool_b', description: 'B', inputSchema: { type: 'object' } },
      { name: 'tool_c', description: 'C', inputSchema: { type: 'object' } },
    ],
  },
  // 3. Removed Tools (Breaking)
  {
    id: 'TC-05',
    category: 'Single Tool Removal',
    expectedClassification: 'BREAKING',
    expectedBreaking: true,
    baseTools: [
      { name: 'tool_a', description: 'A', inputSchema: { type: 'object' } },
      { name: 'tool_b', description: 'B', inputSchema: { type: 'object' } },
    ],
    currentTools: [
      { name: 'tool_a', description: 'A', inputSchema: { type: 'object' } },
    ],
  },
  {
    id: 'TC-06',
    category: 'All Tools Removal',
    expectedClassification: 'BREAKING',
    expectedBreaking: true,
    baseTools: [
      { name: 'tool_a', description: 'A', inputSchema: { type: 'object' } },
    ],
    currentTools: [],
  },
  // 4. Renamed Tools (Breaking)
  {
    id: 'TC-07',
    category: 'Tool Renamed with High Schema Overlap',
    expectedClassification: 'BREAKING',
    expectedBreaking: true,
    baseTools: [
      {
        name: 'fetch_user_v1',
        description: 'Fetch user',
        inputSchema: { type: 'object', properties: { userId: { type: 'string' }, orgId: { type: 'string' } }, required: ['userId'] },
      },
    ],
    currentTools: [
      {
        name: 'fetch_user_v2',
        description: 'Fetch user',
        inputSchema: { type: 'object', properties: { userId: { type: 'string' }, orgId: { type: 'string' } }, required: ['userId'] },
      },
    ],
  },
  // 5. Required Properties (Breaking)
  {
    id: 'TC-08',
    category: 'New Required Property Added',
    expectedClassification: 'BREAKING',
    expectedBreaking: true,
    baseTools: [
      {
        name: 'send_email',
        description: 'Send',
        inputSchema: { type: 'object', properties: { to: { type: 'string' } }, required: ['to'] },
      },
    ],
    currentTools: [
      {
        name: 'send_email',
        description: 'Send',
        inputSchema: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' } }, required: ['to', 'subject'] },
      },
    ],
  },
  {
    id: 'TC-09',
    category: 'Optional Property Promoted to Required',
    expectedClassification: 'BREAKING',
    expectedBreaking: true,
    baseTools: [
      {
        name: 'send_email',
        description: 'Send',
        inputSchema: { type: 'object', properties: { to: { type: 'string' }, body: { type: 'string' } }, required: ['to'] },
      },
    ],
    currentTools: [
      {
        name: 'send_email',
        description: 'Send',
        inputSchema: { type: 'object', properties: { to: { type: 'string' }, body: { type: 'string' } }, required: ['to', 'body'] },
      },
    ],
  },
  // 6. Required Property Removed (Compatible / Non-breaking)
  {
    id: 'TC-10',
    category: 'Required Property Relaxed to Optional',
    expectedClassification: 'NON_BREAKING',
    expectedBreaking: false,
    baseTools: [
      {
        name: 'send_email',
        description: 'Send',
        inputSchema: { type: 'object', properties: { to: { type: 'string' }, token: { type: 'string' } }, required: ['to', 'token'] },
      },
    ],
    currentTools: [
      {
        name: 'send_email',
        description: 'Send',
        inputSchema: { type: 'object', properties: { to: { type: 'string' }, token: { type: 'string' } }, required: ['to'] },
      },
    ],
  },
  // 7. Optional Properties Added / Removed (Compatible)
  {
    id: 'TC-11',
    category: 'New Optional Property Added',
    expectedClassification: 'NON_BREAKING',
    expectedBreaking: false,
    baseTools: [
      {
        name: 'search',
        description: 'Search',
        inputSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
      },
    ],
    currentTools: [
      {
        name: 'search',
        description: 'Search',
        inputSchema: { type: 'object', properties: { q: { type: 'string' }, maxResults: { type: 'number' } }, required: ['q'] },
      },
    ],
  },
  {
    id: 'TC-12',
    category: 'Optional Property Removed',
    expectedClassification: 'NON_BREAKING',
    expectedBreaking: false,
    baseTools: [
      {
        name: 'search',
        description: 'Search',
        inputSchema: { type: 'object', properties: { q: { type: 'string' }, debug: { type: 'boolean' } }, required: ['q'] },
      },
    ],
    currentTools: [
      {
        name: 'search',
        description: 'Search',
        inputSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
      },
    ],
  },
  // 8. Type Changes (Breaking)
  {
    id: 'TC-13',
    category: 'Type Mutation: string to number',
    expectedClassification: 'BREAKING',
    expectedBreaking: true,
    baseTools: [
      {
        name: 'set_age',
        description: 'Set age',
        inputSchema: { type: 'object', properties: { age: { type: 'string' } } },
      },
    ],
    currentTools: [
      {
        name: 'set_age',
        description: 'Set age',
        inputSchema: { type: 'object', properties: { age: { type: 'number' } } },
      },
    ],
  },
  {
    id: 'TC-14',
    category: 'Type Mutation: array to object',
    expectedClassification: 'BREAKING',
    expectedBreaking: true,
    baseTools: [
      {
        name: 'upload_tags',
        description: 'Tags',
        inputSchema: { type: 'object', properties: { tags: { type: 'array' } } },
      },
    ],
    currentTools: [
      {
        name: 'upload_tags',
        description: 'Tags',
        inputSchema: { type: 'object', properties: { tags: { type: 'object' } } },
      },
    ],
  },
  // 9. Enum Mutations
  {
    id: 'TC-15',
    category: 'Enum Restricted (Value Removed)',
    expectedClassification: 'BREAKING',
    expectedBreaking: true,
    baseTools: [
      {
        name: 'checkout',
        description: 'Checkout',
        inputSchema: { type: 'object', properties: { currency: { enum: ['USD', 'EUR', 'GBP'] } } },
      },
    ],
    currentTools: [
      {
        name: 'checkout',
        description: 'Checkout',
        inputSchema: { type: 'object', properties: { currency: { enum: ['USD', 'EUR'] } } },
      },
    ],
  },
  {
    id: 'TC-16',
    category: 'Enum Expanded (New Value Permitted)',
    expectedClassification: 'NON_BREAKING',
    expectedBreaking: false,
    baseTools: [
      {
        name: 'checkout',
        description: 'Checkout',
        inputSchema: { type: 'object', properties: { currency: { enum: ['USD', 'EUR'] } } },
      },
    ],
    currentTools: [
      {
        name: 'checkout',
        description: 'Checkout',
        inputSchema: { type: 'object', properties: { currency: { enum: ['USD', 'EUR', 'INR', 'JPY'] } } },
      },
    ],
  },
  // 10. Constraint Mutations
  {
    id: 'TC-17',
    category: 'Numeric Minimum Tightened',
    expectedClassification: 'BREAKING',
    expectedBreaking: true,
    baseTools: [
      {
        name: 'deposit',
        description: 'Deposit',
        inputSchema: { type: 'object', properties: { amount: { type: 'number', minimum: 10 } } },
      },
    ],
    currentTools: [
      {
        name: 'deposit',
        description: 'Deposit',
        inputSchema: { type: 'object', properties: { amount: { type: 'number', minimum: 100 } } },
      },
    ],
  },
  {
    id: 'TC-18',
    category: 'String MinLength Tightened',
    expectedClassification: 'BREAKING',
    expectedBreaking: true,
    baseTools: [
      {
        name: 'set_password',
        description: 'Set pwd',
        inputSchema: { type: 'object', properties: { pwd: { type: 'string', minLength: 6 } } },
      },
    ],
    currentTools: [
      {
        name: 'set_password',
        description: 'Set pwd',
        inputSchema: { type: 'object', properties: { pwd: { type: 'string', minLength: 12 } } },
      },
    ],
  },
  // 11. Description-Only Changes
  {
    id: 'TC-19',
    category: 'Tool Description Minor Polish',
    expectedClassification: 'DESCRIPTION_ONLY',
    expectedBreaking: false,
    baseTools: [
      { name: 'search', description: 'Search items', inputSchema: { type: 'object' } },
    ],
    currentTools: [
      { name: 'search', description: 'Search products and items with fuzzy matching', inputSchema: { type: 'object' } },
    ],
  },
  {
    id: 'TC-20',
    category: 'Tool Description Detailed Documentation Update',
    expectedClassification: 'DESCRIPTION_ONLY',
    expectedBreaking: false,
    baseTools: [
      { name: 'weather', description: 'Get weather', inputSchema: { type: 'object' } },
    ],
    currentTools: [
      { name: 'weather', description: 'Retrieve real-time temperature, humidity and precipitation forecast', inputSchema: { type: 'object' } },
    ],
  },
  // 12. Compound Multi-Tool Real-World Scenarios
  {
    id: 'TC-21',
    category: 'Compound: Added Tool + Optional Property (Compatible)',
    expectedClassification: 'NON_BREAKING',
    expectedBreaking: false,
    baseTools: [
      { name: 'tool_1', description: 'T1', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    ],
    currentTools: [
      { name: 'tool_1', description: 'T1', inputSchema: { type: 'object', properties: { id: { type: 'string' }, debug: { type: 'boolean' } }, required: ['id'] } },
      { name: 'tool_2', description: 'T2', inputSchema: { type: 'object' } },
    ],
  },
  {
    id: 'TC-22',
    category: 'Compound: Added Tool + Breaking Type Change (Breaking)',
    expectedClassification: 'BREAKING',
    expectedBreaking: true,
    baseTools: [
      { name: 'tool_1', description: 'T1', inputSchema: { type: 'object', properties: { count: { type: 'number' } } } },
    ],
    currentTools: [
      { name: 'tool_1', description: 'T1', inputSchema: { type: 'object', properties: { count: { type: 'string' } } } },
      { name: 'tool_2', description: 'T2', inputSchema: { type: 'object' } },
    ],
  },
  {
    id: 'TC-23',
    category: 'Compound: Description Change + Enum Expansion (Compatible)',
    expectedClassification: 'NON_BREAKING',
    expectedBreaking: false,
    baseTools: [
      { name: 'format', description: 'Format file', inputSchema: { type: 'object', properties: { fmt: { enum: ['json', 'csv'] } } } },
    ],
    currentTools: [
      { name: 'format', description: 'Format and export document', inputSchema: { type: 'object', properties: { fmt: { enum: ['json', 'csv', 'tsv'] } } } },
    ],
  },
  {
    id: 'TC-24',
    category: 'Root Schema Type Mismatch',
    expectedClassification: 'BREAKING',
    expectedBreaking: true,
    baseTools: [
      { name: 'stream', description: 'Stream', inputSchema: { type: 'object' } },
    ],
    currentTools: [
      { name: 'stream', description: 'Stream', inputSchema: { type: 'string' } },
    ],
  },
  {
    id: 'TC-25',
    category: 'Pattern Regex Constraint Added',
    expectedClassification: 'BREAKING',
    expectedBreaking: true,
    baseTools: [
      { name: 'validate_zip', description: 'Zip', inputSchema: { type: 'object', properties: { zip: { type: 'string' } } } },
    ],
    currentTools: [
      { name: 'validate_zip', description: 'Zip', inputSchema: { type: 'object', properties: { zip: { type: 'string', pattern: '^\\d{5}$' } } } },
    ],
  },
];

describe('MCP Contract Drift Benchmark & Rigorous Metrics', () => {
  it('achieves 100% Precision, Recall, and F1 score across all 25 benchmark cases', () => {
    let tp = 0; // True Positive: correctly flagged breaking change
    let tn = 0; // True Negative: correctly identified non-breaking / identical
    let fp = 0; // False Positive: flagged non-breaking as breaking
    let fn = 0; // False Negative: missed a breaking change

    const latenciesMs: number[] = [];

    for (const testCase of BENCHMARK_CORPUS) {
      const baseContract = buildServerContract('benchmark-server', testCase.baseTools);
      const currentContract = buildServerContract('benchmark-server', testCase.currentTools);

      const startTime = performance.now();
      const diff = compareContracts(baseContract, currentContract);
      const elapsedMs = performance.now() - startTime;
      latenciesMs.push(elapsedMs);

      // Verify exact classification matches ground truth
      expect(diff.status).toBe(testCase.expectedClassification);
      expect(diff.hasBreakingChanges).toBe(testCase.expectedBreaking);

      if (testCase.expectedBreaking) {
        if (diff.hasBreakingChanges) {
          tp++;
        } else {
          fn++;
        }
      } else {
        if (!diff.hasBreakingChanges) {
          tn++;
        } else {
          fp++;
        }
      }
    }

    const precision = tp / (tp + fp);
    const recall = tp / (tp + fn);
    const f1 = (2 * precision * recall) / (precision + recall);
    const fpr = fp / (fp + tn);
    const fnr = fn / (fn + tp);

    const avgLatency = latenciesMs.reduce((a, b) => a + b, 0) / latenciesMs.length;
    const maxLatency = Math.max(...latenciesMs);

    // Assert perfect detection metrics
    expect(precision).toBe(1.0);
    expect(recall).toBe(1.0);
    expect(f1).toBe(1.0);
    expect(fpr).toBe(0.0);
    expect(fnr).toBe(0.0);

    // Performance assertion: average detection latency < 5ms per comparison
    expect(avgLatency).toBeLessThan(5.0);

    // Print verified metrics for test logs and documentation
    console.log(`\n=== MCP CONTRACT DRIFT BENCHMARK RESULTS ===`);
    console.log(`Corpus Size:               ${BENCHMARK_CORPUS.length} labelled test cases`);
    console.log(`True Positives (TP):       ${tp}`);
    console.log(`True Negatives (TN):       ${tn}`);
    console.log(`False Positives (FP):      ${fp}`);
    console.log(`False Negatives (FN):      ${fn}`);
    console.log(`Precision:                 ${(precision * 100).toFixed(2)}%`);
    console.log(`Recall:                    ${(recall * 100).toFixed(2)}%`);
    console.log(`F1-Score:                  ${(f1 * 100).toFixed(2)}%`);
    console.log(`False Positive Rate (FPR): ${(fpr * 100).toFixed(2)}%`);
    console.log(`False Negative Rate (FNR): ${(fnr * 100).toFixed(2)}%`);
    console.log(`Average Comparison Latency:${avgLatency.toFixed(3)} ms`);
    console.log(`Max Comparison Latency:    ${maxLatency.toFixed(3)} ms`);
    console.log(`============================================\n`);
  });
});

