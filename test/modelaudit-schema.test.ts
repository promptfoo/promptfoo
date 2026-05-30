import fs from 'fs';
import path from 'path';

import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { beforeAll, describe, expect, it } from 'vitest';

describe('ModelAudit JSON Schema', () => {
  let example: unknown;
  let schema: Record<string, any>;

  beforeAll(() => {
    const version = 'v0.2.45';
    const schemaPath = path.join(
      __dirname,
      '..',
      'site',
      'static',
      'schemas',
      'modelaudit',
      version,
      'modelaudit-scan-result.schema.json',
    );
    const examplePath = path.join(
      __dirname,
      '..',
      'site',
      'static',
      'examples',
      'modelaudit',
      version,
      'modelaudit-scan-result.example.json',
    );

    schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
    example = JSON.parse(fs.readFileSync(examplePath, 'utf-8'));
  });

  it('declares its public Draft 2020-12 identifier', () => {
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.$id).toBe(
      'https://www.promptfoo.dev/schemas/modelaudit/v0.2.45/modelaudit-scan-result.schema.json',
    );
  });

  it('describes has_errors as an operational failure signal', () => {
    expect(schema.properties.has_errors.description).toBe(
      'Whether operational errors occurred during scanning',
    );
  });

  it('validates the published example result', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema);

    expect(validate(example), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });
});
