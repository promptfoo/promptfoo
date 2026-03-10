---
description: Privacy policy for promptfoo services - we don't collect PII, API keys stay local, and telemetry is anonymous and opt-out
---

# Privacy Policy

This Privacy Policy describes how your personal information is collected, used, and shared when you use Promptfoo Command Line Interface (CLI), library, and website.

## Personal Information — CLI and Library

Promptfoo does not collect any personally identifiable information (PII) when you use our CLI or library. The source code is executed on your machine and any call to Language Model (LLM) APIs (OpenAI, Anthropic, etc.) are sent directly to the LLM provider. We do not have access to these requests or responses. Additionally, we do not sell or trade data to outside parties.

API keys are set as local environment variables and never transmitted to anywhere besides the LLM API directly (OpenAI, Anthropic, etc).

Promptfoo runs locally and all data remains on your local machine, ensuring that your LLM inputs and outputs are not stored or transmitted elsewhere.

## Website Analytics and Marketing

Our website (promptfoo.dev) uses the following third-party services, which are loaded only with your consent:

**Analytics** (usage measurement): Google Analytics and PostHog are used to understand how visitors use our site. These services may collect anonymized usage data such as pages visited, time on site, and general location.

**Marketing** (advertising and visitor identification): Google Ads, Vector.co, and Reo.dev are used for advertising measurement and visitor identification. These services may set cookies and collect browsing data for ad targeting purposes.

You can manage your cookie preferences at any time by clicking "Cookie Settings" or "Do Not Sell or Share My Personal Information" in the site footer. Visitors in the EU/EEA, UK, Switzerland, Brazil, and Canada must explicitly opt in before any analytics or marketing scripts are loaded. US visitors may opt out at any time, and the Global Privacy Control (GPC) signal is honored automatically.

## Sharing and Storage of Information

If you explicitly run the share command, your inputs/outputs are stored in Cloudflare KV for 2 weeks. This only happens when you run `promptfoo share` or click the "Share" button in the web UI. This shared information creates a URL which can be used to view the results. The URL is valid for 2 weeks and is publicly accessible, meaning anyone who knows the URL can view your results. After 2 weeks, all data associated with the URL is permanently deleted. To completely disable sharing, set: `PROMPTFOO_DISABLE_SHARING=1`.

## Telemetry

Promptfoo collects basic anonymous telemetry by default. This telemetry helps us decide how to spend time on development. An event is recorded when a command is run (e.g. `init`, `eval`, `view`) or an assertion is used (along with the type of assertion, e.g. `is-json`, `similar`, `llm-rubric`). No additional information is collected.

To disable telemetry, set the following environment variable: `PROMPTFOO_DISABLE_TELEMETRY=1`.

## Remote Generation

SimulatedUser and red team features use Promptfoo's hosted inference endpoints by default. Your target model always runs locally.

To disable remote generation, set `PROMPTFOO_DISABLE_REMOTE_GENERATION=true`.

The CLI checks NPM's package registry for updates. If there is a newer version available, it will notify the user. To disable, set: `PROMPTFOO_DISABLE_UPDATE=1`.

## GDPR and Data Processing Agreement

The Promptfoo CLI and library do not collect or process personally identifiable information (PII). All operations are conducted locally on your machine.

Our website uses consent-based analytics and marketing tools as described above. Visitors in GDPR-regulated regions must explicitly opt in before any tracking scripts are loaded. We support granular consent (analytics and marketing can be controlled independently), consent withdrawal, and the Global Privacy Control (GPC) signal.

If you have any questions or concerns regarding GDPR compliance, please get in touch via GitHub or Discord.
