# parallel-search-mcp (Remote MCP Search and Fetch)

Test a hosted MCP server without running a local server or configuring an API key. This example calls [Parallel Search MCP](https://docs.parallel.ai/integrations/mcp/search-mcp) directly through Promptfoo's existing `mcp` provider. It does not use an LLM or a model-graded assertion.

## Run

```bash
npx promptfoo@latest init --example parallel-search-mcp
cd parallel-search-mcp
npx promptfoo@latest eval --no-cache --max-concurrency 1 -o results.json
```

No environment variables, Parallel account, or API keys are required. The connection uses Streamable HTTP at `https://search.parallel.ai/mcp` without authentication headers.

The two test cases call `web_search` to find Promptfoo's MCP documentation and `web_fetch` to extract `https://example.com`. The assertions check for URLs and nonempty excerpts, the expected source in search results, and no per-URL fetch errors. The response transform reads structured content, with a JSON text fallback, and reports MCP tool errors as eval errors.

Expect two passing tests. Inspect `results.json` for outputs and errors. Search rankings and page content can change, so this is a live integration smoke test, not a search-quality benchmark. Requests use the MCP client's 60-second timeout. Free access is rate limited; if a run hits a limit, wait before retrying rather than increasing concurrency.

## Data sent to Parallel

Running the eval sends the configured search queries, requested URLs, and objectives to Parallel. Use public test data only. The returned excerpts and URLs are included in your eval results. See Parallel's [Customer Terms](https://parallel.ai/customer-terms) and [Privacy Policy](https://parallel.ai/privacy-policy).

This config makes only the listed tool calls. It does not enable web search for other providers, change existing defaults, or add a paid fallback. To stop using the service, stop running this config or remove its MCP provider from any config you copy it into.

To adapt the example, edit the JSON tool arguments under `tests` and their expected assertions. Keep both `objective` and `search_queries` for `web_search`; `web_fetch` takes public URLs and uses excerpts by default.
