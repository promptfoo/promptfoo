import { describe, expect, it } from 'vitest';
import * as contractsApiCommon from '../../src/contracts/api/common';
import * as contractsApiUser from '../../src/contracts/api/user';
import * as contractsEnv from '../../src/contracts/env';
import * as contractsPrompts from '../../src/contracts/prompts';
import * as contractsRecon from '../../src/contracts/recon';
import * as contractsReconConstants from '../../src/contracts/recon-constants';
import * as contractsShared from '../../src/contracts/shared';
import * as contractsTransform from '../../src/contracts/transform';
import * as contractsValidatorPrompts from '../../src/contracts/validators/prompts';
import * as contractsValidatorShared from '../../src/contracts/validators/shared';
import * as legacyApiCommon from '../../src/types/api/common';
import * as legacyApiUser from '../../src/types/api/user';
import * as legacyEnv from '../../src/types/env';
import * as legacyPrompts from '../../src/types/prompts';
import * as legacyShared from '../../src/types/shared';
import * as legacyTransform from '../../src/types/transform';
import * as legacyValidatorPrompts from '../../src/validators/prompts';
import * as legacyRecon from '../../src/validators/recon';
import * as legacyReconConstants from '../../src/validators/recon-constants';
import * as legacyValidatorShared from '../../src/validators/shared';

/**
 * The legacy `src/types/**` and `src/validators/**` paths re-export the
 * `src/contracts/**` modules. Assert referential equality so a future refactor
 * can't accidentally fork the public surface.
 */
describe('legacy shim equivalence', () => {
  const pairs: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
    ['api/common', legacyApiCommon, contractsApiCommon],
    ['api/user', legacyApiUser, contractsApiUser],
    ['env', legacyEnv, contractsEnv],
    ['prompts', legacyPrompts, contractsPrompts],
    ['recon', legacyRecon, contractsRecon],
    ['recon-constants', legacyReconConstants, contractsReconConstants],
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
