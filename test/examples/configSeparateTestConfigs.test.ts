import assert from 'node:assert/strict';
import path from 'node:path';

import { expect, it } from 'vitest';
import { resolveJavaScriptFileFunction } from '../../src/assertions/utils';
import { readConfig } from '../../src/util/config/load';
import { parseFileUrl } from '../../src/util/functions/loadFunction';
import { readTests } from '../../src/util/testCaseReader';

it('loads the external assertion referenced by the separate test configs example', async () => {
  const exampleDir = path.resolve(__dirname, '../../examples/config-separate-test-configs');
  const config = await readConfig(path.join(exampleDir, 'promptfooconfig.yaml'));
  const testCases = await readTests(config.tests, exampleDir);
  const cerealTest = testCases.find(({ vars }) => vars?.topic === 'fruit loops');
  const assertionRef = cerealTest?.assert?.find(({ type }) => type === 'javascript')?.value;
  assert(typeof assertionRef === 'string', 'Expected a JavaScript assertion file reference');

  const { filePath, functionName } = parseFileUrl(assertionRef);
  await expect(
    resolveJavaScriptFileFunction(path.resolve(exampleDir, filePath), functionName),
  ).resolves.toBeTypeOf('function');
});
