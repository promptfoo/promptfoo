import fs from 'node:fs';
import path from 'node:path';

import { createServerOpenApiDocument } from '../src/openapi/server';

const DEFAULT_OUTPUT_PATH = 'site/static/openapi.json';
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const outputPath = args.find((arg) => arg !== '--check') ?? DEFAULT_OUTPUT_PATH;
const absoluteOutputPath = path.resolve(outputPath);
const renderedSpec = `${JSON.stringify(createServerOpenApiDocument(), null, 2)}\n`;

if (checkOnly) {
  if (!fs.existsSync(absoluteOutputPath)) {
    console.error(`OpenAPI spec is missing at ${absoluteOutputPath}`);
    console.error(`Run "npm run openapi:generate" and commit the generated file.`);
    process.exit(1);
  }

  const currentSpec = fs.readFileSync(absoluteOutputPath, 'utf8');
  if (currentSpec !== renderedSpec) {
    console.error(`OpenAPI spec is stale at ${absoluteOutputPath}`);
    console.error(`Run "npm run openapi:generate" and commit the generated file.`);
    process.exit(1);
  }

  console.log(`OpenAPI spec is current at ${absoluteOutputPath}`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true });
fs.writeFileSync(absoluteOutputPath, renderedSpec, 'utf8');

console.log(`Wrote OpenAPI spec to ${absoluteOutputPath}`);
