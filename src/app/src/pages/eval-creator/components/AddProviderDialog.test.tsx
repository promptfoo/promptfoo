import { describe, expect, it } from 'vitest';

// Import the actual file to access the exported function
// Since getProviderTypeFromId is not exported, we need to test it through the component
// or add a test export. For now, we'll create a duplicate of the function for testing.

// Helper function duplicated from AddProviderDialog.tsx for testing
function getProviderTypeFromId(id: string | undefined): string | undefined {
  if (!id || typeof id !== 'string') {
    return undefined;
  }

  if (id.startsWith('openai:')) {
    return 'openai';
  }
  if (id.startsWith('anthropic:')) {
    return 'anthropic';
  }
  if (id.startsWith('bedrock:')) {
    return 'bedrock';
  }
  if (id.startsWith('bedrock-agent:')) {
    return 'bedrock-agent';
  }
  if (id.startsWith('azure:')) {
    return 'azure';
  }
  if (id.startsWith('vertex:')) {
    return 'vertex';
  }
  if (id.startsWith('google:')) {
    return 'google';
  }
  if (id.startsWith('mistral:')) {
    return 'mistral';
  }
  if (id.startsWith('openrouter:')) {
    return 'openrouter';
  }
  if (id.startsWith('groq:')) {
    return 'groq';
  }
  if (id.startsWith('deepseek:')) {
    return 'deepseek';
  }
  if (id.startsWith('perplexity:')) {
    return 'perplexity';
  }
  if (id === 'http') {
    return 'http';
  }
  if (id === 'websocket') {
    return 'websocket';
  }
  if (id === 'browser') {
    return 'browser';
  }
  if (id === 'mcp') {
    return 'mcp';
  }
  if (id.startsWith('exec:')) {
    return 'exec';
  }
  if (id.startsWith('file://')) {
    if (id.includes('.py')) {
      return 'python';
    }
    if (id.includes('.js')) {
      return 'javascript';
    }
    if (id.includes('.go')) {
      return 'go';
    }
    // Check for agent frameworks
    if (id.includes('langchain')) {
      return 'langchain';
    }
    if (id.includes('autogen')) {
      return 'autogen';
    }
    if (id.includes('crewai')) {
      return 'crewai';
    }
    if (id.includes('llamaindex')) {
      return 'llamaindex';
    }
    if (id.includes('langgraph')) {
      return 'langgraph';
    }
    if (id.includes('openai_agents') || id.includes('openai-agents')) {
      return 'openai-agents-sdk';
    }
    if (id.includes('pydantic_ai') || id.includes('pydantic-ai')) {
      return 'pydantic-ai';
    }
    if (id.includes('google_adk') || id.includes('google-adk')) {
      return 'google-adk';
    }
    return 'generic-agent';
  }

  return 'custom';
}

describe('getProviderTypeFromId', () => {
  describe('invalid inputs', () => {
    it('returns undefined for undefined input', () => {
      expect(getProviderTypeFromId(undefined)).toBe(undefined);
    });

    it('returns undefined for empty string', () => {
      expect(getProviderTypeFromId('')).toBe(undefined);
    });
  });

  describe('cloud provider prefixes', () => {
    it('detects openai provider', () => {
      expect(getProviderTypeFromId('openai:gpt-4')).toBe('openai');
      expect(getProviderTypeFromId('openai:gpt-3.5-turbo')).toBe('openai');
    });

    it('detects anthropic provider', () => {
      expect(getProviderTypeFromId('anthropic:claude-3')).toBe('anthropic');
      expect(getProviderTypeFromId('anthropic:claude-2')).toBe('anthropic');
    });

    it('detects bedrock provider', () => {
      expect(getProviderTypeFromId('bedrock:model-id')).toBe('bedrock');
    });

    it('detects bedrock-agent provider (before bedrock)', () => {
      expect(getProviderTypeFromId('bedrock-agent:agent-id')).toBe('bedrock-agent');
    });

    it('detects azure provider', () => {
      expect(getProviderTypeFromId('azure:deployment-name')).toBe('azure');
    });

    it('detects vertex provider', () => {
      expect(getProviderTypeFromId('vertex:model-name')).toBe('vertex');
    });

    it('detects google provider', () => {
      expect(getProviderTypeFromId('google:gemini-pro')).toBe('google');
    });

    it('detects mistral provider', () => {
      expect(getProviderTypeFromId('mistral:model-id')).toBe('mistral');
    });

    it('detects openrouter provider', () => {
      expect(getProviderTypeFromId('openrouter:model-id')).toBe('openrouter');
    });

    it('detects groq provider', () => {
      expect(getProviderTypeFromId('groq:model-id')).toBe('groq');
    });

    it('detects deepseek provider', () => {
      expect(getProviderTypeFromId('deepseek:model-id')).toBe('deepseek');
    });

    it('detects perplexity provider', () => {
      expect(getProviderTypeFromId('perplexity:model-id')).toBe('perplexity');
    });
  });

  describe('exact match providers', () => {
    it('detects http provider', () => {
      expect(getProviderTypeFromId('http')).toBe('http');
    });

    it('detects websocket provider', () => {
      expect(getProviderTypeFromId('websocket')).toBe('websocket');
    });

    it('detects browser provider', () => {
      expect(getProviderTypeFromId('browser')).toBe('browser');
    });

    it('detects mcp provider', () => {
      expect(getProviderTypeFromId('mcp')).toBe('mcp');
    });
  });

  describe('exec provider', () => {
    it('detects exec provider', () => {
      expect(getProviderTypeFromId('exec:./script.sh')).toBe('exec');
      expect(getProviderTypeFromId('exec:command')).toBe('exec');
    });
  });

  describe('file:// based providers', () => {
    describe('language detection', () => {
      it('detects python files', () => {
        expect(getProviderTypeFromId('file://path/to/script.py')).toBe('python');
        expect(getProviderTypeFromId('file://script.py')).toBe('python');
      });

      it('detects javascript files', () => {
        expect(getProviderTypeFromId('file://path/to/script.js')).toBe('javascript');
        expect(getProviderTypeFromId('file://script.js')).toBe('javascript');
      });

      it('detects go files', () => {
        expect(getProviderTypeFromId('file://path/to/script.go')).toBe('go');
        expect(getProviderTypeFromId('file://script.go')).toBe('go');
      });
    });

    describe('agent framework detection', () => {
      it('detects langchain framework without file extensions', () => {
        expect(getProviderTypeFromId('file://path/langchain/agent')).toBe('langchain');
        expect(getProviderTypeFromId('file://langchain')).toBe('langchain');
      });

      it('detects autogen framework without file extensions', () => {
        expect(getProviderTypeFromId('file://path/autogen/agent')).toBe('autogen');
        expect(getProviderTypeFromId('file://autogen')).toBe('autogen');
      });

      it('detects crewai framework without file extensions', () => {
        expect(getProviderTypeFromId('file://path/crewai/agent')).toBe('crewai');
        expect(getProviderTypeFromId('file://crewai')).toBe('crewai');
      });

      it('detects llamaindex framework without file extensions', () => {
        expect(getProviderTypeFromId('file://path/llamaindex/agent')).toBe('llamaindex');
        expect(getProviderTypeFromId('file://llamaindex')).toBe('llamaindex');
      });

      it('detects langgraph framework without file extensions', () => {
        expect(getProviderTypeFromId('file://path/langgraph/agent')).toBe('langgraph');
        expect(getProviderTypeFromId('file://langgraph')).toBe('langgraph');
      });

      it('detects openai-agents-sdk framework with underscore', () => {
        expect(getProviderTypeFromId('file://path/openai_agents/agent')).toBe('openai-agents-sdk');
        expect(getProviderTypeFromId('file://openai_agents')).toBe('openai-agents-sdk');
      });

      it('detects openai-agents-sdk framework with hyphen', () => {
        expect(getProviderTypeFromId('file://path/openai-agents/agent')).toBe('openai-agents-sdk');
        expect(getProviderTypeFromId('file://openai-agents')).toBe('openai-agents-sdk');
      });

      it('detects pydantic-ai framework with underscore', () => {
        expect(getProviderTypeFromId('file://path/pydantic_ai/agent')).toBe('pydantic-ai');
        expect(getProviderTypeFromId('file://pydantic_ai')).toBe('pydantic-ai');
      });

      it('detects pydantic-ai framework with hyphen', () => {
        expect(getProviderTypeFromId('file://path/pydantic-ai/agent')).toBe('pydantic-ai');
        expect(getProviderTypeFromId('file://pydantic-ai')).toBe('pydantic-ai');
      });

      it('detects google-adk framework with underscore', () => {
        expect(getProviderTypeFromId('file://path/google_adk/agent')).toBe('google-adk');
        expect(getProviderTypeFromId('file://google_adk')).toBe('google-adk');
      });

      it('detects google-adk framework with hyphen', () => {
        expect(getProviderTypeFromId('file://path/google-adk/agent')).toBe('google-adk');
        expect(getProviderTypeFromId('file://google-adk')).toBe('google-adk');
      });
    });

    describe('priority and fallback', () => {
      it('prioritizes file extension over framework name', () => {
        // When a file has .py extension, it returns 'python' even if path contains framework name
        expect(getProviderTypeFromId('file://path/langchain/script.py')).toBe('python');
        expect(getProviderTypeFromId('file://autogen.py')).toBe('python');
      });

      it('returns generic-agent for file:// without specific markers', () => {
        expect(getProviderTypeFromId('file://path/to/agent.txt')).toBe('generic-agent');
        expect(getProviderTypeFromId('file://path/to/unknown')).toBe('generic-agent');
      });
    });
  });

  describe('custom provider fallback', () => {
    it('returns custom for unrecognized provider ids', () => {
      expect(getProviderTypeFromId('unknown-provider')).toBe('custom');
      expect(getProviderTypeFromId('custom-llm')).toBe('custom');
      expect(getProviderTypeFromId('my-provider')).toBe('custom');
    });
  });
});
