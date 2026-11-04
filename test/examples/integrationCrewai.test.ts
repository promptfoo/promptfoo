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
import os
import sys
from types import ModuleType, SimpleNamespace

class LLM:
    def __init__(self, model, api_key=None):
        if settings.get("error") == "llm":
            raise RuntimeError("fixture LLM initialization failed")
        self.model = model
        # Native CrewAI providers resolve their own environment credentials when
        # no explicit key is supplied. Unknown model paths stay opaque here.
        key_variable = {
            "openai": "OPENAI_API_KEY",
            "anthropic": "ANTHROPIC_API_KEY",
        }.get(model.split("/", 1)[0])
        self.api_key = api_key
        if self.api_key is None and key_variable:
            self.api_key = os.getenv(key_variable)
        if key_variable and self.api_key is None:
            raise ValueError(f"{key_variable} is required")

class Agent:
    def __init__(self, llm=None, **kwargs):
        self.llm = llm

class Task:
    def __init__(self, **kwargs):
        pass

class Crew:
    def __init__(self, agents, tasks):
        self.agent = agents[0]

    async def kickoff_async(self, inputs):
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
results = []
for case in json.loads(sys.argv[2]):
    settings = case["settings"]
    observed = {}
    for key in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY"):
        os.environ.pop(key, None)
    os.environ.update(case["credentials"])
    spec = importlib.util.spec_from_file_location("recruitment_example", sys.argv[1])
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    response = module.call_api("Find a Ruby engineer", {"config": settings.get("config", {})}, {})
    results.append({"response": response, "observed": observed})
print(json.dumps(results))
`;

const cases = [
  {
    name: 'uses the default LLM and parses the crew output',
    settings: { output: CANDIDATES },
    credentials: { OPENAI_API_KEY: 'fixture-key' },
    response: { output: CANDIDATES },
    observed: {
      model: 'openai/gpt-4.1',
      api_key: 'fixture-key',
      inputs: { job_requirements: 'Find a Ruby engineer' },
    },
  },
  ...['openai/gpt-4.1-mini', 'custom-provider/team/model:release'].map((model) => ({
    name: `forwards the configured model ${model} unchanged and parses a markdown string`,
    settings: { config: { model }, output: CANDIDATES, result_type: 'string' },
    credentials: { OPENAI_API_KEY: 'fixture-key' },
    response: { output: CANDIDATES },
    observed: expect.objectContaining({ model }),
  })),
  {
    name: 'surfaces a kickoff failure as a provider error',
    settings: { error: 'kickoff' },
    credentials: { OPENAI_API_KEY: 'fixture-key' },
    response: { error: 'An unexpected error occurred: fixture kickoff failed', raw: '' },
    observed: expect.any(Object),
  },
  ...[undefined, 'fixture-openai-key'].map((openaiKey) => ({
    name: `uses the configured provider credentials when the OpenAI key is ${openaiKey}`,
    settings: { config: { model: 'anthropic/claude-sonnet-4-6' }, output: CANDIDATES },
    credentials: { OPENAI_API_KEY: openaiKey, ANTHROPIC_API_KEY: 'fixture-anthropic-key' },
    response: { output: CANDIDATES },
    observed: {
      model: 'anthropic/claude-sonnet-4-6',
      api_key: 'fixture-anthropic-key',
      inputs: { job_requirements: 'Find a Ruby engineer' },
    },
  })),
  {
    name: 'reports missing credentials for the default OpenAI model',
    settings: { output: CANDIDATES },
    credentials: {},
    response: { error: expect.stringContaining('OPENAI_API_KEY') },
    observed: {},
  },
  {
    name: 'surfaces LLM initialization failures as provider errors',
    settings: { error: 'llm' },
    credentials: { OPENAI_API_KEY: 'fixture-key' },
    response: { error: 'An error occurred in call_api: fixture LLM initialization failed' },
    observed: {},
  },
];

describe('integration-crewai example', () => {
  let results: { response: unknown; observed: unknown }[];

  beforeAll(async () => {
    const configured = getConfiguredPythonPath();
    const pythonPath = await validatePythonPath(configured ?? 'python', Boolean(configured));
    // Import Python's standard library once for the suite. Repeated cold starts can
    // exceed the process deadline on busy Windows runners. Each case still imports
    // a fresh example module and resets its credentials and recorded calls.
    const result = spawnSync(
      pythonPath,
      [
        // The fixture supplies CrewAI itself; skip site packages and inherited Python settings.
        '-I',
        '-S',
        '-B',
        '-c',
        CHECK_EXAMPLE,
        EXAMPLE_PATH,
        JSON.stringify(cases.map(({ settings, credentials }) => ({ settings, credentials }))),
      ],
      { encoding: 'utf8', timeout: 5000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe('');
    results = JSON.parse(result.stdout);
    expect(results).toHaveLength(cases.length);
  });

  it.each(cases.map((testCase, index) => ({ ...testCase, index })))('$name', (testCase) => {
    expect(results[testCase.index]).toEqual({
      response: testCase.response,
      observed: testCase.observed,
    });
  });
});
