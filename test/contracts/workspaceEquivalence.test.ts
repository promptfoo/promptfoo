import { describe, expect, expectTypeOf, it } from 'vitest';
import * as workspaceApiCommon from '../../packages/contracts/src/api/common';
import * as workspaceApiUser from '../../packages/contracts/src/api/user';
import * as workspaceBlobs from '../../packages/contracts/src/blobs';
import * as workspaceEnv from '../../packages/contracts/src/env';
import * as workspaceIndex from '../../packages/contracts/src/index';
import * as workspacePrompts from '../../packages/contracts/src/prompts';
import * as workspaceProviders from '../../packages/contracts/src/providers';
import * as workspaceShared from '../../packages/contracts/src/shared';
import * as workspaceTraceProviderEndpoint from '../../packages/contracts/src/traceProviderEndpoint';
import * as workspaceTransform from '../../packages/contracts/src/transform';
import * as workspaceValidatorPrompts from '../../packages/contracts/src/validators/prompts';
import * as workspaceValidatorShared from '../../packages/contracts/src/validators/shared';
import * as contracts from '../../src/contracts';
import * as contractsApiCommon from '../../src/contracts/api/common';
import * as contractsApiUser from '../../src/contracts/api/user';
import * as contractsBlobs from '../../src/contracts/blobs';
import * as contractsEnv from '../../src/contracts/env';
import * as contractsIndex from '../../src/contracts/index';
import * as contractsPrompts from '../../src/contracts/prompts';
import * as contractsProviders from '../../src/contracts/providers';
import * as contractsShared from '../../src/contracts/shared';
import * as contractsTraceProviderEndpoint from '../../src/contracts/traceProviderEndpoint';
import * as contractsTransform from '../../src/contracts/transform';
import * as contractsValidatorPrompts from '../../src/contracts/validators/prompts';
import * as contractsValidatorShared from '../../src/contracts/validators/shared';

describe('contracts workspace compatibility', () => {
  const pairs: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
    ['public barrel', contracts, workspaceIndex],
    ['index', contractsIndex, workspaceIndex],
    ['api/common', contractsApiCommon, workspaceApiCommon],
    ['api/user', contractsApiUser, workspaceApiUser],
    ['blobs', contractsBlobs, workspaceBlobs],
    ['env', contractsEnv, workspaceEnv],
    ['prompts', contractsPrompts, workspacePrompts],
    ['providers', contractsProviders, workspaceProviders],
    ['shared', contractsShared, workspaceShared],
    ['traceProviderEndpoint', contractsTraceProviderEndpoint, workspaceTraceProviderEndpoint],
    ['transform', contractsTransform, workspaceTransform],
    ['validators/prompts', contractsValidatorPrompts, workspaceValidatorPrompts],
    ['validators/shared', contractsValidatorShared, workspaceValidatorShared],
  ];

  it.each(pairs)('%s re-exports the same runtime symbols and instances', (_, shim, workspace) => {
    const workspaceKeys = Object.keys(workspace).sort();
    expect(Object.keys(shim).sort()).toEqual(workspaceKeys);

    for (const key of workspaceKeys) {
      expect(shim[key], key).toBe(workspace[key]);
    }
  });

  it('keeps type-only modules free of runtime exports', () => {
    for (const module of [contractsBlobs, workspaceBlobs, contractsPrompts, workspacePrompts]) {
      expect(Object.keys(module)).toEqual([]);
    }
  });

  it('preserves blob, prompt, and provider types through the compatibility modules', () => {
    expectTypeOf<contractsBlobs.BlobRef>().toEqualTypeOf<workspaceBlobs.BlobRef>();

    expectTypeOf<contractsPrompts.MinimalApiProvider>().toEqualTypeOf<workspacePrompts.MinimalApiProvider>();
    expectTypeOf<contractsPrompts.PromptContent>().toEqualTypeOf<workspacePrompts.PromptContent>();
    expectTypeOf<contractsPrompts.PromptConfig>().toEqualTypeOf<workspacePrompts.PromptConfig>();
    expectTypeOf<contractsPrompts.PromptFunctionContext>().toEqualTypeOf<workspacePrompts.PromptFunctionContext>();
    expectTypeOf<contractsPrompts.PromptFunctionResult>().toEqualTypeOf<workspacePrompts.PromptFunctionResult>();
    expectTypeOf<contractsPrompts.PromptFunction>().toEqualTypeOf<workspacePrompts.PromptFunction>();
    expectTypeOf<contractsPrompts.Prompt>().toEqualTypeOf<workspacePrompts.Prompt>();

    expectTypeOf<contractsProviders.ChatMessage>().toEqualTypeOf<workspaceProviders.ChatMessage>();
    expectTypeOf<contractsProviders.ModerationFlag>().toEqualTypeOf<workspaceProviders.ModerationFlag>();
    expectTypeOf<contractsProviders.ProviderModerationResponse>().toEqualTypeOf<workspaceProviders.ProviderModerationResponse>();
    expectTypeOf<contractsProviders.GuardrailResponse>().toEqualTypeOf<workspaceProviders.GuardrailResponse>();
    expectTypeOf<contractsProviders.ImageOutput>().toEqualTypeOf<workspaceProviders.ImageOutput>();
    expectTypeOf<contractsProviders.ProviderResponse>().toEqualTypeOf<workspaceProviders.ProviderResponse>();
    expectTypeOf<contractsProviders.ProviderEmbeddingResponse>().toEqualTypeOf<workspaceProviders.ProviderEmbeddingResponse>();
    expectTypeOf<contractsProviders.ProviderSimilarityResponse>().toEqualTypeOf<workspaceProviders.ProviderSimilarityResponse>();
    expectTypeOf<contractsProviders.ProviderClassificationResponse>().toEqualTypeOf<workspaceProviders.ProviderClassificationResponse>();
    expectTypeOf<contractsProviders.FunctionToolCallValidator>().toEqualTypeOf<workspaceProviders.FunctionToolCallValidator>();
  });

  it('preserves portable types through both public barrels', () => {
    expectTypeOf<contracts.BlobRef>().toEqualTypeOf<workspaceIndex.BlobRef>();
    expectTypeOf<contracts.Prompt>().toEqualTypeOf<workspaceIndex.Prompt>();
    expectTypeOf<contracts.ProviderResponse>().toEqualTypeOf<workspaceIndex.ProviderResponse>();
    expectTypeOf<contractsIndex.BlobRef>().toEqualTypeOf<workspaceIndex.BlobRef>();
    expectTypeOf<contractsIndex.Prompt>().toEqualTypeOf<workspaceIndex.Prompt>();
    expectTypeOf<contractsIndex.ProviderResponse>().toEqualTypeOf<workspaceIndex.ProviderResponse>();
  });

  it('keeps the trace credential matcher available only through its deep module', () => {
    expect(contractsTraceProviderEndpoint.TRACE_CREDENTIAL_PATH_SEGMENT).toBeInstanceOf(RegExp);

    for (const barrel of [contracts, contractsIndex, workspaceIndex]) {
      expect(barrel).not.toHaveProperty('TRACE_CREDENTIAL_PATH_SEGMENT');
    }
  });
});
