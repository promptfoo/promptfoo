# Privacy Policy

This Privacy Policy describes how your personal information is collected, used, and shared when you use Promptfoo Command Line Interface (CLI), library, and website.

## We do not collect Personal Information

Promptfoo does not collect any personally identifiable information (PII) when you use our CLI, library, or website. The source code is executed on your machine and any call to Language Model (LLM) APIs (OpenAI, Anthropic, etc.) are sent directly to the LLM provider. We do not have access to these requests or responses. Additionally, we do not sell or trade data to outside parties.

API keys are set as local environment variables and never transmitted to anywhere besides the LLM API directly (OpenAI, Anthropic, etc).

Promptfoo runs locally and all data remains on your local machine, ensuring that your LLM inputs and outputs are not stored or transmitted elsewhere.

## Sharing and Storage of Information

If you explicitly run the share command, your inputs/outputs are stored in Cloudflare KV for 2 weeks. This only happens when you run `promptfoo share` or click the "Share" button in the web UI. This shared information creates a URL which can be used to view the results. The URL is valid for 2 weeks and is publicly accessible, meaning anyone who knows the URL can view your results. After 2 weeks, all data associated with the URL is permanently deleted. To completely disable sharing, set: `PROMPTFOO_DISABLE_SHARING=1`.

## Telemetry

Promptfoo collects basic anonymous telemetry by default. This telemetry helps us decide how to spend time on development. An event is recorded when a command is run (e.g. `init`, `eval`, `view`) or an assertion is used (along with the type of assertion, e.g. `is-json`, `similar`, `llm-rubric`). No additional information is collected.

To disable telemetry, set the following environment variable: `PROMPTFOO_DISABLE_TELEMETRY=1`.

Promptfoo hosts free unaligned inference endpoints for harmful test case generation when running `promptfoo redteam generate`. You can disable remote generation with: `PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION=1`

The CLI checks NPM's package registry for updates. If there is a newer version available, it will notify the user. To disable, set: `PROMPTFOO_DISABLE_UPDATE=1`.

## GDPR and Data Processing Agreement

Promptfoo is designed to be compliant with the General Data Protection Regulation (GDPR). As we do not collect or process any personally identifiable information (PII), and all operations are conducted locally on your machine with data not transmitted or stored elsewhere, the typical need for a Data Processing Agreement (DPA) under GDPR is not applicable in this instance.

However, we are committed to ensuring the privacy and protection of all users and their data. If you have any questions or concerns regarding GDPR compliance, please get in touch via GitHub or Discord.
