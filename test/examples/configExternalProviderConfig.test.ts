import assert from 'node:assert/strict';
import path from 'node:path';

import { expect, it } from 'vitest';
import { loadApiProviders } from '../../src/providers';
import { readConfig } from '../../src/util/config/load';

it('loads the provider file referenced by the external provider config example', async () => {
  const exampleDir = path.resolve(__dirname, '../../examples/config-external-provider-config');
  const { providers } = await readConfig(path.join(exampleDir, 'promptfooconfig.yaml'));

  assert(Array.isArray(providers));
  expect(providers).toEqual([expect.stringMatching(/^file:\/\//)]);
  await expect(loadApiProviders(providers, { basePath: exampleDir })).resolves.toHaveLength(1);
});
