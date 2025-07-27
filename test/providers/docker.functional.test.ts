import { clearDMRModelsCache, fetchDockerModelRunnerModels } from '../../src/providers/docker';
import { beforeAll } from '@jest/globals';
import nock from 'nock';

describe('docker', () => {
  describe('fetchDockerModelRunnerModels', () => {
    // un-skip functional test as needed for debugging and triage
    describe.skip('functional', () => {
      beforeAll(() => {
        nock.cleanAll();
        nock.enableNetConnect();
      });

      beforeEach(() => {
        clearDMRModelsCache();
      });

      it(
        'fetches model ids from docker hub',
        async () => {
          const models = await fetchDockerModelRunnerModels();

          expect(models).toBeDefined();
          expect(models?.length).toBeGreaterThanOrEqual(84);
          const modelIds = models?.map((model) => model.id) ?? [];
          expect(modelIds).toContain('ai/mistral:latest');
          expect(modelIds).toContain('ai/llama3.1:8B-Q4_K_M');
        },
        60 * 1000,
      );
    });
  });
});
