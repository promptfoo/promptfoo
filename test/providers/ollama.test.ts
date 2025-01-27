import { clearCache } from '../../src/cache';
import { loadApiProvider } from '../../src/providers';
import {
  OllamaChatProvider,
  OllamaCompletionProvider,
  OllamaEmbeddingProvider,
} from '../../src/providers/ollama';

const mockFetch = jest.mocked(jest.fn());
global.fetch = mockFetch;

const defaultMockResponse = {
  status: 200,
  statusText: 'OK',
  headers: {
    get: jest.fn().mockReturnValue(null),
    entries: jest.fn().mockReturnValue([]),
  },
};

describe('Ollama Providers', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await clearCache();
  });

  describe('Provider Loading', () => {
    it('loadApiProvider with ollama:modelName', async () => {
      const provider = await loadApiProvider('ollama:llama2:13b');
      expect(provider).toBeInstanceOf(OllamaCompletionProvider);
      expect(provider.id()).toBe('ollama:completion:llama2:13b');
    });

    it('loadApiProvider with ollama:completion:modelName', async () => {
      const provider = await loadApiProvider('ollama:completion:llama2:13b');
      expect(provider).toBeInstanceOf(OllamaCompletionProvider);
      expect(provider.id()).toBe('ollama:completion:llama2:13b');
    });

    it('loadApiProvider with ollama:embedding:modelName', async () => {
      const provider = await loadApiProvider('ollama:embedding:llama2:13b');
      expect(provider).toBeInstanceOf(OllamaEmbeddingProvider);
    });

    it('loadApiProvider with ollama:embeddings:modelName', async () => {
      const provider = await loadApiProvider('ollama:embeddings:llama2:13b');
      expect(provider).toBeInstanceOf(OllamaEmbeddingProvider);
    });

    it('loadApiProvider with ollama:chat:modelName', async () => {
      const provider = await loadApiProvider('ollama:chat:llama2:13b');
      expect(provider).toBeInstanceOf(OllamaChatProvider);
      expect(provider.id()).toBe('ollama:chat:llama2:13b');
    });
  });

  describe('API Calls', () => {
    it('OllamaCompletionProvider callApi', async () => {
      const mockResponse = {
        ...defaultMockResponse,
        text: jest.fn()
          .mockResolvedValue(`{"model":"llama2:13b","created_at":"2023-08-08T21:50:34.898068Z","response":"Gre","done":false}
{"model":"llama2:13b","created_at":"2023-08-08T21:50:34.929199Z","response":"at","done":false}
{"model":"llama2:13b","created_at":"2023-08-08T21:50:34.959989Z","response":" question","done":false}
{"model":"llama2:13b","created_at":"2023-08-08T21:50:34.992117Z","response":"!","done":false}
{"model":"llama2:13b","created_at":"2023-08-08T21:50:35.023658Z","response":" The","done":false}
{"model":"llama2:13b","created_at":"2023-08-08T21:50:35.0551Z","response":" sky","done":false}
{"model":"llama2:13b","created_at":"2023-08-08T21:50:35.086103Z","response":" appears","done":false}
{"model":"llama2:13b","created_at":"2023-08-08T21:50:35.117166Z","response":" blue","done":false}
{"model":"llama2:13b","created_at":"2023-08-08T21:50:41.695299Z","done":true,"context":[1,29871,1,13,9314],"total_duration":10411943458,"load_duration":458333,"sample_count":217,"sample_duration":154566000,"prompt_eval_count":11,"prompt_eval_duration":3334582000,"eval_count":216,"eval_duration":6905134000}`),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const provider = new OllamaCompletionProvider('llama');
      const result = await provider.callApi('Test prompt');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('Great question! The sky appears blue');
    });

    it('OllamaChatProvider callApi', async () => {
      const mockResponse = {
        ...defaultMockResponse,
        text: jest.fn()
          .mockResolvedValue(`{"model":"orca-mini","created_at":"2023-12-16T01:46:19.263682972Z","message":{"role":"assistant","content":" Because","images":null},"done":false}
{"model":"orca-mini","created_at":"2023-12-16T01:46:19.275143974Z","message":{"role":"assistant","content":" of","images":null},"done":false}
{"model":"orca-mini","created_at":"2023-12-16T01:46:19.288137727Z","message":{"role":"assistant","content":" Ray","images":null},"done":false}
{"model":"orca-mini","created_at":"2023-12-16T01:46:19.301139709Z","message":{"role":"assistant","content":"leigh","images":null},"done":false}
{"model":"orca-mini","created_at":"2023-12-16T01:46:19.311364699Z","message":{"role":"assistant","content":" scattering","images":null},"done":false}
{"model":"orca-mini","created_at":"2023-12-16T01:46:19.324309782Z","message":{"role":"assistant","content":".","images":null},"done":false}
{"model":"orca-mini","created_at":"2023-12-16T01:46:19.337165395Z","done":true,"total_duration":1486443841,"load_duration":1280794143,"prompt_eval_count":35,"prompt_eval_duration":142384000,"eval_count":6,"eval_duration":61912000}`),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const provider = new OllamaChatProvider('llama');
      const result = await provider.callApi('Test prompt');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.output).toBe(' Because of Rayleigh scattering.');
    });
  });
});
