# Smoke Tests Plan

Comprehensive smoke test plan for the promptfoo CLI and library. This document serves as the checklist and specification for smoke tests that verify the **built package** works correctly across critical user flows.

**Test location:** `test/smoke/`
**Run command:** `npm run test:smoke`

## Philosophy

1. **Test the built package** (`dist/`), not source code
2. **No external API dependencies** - use `echo` provider, local scripts, or mock servers
3. **Fast execution** - target < 3 minutes total
4. **Cover critical paths** - CLI commands, config loading, provider initialization

## Running Smoke Tests

```bash
# Run all smoke tests
npm run test:smoke

# Run individual test suites
npm run test:smoke:cli      # CLI binary tests
npm run test:smoke:eval     # Eval pipeline tests
```

## Test Location

All smoke tests live in `test/smoke/`:

```
test/smoke/
├── cli.test.ts              # CLI command tests
├── eval.test.ts             # Eval pipeline tests
├── providers.test.ts        # Provider loading tests
├── configs.test.ts          # Config format tests
├── data-loading.test.ts     # Data source tests
├── fixtures/
│   ├── configs/             # Config format examples
│   ├── providers/           # Echo-based providers
│   ├── data/                # Test data files
│   └── assertions/          # Assertion scripts
└── scripts/
    └── run-all.sh           # Shell-based smoke tests
```

---

## Test Checklist

### 1. CLI Binary Tests

#### 1.1 Basic CLI Operations

| #     | Test            | Command                              | Verifies                 |
| ----- | --------------- | ------------------------------------ | ------------------------ |
| 1.1.1 | Version output  | `promptfoo --version`                | Binary executes, version |
| 1.1.2 | Help output     | `promptfoo --help`                   | Commander parsing        |
| 1.1.3 | Subcommand help | `promptfoo eval --help`              | Subcommand routing       |
| 1.1.4 | Unknown command | `promptfoo unknownxyz`               | Error handling           |
| 1.1.5 | Invalid config  | `promptfoo eval -c nonexistent.yaml` | File not found error     |

#### 1.2 Init Command

| #     | Test              | Command                               | Verifies            |
| ----- | ----------------- | ------------------------------------- | ------------------- |
| 1.2.1 | Init interactive  | `promptfoo init --no-interactive`     | Project scaffolding |
| 1.2.2 | Init with example | `promptfoo init --example simple-cli` | Example download    |

#### 1.3 Validate Command

| #     | Test           | Command                                | Verifies          |
| ----- | -------------- | -------------------------------------- | ----------------- |
| 1.3.1 | Valid config   | `promptfoo validate -c valid.yaml`     | Validation passes |
| 1.3.2 | Invalid config | `promptfoo validate -c invalid.yaml`   | Validation errors |
| 1.3.3 | Schema errors  | `promptfoo validate -c malformed.yaml` | Schema validation |

#### 1.4 Eval Command (Core)

| #     | Test            | Command                                             | Verifies            |
| ----- | --------------- | --------------------------------------------------- | ------------------- |
| 1.4.1 | Basic eval      | `promptfoo eval -c echo-config.yaml --no-cache`     | Core eval pipeline  |
| 1.4.2 | JSON output     | `promptfoo eval -c config.yaml -o out.json`         | JSON export         |
| 1.4.3 | YAML output     | `promptfoo eval -c config.yaml -o out.yaml`         | YAML export         |
| 1.4.4 | CSV output      | `promptfoo eval -c config.yaml -o out.csv`          | CSV export          |
| 1.4.5 | Max concurrency | `promptfoo eval -c config.yaml --max-concurrency 1` | Concurrency control |
| 1.4.6 | Repeat          | `promptfoo eval -c config.yaml --repeat 2`          | Repeat runs         |
| 1.4.7 | Verbose         | `promptfoo eval -c config.yaml --verbose`           | Verbose logging     |
| 1.4.8 | Env file        | `promptfoo eval -c config.yaml --env-file .env`     | Env loading         |

#### 1.5 List/Show/Export Commands

| #     | Test          | Command                                  | Verifies             |
| ----- | ------------- | ---------------------------------------- | -------------------- |
| 1.5.1 | List evals    | `promptfoo list evals`                   | Database reads       |
| 1.5.2 | List datasets | `promptfoo list datasets`                | Dataset listing      |
| 1.5.3 | Show eval     | `promptfoo show <eval-id>`               | Eval retrieval       |
| 1.5.4 | Export eval   | `promptfoo export <eval-id> -o out.json` | Export functionality |

#### 1.6 Cache Commands

| #     | Test        | Command                 | Verifies         |
| ----- | ----------- | ----------------------- | ---------------- |
| 1.6.1 | Cache clear | `promptfoo cache clear` | Cache management |

#### 1.7 Exit Codes

| #     | Test           | Scenario            | Expected Code |
| ----- | -------------- | ------------------- | ------------- |
| 1.7.1 | All pass       | All assertions pass | `0`           |
| 1.7.2 | Assertion fail | Assertion fails     | `100`         |
| 1.7.3 | Config error   | Invalid config      | `1`           |
| 1.7.4 | Provider error | Provider fails      | `1`           |

#### 1.8 Filter Flags

Test count and content filters that control which tests run.

##### 1.8.1 Count-Based Filters

| #       | Test            | Command                               | Verifies                         |
| ------- | --------------- | ------------------------------------- | -------------------------------- |
| 1.8.1.1 | First N tests   | `--filter-first-n 2` (with 5 tests)   | Takes first 2 tests only         |
| 1.8.1.2 | First N > total | `--filter-first-n 100` (with 5 tests) | Returns all 5 tests              |
| 1.8.1.3 | First N zero    | `--filter-first-n 0`                  | Returns 0 tests (no eval runs)   |
| 1.8.1.4 | Sample N tests  | `--filter-sample 2` (with 5 tests)    | Returns exactly 2 tests (random) |
| 1.8.1.5 | Sample > total  | `--filter-sample 100` (with 5 tests)  | Returns all 5 tests              |

##### 1.8.2 Pattern Filters

| #       | Test             | Command                             | Verifies                      |
| ------- | ---------------- | ----------------------------------- | ----------------------------- |
| 1.8.2.1 | Pattern match    | `--filter-pattern "user.*test"`     | Only tests with matching desc |
| 1.8.2.2 | Pattern case     | `--filter-pattern "(?i)TEST"`       | Case-insensitive regex works  |
| 1.8.2.3 | Pattern no match | `--filter-pattern "nonexistent123"` | Zero tests run                |
| 1.8.2.4 | Pattern special  | `--filter-pattern "test\\.special"` | Regex escaping works          |

##### 1.8.3 Metadata Filters

| #       | Test              | Command                                  | Verifies                        |
| ------- | ----------------- | ---------------------------------------- | ------------------------------- |
| 1.8.3.1 | Metadata match    | `--filter-metadata category=auth`        | Only tests with metadata match  |
| 1.8.3.2 | Metadata partial  | `--filter-metadata category=au`          | Partial value match works       |
| 1.8.3.3 | Metadata array    | `--filter-metadata tags=security`        | Array metadata value match      |
| 1.8.3.4 | Metadata no match | `--filter-metadata category=nonexistent` | Zero tests run                  |
| 1.8.3.5 | Metadata invalid  | `--filter-metadata invalid`              | Error: must be key=value format |

##### 1.8.4 Provider Filters

| #       | Test              | Command                             | Verifies                        |
| ------- | ----------------- | ----------------------------------- | ------------------------------- |
| 1.8.4.1 | Provider by ID    | `--filter-providers "echo"`         | Only echo provider runs         |
| 1.8.4.2 | Provider by label | `--filter-providers "Custom.*"`     | Provider label regex match      |
| 1.8.4.3 | Provider multi    | `--filter-providers "echo\|custom"` | Multiple provider match         |
| 1.8.4.4 | Provider no match | `--filter-providers "nonexistent"`  | No providers match, error/empty |
| 1.8.4.5 | Filter targets    | `--filter-targets "echo"`           | Alias for --filter-providers    |

##### 1.8.5 History-Based Filters

| #       | Test                | Command                            | Verifies                    |
| ------- | ------------------- | ---------------------------------- | --------------------------- |
| 1.8.5.1 | Filter failing file | `--filter-failing output.json`     | Re-runs only failed tests   |
| 1.8.5.2 | Filter failing ID   | `--filter-failing eval-abc123`     | Re-runs failures by eval ID |
| 1.8.5.3 | Filter errors file  | `--filter-errors-only output.json` | Re-runs only error tests    |
| 1.8.5.4 | Filter errors ID    | `--filter-errors-only eval-abc123` | Re-runs errors by eval ID   |

##### 1.8.6 Combined Filters

| #       | Test               | Command                                      | Verifies                    |
| ------- | ------------------ | -------------------------------------------- | --------------------------- |
| 1.8.6.1 | Pattern + First N  | `--filter-pattern "auth" --filter-first-n 2` | Filters apply in sequence   |
| 1.8.6.2 | Metadata + Sample  | `--filter-metadata cat=x --filter-sample 1`  | Metadata then sample        |
| 1.8.6.3 | Provider + Pattern | `--filter-providers echo --filter-pattern x` | Provider and test filtering |

#### 1.9 Variable and Prompt Flags

Flags that modify variables or prompt content.

| #     | Test            | Command                                     | Verifies                    |
| ----- | --------------- | ------------------------------------------- | --------------------------- |
| 1.9.1 | Var single      | `--var name=Alice`                          | Variable substitution       |
| 1.9.2 | Var multiple    | `--var name=Alice --var age=30`             | Multiple vars               |
| 1.9.3 | Var override    | `--var name=Override` (config has name=Bob) | CLI overrides config        |
| 1.9.4 | Var invalid     | `--var invalid`                             | Error: must be key=value    |
| 1.9.5 | Prompt prefix   | `--prompt-prefix "System: "`                | Prefix prepended to prompts |
| 1.9.6 | Prompt suffix   | `--prompt-suffix "\nEnd."`                  | Suffix appended to prompts  |
| 1.9.7 | Prefix + suffix | `--prompt-prefix "A" --prompt-suffix "Z"`   | Both applied                |

#### 1.10 Execution Control Flags

Flags that control how tests execute.

| #      | Test             | Command                           | Verifies                        |
| ------ | ---------------- | --------------------------------- | ------------------------------- |
| 1.10.1 | Delay            | `--delay 100` (with timing check) | Delay between tests             |
| 1.10.2 | Delay zero       | `--delay 0`                       | No delay (default)              |
| 1.10.3 | No cache         | `--no-cache`                      | Cache disabled (already tested) |
| 1.10.4 | No progress bar  | `--no-progress-bar`               | Progress bar hidden             |
| 1.10.5 | No table         | `--no-table`                      | Table output suppressed         |
| 1.10.6 | Table max length | `--table-cell-max-length 50`      | Cell truncation                 |

#### 1.11 Output and Metadata Flags

Flags that affect output and eval metadata.

| #      | Test             | Command                       | Verifies                    |
| ------ | ---------------- | ----------------------------- | --------------------------- |
| 1.11.1 | Description      | `--description "My test run"` | Description in output       |
| 1.11.2 | Multiple outputs | `-o out.json -o out.csv`      | Multiple output files       |
| 1.11.3 | No write         | `--no-write`                  | Results not persisted to DB |
| 1.11.4 | Share disabled   | `--no-share`                  | Sharing disabled            |

#### 1.12 Resume and Retry Flags

Flags for resuming or retrying evaluations.

| #      | Test          | Command                | Verifies                       |
| ------ | ------------- | ---------------------- | ------------------------------ |
| 1.12.1 | Resume latest | `--resume`             | Resumes latest incomplete eval |
| 1.12.2 | Resume by ID  | `--resume eval-abc123` | Resumes specific eval          |
| 1.12.3 | Retry errors  | `--retry-errors`       | Retries errors from latest     |

---

### 2. Config Format Tests

#### 2.1 YAML Configs

| #     | Test              | Config                | Verifies          |
| ----- | ----------------- | --------------------- | ----------------- |
| 2.1.1 | Basic YAML        | `config.yaml`         | YAML parsing      |
| 2.1.2 | YAML with anchors | `config-anchors.yaml` | YAML anchor/alias |
| 2.1.3 | YML extension     | `config.yml`          | .yml extension    |

#### 2.2 JSON Configs

| #     | Test        | Config        | Verifies     |
| ----- | ----------- | ------------- | ------------ |
| 2.2.1 | JSON config | `config.json` | JSON parsing |

#### 2.3 JavaScript Configs

| #     | Test              | Config       | Export Style               | Verifies       |
| ----- | ----------------- | ------------ | -------------------------- | -------------- |
| 2.3.1 | CJS class export  | `config.js`  | `module.exports = Class`   | CJS class      |
| 2.3.2 | CJS object export | `config.js`  | `module.exports = { ... }` | CJS object     |
| 2.3.3 | CJS named export  | `config.js`  | `module.exports.foo = ...` | CJS named      |
| 2.3.4 | CJS explicit ext  | `config.cjs` | `module.exports = ...`     | .cjs extension |
| 2.3.5 | ESM default       | `config.mjs` | `export default { ... }`   | ESM default    |
| 2.3.6 | ESM class         | `config.mjs` | `export default class`     | ESM class      |
| 2.3.7 | ESM named         | `config.mjs` | `export const config`      | ESM named      |

#### 2.4 TypeScript Configs

| #     | Test          | Config       | Export Style             | Verifies       |
| ----- | ------------- | ------------ | ------------------------ | -------------- |
| 2.4.1 | TS default    | `config.ts`  | `export default { ... }` | TS transpile   |
| 2.4.2 | TS class      | `config.ts`  | `export default class`   | TS class       |
| 2.4.3 | TS named      | `config.ts`  | `export const config`    | TS named       |
| 2.4.4 | TS with types | `config.ts`  | `implements ApiProvider` | Type imports   |
| 2.4.5 | MTS extension | `config.mts` | `export default ...`     | .mts extension |
| 2.4.6 | CTS extension | `config.cts` | `module.exports = ...`   | .cts extension |

---

### 3. Provider Tests

#### 3.1 Built-in Providers (No API Key)

| #     | Test          | Provider            | Verifies      |
| ----- | ------------- | ------------------- | ------------- |
| 3.1.1 | Echo provider | `echo`              | Built-in echo |
| 3.1.2 | Exec provider | `exec:echo "hello"` | Shell command |

#### 3.2 JavaScript Providers

| #     | Test         | Provider Config               | Export Style                  | Verifies       |
| ----- | ------------ | ----------------------------- | ----------------------------- | -------------- |
| 3.2.1 | CJS class    | `file://provider.js`          | `module.exports = Class`      | CJS class      |
| 3.2.2 | CJS function | `file://provider.js:callApi`  | `module.exports.callApi = fn` | CJS named fn   |
| 3.2.3 | CJS explicit | `file://provider.cjs`         | `module.exports = ...`        | .cjs extension |
| 3.2.4 | ESM default  | `file://provider.mjs`         | `export default class`        | ESM class      |
| 3.2.5 | ESM function | `file://provider.mjs:callApi` | `export function callApi`     | ESM named fn   |

#### 3.3 TypeScript Providers

| #     | Test              | Provider Config              | Export Style              | Verifies     |
| ----- | ----------------- | ---------------------------- | ------------------------- | ------------ |
| 3.3.1 | TS default class  | `file://provider.ts`         | `export default class`    | TS class     |
| 3.3.2 | TS named function | `file://provider.ts:callApi` | `export function callApi` | TS named fn  |
| 3.3.3 | TS with interface | `file://provider.ts`         | `implements ApiProvider`  | TS interface |

#### 3.4 Python Providers

| #     | Test         | Provider Config                | Function               | Verifies        |
| ----- | ------------ | ------------------------------ | ---------------------- | --------------- |
| 3.4.1 | Default fn   | `file://provider.py`           | `call_api()`           | Python default  |
| 3.4.2 | Named fn     | `file://provider.py:custom_fn` | `custom_fn()`          | Python named    |
| 3.4.3 | Async fn     | `file://provider.py:async_fn`  | `async def async_fn()` | Python async    |
| 3.4.4 | With context | `file://provider.py`           | Uses `context` param   | Context passing |
| 3.4.5 | With options | `file://provider.py`           | Uses `options` param   | Options passing |
| 3.4.6 | Token usage  | `file://provider.py`           | Returns `tokenUsage`   | Token tracking  |
| 3.4.7 | Error return | `file://provider.py`           | Returns `error`        | Error handling  |

#### 3.5 Ruby Providers

| #     | Test        | Provider Config                | Function      | Verifies     |
| ----- | ----------- | ------------------------------ | ------------- | ------------ |
| 3.5.1 | Default fn  | `file://provider.rb`           | `call_api()`  | Ruby default |
| 3.5.2 | Named fn    | `file://provider.rb:custom_fn` | `custom_fn()` | Ruby named   |
| 3.5.3 | Hash return | `file://provider.rb`           | Hash output   | Ruby hash    |

#### 3.6 Go Providers

| #     | Test        | Provider Config  | Function      | Verifies   |
| ----- | ----------- | ---------------- | ------------- | ---------- |
| 3.6.1 | Default fn  | `file://main.go` | `CallApi`     | Go default |
| 3.6.2 | With go.mod | `file://main.go` | Multi-package | Go modules |

#### 3.7 HTTP Providers

| #     | Test               | Provider Config                  | Verifies           |
| ----- | ------------------ | -------------------------------- | ------------------ |
| 3.7.1 | Basic HTTP         | `id: http://...`                 | HTTP provider      |
| 3.7.2 | HTTPS              | `id: https://...`                | HTTPS provider     |
| 3.7.3 | Body template      | `body: { prompt: "{{prompt}}" }` | Body templating    |
| 3.7.4 | Transform response | `transformResponse: json.output` | Response transform |
| 3.7.5 | Custom headers     | `headers: { X-Custom: value }`   | Header passing     |

#### 3.8 HTTP Auth Configurations

| #      | Test               | Auth Config                                            | Verifies       |
| ------ | ------------------ | ------------------------------------------------------ | -------------- |
| 3.8.1  | Bearer token       | `auth: { type: bearer, token: ... }`                   | Bearer auth    |
| 3.8.2  | API key header     | `auth: { type: api_key, placement: header }`           | API key header |
| 3.8.3  | API key query      | `auth: { type: api_key, placement: query }`            | API key query  |
| 3.8.4  | Basic auth         | `auth: { type: basic, username, password }`            | Basic auth     |
| 3.8.5  | OAuth client creds | `auth: { type: oauth, grantType: client_credentials }` | OAuth CC       |
| 3.8.6  | OAuth password     | `auth: { type: oauth, grantType: password }`           | OAuth password |
| 3.8.7  | Signature PEM      | `signatureAuth: { type: pem, privateKeyPath }`         | PEM signature  |
| 3.8.8  | Signature JKS      | `signatureAuth: { type: jks, keystorePath }`           | JKS signature  |
| 3.8.9  | Signature PFX      | `signatureAuth: { type: pfx, pfxPath }`                | PFX signature  |
| 3.8.10 | mTLS cert          | `tls: { certPath, keyPath }`                           | Mutual TLS     |

---

### 4. Data Loading Tests

#### 4.1 Vars Loading

| #     | Test        | Config                   | Source      | Verifies    |
| ----- | ----------- | ------------------------ | ----------- | ----------- |
| 4.1.1 | Inline vars | `vars: { key: value }`   | YAML inline | Direct vars |
| 4.1.2 | JSON file   | `vars: file://data.json` | JSON file   | JSON vars   |
| 4.1.3 | YAML file   | `vars: file://data.yaml` | YAML file   | YAML vars   |

#### 4.2 Tests Loading

| #      | Test             | Config                      | Source      | Verifies        |
| ------ | ---------------- | --------------------------- | ----------- | --------------- |
| 4.2.1  | Inline tests     | `tests: [{ vars: ... }]`    | YAML inline | Direct tests    |
| 4.2.2  | CSV file         | `tests: file://tests.csv`   | CSV file    | CSV parsing     |
| 4.2.3  | JSON file        | `tests: file://tests.json`  | JSON file   | JSON tests      |
| 4.2.4  | JSONL file       | `tests: file://tests.jsonl` | JSONL file  | JSONL parsing   |
| 4.2.5  | YAML file        | `tests: file://tests.yaml`  | YAML file   | YAML tests      |
| 4.2.6  | XLSX file        | `tests: file://tests.xlsx`  | Excel file  | Excel parsing   |
| 4.2.7  | JS generator     | `tests: file://tests.js`    | JS function | JS test gen     |
| 4.2.8  | TS generator     | `tests: file://tests.ts`    | TS function | TS test gen     |
| 4.2.9  | Python generator | `tests: file://tests.py`    | Python fn   | Python test gen |
| 4.2.10 | Glob pattern     | `tests: tests/*.yaml`       | Glob        | Glob expansion  |

#### 4.3 Prompts Loading

| #     | Test         | Config                           | Source        | Verifies      |
| ----- | ------------ | -------------------------------- | ------------- | ------------- |
| 4.3.1 | Inline       | `prompts: ["Hello {{name}}"]`    | YAML inline   | Direct prompt |
| 4.3.2 | File ref     | `prompts: [file://prompt.txt]`   | Text file     | File loading  |
| 4.3.3 | Glob pattern | `prompts: prompts/*.txt`         | Glob          | Glob prompts  |
| 4.3.4 | Exec prompt  | `prompts: [{ raw: "exec:..." }]` | Shell         | Executable    |
| 4.3.5 | JSON chat    | `prompts: [file://chat.json]`    | JSON messages | Chat format   |

---

### 5. Assertion Tests

#### 5.1 Built-in Assertions

| #      | Test          | Assertion Type               | Verifies            |
| ------ | ------------- | ---------------------------- | ------------------- |
| 5.1.1  | Contains      | `type: contains`             | String contains     |
| 5.1.2  | Not contains  | `type: not-contains`         | String not contains |
| 5.1.3  | Equals        | `type: equals`               | Exact match         |
| 5.1.4  | Starts with   | `type: starts-with`          | Prefix match        |
| 5.1.5  | Regex         | `type: regex`                | Regex match         |
| 5.1.6  | Is JSON       | `type: is-json`              | JSON validation     |
| 5.1.7  | Contains JSON | `type: contains-json`        | JSON subset         |
| 5.1.8  | JSON schema   | `type: is-valid-json-schema` | JSON schema         |
| 5.1.9  | Cost          | `type: cost`                 | Cost threshold      |
| 5.1.10 | Latency       | `type: latency`              | Latency threshold   |
| 5.1.11 | Perplexity    | `type: perplexity`           | Perplexity check    |

#### 5.2 Script Assertions

| #     | Test          | Assertion Config                               | Verifies      |
| ----- | ------------- | ---------------------------------------------- | ------------- |
| 5.2.1 | Inline JS     | `type: javascript, value: "output.includes()"` | Inline JS     |
| 5.2.2 | JS file       | `type: javascript, value: file://assert.js`    | JS file       |
| 5.2.3 | JS named fn   | `type: javascript, value: file://assert.js:fn` | JS named      |
| 5.2.4 | Inline Python | `type: python, value: "output.lower()"`        | Inline Python |
| 5.2.5 | Python file   | `type: python, value: file://assert.py`        | Python file   |
| 5.2.6 | Python named  | `type: python, value: file://assert.py:check`  | Python named  |

#### 5.3 Model-Graded Assertions (Config Validation Only)

| #     | Test              | Assertion Type            | Verifies    |
| ----- | ----------------- | ------------------------- | ----------- |
| 5.3.1 | Factuality        | `type: factuality`        | Config load |
| 5.3.2 | Answer relevance  | `type: answer-relevance`  | Config load |
| 5.3.3 | Context relevance | `type: context-relevance` | Config load |
| 5.3.4 | LLM rubric        | `type: llm-rubric`        | Config load |

---

### 6. Transform Tests

#### 6.1 Response Transforms

| #     | Test           | Transform Config                            | Verifies        |
| ----- | -------------- | ------------------------------------------- | --------------- |
| 6.1.1 | String expr    | `transformResponse: "json.content"`         | Expression eval |
| 6.1.2 | JS file        | `transformResponse: file://transform.js`    | JS transform    |
| 6.1.3 | Named function | `transformResponse: file://transform.js:fn` | Named transform |

#### 6.2 Prompt Transforms

| #     | Test            | Transform Config                     | Verifies       |
| ----- | --------------- | ------------------------------------ | -------------- |
| 6.2.1 | Prompt function | `prompt: file://prompt.js`           | Prompt fn      |
| 6.2.2 | Nunjucks filter | `nunjucksFilters: file://filters.js` | Custom filters |

---

### 7. Feature Integration Tests

#### 7.1 Provider Config Options

| #     | Test                 | Config                                            | Verifies       |
| ----- | -------------------- | ------------------------------------------------- | -------------- |
| 7.1.1 | Provider with config | `providers: [{ id: echo, config: { foo: bar } }]` | Config passing |
| 7.1.2 | Provider with label  | `providers: [{ id: echo, label: "My Echo" }]`     | Label support  |
| 7.1.3 | Multiple providers   | `providers: [echo, echo]`                         | Multi-provider |

#### 7.2 DefaultTest

| #     | Test               | Config                             | Verifies       |
| ----- | ------------------ | ---------------------------------- | -------------- |
| 7.2.1 | Inline defaultTest | `defaultTest: { assert: [...] }`   | Inline default |
| 7.2.2 | File defaultTest   | `defaultTest: file://default.yaml` | File default   |

#### 7.3 Scenarios

| #     | Test           | Config                                     | Verifies         |
| ----- | -------------- | ------------------------------------------ | ---------------- |
| 7.3.1 | Basic scenario | `scenarios: [{ config: ..., tests: ... }]` | Scenario loading |

---

### 8. Example Config Smoke Tests

Validate existing examples work with echo provider substitution:

| #    | Example                               | Original Provider | Test With |
| ---- | ------------------------------------- | ----------------- | --------- |
| 8.1  | `examples/simple-test`                | openai            | echo      |
| 8.2  | `examples/simple-csv`                 | openai            | echo      |
| 8.3  | `examples/json-output`                | openai            | echo      |
| 8.4  | `examples/executable-prompts`         | echo              | as-is     |
| 8.5  | `examples/csv-metadata`               | openai            | echo      |
| 8.6  | `examples/jsonl-test-cases`           | openai            | echo      |
| 8.7  | `examples/javascript-assert-external` | openai            | echo      |
| 8.8  | `examples/nunjucks-custom-filters`    | openai            | echo      |
| 8.9  | `examples/external-defaulttest`       | openai            | echo      |
| 8.10 | `examples/multishot`                  | openai            | echo      |

---

## Implementation Priority

### Phase 1: Foundation (Must Ship) - COMPLETE

- [x] 1.1.1-1.1.5: Basic CLI operations
- [x] 1.4.1-1.4.7: Basic eval with echo (output formats, flags)
- [x] 1.7.1-1.7.3: Exit codes
- [x] 2.1.1: YAML config
- [x] 3.1.1: Echo provider
- [x] 4.2.1: Inline tests
- [x] 1.2.1: Init command
- [x] 1.3.1-1.3.2: Validate command
- [x] 1.5.1-1.5.2: List commands
- [x] 1.6.1: Cache commands

### Phase 2: Config & Provider Formats - PARTIAL

- [x] 2.2.1: JSON config
- [x] 2.3.1: CJS config with module.exports
- [x] 2.3.5: ESM config with export default
- [ ] 2.3.2-2.3.4, 2.3.6-2.3.7: Other JS config variants
- [x] 2.4.1: TypeScript config with export default
- [ ] 2.4.2-2.4.6: Other TS config variants
- [x] 3.2.1: CJS provider class
- [x] 3.2.4: ESM provider class
- [ ] 3.2.2-3.2.3, 3.2.5: Other JS provider variants
- [x] 3.3.1: TypeScript provider class
- [ ] 3.3.2-3.3.3: Other TS provider variants

### Phase 3: Script Providers - PARTIAL

- [x] 3.4.1: Python provider (default call_api)
- [x] 3.4.2: Python provider named function
- [ ] 3.4.3-3.4.7: Other Python provider variants
- [ ] 3.5.1-3.5.3: Ruby provider variants
- [ ] 3.6.1-3.6.2: Go provider variants
- [x] 3.1.2: Exec provider

### Phase 4: Data & Assertions - PARTIAL

- [x] 4.2.2: CSV file tests
- [x] 4.2.3: JSON file tests
- [x] 4.2.4: JSONL file tests
- [x] 4.2.5: YAML file tests
- [x] 4.2.7: JS test generator
- [x] 4.3.2: File ref prompts
- [ ] 4.2.6, 4.2.8-4.2.10: Other data loading formats (XLSX, TS/Python generators, glob)
- [x] 5.1.1: Contains assertion
- [x] 5.1.2: Not-contains assertion
- [x] 5.1.3: Equals assertion
- [x] 5.1.4: Starts-with assertion
- [x] 5.1.5: Regex assertion
- [x] 5.1.6: Is-JSON assertion
- [x] 5.1.7: Contains-json assertion
- [x] 5.2.1: Inline JavaScript assertion
- [x] 5.2.2: JavaScript file assertion
- [x] 5.2.5: Python file assertion
- [ ] 5.1.8-5.1.11: Other built-in assertions (json-schema, cost, latency, perplexity)
- [ ] 5.2.3-5.2.4, 5.2.6: Other script assertion variants

### Phase 5: HTTP & Auth

- [ ] 3.7.1-3.7.5: HTTP provider basics
- [ ] 3.8.1-3.8.10: All auth configurations

### Phase 6: Filter & Flag Tests - PARTIAL

High-value tests for CLI filter flags and execution options.

**Priority 1 - Count/Pattern Filters:**

- [x] 1.8.1.1: First N tests (`--filter-first-n 2`)
- [x] 1.8.1.2: First N > total (returns all)
- [x] 1.8.1.4: Sample N tests (`--filter-sample 2`)
- [x] 1.8.2.1: Pattern filter (`--filter-pattern "user.*test"`)
- [x] 1.8.2.3: Pattern no match (0 tests)
- [x] 1.8.3.1: Metadata filter (`--filter-metadata category=auth`)
- [x] 1.8.3.2: Metadata partial match
- [x] 1.8.3.3: Metadata array match

**Priority 2 - Provider Filters:**

- [x] 1.8.4.1: Provider by ID (`--filter-providers "echo"`)
- [x] 1.8.4.2: Provider by label regex
- [x] 1.8.6.1: Combined filters (pattern + first-n)

**Priority 3 - Variable/Prompt Flags:**

- [x] 1.9.1: Single var (`--var name=Alice`)
- [x] 1.9.2: Multiple vars
- [x] 1.9.3: Var precedence (test vars override --var)
- [x] 1.9.5: Prompt prefix
- [x] 1.9.6: Prompt suffix
- [x] 1.9.7: Prefix + suffix combined

**Priority 4 - Output/Execution Flags:**

- [x] 1.10.1: Delay between tests (`--delay 100`)
- [x] 1.10.5: No table output
- [x] 1.11.1: Description flag
- [x] 1.11.2: Multiple output files
- [x] 1.11.3: No write flag

**Priority 5 - History-Based Filters (more complex):**

- [x] 1.8.5.1: Filter failing from file
- [ ] 1.8.5.3: Filter errors only from file
- [ ] 1.12.1: Resume evaluation
- [ ] 1.12.3: Retry errors

### Phase 7: Integration & Polish - PARTIAL

- [x] 6.1.1: Transform response expression
- [ ] 6.1.2-6.1.3: Other transform variants
- [x] 7.1.1: Provider with config options
- [ ] 7.1.2-7.1.3: Other provider config variants
- [x] 7.2.1: DefaultTest feature
- [ ] 7.2.2: File defaultTest
- [x] 7.3.1: Scenarios feature
- [ ] 8.1-8.10: Example config tests

### Phase 8: Advanced Features - PARTIAL

Advanced CLI features and assertion capabilities.

- [x] 1.4.8: Environment file loading (`--env-file`)
- [x] 1.4.4b: HTML output format
- [x] 4.3.1b: Multiple prompts (A/B testing)
- [x] 4.3.2b: Multiple file prompts (`file://` references)
- [x] 5.1.2b: icontains assertion (case-insensitive)
- [x] 5.1.5b: Regex end-of-string pattern (`$` anchor)
- [x] 5.3.1: Assertion weights
- [x] 7.4.1: Test threshold option (partial assertion passes)
- [ ] 1.4.9: `--grader` flag for model-graded assertions
- [ ] 1.12.1: Resume evaluation (`--resume`)
- [ ] 1.12.3: Retry errors (`--retry-errors`)
- [ ] 2.5.1: Config extends feature

---

## Cross-Platform Testing

### OS Matrix

| #     | OS      | Node Versions | Special Considerations          |
| ----- | ------- | ------------- | ------------------------------- |
| 9.1.1 | Ubuntu  | 20, 22, 24    | Standard                        |
| 9.1.2 | macOS   | 20, 22, 24    | fsevents, path handling         |
| 9.1.3 | Windows | 20, 22, 24    | Path separators, shell commands |

### Script Language Matrix

| #     | Language | Versions  | Tests           |
| ----- | -------- | --------- | --------------- |
| 9.2.1 | Python   | 3.9, 3.11 | Python provider |
| 9.2.2 | Ruby     | 3.0, 3.3  | Ruby provider   |
| 9.2.3 | Go       | 1.23      | Go provider     |

---

## CI Integration

Add to `.github/workflows/main.yml`:

```yaml
smoke-tests:
  name: Smoke Tests
  runs-on: ubuntu-latest
  needs: [build]
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '20'
    - uses: actions/setup-python@v5
      with:
        python-version: '3.11'

    - name: Install dependencies
      run: npm ci

    - name: Build
      run: npm run build

    - name: Smoke Tests
      run: npm run test:smoke
```

---

## Writing New Smoke Tests

### Guidelines

1. **Use echo provider** - No external API dependencies
2. **Keep fixtures minimal** - Only what's needed to test the feature
3. **Test one thing** - Each test should verify a single capability
4. **Include negative tests** - Verify errors are handled correctly
5. **Document the test** - Add entry to checklist above

### Echo-Based Provider Template

```python
# test/smoke/fixtures/providers/echo-provider.py
def call_api(prompt, options, context):
    """Echo provider that returns the prompt back."""
    return {
        "output": f"Echo: {prompt}",
        "tokenUsage": {"total": len(prompt), "prompt": len(prompt), "completion": 0}
    }
```

```javascript
// test/smoke/fixtures/providers/echo-provider.js
module.exports = class EchoProvider {
  constructor(options) {
    this.id = options.id || 'echo-js';
  }
  id() {
    return this.id;
  }
  async callApi(prompt) {
    return { output: `Echo: ${prompt}` };
  }
};
```

### Config Fixture Template

```yaml
# test/smoke/fixtures/configs/basic.yaml
description: 'Smoke test - basic eval'
providers:
  - echo
prompts:
  - 'Hello {{name}}'
tests:
  - vars:
      name: World
    assert:
      - type: contains
        value: Hello
      - type: contains
        value: World
```

---

## Key Findings

Important discoveries made during smoke test implementation that may inform future development:

### Provider Named Function Syntax

The `:functionName` syntax (e.g., `file://provider.py:custom_fn`) is **only supported** for:

- **Python providers** - `file://provider.py:custom_fn` works
- **Ruby providers** - `file://provider.rb:custom_fn` works
- **Go providers** - `file://main.go:CustomFn` works

It is **NOT supported** for JavaScript/TypeScript providers. JS/TS providers must export a class:

```javascript
// Correct - class export
module.exports = class MyProvider {
  async callApi(prompt) {
    return { output: prompt };
  }
};

// NOT supported - named function export for providers
// module.exports.callApi = async (prompt) => { ... };
```

The `:functionName` syntax IS supported for JavaScript in other contexts:

- Assertions: `type: javascript, value: file://assert.js:checkFn`
- Transforms: `transform: file://transform.js:transformFn`
- Test generators: `tests: file://tests.js:generateTests`

### Assertion Behavior

#### `contains-json` Assertion

The `contains-json` assertion behaves differently based on whether a `value` is provided:

- **Without value**: Checks that the output contains valid JSON somewhere
- **With value**: Validates extracted JSON against a **JSON Schema** (not a subset match)

```yaml
# Just check for valid JSON presence
- type: contains-json

# Validate against JSON Schema
- type: contains-json
  value:
    type: object
    required: [status, code]
    properties:
      status: { type: string }
      code: { type: number }
```

### Scenarios Configuration

The `scenarios[].config` field expects an **array** of variable configurations, not a plain object:

```yaml
# Correct
scenarios:
  - config:
      - vars:
          region: US
      - vars:
          region: EU
    tests:
      - vars: { name: Alice }

# Incorrect - will fail validation
scenarios:
  - config:
      region: US  # This is wrong
    tests:
      - vars: { name: Alice }
```

### Exit Codes

The CLI uses specific exit codes:

| Exit Code | Meaning                                                             |
| --------- | ------------------------------------------------------------------- |
| `0`       | Success - all tests passed                                          |
| `100`     | Test failures - one or more assertions failed                       |
| `1`       | Error - configuration error, provider error, or other runtime error |

### Output JSON Structure

When exporting results to JSON (`-o output.json`), key paths:

- `results.prompts[].provider` - Provider label/ID for each prompt
- `results.results[].success` - Boolean indicating if all assertions passed
- `results.results[].response.output` - The LLM output text
- `results.results[].provider.label` - Provider label if configured
- `results.results[].gradingResult.componentResults[]` - Individual assertion results

### Echo Provider Behavior

The built-in `echo` provider returns the prompt exactly as-is. This is useful for:

- Testing assertion logic without API calls
- Verifying prompt template rendering
- Testing data loading and variable substitution

To test JSON-related assertions, include JSON in the prompt itself:

```yaml
prompts:
  - 'Response: {"status": "ok", "count": 42}'
tests:
  - assert:
      - type: contains-json
```

### Test Isolation

Each smoke test file creates its own temporary output directory and cleans it up in `afterAll`. This ensures tests don't interfere with each other when run in parallel.

```typescript
const OUTPUT_DIR = path.resolve(__dirname, '.temp-output-unique-name');

beforeAll(() => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
});

afterAll(() => {
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
});
```

### Available Assertion Types

There is **no `ends-with` assertion type**. To check string suffixes, use the `regex` assertion with a `$` anchor:

```yaml
# Check if output ends with "42."
- type: regex
  value: '42\.$'
```

Available assertion types include: `contains`, `contains-all`, `contains-any`, `icontains`, `icontains-all`, `icontains-any`, `equals`, `starts-with`, `regex`, `is-json`, `contains-json`, `is-html`, `is-xml`, `is-sql`, `javascript`, `python`, and model-graded assertions.

### Glob Patterns for Prompts

Glob patterns in prompts (e.g., `prompts/*.txt`) have path resolution issues when used with `file://` prefix. Use explicit file references instead:

```yaml
# Works - explicit file references
prompts:
  - file://../prompts/greeting.txt
  - file://../prompts/farewell.txt

# Has issues - glob pattern
prompts:
  - file://prompts/*.txt
```

### Multiple Config Files Behavior

Using multiple `-c` flags doesn't deeply merge configs. Each config is processed separately with defaults for missing properties. The second config will get a default `{{prompt}}` prompt if prompts aren't specified.

To compose configs, use explicit `file://` references within a single config or specify all required properties in each config file.

### HTML Output Format

The HTML output uses lowercase `<!doctype html>` (valid HTML5) rather than uppercase `<!DOCTYPE html>`.

---

## Bug Regression Tests (0.120.x)

Critical bugs identified in versions 0.120.0-0.120.3 that should have smoke test coverage. These bugs represent real issues users encountered after the major ESM migration.

### 10. ESM Migration Bugs (0.120.0)

The 0.120.0 release migrated from CommonJS to ESM, causing several regressions:

#### 10.1 Module Loading

| #      | Bug                   | Issue | Description                                                | Proposed Test                                 |
| ------ | --------------------- | ----- | ---------------------------------------------------------- | --------------------------------------------- |
| 10.1.1 | CJS fallback          | #6501 | `.js` files with CJS syntax failed to load                 | Load `.js` provider with `module.exports`     |
| 10.1.2 | require() resolution  | #6468 | `require()` calls in custom code failed                    | Provider that uses require() internally       |
| 10.1.3 | process.mainModule    | #6606 | Inline transforms using `process.mainModule.require` broke | Inline JS assertion with `process.mainModule` |
| 10.1.4 | ESM import resolution | #6509 | Various import paths failed in ESM context                 | TS provider with complex imports              |

#### 10.2 Provider Path Resolution

| #      | Bug                    | Issue | Description                                                  | Proposed Test                                    |
| ------ | ---------------------- | ----- | ------------------------------------------------------------ | ------------------------------------------------ |
| 10.2.1 | Relative path from CWD | #6503 | Provider paths resolved from CWD instead of config directory | Config in subdir with `./provider.js` path       |
| 10.2.2 | Python wrapper path    | #6500 | Python wrapper.py path resolution failed                     | Python provider from different working directory |
| 10.2.3 | Python provider path   | #6465 | Python provider module path resolution issues                | Python provider with relative imports            |

#### 10.3 Cache & Config

| #      | Bug                    | Issue | Description                                                  | Proposed Test                                    |
| ------ | ---------------------- | ----- | ------------------------------------------------------------ | ------------------------------------------------ |
| 10.3.1 | Cache init failure     | #6467 | Cache failed to initialize: "KeyvFile is not a constructor"  | Run eval with cache enabled (default)            |
| 10.3.2 | maxConcurrency ignored | #6526 | `maxConcurrency` in config.yaml was ignored, only CLI worked | Config with `defaultTest.options.maxConcurrency` |

#### 10.4 CLI Issues

| #      | Bug                    | Issue | Description                                        | Proposed Test                                   |
| ------ | ---------------------- | ----- | -------------------------------------------------- | ----------------------------------------------- |
| 10.4.1 | Eval hanging           | #6460 | Eval command hung indefinitely, never completing   | Basic eval completes in reasonable time         |
| 10.4.2 | View premature exit    | #6460 | `promptfoo view` exited immediately after starting | (Not testable in smoke tests - requires server) |
| 10.4.3 | Logger write-after-end | #6511 | Winston "write after end" errors during shutdown   | Multiple evals in sequence don't cause errors   |

#### 10.5 Language Providers

| #      | Bug                  | Issue | Description                                      | Proposed Test                     |
| ------ | -------------------- | ----- | ------------------------------------------------ | --------------------------------- |
| 10.5.1 | Go provider broken   | #6506 | Go provider wrapper failed after ESM migration   | Go provider basic functionality   |
| 10.5.2 | Ruby provider broken | #6506 | Ruby provider wrapper failed after ESM migration | Ruby provider basic functionality |

### 11. Version 0.120.1-0.120.2 Bugs

#### 11.1 Database & Migrations

| #      | Bug                     | Issue | Description                                | Proposed Test                           |
| ------ | ----------------------- | ----- | ------------------------------------------ | --------------------------------------- |
| 11.1.1 | Drizzle migrations path | #6573 | DB migrations not found when using npm/npx | (Tested implicitly - eval writes to DB) |

#### 11.2 Parsing Issues

| #      | Bug                     | Issue | Description                                            | Proposed Test                                     |
| ------ | ----------------------- | ----- | ------------------------------------------------------ | ------------------------------------------------- |
| 11.2.1 | JSON chat parsing       | #6568 | Incorrect parsing of JSON vs non-JSON chat messages    | JSON array prompt parses correctly                |
| 11.2.2 | Gemini empty contents   | #6580 | Gemini provider crashed on empty content responses     | (Requires Gemini - not for smoke tests)           |
| 11.2.3 | Context-recall preamble | #6566 | Preamble text in context-recall parser caused failures | (Requires grading provider - not for smoke tests) |

#### 11.3 Assertion Improvements

| #      | Bug                   | Issue | Description                                              | Proposed Test                           |
| ------ | --------------------- | ----- | -------------------------------------------------------- | --------------------------------------- |
| 11.3.1 | is-sql error messages | #6565 | Unhelpful error messages for is-sql whitelist violations | is-sql with whitelist shows clear error |

#### 11.4 HTTP Provider

| #      | Bug          | Issue | Description                               | Proposed Test                            |
| ------ | ------------ | ----- | ----------------------------------------- | ---------------------------------------- |
| 11.4.1 | Body parsing | #6484 | HTTP provider body parsing had edge cases | HTTP provider with complex body template |

### 12. Key Regression Test Implementations

Priority smoke tests to add based on critical 0.120.x bugs:

#### 12.1 Module Loading Regression Tests

```yaml
# Test 10.1.1: CJS provider with module.exports still works
# Fixture: test/smoke/fixtures/providers/cjs-module-exports.js
providers:
  - file://providers/cjs-module-exports.js

# Test 10.1.3: Inline JS with process.mainModule (requires Node.js CJS compat)
tests:
  - assert:
      - type: javascript
        value: |
          // This should not throw even though process.mainModule is undefined in ESM
          const output = context.output || '';
          return output.includes('test');
```

#### 12.2 Provider Path Resolution Tests

```yaml
# Test 10.2.1: Provider path relative to config file, NOT cwd
# Config at: test/smoke/fixtures/subdir/config-relative-provider.yaml
# Provider at: test/smoke/fixtures/subdir/local-provider.js
# Run from: test/smoke/ (different directory than config)
providers:
  - file://./local-provider.js # Should resolve relative to config, not cwd
```

#### 12.3 Config Option Tests

```yaml
# Test 10.3.2: maxConcurrency in config.yaml is respected
defaultTest:
  options:
    maxConcurrency: 1
providers:
  - echo
prompts:
  - 'Test {{n}}'
tests:
  - vars: { n: 1 }
  - vars: { n: 2 }
  - vars: { n: 3 }
# Verify tests run sequentially (timing check)
```

### Implementation Priority for Regression Tests

**Phase 1: High Priority (Add Now)**

- [ ] 10.1.1: CJS module.exports provider loading
- [ ] 10.2.1: Provider path resolution from config directory
- [ ] 10.3.2: maxConcurrency in config file
- [ ] 11.2.1: JSON chat message parsing

**Phase 2: Medium Priority**

- [ ] 10.1.3: Inline JS with process.mainModule shim
- [ ] 10.5.1: Go provider basic test
- [ ] 10.5.2: Ruby provider basic test

**Phase 3: Lower Priority (Complex Setup)**

- [ ] 10.2.2: Python wrapper path from different CWD
- [ ] 11.4.1: HTTP provider complex body parsing

---

## Implemented Tests Summary

Current smoke test coverage:

| Test File                       | Tests   | Category                             |
| ------------------------------- | ------- | ------------------------------------ |
| `cli.test.ts`                   | 18      | CLI commands, init, validate         |
| `eval.test.ts`                  | 12      | Core eval pipeline                   |
| `providers.test.ts`             | 14      | Provider loading (JS/TS/Python)      |
| `configs.test.ts`               | 8       | Config format parsing                |
| `data-loading.test.ts`          | 13      | Data sources (CSV, JSON, YAML)       |
| `filters-flags.test.ts`         | 22      | Filter flags and CLI options         |
| `advanced-features.test.ts`     | 10      | Advanced features (env, delay, HTML) |
| `output-and-assertions.test.ts` | 15      | Assertion types and output formats   |
| **Total**                       | **100** |                                      |
