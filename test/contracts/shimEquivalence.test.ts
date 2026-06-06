import { describe, expect, it } from 'vitest';
import * as contractsApiBlobs from '../../src/contracts/api/blobs';
import * as contractsApiCommon from '../../src/contracts/api/common';
import * as contractsApiConfigs from '../../src/contracts/api/configs';
import * as contractsApiMedia from '../../src/contracts/api/media';
import * as contractsApiModelAudit from '../../src/contracts/api/modelAudit';
import * as contractsApiResponses from '../../src/contracts/api/responses';
import * as contractsApiRoutes from '../../src/contracts/api/routes';
import * as contractsApiTraces from '../../src/contracts/api/traces';
import * as contractsApiUser from '../../src/contracts/api/user';
import * as contractsApiVersion from '../../src/contracts/api/version';
import * as contractsEnv from '../../src/contracts/env';
import * as contractsPrompts from '../../src/contracts/prompts';
import * as contractsShared from '../../src/contracts/shared';
import * as contractsTransform from '../../src/contracts/transform';
import * as contractsValidatorPrompts from '../../src/contracts/validators/prompts';
import * as contractsValidatorShared from '../../src/contracts/validators/shared';
import * as legacyApiBlobs from '../../src/types/api/blobs';
import * as legacyApiCommon from '../../src/types/api/common';
import * as legacyApiConfigs from '../../src/types/api/configs';
import * as legacyApiMedia from '../../src/types/api/media';
import * as legacyApiModelAudit from '../../src/types/api/modelAudit';
import * as legacyApiResponses from '../../src/types/api/responses';
import * as legacyApiRoutes from '../../src/types/api/routes';
import * as legacyApiTraces from '../../src/types/api/traces';
import * as legacyApiUser from '../../src/types/api/user';
import * as legacyApiVersion from '../../src/types/api/version';
import * as legacyEnv from '../../src/types/env';
import * as legacyPrompts from '../../src/types/prompts';
import * as legacyShared from '../../src/types/shared';
import * as legacyTransform from '../../src/types/transform';
import * as legacyValidatorPrompts from '../../src/validators/prompts';
import * as legacyValidatorShared from '../../src/validators/shared';

/**
 * The legacy `src/types/**` and `src/validators/**` paths re-export the
 * `src/contracts/**` modules. Assert referential equality so a future refactor
 * can't accidentally fork the public surface.
 */
describe('legacy shim equivalence', () => {
  const pairs: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
    ['api/blobs', legacyApiBlobs, contractsApiBlobs],
    ['api/common', legacyApiCommon, contractsApiCommon],
    ['api/configs', legacyApiConfigs, contractsApiConfigs],
    ['api/media', legacyApiMedia, contractsApiMedia],
    ['api/modelAudit', legacyApiModelAudit, contractsApiModelAudit],
    ['api/responses', legacyApiResponses, contractsApiResponses],
    ['api/routes', legacyApiRoutes, contractsApiRoutes],
    ['api/traces', legacyApiTraces, contractsApiTraces],
    ['api/user', legacyApiUser, contractsApiUser],
    ['api/version', legacyApiVersion, contractsApiVersion],
    ['env', legacyEnv, contractsEnv],
    ['prompts', legacyPrompts, contractsPrompts],
    ['shared', legacyShared, contractsShared],
    ['transform', legacyTransform, contractsTransform],
    ['validators/prompts', legacyValidatorPrompts, contractsValidatorPrompts],
    ['validators/shared', legacyValidatorShared, contractsValidatorShared],
  ];

  it.each(
    pairs,
  )('%s: legacy module re-exports identical runtime symbols', (_, legacy, contracts) => {
    const legacyKeys = Object.keys(legacy).sort();
    const contractsKeys = Object.keys(contracts).sort();
    expect(legacyKeys).toEqual(contractsKeys);

    for (const key of legacyKeys) {
      expect(legacy[key]).toBe(contracts[key]);
    }
  });
});
