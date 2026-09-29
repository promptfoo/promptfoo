---
sidebar_label: Remote Generation Errors
description: Red team remote API connectivity issues by diagnosing network blocks and security policies to ensure secure access for LLM adversarial testing workflows
---

# Remote Generation Errors

You may encounter connection issues due to corporate firewalls or security policies. Since our service generates potentially harmful outputs for testing purposes, some organizations' security policies may block access to our API endpoints.

## Checking Connectivity

To verify if you can reach our API, try accessing Promptfoo's version endpoint:

```bash
curl https://api.promptfoo.app/version
```

You should receive a response like:

```json
{
  "version": "0.103.3"
}
```

If this request fails or times out, it likely means your network is blocking access to our API. You can also try opening `https://api.promptfoo.app/version` in your browser to see if you can reach the page.

## Common Solutions

1. **Check with IT**: Since promptfoo generates adversarial content for security testing, our API endpoints may be blocked by corporate security policies. Contact your IT department to:
   - Allowlist `api.promptfoo.app`
   - Allow HTTPS traffic to our endpoints
   - Review security logs for blocked requests

2. **Use a Different Network**: Try running promptfoo on:
   - A personal network
   - Mobile hotspot
   - Development environment outside corporate network

3. **Configure Proxy**: If you need to use a corporate proxy, you can configure it using environment variables. Promptfoo uses Node.js's [Unidici](https://undici.nodejs.org/#/docs/api/ProxyAgent.md) to handle proxy configuration. It automatically detects and uses standard proxy environment variables. The proxy URL format is: `[protocol://][user:password@]host[:port]`

   ```bash
   export HTTPS_PROXY=http://proxy.company.com:8080
   promptfoo eval
   ```

## Why Are Fewer Tests Generated Than Requested?

When plugins request a specific number of tests but only generate a subset or none at all, the most common causes are:

1. **Model refusals**: The configured redteam provider model is refusing to generate adversarial content. Some models have safety filters that block generation of harmful test cases.
2. **Rate limiting**: The API you're using has rate limits that throttle or reject requests when exceeded.
3. **Missing API keys**: Some plugins require external API keys (noted in the setup UI). If these are missing or invalid, generation can fail or return partial results.

To diagnose, run with `--verbose` to see detailed logs of any generation failures or refusals.

## Is Test Generation Capped?

No. `numTests` accepts any positive integer — there is no fixed upper bound in the config schema.

It is worth understanding what the number means before raising it. Each test case is a _seed_, and strategies expand each seed into many attack attempts: `jailbreak:hydra` branches across conversation paths, and `jailbreak:meta` iterates through attack approaches. A small number of seeds therefore still produces broad coverage, and raising `numTests` multiplies generation cost and scan time.

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

If you cannot get network access to our remote generation service, you can:

1. Use local generation with a local LLM
2. Set up your own generation service
3. Use manual prompt creation

See our [configuration guide](/docs/configuration/guide/) for more details on these options.

## Getting Help

If you continue experiencing issues, [contact us](/contact/) for enterprise support.
