import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getRemoteGenerationUrl,
  getRemoteGenerationUrlForUnaligned,
} from '../../src/redteam/remoteGeneration';
import { resolveRemoteGenerationUrl } from '../../src/redteam/remoteGenerationRequest';
import { ensureCloudTeamContext } from '../../src/util/cloud';

vi.mock('../../src/redteam/remoteGeneration');
vi.mock('../../src/util/cloud', () => ({ ensureCloudTeamContext: vi.fn() }));

afterEach(() => vi.resetAllMocks());

describe('remote task URL resolution', () => {
  it('rereads the endpoint after asynchronous team recovery', async () => {
    vi.mocked(getRemoteGenerationUrl).mockReturnValue('https://first.example.com/api/v1/task');
    vi.mocked(ensureCloudTeamContext).mockImplementation(async () => {
      vi.mocked(getRemoteGenerationUrl).mockReturnValue('https://second.example.com/api/v1/task');
    });

    await expect(resolveRemoteGenerationUrl()).resolves.toBe(
      'https://second.example.com/api/v1/task',
    );
    expect(ensureCloudTeamContext).toHaveBeenCalledExactlyOnceWith(
      'https://first.example.com/api/v1/task',
    );
  });

  it('resolves the configured unaligned endpoint without dispatching a request', async () => {
    vi.mocked(getRemoteGenerationUrlForUnaligned).mockReturnValue(
      'https://custom.example.com/task',
    );

    await expect(resolveRemoteGenerationUrl({}, { unaligned: true })).resolves.toBe(
      'https://custom.example.com/task',
    );
    expect(ensureCloudTeamContext).toHaveBeenCalledExactlyOnceWith(
      'https://custom.example.com/task',
    );
    expect(getRemoteGenerationUrl).not.toHaveBeenCalled();
  });
});
