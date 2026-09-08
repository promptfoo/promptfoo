import { spawnSync } from 'child_process';
import path from 'path';

import { beforeAll, describe, expect, it } from 'vitest';
import { getConfiguredPythonPath, validatePythonPath } from '../../src/python/pythonUtils';

const EXAMPLE_PATH = path.join(process.cwd(), 'examples', 'integration-crewai', 'agent.py');
const CANDIDATES = {
  candidates: [{ name: 'Sample Candidate', experience: '8 years', skills: ['Ruby'] }],
};

// Import the real example with an offline CrewAI boundary. Agent ignores unknown fields,
// like CrewAI does, so passing model= instead of llm= cannot satisfy these assertions.
const CHECK_EXAMPLE = String.raw`
import importlib.util
import json
import sys
from types import ModuleType, SimpleNamespace

settings = json.loads(sys.argv[2])
observed = {}

class LLM:
    def __init__(self, model, api_key=None):
        if settings.get("error") == "llm":
            raise RuntimeError("fixture LLM initialization failed")
        self.model = model
        self.api_key = api_key

class Agent:
    def __init__(self, llm=None, **kwargs):
        self.llm = llm

class Task:
    def __init__(self, **kwargs):
        pass

class Crew:
    def __init__(self, agents, tasks):
        self.agent = agents[0]

    def kickoff(self, inputs):
        observed["model"] = self.agent.llm.model if self.agent.llm else None
        observed["api_key"] = self.agent.llm.api_key if self.agent.llm else None
        observed["inputs"] = inputs
        if settings.get("error") == "kickoff":
            raise RuntimeError("fixture kickoff failed")
        text = json.dumps(settings["output"])
        if settings.get("result_type") == "string":
            return "\x60\x60\x60json\n" + text + "\n\x60\x60\x60"
        return SimpleNamespace(raw=text)

crewai = ModuleType("crewai")
crewai.LLM, crewai.Agent, crewai.Task, crewai.Crew = LLM, Agent, Task, Crew
sys.modules["crewai"] = crewai
spec = importlib.util.spec_from_file_location("recruitment_example", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
response = module.call_api("Find a Ruby engineer", {"config": settings.get("config", {})}, {})
print(json.dumps({"response": response, "observed": observed}))
`;

describe('integration-crewai example', () => {
  let pythonPath: string;

  beforeAll(async () => {
    const configured = getConfiguredPythonPath();
    pythonPath = await validatePythonPath(configured ?? 'python', Boolean(configured));
  });

  function runExample(settings: Record<string, unknown>) {
    const result = spawnSync(
      pythonPath,
      ['-c', CHECK_EXAMPLE, EXAMPLE_PATH, JSON.stringify(settings)],
      {
        encoding: 'utf8',
        env: { ...process.env, OPENAI_API_KEY: 'fixture-key', PYTHONDONTWRITEBYTECODE: '1' },
        timeout: 5000,
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe('');
    return JSON.parse(result.stdout);
  }

  it('uses the default LLM and parses the crew output', () => {
    const result = runExample({ output: CANDIDATES });
    expect(result.response).toEqual({ output: CANDIDATES });
    expect(result.observed).toEqual({
      model: 'openai/gpt-4.1',
      api_key: 'fixture-key',
      inputs: { job_requirements: 'Find a Ruby engineer' },
    });
  });

  it.each(['openai/gpt-4.1-mini', 'custom-provider/team/model:release'])(
    'forwards the configured model %s unchanged and parses a markdown string',
    (model) => {
      const result = runExample({ config: { model }, output: CANDIDATES, result_type: 'string' });
      expect(result.response).toEqual({ output: CANDIDATES });
      expect(result.observed.model).toBe(model);
    },
  );

  it('surfaces a kickoff failure as a provider error', () => {
    const result = runExample({ error: 'kickoff' });
    expect(result.response).toEqual({
      error: 'An unexpected error occurred: fixture kickoff failed',
      raw: '',
    });
  });

  it('surfaces LLM initialization failures as provider errors', () => {
    const result = runExample({ error: 'llm' });
    expect(result.response).toEqual({
      error: 'An error occurred in call_api: fixture LLM initialization failed',
    });
    expect(result.observed).toEqual({});
  });
});
