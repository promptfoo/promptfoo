---
sidebar_label: Remote Generation Errors
description: Red team remote API connectivity issues by diagnosing network blocks and security policies to ensure secure access for LLM adversarial testing workflows
---

# Remote Generation Errors

Use the failed request's status or error message to distinguish a network problem from a generation failure. DNS resolution, TLS, proxy settings, service errors, and network policies can all prevent a request from completing.

## Checking Connectivity

From the same machine or CI runner as Promptfoo, check the default service endpoint:

```bash
curl -i https://api.promptfoo.app/version
```

An HTTP `200` response with a `version` field confirms that this endpoint is reachable. It does not confirm that an authenticated generation request will succeed. If you use a custom remote endpoint, check that host instead.

For a failed request, note whether the error concerns DNS, TLS, a proxy, or an HTTP status. Compare it with the failed generation request before attributing the problem to a firewall.

## Common Solutions

If logs show a network-policy block, ask your network administrator to allow HTTPS access to the configured generation endpoint. The default host is `api.promptfoo.app`.

If your environment requires a proxy, configure it before retrying:

```bash
export HTTPS_PROXY=http://proxy.company.com:8080
promptfoo redteam generate --verbose
```

Use the proxy and certificate settings required by your organization. A browser may use different settings from the Node.js process, so browser access alone does not confirm the CLI can connect.

## Why Are Fewer Tests Generated Than Requested?

When plugins request a specific number of tests but only generate a subset or none at all, the most common causes are:

1. **Model refusals**: The configured redteam provider model is refusing to generate adversarial content. Some models have safety filters that block generation of harmful test cases.
2. **Rate limiting**: The API you're using has rate limits that throttle or reject requests when exceeded.
3. **Missing API keys**: Some plugins require external API keys (noted in the setup UI). If these are missing or invalid, generation can fail or return partial results.

To diagnose, run with `--verbose` to see detailed logs of any generation failures or refusals.

## Is Test Generation Capped?

`numTests` accepts a positive integer without a fixed upper bound in the config schema. This does not remove provider rate limits or service quotas.

`numTests` controls the requested seed count per plugin. Strategies can expand each seed into additional attempts, so it is not a limit on target requests. Increasing it can increase generation cost and scan time without guaranteeing additional coverage.

The [default is 5 per plugin](/docs/red-team/configuration/#configuration-fields), and it can be set globally or per plugin:

```yaml
redteam:
  numTests: 5 # applies to every plugin
  plugins:
    - id: harmful:hate
      numTests: 10 # override for one plugin
```

If you are hitting generation failures, lowering the count is a reasonable first step.

## Alternative Options

For plugins and strategies that support it, configure a [local generation provider](/docs/red-team/configuration#providers) and disable remote generation. Check the remote-inference indicators in the [plugin](/docs/red-team/plugins) and [strategy](/docs/red-team/strategies) tables before choosing this path.

## Getting Help

If you continue experiencing issues, [contact us](/contact/) for enterprise support.
