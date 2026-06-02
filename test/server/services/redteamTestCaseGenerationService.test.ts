import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockResponse } from '../../util/utils';

import type { MultiTurnPromptParams } from '../../../src/server/services/redteamTestCaseGenerationService';

async function getExpectedRemoteGenerationUrl() {
  const { getRemoteGenerationUrl } = await vi.importActual<
    typeof import('../../../src/redteam/remoteGeneration')
  >('../../../src/redteam/remoteGeneration');
  return getRemoteGenerationUrl();
}
const TEST_REQUEST_TIMEOUT_MS = 300000;
const MOCKED_MODULES = [
  '../../../src/util/fetch/index',
  '../../../src/redteam/remoteGeneration',
  '../../../src/providers/shared',
  '../../../src/constants',
];

function mockRemoteGeneration(responseBody: unknown, rejectWith?: Error) {
  const fetchWithRetries = rejectWith
    ? vi.fn().mockRejectedValueOnce(rejectWith)
    : vi.fn().mockResolvedValueOnce(
        createMockResponse({
          body: responseBody,
        }),
      );

  vi.doMock('../../../src/util/fetch/index', () => ({
    fetchWithRetries,
  }));
  vi.doMock('../../../src/redteam/remoteGeneration', async () => ({
    getRemoteGenerationUrl: vi.fn().mockReturnValue(await getExpectedRemoteGenerationUrl()),
    getRemoteGenerationHeaders: vi.fn((extra) => ({
      'Content-Type': 'application/json',
      ...extra,
    })),
    neverGenerateRemote: vi.fn().mockReturnValue(false),
  }));
  vi.doMock('../../../src/providers/shared', () => ({
    getRequestTimeoutMs: () => TEST_REQUEST_TIMEOUT_MS,
  }));
  vi.doMock('../../../src/constants', () => ({
    VERSION: '0.0.0-test',
  }));

  return fetchWithRetries;
}

async function generatePromptForStrategy(strategyId: MultiTurnPromptParams['strategyId']) {
  const { generateMultiTurnPrompt } = await import(
    '../../../src/server/services/redteamTestCaseGenerationService'
  );

  await generateMultiTurnPrompt({
    pluginId: 'harmful:hate',
    strategyId,
    strategyConfigRecord: {},
    history: [],
    turn: 0,
    maxTurns: 5,
    baseMetadata: { pluginConfig: {} },
    generatedPrompt: 'initial prompt',
    purpose: 'test purpose',
  });
}

async function expectTaskRequest(fetchWithRetries: ReturnType<typeof vi.fn>, expectedTask: string) {
  expect(fetchWithRetries).toHaveBeenCalledTimes(1);
  const [url, request, timeout] = fetchWithRetries.mock.calls[0]!;
  const body = JSON.parse(String(request.body));

  expect(url).toBe(await getExpectedRemoteGenerationUrl());
  expect(request).toMatchObject({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  expect(body.task).toBe(expectedTask);
  expect(timeout).toBe(TEST_REQUEST_TIMEOUT_MS);
}

describe('redteamTestCaseGenerationService', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetAllMocks();
    for (const modulePath of MOCKED_MODULES) {
      vi.doUnmock(modulePath);
    }
    vi.resetModules();
  });

  describe('multi-turn strategy handlers use fetchWithRetries', () => {
    it('should call fetchWithRetries with correct parameters for GOAT strategy', async () => {
      const fetchWithRetries = mockRemoteGeneration({
        message: { content: 'test prompt' },
        tokenUsage: { total: 100 },
      });

      await generatePromptForStrategy('goat');

      await expectTaskRequest(fetchWithRetries, 'goat');
    });

    it('should propagate remote generation failures', async () => {
      const remoteError = new Error('remote generation failed');
      const fetchWithRetries = mockRemoteGeneration(undefined, remoteError);

      await expect(generatePromptForStrategy('goat')).rejects.toThrow('remote generation failed');
      expect(fetchWithRetries).toHaveBeenCalledTimes(1);
    });

    it('should call fetchWithRetries with correct parameters for Crescendo strategy', async () => {
      const fetchWithRetries = mockRemoteGeneration({
        result: {
          generatedQuestion: 'test question',
          lastResponseSummary: 'summary',
          rationaleBehindJailbreak: 'rationale',
        },
      });

      await generatePromptForStrategy('crescendo');

      await expectTaskRequest(fetchWithRetries, 'crescendo');
    });

    it('should call fetchWithRetries with correct parameters for Hydra strategy', async () => {
      const fetchWithRetries = mockRemoteGeneration({
        result: { prompt: 'test prompt' },
      });

      await generatePromptForStrategy('jailbreak:hydra');

      await expectTaskRequest(fetchWithRetries, 'hydra-decision');
    });

    it('should call fetchWithRetries with correct parameters for Mischievous User strategy', async () => {
      const fetchWithRetries = mockRemoteGeneration({
        result: 'test prompt',
      });

      await generatePromptForStrategy('mischievous-user');

      await expectTaskRequest(fetchWithRetries, 'mischievous-user-redteam');
    });
  });

  describe('getPluginConfigurationError', () => {
    it('validates privacy policy consistency config before preview generation', async () => {
      const { getPluginConfigurationError } = await import(
        '../../../src/server/services/redteamTestCaseGenerationService'
      );

      expect(
        getPluginConfigurationError({
          id: 'privacy-policy-consistency',
          config: {},
        }),
      ).toBe(
        'Privacy Policy Consistency plugin requires `config.privacyPolicy` to be set to a file:// reference or an uploaded privacy policy file.',
      );
      expect(
        getPluginConfigurationError({
          id: 'privacy-policy-consistency',
          config: { privacyPolicy: 'https://example.com/privacy-policy' },
        }),
      ).toBe(
        'Privacy Policy Consistency plugin requires file-backed URI references to use the file:// scheme.',
      );
      expect(
        getPluginConfigurationError({
          id: 'privacy-policy-consistency',
          config: { privacyPolicyContent: 'Resolved policy contents.' },
        }),
      ).toBeNull();
      const missingPolicyError = getPluginConfigurationError({
        id: 'privacy-policy-consistency',
        config: { privacyPolicy: 'file:///definitely/does/not/exist/privacy-policy.md' },
      });
      expect(missingPolicyError).toBe(
        'Privacy Policy Consistency plugin could not load `config.privacyPolicy` from the provided file:// reference.',
      );
      expect(missingPolicyError).not.toContain('/definitely/does/not/exist');
    });

    it('requires privacy geographies for privacy rights workflow test generation', async () => {
      const { getPluginConfigurationError } = await import(
        '../../../src/server/services/redteamTestCaseGenerationService'
      );

      expect(
        getPluginConfigurationError({
          id: 'privacy:rights-request-workflow-integrity',
          config: {},
        }),
      ).toBe(
        'Privacy Rights Request Workflow Integrity plugin requires `config.geographies` with at least one supported privacy geography.',
      );
      expect(
        getPluginConfigurationError({
          id: 'privacy:rights-request-workflow-integrity',
          config: { geographies: ['unsupported'] },
        }),
      ).toBe(
        'Privacy Rights Request Workflow Integrity plugin supports only these `config.geographies` values: california-ccpa, eu-gdpr.',
      );
      expect(
        getPluginConfigurationError({
          id: 'privacy:rights-request-workflow-integrity',
          config: { geographies: ['california-ccpa'] },
        }),
      ).toBeNull();
      expect(
        getPluginConfigurationError({
          id: 'privacy:rights-request-workflow-integrity',
          config: { geographies: ['eu-gdpr'], frameworks: ['unsupported'] },
        }),
      ).toBeNull();
      expect(
        getPluginConfigurationError({
          id: 'privacy:rights-request-workflow-integrity',
          config: { frameworks: ['gdpr'] },
        }),
      ).toBeNull();
      const missingWorkflowError = getPluginConfigurationError({
        id: 'privacy:rights-request-workflow-integrity',
        config: {
          geographies: ['eu-gdpr'],
          rightsRequestPolicy: 'file:///definitely/does/not/exist/privacy-workflow.md',
        },
      });
      expect(missingWorkflowError).toBe(
        'Privacy Rights Request Workflow Integrity plugin could not load `config.rightsRequestPolicy` from the provided file:// reference.',
      );
      expect(missingWorkflowError).not.toContain('/definitely/does/not/exist');
    });

    it('requires profiles for automated decision response test generation', async () => {
      const { getPluginConfigurationError } = await import(
        '../../../src/server/services/redteamTestCaseGenerationService'
      );

      expect(
        getPluginConfigurationError({
          id: 'decisioning:automated-decision-response-integrity',
          config: {},
        }),
      ).toBe(
        'Automated Decision Response Integrity plugin requires `config.profiles` with at least one supported decision-response profile.',
      );
      expect(
        getPluginConfigurationError({
          id: 'decisioning:automated-decision-response-integrity',
          config: { profiles: ['unsupported'] },
        }),
      ).toBe(
        'Automated Decision Response Integrity plugin supports only these `config.profiles` values: california-ccpa-admt, eu-ai-act-high-risk-explanation, colorado-ai-act-consequential-decision.',
      );
      expect(
        getPluginConfigurationError({
          id: 'decisioning:automated-decision-response-integrity',
          config: {
            profiles: ['california-ccpa-admt'],
            decisionResponsePolicyContent: { text: 'not uploaded text' },
          },
        }),
      ).toBe(
        'Automated Decision Response Integrity plugin requires `config.decisionResponsePolicyContent` to be uploaded text when provided.',
      );
      expect(
        getPluginConfigurationError({
          id: 'decisioning:automated-decision-response-integrity',
          config: { profiles: ['california-ccpa-admt'] },
        }),
      ).toBeNull();
      const missingPolicyError = getPluginConfigurationError({
        id: 'decisioning:automated-decision-response-integrity',
        config: {
          profiles: ['california-ccpa-admt'],
          decisionResponsePolicy: 'file:///definitely/does/not/exist/decision-response-sop.md',
        },
      });
      expect(missingPolicyError).toBe(
        'Automated Decision Response Integrity plugin could not load `config.decisionResponsePolicy` from the provided file:// reference.',
      );
      expect(missingPolicyError).not.toContain('/definitely/does/not/exist');
    });
  });
});
