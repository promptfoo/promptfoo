import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerShareEvaluationTool } from '../../../../src/commands/mcp/tools/shareEvaluation';
import { cloudConfig } from '../../../../src/globalConfig/cloud';
import Eval from '../../../../src/models/eval';
import {
  createShareableUrl,
  getShareableUrl,
  hasEvalBeenShared,
  isSharingEnabled,
} from '../../../../src/share';
import { loadDefaultConfig } from '../../../../src/util/config/default';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('../../../../src/globalConfig/cloud', () => ({ cloudConfig: { isEnabled: vi.fn() } }));
vi.mock('../../../../src/logger', () => ({ default: { debug: vi.fn(), error: vi.fn() } }));
vi.mock('../../../../src/models/eval', () => ({
  default: { findById: vi.fn(), latest: vi.fn() },
}));
vi.mock('../../../../src/share', () => ({
  createShareableUrl: vi.fn(),
  getShareableUrl: vi.fn(),
  hasEvalBeenShared: vi.fn(),
  isSharingEnabled: vi.fn(),
}));
vi.mock('../../../../src/util/config/default', () => ({ loadDefaultConfig: vi.fn() }));

const tool = vi.fn();
registerShareEvaluationTool({ tool } as unknown as McpServer);
const handler = tool.mock.calls[0][2];
const shareUrl = 'https://example.com/eval/eval-1';

beforeEach(() => {
  vi.mocked(cloudConfig.isEnabled).mockReturnValue(true);
  vi.mocked(Eval.findById).mockResolvedValue({
    id: 'eval-1',
    prompts: [{ raw: 'hello' }],
    config: { description: 'example' },
    createdAt: '2026-10-13T00:00:00Z',
  } as unknown as Eval);
  vi.mocked(loadDefaultConfig).mockResolvedValue({
    defaultConfig: {},
    defaultConfigPath: undefined,
  });
  vi.mocked(isSharingEnabled).mockReturnValue(true);
  vi.mocked(getShareableUrl).mockResolvedValue(shareUrl);
  vi.mocked(createShareableUrl).mockResolvedValue(shareUrl);
});

afterEach(() => {
  vi.resetAllMocks();
});

describe('share_evaluation response', () => {
  it.each([
    ['new', false],
    ['already shared', true],
  ])('returns shareUrl for a %s evaluation', async (_case, alreadyShared) => {
    vi.mocked(hasEvalBeenShared).mockResolvedValue(alreadyShared);

    const result = await handler({ evalId: 'eval-1', showAuth: false, overwrite: false });
    const response = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(false);
    expect(response.data.shareUrl).toBe(shareUrl);
    if (alreadyShared) {
      expect(response.data.url).toBe(shareUrl);
    }
    expect(createShareableUrl).toHaveBeenCalledTimes(alreadyShared ? 0 : 1);
  });
});
