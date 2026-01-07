/**
 * Integration test for --filter-providers flag
 * Regression test for issue #6947: filter-providers should work with providers
 * that have same id but different labels
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('filter-providers integration test', () => {
  const testDir = path.join(process.cwd(), '.test-tmp', 'filter-providers-integration');
  const configPath = path.join(testDir, 'promptfooconfig.yaml');
  const outputPath = path.join(testDir, 'output.json');

  beforeAll(() => {
    // Create test directory and config
    fs.mkdirSync(testDir, { recursive: true });

    const config = `
description: 'Integration test for filter-providers'
prompts:
  - 'Echo: {{message}}'
providers:
  - id: echo
    label: 'provider-a'
    config:
      output: 'Response from A: {{prompt}}'
  - id: echo
    label: 'provider-b'
    config:
      output: 'Response from B: {{prompt}}'
tests:
  - vars:
      message: 'test'
`;
    fs.writeFileSync(configPath, config.trim());
  });

  afterAll(() => {
    // Clean up
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should filter by provider label (provider-a)', () => {
    const cmd = `npm run local -- eval -c ${configPath} --no-cache --filter-providers provider-a -o ${outputPath}`;

    const output = execSync(cmd, {
      encoding: 'utf-8',
      stdio: 'pipe',
      env: { ...process.env, PROMPTFOO_DISABLE_TELEMETRY: '1' },
    });

    // Check that only provider-a appears in the output
    expect(output).toContain('[provider-a]');
    expect(output).not.toContain('[provider-b]');

    // Verify the output file was created
    expect(fs.existsSync(outputPath)).toBe(true);

    // Clean up output file
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
  });

  it('should filter by provider label (provider-b)', () => {
    const cmd = `npm run local -- eval -c ${configPath} --no-cache --filter-providers provider-b -o ${outputPath}`;

    const output = execSync(cmd, {
      encoding: 'utf-8',
      stdio: 'pipe',
      env: { ...process.env, PROMPTFOO_DISABLE_TELEMETRY: '1' },
    });

    // Check that only provider-b appears in the output
    expect(output).not.toContain('[provider-a]');
    expect(output).toContain('[provider-b]');

    // Verify the output file was created
    expect(fs.existsSync(outputPath)).toBe(true);

    // Clean up output file
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
  });

  it('should run both providers when no filter is applied', () => {
    const cmd = `npm run local -- eval -c ${configPath} --no-cache -o ${outputPath}`;

    const output = execSync(cmd, {
      encoding: 'utf-8',
      stdio: 'pipe',
      env: { ...process.env, PROMPTFOO_DISABLE_TELEMETRY: '1' },
    });

    // Check that both providers appear in the output
    expect(output).toContain('[provider-a]');
    expect(output).toContain('[provider-b]');

    // Verify the output file was created
    expect(fs.existsSync(outputPath)).toBe(true);

    // Clean up output file
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
  });

  it('should show warning when filter matches no providers', () => {
    const cmd = `npm run local -- eval -c ${configPath} --no-cache --filter-providers nonexistent -o ${outputPath} 2>&1`;

    const output = execSync(cmd, {
      encoding: 'utf-8',
      stdio: 'pipe',
      env: { ...process.env, PROMPTFOO_DISABLE_TELEMETRY: '1' },
    });

    // Should show warning about no matches
    expect(output).toContain('No providers matched the filter');
  });
});
