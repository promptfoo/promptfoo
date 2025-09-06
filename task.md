# Provider Loading in Promptfoo: Redteam Deep Dive

This document outlines the mechanisms for loading and configuring providers for the `redteam` feature, contrasting it with the application's general **Default Provider** system.

## 1. The Default Provider System (Not Used by Redteam)

Promptfoo has a general-purpose system for providing default providers for tasks like scoring assertions or suggesting improvements.

- **Source**: `src/providers/defaults.ts`
- **Logic**: The `getDefaultProviders()` function inspects environment variables (e.g., `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) to select a default set of providers.
- **Conclusion**: The `redteam` module **does not use this system**. It has its own self-contained provider management logic.

## 2. Redteam Provider Management: `redteamProviderManager`

All provider loading for red teaming tasks (both test generation and grading) is centralized in the `redteamProviderManager`, an instance of `RedteamProviderManager` found in `src/redteam/providers/shared.ts`.

This manager ensures that all red teaming activities use a provider from a consistent and explicit configuration path.

### 2.1. Provider for Test Case Generation

This is the provider used to generate the actual adversarial attacks via plugins.

- **Source Files**:
  - `src/redteam/index.ts` (the `synthesize` function)
  - `src/redteam/providers/shared.ts` (the `redteamProviderManager`)
- **Configuration Hierarchy**: The provider is chosen based on the following explicit order:
  1.  The `--provider` command-line flag passed to `redteam generate`.
  2.  The `provider` key in the `redteam` section of `promptfooconfig.yaml`.
  3.  A hardcoded fallback to the `ATTACKER_MODEL`.
- **Loading Logic**:
  1.  The `synthesize` function calls `redteamProviderManager.getProvider({ provider: ... })`, passing in the provider ID from the configuration hierarchy.
  2.  The manager's `loadRedteamProvider` function then either uses the existing provider instance, loads it via the standard `loadApiProviders` function, or creates a new `OpenAiChatCompletionProvider` with the default model.
  3.  This single provider instance is then used for all test generation steps, including purpose extraction, entity extraction, and running the plugins themselves.

### 2.2. Provider for Grading

This is the provider used by red team graders (subclasses of `RedteamGraderBase`) to evaluate the test case outputs.

- **Source Files**:
  - `src/redteam/plugins/base.ts` (the `RedteamGraderBase` class)
  - `src/redteam/providers/shared.ts` (the `redteamProviderManager`)
- **Configuration Hierarchy**: The grader provider is chosen based on a _different_ hierarchy:
  1.  The `provider` key within the `defaultTest` section of `promptfooconfig.yaml`.
  2.  If not found, it falls back to the default redteam provider logic (i.e., the `ATTACKER_MODEL`).
- **Loading Logic**:
  1.  The `getResult` method in `RedteamGraderBase` calls `redteamProviderManager.getProvider(...)`.
  2.  It explicitly passes the provider from `cliState.config?.defaultTest?.provider`.
  3.  If this is `undefined`, the manager's fallback logic is triggered, and it loads the default `ATTACKER_MODEL`.

## 3. Default Redteam Models

The hardcoded fallback models are defined in `src/redteam/providers/constants.ts`:

- **`ATTACKER_MODEL`**: `'gpt-4.1-2025-04-14'` (The primary default)
- **`ATTACKER_MODEL_SMALL`**: `'gpt-4o-mini'` (Used in specific cases where a smaller model is preferred)

## Final Conclusion

The `redteam` module operates with a completely independent provider loading mechanism, centralized in the `redteamProviderManager`. It **does not** interact with the global `getDefaultProviders()` system.

- **Test Generation** uses a provider explicitly configured for red teaming (`--provider` or `redteam.provider`).
- **Test Grading** uses a provider configured in the `defaultTest` section, falling back to the same default redteam model if not specified.

This ensures that the models used for generating attacks and grading them are explicitly configured and independent of other application-wide defaults.

---

## Future Work: Integrating Redteam Provider with the Default System

The current design separates the redteam provider logic from the default provider system. Integrating them would centralize provider management and improve user experience.

### Motivation

- **Centralize Defaults**: Consolidate all default provider logic into `src/providers/defaults.ts`.
- **Improve User Experience**: Allow users to run red teaming without explicit configuration. If `ANTHROPIC_API_KEY` is set, the system should automatically select a powerful Claude model for red teaming, removing the need for users to know and set a specific model ID.
- **Decouple from OpenAI**: Remove the hardcoded dependency on `OpenAiChatCompletionProvider` as the ultimate fallback, making the system more vendor-agnostic.

### Proposed Implementation Plan

1.  **Modify `DefaultProviders` Type**: In `src/types.ts`, add a new optional property `redteamProvider?: ApiProvider` to the `DefaultProviders` interface.

2.  **Enhance `getDefaultProviders`**: In `src/providers/defaults.ts`, update the `getDefaultProviders` function. For each vendor (OpenAI, Anthropic, Google, etc.), instantiate and assign a powerful, attack-generation-appropriate model to the `redteamProvider` property.
    - For OpenAI, this would be `new OpenAiChatCompletionProvider('gpt-4.1-2025-04-14')`.
    - For Anthropic, this could be `new AnthropicChatCompletionProvider('claude-3-opus-20240229')`.

3.  **Refactor `redteamProviderManager`**: In `src/redteam/providers/shared.ts`, modify the fallback logic within the `loadRedteamProvider` function.
    - The final `else` block, which currently creates a new `OpenAiChatCompletionProvider`, should be changed.
    - It should instead call `await getDefaultProviders()` and use the `redteamProvider` from the returned object.
    - It should also include a fallback to the old hardcoded logic to ensure backward compatibility in case `defaultProviders.redteamProvider` is not available.

4.  **Address Complications**: The `loadRedteamProvider` function accepts a `jsonOnly` flag. The new default provider from `getDefaultProviders` will not be pre-configured for JSON mode. The refactored function will need to handle this, potentially by "cloning" and re-configuring the provider instance it receives. This may require a standardized way for providers to be reconfigured.

### Expected Outcome

After this change, a user could simply set an environment variable like `ANTHROPIC_API_KEY`. When they run `promptfoo redteam generate` without any specific provider configuration, the system would automatically select a powerful default model from the corresponding vendor (e.g., Claude 3 Opus) to perform the attack generation. This would lower the barrier to entry and make the entire system more robust and flexible.

### Success Criteria

1.  **Decoupling Achieved**: The `redteamProviderManager`'s fallback logic is fully decoupled from the hardcoded `OpenAiChatCompletionProvider` and instead relies on the `getDefaultProviders` system.
2.  **Correct Environment-Based Defaults**: Running `redteam generate` with no explicit provider configuration correctly and automatically uses a powerful default model corresponding to the set environment variable (e.g., `ANTHROPIC_API_KEY` results in using a default Claude model).
3.  **Explicit Configuration Priority**: All existing forms of explicit configuration (`--provider` flag, `redteam.provider` config, `defaultTest.provider` for graders) continue to take precedence over the new environment-based defaults.
4.  **Graceful Failure**: If no API keys are set and no explicit provider is configured, the `redteam generate` command fails with a clear, informative error message that guides the user to set an API key or configure a provider.
5.  **Dynamic Configuration Integrity**: The `jsonOnly` flag and other dynamic configurations are still correctly applied to the provider instance, even when it is fetched from the default system.

### Validation Steps

1.  **Unit Tests for `getDefaultProviders` (`test/providers/defaults.test.ts`)**:
    - Add tests to verify that when a given vendor's API key is set (e.g., `MISTRAL_API_KEY`), the `getDefaultProviders()` result contains a `redteamProvider` that is an instance of the correct provider class with the expected powerful model ID.

2.  **Integration Tests for `redteamProviderManager` (`src/redteam/providers/shared.ts`)**:
    - **Test Case: New Default Fallback**: Test the `loadRedteamProvider` function with `provider: undefined`. Mock `getDefaultProviders` to return a specific `redteamProvider` (e.g., a mock Anthropic provider) and assert that `loadRedteamProvider` returns that mock provider.
    - **Test Case: Explicit Override**: Test that calling `loadRedteamProvider` with an explicit provider ID string correctly loads that provider, ignoring the mock `redteamProvider` from `getDefaultProviders`.
    - **Test Case: `jsonOnly` Flag**: Test that calling `loadRedteamProvider` with `jsonOnly: true` and `provider: undefined` results in a provider that is correctly configured for JSON output, even when the original provider came from the `getDefaultProviders` mock.

3.  **End-to-End (E2E) Manual Verification**:
    - **Scenario 1 (Anthropic)**: Unset all other API keys. Set `ANTHROPIC_API_KEY`. Run `promptfoo redteam generate` without a `--provider` flag. Check the logs to confirm it is using the default powerful Anthropic model (e.g., `claude-3-opus-20240229`).
    - **Scenario 2 (OpenAI)**: Unset all other API keys. Set `OPENAI_API_KEY`. Run `promptfoo redteam generate` without a `--provider` flag. Check the logs to confirm it is using the default powerful OpenAI model (e.g., `gpt-4.1-2025-04-14`).
    - **Scenario 3 (Explicit Override)**: Set any API key. Run `promptfoo redteam generate --provider "openai:gpt-3.5-turbo"`. Confirm from the logs that `gpt-3.5-turbo` is used, overriding the environment-based default.
    - **Scenario 4 (No Keys)**: Unset all API keys. Run `promptfoo redteam generate`. Verify that the command fails with a clear error message instructing the user to set an API key or configure a provider.
