/**
 * Export utilities for the Ink UI.
 *
 * Converts EvaluateTable data to various output formats
 * and writes to file.
 */

import fs from 'fs';
import path from 'path';

import type { EvaluateTable } from '../../types/index';

export type ExportFormat = 'json' | 'yaml' | 'csv' | 'txt';

export interface ExportFormatInfo {
  key: string;
  label: string;
  extension: string;
  description: string;
}

/**
 * Available export formats with their metadata.
 */
export const EXPORT_FORMATS: ExportFormatInfo[] = [
  { key: 'j', label: 'JSON', extension: '.json', description: 'Full data in JSON format' },
  { key: 'y', label: 'YAML', extension: '.yaml', description: 'Human-readable YAML format' },
  { key: 'c', label: 'CSV', extension: '.csv', description: 'Spreadsheet-compatible CSV' },
  { key: 't', label: 'Text', extension: '.txt', description: 'Plain text summary' },
];

/**
 * Convert EvaluateTable to JSON string.
 */
function tableToJson(table: EvaluateTable): string {
  return JSON.stringify(table, null, 2);
}

/**
 * Convert EvaluateTable to YAML string.
 * Simple YAML serialization without external dependencies.
 */
function tableToYaml(table: EvaluateTable): string {
  const lines: string[] = ['# Promptfoo Evaluation Results', ''];

  // Head section
  lines.push('head:');
  lines.push('  vars:');
  for (const varName of table.head.vars) {
    lines.push(`    - "${escapeYamlString(varName)}"`);
  }
  lines.push('  prompts:');
  for (const prompt of table.head.prompts) {
    lines.push(`    - provider: "${escapeYamlString(prompt.provider || '')}"`);
    lines.push(`      label: "${escapeYamlString(prompt.label || '')}"`);
  }

  // Body section
  lines.push('');
  lines.push('body:');
  for (const row of table.body) {
    lines.push(`  - testIdx: ${row.testIdx}`);
    if (row.description) {
      lines.push(`    description: "${escapeYamlString(row.description)}"`);
    }
    lines.push('    vars:');
    for (const v of row.vars) {
      lines.push(`      - "${escapeYamlString(truncateForYaml(v))}"`);
    }
    lines.push('    outputs:');
    for (const output of row.outputs) {
      lines.push(`      - pass: ${output.pass}`);
      lines.push(`        score: ${output.score}`);
      lines.push(`        text: "${escapeYamlString(truncateForYaml(output.text))}"`);
      if (output.error) {
        lines.push(`        error: "${escapeYamlString(output.error)}"`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Escape special characters for YAML strings.
 */
function escapeYamlString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/**
 * Truncate long strings for YAML output.
 */
function truncateForYaml(str: string, maxLength: number = 200): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Convert EvaluateTable to CSV string.
 */
function tableToCsv(table: EvaluateTable): string {
  const lines: string[] = [];

  // Header row: vars + provider columns
  const headers = [
    ...table.head.vars,
    ...table.head.prompts.map((p) => `[${p.provider}] ${p.label || 'output'}`),
  ];
  lines.push(headers.map(escapeCsvField).join(','));

  // Data rows
  for (const row of table.body) {
    const cells = [
      ...row.vars.map(escapeCsvField),
      ...row.outputs.map((output) => {
        const status = output.pass ? '[PASS]' : output.error ? '[ERROR]' : '[FAIL]';
        const text = output.text || output.error || '';
        return escapeCsvField(`${status} ${text}`);
      }),
    ];
    lines.push(cells.join(','));
  }

  return lines.join('\n');
}

/**
 * Escape a field for CSV format.
 */
function escapeCsvField(field: string): string {
  // If field contains comma, newline, or quote, wrap in quotes and escape quotes
  if (field.includes(',') || field.includes('\n') || field.includes('"')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Convert EvaluateTable to plain text summary.
 */
function tableToText(table: EvaluateTable): string {
  const lines: string[] = [];

  lines.push('PROMPTFOO EVALUATION RESULTS');
  lines.push('='.repeat(40));
  lines.push('');

  // Summary stats
  let passes = 0;
  let fails = 0;
  let errors = 0;
  for (const row of table.body) {
    for (const output of row.outputs) {
      if (output.pass) {
        passes++;
      } else if (output.error) {
        errors++;
      } else {
        fails++;
      }
    }
  }
  const total = passes + fails + errors;
  const passRate = total > 0 ? ((passes / total) * 100).toFixed(1) : '0.0';

  lines.push(`Total Tests: ${table.body.length}`);
  lines.push(`Total Results: ${total}`);
  lines.push(`Passed: ${passes} (${passRate}%)`);
  lines.push(`Failed: ${fails}`);
  lines.push(`Errors: ${errors}`);
  lines.push('');
  lines.push('-'.repeat(40));
  lines.push('');

  // Providers
  lines.push('PROVIDERS:');
  for (const prompt of table.head.prompts) {
    lines.push(`  - ${prompt.provider} (${prompt.label || 'default'})`);
  }
  lines.push('');

  // Variables
  lines.push('VARIABLES:');
  for (const varName of table.head.vars) {
    lines.push(`  - ${varName}`);
  }
  lines.push('');

  // Results detail (first 20 rows)
  lines.push('-'.repeat(40));
  lines.push('RESULTS (first 20 rows):');
  lines.push('');

  const rowsToShow = Math.min(table.body.length, 20);
  for (let i = 0; i < rowsToShow; i++) {
    const row = table.body[i];
    lines.push(`Test ${row.testIdx + 1}:`);
    if (row.description) {
      lines.push(`  Description: ${row.description}`);
    }
    for (let j = 0; j < row.outputs.length; j++) {
      const output = row.outputs[j];
      const provider = table.head.prompts[j]?.provider || `Provider ${j + 1}`;
      const status = output.pass ? 'PASS' : output.error ? 'ERROR' : 'FAIL';
      const text = (output.text || output.error || '').slice(0, 100);
      lines.push(`  [${status}] ${provider}: ${text}${text.length >= 100 ? '...' : ''}`);
    }
    lines.push('');
  }

  if (table.body.length > 20) {
    lines.push(`... and ${table.body.length - 20} more rows`);
  }

  return lines.join('\n');
}

/**
 * Convert EvaluateTable to the specified format.
 */
export function convertTableToFormat(table: EvaluateTable, format: ExportFormat): string {
  switch (format) {
    case 'json':
      return tableToJson(table);
    case 'yaml':
      return tableToYaml(table);
    case 'csv':
      return tableToCsv(table);
    case 'txt':
      return tableToText(table);
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}

/**
 * Generate a default filename for export.
 */
export function generateDefaultFilename(format: ExportFormat): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
  const formatInfo = EXPORT_FORMATS.find((f) => f.extension === `.${format}`);
  const extension = formatInfo?.extension || `.${format}`;
  return `promptfoo-results-${timestamp}${extension}`;
}

export interface ExportResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

/**
 * Export EvaluateTable to a file.
 */
export function exportTableToFile(
  table: EvaluateTable,
  format: ExportFormat,
  outputPath?: string,
): ExportResult {
  try {
    const content = convertTableToFormat(table, format);
    const filePath = outputPath || generateDefaultFilename(format);

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (dir && dir !== '.' && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, content, 'utf-8');

    return {
      success: true,
      filePath: path.resolve(filePath),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get format from key press.
 */
export function getFormatFromKey(key: string): ExportFormat | null {
  const formatInfo = EXPORT_FORMATS.find((f) => f.key === key.toLowerCase());
  if (!formatInfo) {
    return null;
  }
  // Map the key to the actual format
  switch (formatInfo.key) {
    case 'j':
      return 'json';
    case 'y':
      return 'yaml';
    case 'c':
      return 'csv';
    case 't':
      return 'txt';
    default:
      return null;
  }
}
