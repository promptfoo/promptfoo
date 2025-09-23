---
sidebar_label: Changelog
---

# Changelog

We publish a list of new features every week. For more recent updates, check out our GitHub page.

## September 2025

### September 15 {#september-2025-week-3}

- New [Layer strategy](/docs/red-team/strategies/#layered-strategies): chain multiple strategies in red team scans!
- Threshold: set a minimum score threshold for red team tests to pass.
- Context can be provided to tests as an array of strings instead of a single string ([example](/docs/configuration/expected-outputs/model-graded/context-relevance/#array-context)).
- Upload your Custom Policies in a CSV through the red team setup web UI.
- The results table can now display both the encoded attack and its original decoded form when an attack uses an encoded strategy.
- Delete evals in bulk on the Evals Results page.
- [AWS Bedrock inference profiles](/docs/providers/aws-bedrock/#application-inference-profiles): reference inference profiles instead of individual model IDs.
- `azure:responses` provider alias for Azure Responses API added.

### September 8 {#september-2025-week-2}

- New [VLGuard multi-modal plugin](/docs/red-team/plugins/vlguard/): test multi-modal modals for images from the [kirito011024](https://huggingface.co/kirito011024)/vlguard_unsafes dataset.
- Pause and resume evals with `Ctrl+C` and `promptfoo eval --resume`!
- Use `promptfoo export logs` to... Export logs. Creates a tar.gz to share for debugging.
- Risk score added to red team Vulnerability Reports to better understand the potential harm.
- Custom policies: can now have a custom severity level assigned and test cases can be generated (in plugins view) directly from the red team setup web UI.
- [Custom websocket URLs](/docs/providers/websocket/) for OpenAI Realtime added.
- [Ollama 'thinking'](https://ollama.com/blog/thinking) supported through configuration options.

### September 1 {#september-2025-week-1}

- New financial plugins: [Financial Confidential disclosure](/docs/red-team/plugins/financial/#financial-confidential-disclosure), [Financial Counterfactual](/docs/red-team/plugins/financial/#financial-defamation), [Financial Defamation](/docs/red-team/plugins/financial/#financial-defamation), [Financial Impartiality](/docs/red-team/plugins/financial/#financial-impartiality), and [Misconduct](/docs/red-team/plugins/financial/#financial-misconduct). They test for incorrect, non-existent, or potentially harm.
- New [Special token injection plugin](/docs/red-team/plugins/special-token-injection/) added; tests for vulnerabilities that include ChatML format tags (`<|im_start|>`, `<|im_end|>`) and other similar delimiters.
- Visible monthly limits added to red team scans.
- Filter red team evals by severity.
- A CI-friendly progress reporter will activate for long-running evals, switching to text-based reporting for miletones.
- If you're connected to Cloud, results sharing will be enabled by default.
- Select TLS certificates when setting up a red team through the web interface.
- AWS Bedrock: AgentCore provider added, OpenAI GPT OSS models supported, and API key authentication added.
- Meta's Llama API support added for all 7 available models; includes multimodal support for Llama 4 variants.
