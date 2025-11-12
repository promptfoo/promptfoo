# Promptfoo Code Scan GitHub Action

Automatically scan pull requests for LLM security vulnerabilities using AI-powered analysis.

## About Code Scanning

Promptfoo Code Scanning uses AI agents to find LLM-related vulnerabilities in your codebase and helps you fix them before you merge. By focusing specifically on LLM-related vulnerabilities, it finds issues that more general security scanners might miss.

The scanner examines code changes for common LLM security risks including prompt injection, PII exposure, and excessive agency. Rather than just analyzing the surface-level diff, it traces data flows deep into your codebase to understand how user inputs reach LLM prompts, how outputs are used, and what capabilities your LLM has access to.

After scanning, the action posts findings with severity levels and suggested fixes as PR review comments.

## Quick Start

**Recommended:** Install the [Promptfoo Scanner GitHub App](https://github.com/apps/promptfoo-scanner) for the easiest setup:

1. Go to [github.com/apps/promptfoo-scanner](https://github.com/apps/promptfoo-scanner) and install the app
2. Select which repositories to enable scanning for
3. Submit your email or sign in (no account required—just a valid email address)
4. Review and merge the setup PR that's automatically opened in your repository

Once merged, the scanner will automatically run on future pull requests. Authentication is handled automatically with GitHub OIDC—no API key needed.

**[Read the full documentation →](https://promptfoo.dev/docs/code-scanning/github-action)** for configuration options, manual installation, and more.

## Contributing

Please note that this a release-only repository. To contribute, refer to the [associated directory](https://github.com/promptfoo/promptfoo/tree/main/promptfoo/code-scan-action) in the main promptfoo repository.

## License

MIT
