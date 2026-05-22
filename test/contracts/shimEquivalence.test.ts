import { describe, expect, it } from 'vitest';
import * as contractsEnv from '../../src/contracts/env';
import * as contractsPrompts from '../../src/contracts/prompts';
import * as contractsShared from '../../src/contracts/shared';
import * as contractsTransform from '../../src/contracts/transform';
import * as contractsValidatorPrompts from '../../src/contracts/validators/prompts';
import * as contractsValidatorShared from '../../src/contracts/validators/shared';
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
