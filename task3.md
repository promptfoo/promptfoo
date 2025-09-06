# Comprehensive Provider Loading Analysis and Refactoring Plan

## 1. Overview

This document provides a comprehensive analysis of the current provider loading mechanisms within the `promptfoo` application, focusing on the distinct systems for **Default Providers** (for evaluation) and **Redteam Providers** (for generation).

Based on this analysis, it proposes a detailed plan to refactor and unify these systems to centralize provider management, improve user experience, and increase modularity.

---

## 2. Current State Analysis

The `promptfoo` application currently employs two separate systems for managing providers, each tailored to its specific context.

### System Comparison

| Aspect              | Default Providers           | Redteam Provider                            |
| ------------------- | --------------------------- | ------------------------------------------- |
| **Scope**           | Evaluation system           | Generation system                           |
| **Provider Count**  | 6+ specialized providers    | 1 unified provider, loaded as needed        |
| **Selection Logic** | Automatic, credential-based | Explicit configuration or hardcoded default |
| **Primary Use**     | Evaluating test cases       | Generating adversarial tests                |
| **Commands**        | `promptfoo eval`            | `promptfoo redteam generate`                |
| **Fallback**        | OpenAI providers            | `gpt-4.1-2025-04-14`                        |

### 2.1. The Default Provider System

This system is designed to provide sensible, application-wide providers for evaluating test cases.

- **Source**: `src/providers/defaults.ts`
- **Core Function**: `getDefaultProviders()`
- **Selection Logic**: Automatically selects a suite of providers by checking for environment variables (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.) in a fixed order of precedence.

### 2.2. The Redteam Provider System

This system is purpose-built for generating adversarial tests and is entirely self-contained within the `src/redteam` module.

- **Central Manager**: All provider loading is handled by the `redteamProviderManager` singleton located in `src/redteam/providers/shared.ts`. This manager caches provider instances to ensure consistency and performance.
- **Configuration Hierarchy**: The provider is selected based on a strict priority:
  1.  An explicit provider parameter passed directly to a function.
  2.  Configuration from the command line (`--provider`) or `promptfooconfig.yaml` (`redteam.provider` or `defaultTest.provider` for graders).
  3.  A hardcoded fallback to a default model, typically `ATTACKER_MODEL` (`gpt-4.1-2025-04-14`).

### 2.3. Redteam Provider Loading Instances

The `redteamProviderManager` is called from numerous locations, demonstrating its central role. This highlights the need for any refactoring to consider all these use cases.

- **Main Synthesis Function** (`src/redteam/index.ts`): Loads the primary provider for purpose/entity extraction and running plugins.
- **Advanced Attack Providers** (`src/redteam/providers/crescendo/index.ts`, `custom/index.ts`, `iterative.ts`): These complex, multi-step strategies load their own internal redteam and grading providers via the manager.
- **Strategies** (`multilingual.ts`, `mathPrompt.ts`): Individual strategies can request a specific type of provider (e.g., a smaller model for efficiency).
- **Base Grader** (`src/redteam/plugins/base.ts`): The `RedteamGraderBase` loads its provider by checking the `defaultTest` config section first, then falling back to the default redteam model.

### 2.4. Key Provider Loading Patterns

The analysis reveals four primary patterns for requesting a provider from the `redteamProviderManager`:

1.  **Default Generation**: `getProvider({ provider })` - For standard test generation.
2.  **Small Model Preference**: `getProvider({ preferSmallModel: true })` - For faster, cheaper operations like translation.
3.  **JSON-Only Responses**: `getProvider({ jsonOnly: true })` - To enforce JSON output from the model.
4.  **Target Provider Access**: `context.originalProvider` - Some strategies access the _evaluation target_ directly, bypassing the redteam provider system entirely.

---

## 3. Proposed Refactoring: Unifying Provider Defaults

The current separation is functional but can be improved. This plan proposes integrating the redteam provider's fallback logic with the default provider system.

### 3.1. Motivation

- **Centralize Defaults**: Consolidate all default provider logic into `src/providers/defaults.ts` to create a single source of truth.
- **Improve User Experience**: Allow users to run red teaming without explicit configuration. If `ANTHROPIC_API_KEY` is set, the system should automatically select a powerful Claude model, removing the need for users to know specific model IDs.
- **Decouple from OpenAI**: Remove the hardcoded dependency on `OpenAiChatCompletionProvider` as the ultimate fallback, making the system more vendor-agnostic.

### 3.2. Implementation Plan

1.  **Modify `DefaultProviders` Type**: In `src/types.ts`, add a new optional property `redteamProvider?: ApiProvider` to the `DefaultProviders` interface.

2.  **Enhance `getDefaultProviders`**: In `src/providers/defaults.ts`, update the `getDefaultProviders` function. For each vendor (OpenAI, Anthropic, Google, etc.), instantiate and assign a powerful, attack-generation-appropriate model to the `redteamProvider` property.
    - _Example for Anthropic_: `redteamProvider: new AnthropicChatCompletionProvider('claude-3-opus-20240229')`.

3.  **Refactor `redteamProviderManager`**: In `src/redteam/providers/shared.ts`, modify the fallback logic within the `loadRedteamProvider` function. The final `else` block (which currently creates a new `OpenAiChatCompletionProvider`) should be changed to `await getDefaultProviders()` and use the `redteamProvider` from the returned object.

4.  **Address Complications**: The `loadRedteamProvider` function accepts flags like `jsonOnly` and `preferSmallModel`. The refactored function must handle this, potentially by "cloning" and re-configuring the provider instance it receives from the default system. This may require a standardized way for providers to be reconfigured.

### 3.3. Success Criteria

1.  **Decoupling Achieved**: The `redteamProviderManager`'s fallback logic is fully decoupled from the hardcoded `OpenAiChatCompletionProvider`.
2.  **Correct Environment-Based Defaults**: Running `redteam generate` with no explicit provider configuration correctly uses a powerful default model corresponding to the set environment variable.
3.  **Explicit Configuration Priority**: All existing forms of explicit configuration (`--provider`, `redteam.provider`, etc.) continue to take precedence over the new defaults.
4.  **Graceful Failure**: If no API keys are set and no explicit provider is configured, the command fails with a clear error message.
5.  **Dynamic Configuration Integrity**: The `jsonOnly` and `preferSmallModel` flags are still correctly applied to the provider instance fetched from the default system.

### 3.4. Validation Steps

1.  **Unit Tests for `getDefaultProviders`**: Add tests to `test/providers/defaults.test.ts` to verify that `getDefaultProviders()` returns the expected `redteamProvider` when a given vendor's API key is set.

2.  **Integration Tests for `redteamProviderManager`**:
    - **Default Fallback Test**: Test `loadRedteamProvider` with `provider: undefined`. Mock `getDefaultProviders` to return a specific `redteamProvider` and assert that it is returned.
    - **Explicit Override Test**: Test that calling `loadRedteamProvider` with an explicit provider ID ignores the provider from the mocked `getDefaultProviders`.
    - **`jsonOnly` Flag Test**: Test that calling `loadRedteamProvider` with `jsonOnly: true` results in a provider correctly configured for JSON output.

3.  **End-to-End (E2E) Manual Verification**:
    - **Scenario 1 (Anthropic)**: With only `ANTHROPIC_API_KEY` set, run `promptfoo redteam generate` and verify from logs that the default Claude model is used.
    - **Scenario 2 (OpenAI)**: With only `OPENAI_API_KEY` set, run `promptfoo redteam generate` and verify from logs that the default GPT-4 model is used.
    - **Scenario 3 (Explicit Override)**: Set any API key. Run `promptfoo redteam generate --provider "openai:gpt-3.5-turbo"` and verify that `gpt-3.5-turbo` is used.
    - **Scenario 4 (No Keys)**: With no API keys set, verify that `promptfoo redteam generate` fails with a clear error message.
