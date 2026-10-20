import fs from 'fs';
import path from 'path';

import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { beforeAll, describe, expect, it } from 'vitest';

describe('ModelAudit JSON Schema', () => {
  type JsonObject = Record<string, unknown>;

  let example: JsonObject;
  let schema: JsonObject;

  const readJsonObject = (filePath: string): JsonObject => {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Expected ${filePath} to contain a JSON object`);
    }
    return value as JsonObject;
  };

  const schemaPath = path.join(
    __dirname,
    '..',
    'site',
    'static',
    'schemas',
    'modelaudit',
    'modelaudit-scan-result.schema.json',
  );

  const examplePath = path.join(
    __dirname,
    '..',
    'site',
    'static',
    'examples',
    'modelaudit',
    'modelaudit-scan-result.example.json',
  );

  beforeAll(() => {
    schema = readJsonObject(schemaPath);
    example = readJsonObject(examplePath);
  });

  it('declares its public Draft 2020-12 identifier', () => {
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.$id).toBe(
      'https://www.promptfoo.dev/schemas/modelaudit/modelaudit-scan-result.schema.json',
    );
  });

  it('describes has_errors as an operational failure signal', () => {
    const properties = schema.properties as JsonObject;
    const hasErrors = properties.has_errors as JsonObject;
    expect(hasErrors.description).toBe('Whether operational errors occurred during scanning');
  });

  it('validates the published example result', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema);

    expect(validate(example), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });
});
