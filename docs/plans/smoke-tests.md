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

| #     | Test            | Command                              | Verifies                    |
| ----- | --------------- | ------------------------------------ | --------------------------- |
| 1.1.1 | Version output  | `promptfoo --version`                | Binary executes, version    |
| 1.1.2 | Help output     | `promptfoo --help`                   | Commander parsing           |
| 1.1.3 | Subcommand help | `promptfoo eval --help`              | Subcommand routing          |
| 1.1.4 | Unknown command | `promptfoo unknownxyz`               | Error handling              |
| 1.1.5 | Invalid config  | `promptfoo eval -c nonexistent.yaml` | File not found error        |

#### 1.2 Init Command

| #     | Test              | Command                               | Verifies            |
| ----- | ----------------- | ------------------------------------- | ------------------- |
| 1.2.1 | Init interactive  | `promptfoo init --no-interactive`     | Project scaffolding |
| 1.2.2 | Init with example | `promptfoo init --example simple-cli` | Example download    |

#### 1.3 Validate Command

| #     | Test           | Command                              | Verifies          |
| ----- | -------------- | ------------------------------------ | ----------------- |
| 1.3.1 | Valid config   | `promptfoo validate -c valid.yaml`   | Validation passes |
| 1.3.2 | Invalid config | `promptfoo validate -c invalid.yaml` | Validation errors |
| 1.3.3 | Schema errors  | `promptfoo validate -c malformed.yaml` | Schema validation |

#### 1.4 Eval Command (Core)

| #     | Test            | Command                                           | Verifies            |
| ----- | --------------- | ------------------------------------------------- | ------------------- |
| 1.4.1 | Basic eval      | `promptfoo eval -c echo-config.yaml --no-cache`   | Core eval pipeline  |
| 1.4.2 | JSON output     | `promptfoo eval -c config.yaml -o out.json`       | JSON export         |
| 1.4.3 | YAML output     | `promptfoo eval -c config.yaml -o out.yaml`       | YAML export         |
| 1.4.4 | CSV output      | `promptfoo eval -c config.yaml -o out.csv`        | CSV export          |
| 1.4.5 | Max concurrency | `promptfoo eval -c config.yaml --max-concurrency 1` | Concurrency control |
| 1.4.6 | Repeat          | `promptfoo eval -c config.yaml --repeat 2`        | Repeat runs         |
| 1.4.7 | Verbose         | `promptfoo eval -c config.yaml --verbose`         | Verbose logging     |
| 1.4.8 | Env file        | `promptfoo eval -c config.yaml --env-file .env`   | Env loading         |

#### 1.5 List/Show/Export Commands

| #     | Test          | Command                                  | Verifies          |
| ----- | ------------- | ---------------------------------------- | ----------------- |
| 1.5.1 | List evals    | `promptfoo list evals`                   | Database reads    |
| 1.5.2 | List datasets | `promptfoo list datasets`                | Dataset listing   |
| 1.5.3 | Show eval     | `promptfoo show <eval-id>`               | Eval retrieval    |
| 1.5.4 | Export eval   | `promptfoo export <eval-id> -o out.json` | Export functionality |

#### 1.6 Cache Commands

| #     | Test        | Command                | Verifies         |
| ----- | ----------- | ---------------------- | ---------------- |
| 1.6.1 | Cache clear | `promptfoo cache clear` | Cache management |

#### 1.7 Exit Codes

| #     | Test           | Scenario             | Expected Code |
| ----- | -------------- | -------------------- | ------------- |
| 1.7.1 | All pass       | All assertions pass  | `0`           |
| 1.7.2 | Assertion fail | Assertion fails      | `100`         |
| 1.7.3 | Config error   | Invalid config       | `1`           |
| 1.7.4 | Provider error | Provider fails       | `1`           |

---

### 2. Config Format Tests

#### 2.1 YAML Configs

| #     | Test              | Config               | Verifies           |
| ----- | ----------------- | -------------------- | ------------------ |
| 2.1.1 | Basic YAML        | `config.yaml`        | YAML parsing       |
| 2.1.2 | YAML with anchors | `config-anchors.yaml` | YAML anchor/alias  |
| 2.1.3 | YML extension     | `config.yml`         | .yml extension     |

#### 2.2 JSON Configs

| #     | Test        | Config        | Verifies     |
| ----- | ----------- | ------------- | ------------ |
| 2.2.1 | JSON config | `config.json` | JSON parsing |

#### 2.3 JavaScript Configs

| #     | Test             | Config       | Export Style               | Verifies    |
| ----- | ---------------- | ------------ | -------------------------- | ----------- |
| 2.3.1 | CJS class export | `config.js`  | `module.exports = Class`   | CJS class   |
| 2.3.2 | CJS object export | `config.js` | `module.exports = { ... }` | CJS object  |
| 2.3.3 | CJS named export | `config.js`  | `module.exports.foo = ...` | CJS named   |
| 2.3.4 | CJS explicit ext | `config.cjs` | `module.exports = ...`     | .cjs extension |
| 2.3.5 | ESM default      | `config.mjs` | `export default { ... }`   | ESM default |
| 2.3.6 | ESM class        | `config.mjs` | `export default class`     | ESM class   |
| 2.3.7 | ESM named        | `config.mjs` | `export const config`      | ESM named   |

#### 2.4 TypeScript Configs

| #     | Test             | Config       | Export Style               | Verifies       |
| ----- | ---------------- | ------------ | -------------------------- | -------------- |
| 2.4.1 | TS default       | `config.ts`  | `export default { ... }`   | TS transpile   |
| 2.4.2 | TS class         | `config.ts`  | `export default class`     | TS class       |
| 2.4.3 | TS named         | `config.ts`  | `export const config`      | TS named       |
| 2.4.4 | TS with types    | `config.ts`  | `implements ApiProvider`   | Type imports   |
| 2.4.5 | MTS extension    | `config.mts` | `export default ...`       | .mts extension |
| 2.4.6 | CTS extension    | `config.cts` | `module.exports = ...`     | .cts extension |

---

### 3. Provider Tests

#### 3.1 Built-in Providers (No API Key)

| #     | Test          | Provider             | Verifies          |
| ----- | ------------- | -------------------- | ----------------- |
| 3.1.1 | Echo provider | `echo`               | Built-in echo     |
| 3.1.2 | Exec provider | `exec:echo "hello"`  | Shell command     |

#### 3.2 JavaScript Providers

| #     | Test         | Provider Config              | Export Style                 | Verifies          |
| ----- | ------------ | ---------------------------- | ---------------------------- | ----------------- |
| 3.2.1 | CJS class    | `file://provider.js`         | `module.exports = Class`     | CJS class         |
| 3.2.2 | CJS function | `file://provider.js:callApi` | `module.exports.callApi = fn` | CJS named fn      |
| 3.2.3 | CJS explicit | `file://provider.cjs`        | `module.exports = ...`       | .cjs extension    |
| 3.2.4 | ESM default  | `file://provider.mjs`        | `export default class`       | ESM class         |
| 3.2.5 | ESM function | `file://provider.mjs:callApi` | `export function callApi`   | ESM named fn      |

#### 3.3 TypeScript Providers

| #     | Test              | Provider Config               | Export Style              | Verifies       |
| ----- | ----------------- | ----------------------------- | ------------------------- | -------------- |
| 3.3.1 | TS default class  | `file://provider.ts`          | `export default class`    | TS class       |
| 3.3.2 | TS named function | `file://provider.ts:callApi`  | `export function callApi` | TS named fn    |
| 3.3.3 | TS with interface | `file://provider.ts`          | `implements ApiProvider`  | TS interface   |

#### 3.4 Python Providers

| #     | Test            | Provider Config                | Function               | Verifies        |
| ----- | --------------- | ------------------------------ | ---------------------- | --------------- |
| 3.4.1 | Default fn      | `file://provider.py`           | `call_api()`           | Python default  |
| 3.4.2 | Named fn        | `file://provider.py:custom_fn` | `custom_fn()`          | Python named    |
| 3.4.3 | Async fn        | `file://provider.py:async_fn`  | `async def async_fn()` | Python async    |
| 3.4.4 | With context    | `file://provider.py`           | Uses `context` param   | Context passing |
| 3.4.5 | With options    | `file://provider.py`           | Uses `options` param   | Options passing |
| 3.4.6 | Token usage     | `file://provider.py`           | Returns `tokenUsage`   | Token tracking  |
| 3.4.7 | Error return    | `file://provider.py`           | Returns `error`        | Error handling  |

#### 3.5 Ruby Providers

| #     | Test        | Provider Config                | Function      | Verifies     |
| ----- | ----------- | ------------------------------ | ------------- | ------------ |
| 3.5.1 | Default fn  | `file://provider.rb`           | `call_api()`  | Ruby default |
| 3.5.2 | Named fn    | `file://provider.rb:custom_fn` | `custom_fn()` | Ruby named   |
| 3.5.3 | Hash return | `file://provider.rb`           | Hash output   | Ruby hash    |

#### 3.6 Go Providers

| #     | Test            | Provider Config     | Function     | Verifies   |
| ----- | --------------- | ------------------- | ------------ | ---------- |
| 3.6.1 | Default fn      | `file://main.go`    | `CallApi`    | Go default |
| 3.6.2 | With go.mod     | `file://main.go`    | Multi-package | Go modules |

#### 3.7 HTTP Providers

| #     | Test               | Provider Config                       | Verifies           |
| ----- | ------------------ | ------------------------------------- | ------------------ |
| 3.7.1 | Basic HTTP         | `id: http://...`                      | HTTP provider      |
| 3.7.2 | HTTPS              | `id: https://...`                     | HTTPS provider     |
| 3.7.3 | Body template      | `body: { prompt: "{{prompt}}" }`      | Body templating    |
| 3.7.4 | Transform response | `transformResponse: json.output`      | Response transform |
| 3.7.5 | Custom headers     | `headers: { X-Custom: value }`        | Header passing     |

#### 3.8 HTTP Auth Configurations

| #      | Test               | Auth Config                                      | Verifies       |
| ------ | ------------------ | ------------------------------------------------ | -------------- |
| 3.8.1  | Bearer token       | `auth: { type: bearer, token: ... }`             | Bearer auth    |
| 3.8.2  | API key header     | `auth: { type: api_key, placement: header }`     | API key header |
| 3.8.3  | API key query      | `auth: { type: api_key, placement: query }`      | API key query  |
| 3.8.4  | Basic auth         | `auth: { type: basic, username, password }`      | Basic auth     |
| 3.8.5  | OAuth client creds | `auth: { type: oauth, grantType: client_credentials }` | OAuth CC  |
| 3.8.6  | OAuth password     | `auth: { type: oauth, grantType: password }`     | OAuth password |
| 3.8.7  | Signature PEM      | `signatureAuth: { type: pem, privateKeyPath }`   | PEM signature  |
| 3.8.8  | Signature JKS      | `signatureAuth: { type: jks, keystorePath }`     | JKS signature  |
| 3.8.9  | Signature PFX      | `signatureAuth: { type: pfx, pfxPath }`          | PFX signature  |
| 3.8.10 | mTLS cert          | `tls: { certPath, keyPath }`                     | Mutual TLS     |

---

### 4. Data Loading Tests

#### 4.1 Vars Loading

| #     | Test        | Config                   | Source      | Verifies    |
| ----- | ----------- | ------------------------ | ----------- | ----------- |
| 4.1.1 | Inline vars | `vars: { key: value }`   | YAML inline | Direct vars |
| 4.1.2 | JSON file   | `vars: file://data.json` | JSON file   | JSON vars   |
| 4.1.3 | YAML file   | `vars: file://data.yaml` | YAML file   | YAML vars   |

#### 4.2 Tests Loading

| #      | Test             | Config                     | Source        | Verifies         |
| ------ | ---------------- | -------------------------- | ------------- | ---------------- |
| 4.2.1  | Inline tests     | `tests: [{ vars: ... }]`   | YAML inline   | Direct tests     |
| 4.2.2  | CSV file         | `tests: file://tests.csv`  | CSV file      | CSV parsing      |
| 4.2.3  | JSON file        | `tests: file://tests.json` | JSON file     | JSON tests       |
| 4.2.4  | JSONL file       | `tests: file://tests.jsonl` | JSONL file   | JSONL parsing    |
| 4.2.5  | YAML file        | `tests: file://tests.yaml` | YAML file     | YAML tests       |
| 4.2.6  | XLSX file        | `tests: file://tests.xlsx` | Excel file    | Excel parsing    |
| 4.2.7  | JS generator     | `tests: file://tests.js`   | JS function   | JS test gen      |
| 4.2.8  | TS generator     | `tests: file://tests.ts`   | TS function   | TS test gen      |
| 4.2.9  | Python generator | `tests: file://tests.py`   | Python fn     | Python test gen  |
| 4.2.10 | Glob pattern     | `tests: tests/*.yaml`      | Glob          | Glob expansion   |

#### 4.3 Prompts Loading

| #     | Test         | Config                          | Source        | Verifies        |
| ----- | ------------ | ------------------------------- | ------------- | --------------- |
| 4.3.1 | Inline       | `prompts: ["Hello {{name}}"]`   | YAML inline   | Direct prompt   |
| 4.3.2 | File ref     | `prompts: [file://prompt.txt]`  | Text file     | File loading    |
| 4.3.3 | Glob pattern | `prompts: prompts/*.txt`        | Glob          | Glob prompts    |
| 4.3.4 | Exec prompt  | `prompts: [{ raw: "exec:..." }]` | Shell        | Executable      |
| 4.3.5 | JSON chat    | `prompts: [file://chat.json]`   | JSON messages | Chat format     |

---

### 5. Assertion Tests

#### 5.1 Built-in Assertions

| #      | Test              | Assertion Type            | Verifies          |
| ------ | ----------------- | ------------------------- | ----------------- |
| 5.1.1  | Contains          | `type: contains`          | String contains   |
| 5.1.2  | Not contains      | `type: not-contains`      | String not contains |
| 5.1.3  | Equals            | `type: equals`            | Exact match       |
| 5.1.4  | Starts with       | `type: starts-with`       | Prefix match      |
| 5.1.5  | Regex             | `type: regex`             | Regex match       |
| 5.1.6  | Is JSON           | `type: is-json`           | JSON validation   |
| 5.1.7  | Contains JSON     | `type: contains-json`     | JSON subset       |
| 5.1.8  | JSON schema       | `type: is-valid-json-schema` | JSON schema    |
| 5.1.9  | Cost              | `type: cost`              | Cost threshold    |
| 5.1.10 | Latency           | `type: latency`           | Latency threshold |
| 5.1.11 | Perplexity        | `type: perplexity`        | Perplexity check  |

#### 5.2 Script Assertions

| #     | Test          | Assertion Config                              | Verifies      |
| ----- | ------------- | --------------------------------------------- | ------------- |
| 5.2.1 | Inline JS     | `type: javascript, value: "output.includes()"` | Inline JS    |
| 5.2.2 | JS file       | `type: javascript, value: file://assert.js`   | JS file       |
| 5.2.3 | JS named fn   | `type: javascript, value: file://assert.js:fn` | JS named     |
| 5.2.4 | Inline Python | `type: python, value: "output.lower()"`       | Inline Python |
| 5.2.5 | Python file   | `type: python, value: file://assert.py`       | Python file   |
| 5.2.6 | Python named  | `type: python, value: file://assert.py:check` | Python named  |

#### 5.3 Model-Graded Assertions (Config Validation Only)

| #     | Test             | Assertion Type         | Verifies    |
| ----- | ---------------- | ---------------------- | ----------- |
| 5.3.1 | Factuality       | `type: factuality`     | Config load |
| 5.3.2 | Answer relevance | `type: answer-relevance` | Config load |
| 5.3.3 | Context relevance | `type: context-relevance` | Config load |
| 5.3.4 | LLM rubric       | `type: llm-rubric`     | Config load |

---

### 6. Transform Tests

#### 6.1 Response Transforms

| #     | Test             | Transform Config                          | Verifies       |
| ----- | ---------------- | ----------------------------------------- | -------------- |
| 6.1.1 | String expr      | `transformResponse: "json.content"`       | Expression eval |
| 6.1.2 | JS file          | `transformResponse: file://transform.js`  | JS transform   |
| 6.1.3 | Named function   | `transformResponse: file://transform.js:fn` | Named transform |

#### 6.2 Prompt Transforms

| #     | Test            | Transform Config                    | Verifies       |
| ----- | --------------- | ----------------------------------- | -------------- |
| 6.2.1 | Prompt function | `prompt: file://prompt.js`          | Prompt fn      |
| 6.2.2 | Nunjucks filter | `nunjucksFilters: file://filters.js` | Custom filters |

---

### 7. Feature Integration Tests

#### 7.1 Provider Config Options

| #     | Test               | Config                                         | Verifies       |
| ----- | ------------------ | ---------------------------------------------- | -------------- |
| 7.1.1 | Provider with config | `providers: [{ id: echo, config: { foo: bar } }]` | Config passing |
| 7.1.2 | Provider with label | `providers: [{ id: echo, label: "My Echo" }]`  | Label support  |
| 7.1.3 | Multiple providers | `providers: [echo, echo]`                      | Multi-provider |

#### 7.2 DefaultTest

| #     | Test              | Config                              | Verifies      |
| ----- | ----------------- | ----------------------------------- | ------------- |
| 7.2.1 | Inline defaultTest | `defaultTest: { assert: [...] }`   | Inline default |
| 7.2.2 | File defaultTest  | `defaultTest: file://default.yaml`  | File default  |

#### 7.3 Scenarios

| #     | Test           | Config                                   | Verifies         |
| ----- | -------------- | ---------------------------------------- | ---------------- |
| 7.3.1 | Basic scenario | `scenarios: [{ config: ..., tests: ... }]` | Scenario loading |

---

### 8. Example Config Smoke Tests

Validate existing examples work with echo provider substitution:

| #    | Example                        | Original Provider | Test With |
| ---- | ------------------------------ | ----------------- | --------- |
| 8.1  | `examples/simple-test`         | openai            | echo      |
| 8.2  | `examples/simple-csv`          | openai            | echo      |
| 8.3  | `examples/json-output`         | openai            | echo      |
| 8.4  | `examples/executable-prompts`  | echo              | as-is     |
| 8.5  | `examples/csv-metadata`        | openai            | echo      |
| 8.6  | `examples/jsonl-test-cases`    | openai            | echo      |
| 8.7  | `examples/javascript-assert-external` | openai      | echo      |
| 8.8  | `examples/nunjucks-custom-filters` | openai         | echo      |
| 8.9  | `examples/external-defaulttest` | openai           | echo      |
| 8.10 | `examples/multishot`           | openai            | echo      |

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

### Phase 6: Integration & Polish - PARTIAL

- [x] 6.1.1: Transform response expression
- [ ] 6.1.2-6.1.3: Other transform variants
- [x] 7.1.1: Provider with config options
- [ ] 7.1.2-7.1.3: Other provider config variants
- [x] 7.2.1: DefaultTest feature
- [ ] 7.2.2: File defaultTest
- [x] 7.3.1: Scenarios feature
- [ ] 8.1-8.10: Example config tests

---

## Cross-Platform Testing

### OS Matrix

| #     | OS      | Node Versions | Special Considerations          |
| ----- | ------- | ------------- | ------------------------------- |
| 9.1.1 | Ubuntu  | 20, 22, 24    | Standard                        |
| 9.1.2 | macOS   | 20, 22, 24    | fsevents, path handling         |
| 9.1.3 | Windows | 20, 22, 24    | Path separators, shell commands |

### Script Language Matrix

| #     | Language | Versions    | Tests           |
| ----- | -------- | ----------- | --------------- |
| 9.2.1 | Python   | 3.9, 3.11   | Python provider |
| 9.2.2 | Ruby     | 3.0, 3.3    | Ruby provider   |
| 9.2.3 | Go       | 1.23        | Go provider     |

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
  id() { return this.id; }
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
