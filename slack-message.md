I could use some help on PR reviews:

My PRs (ready for review):

- #5108 - fix: prevent Unicode corruption in Python providers - Fixes Unicode character corruption during JSON serialization between Node.js and Python, particularly affecting red team evaluations with special characters like ®, ™, ©.
https://github.com/promptfoo/promptfoo/pull/5108

- #5104 - feat: add Google Imagen image generation support - Adds support for all 6 Google Imagen models with Vertex AI authentication, including configuration options for aspect ratio, seed, and watermark settings.
https://github.com/promptfoo/promptfoo/pull/5104

- #5095 - docs(site): add tracing to homepage - Adds tracing as a distinct product offering on the promptfoo homepage, positioned between MCP and Evaluations.
https://github.com/promptfoo/promptfoo/pull/5095

- #5085 - chore: update replicate provider - Updates the Replicate provider implementation.
https://github.com/promptfoo/promptfoo/pull/5085

- #5082 - feat: add better error messages and validation for Python assertions - Improves developer experience with external Python assertions by adding file validation and better error messages.
https://github.com/promptfoo/promptfoo/pull/5082

- #4909 - feat(webui): add cloud status indicator to navbar - Adds a visual indicator to show users their Promptfoo Cloud connection status in the navigation bar.
https://github.com/promptfoo/promptfoo/pull/4909

- #4886 - feat(export): add metadata to exported evaluation files - Enhances exported evaluation files with timestamps and author information for better debugging and audit trails.
https://github.com/promptfoo/promptfoo/pull/4886

- #4872 - feat(cli): add self-upgrade command - Implements `promptfoo upgrade` command that automatically detects and handles various installation methods (npm, yarn, pnpm, homebrew, npx, binary).
https://github.com/promptfoo/promptfoo/pull/4872

- #4759 - feat(webui): add additional provider configuration support to eval creator - Adds comprehensive provider configuration in the web UI with both form editor for common fields and YAML editor for complete control.
https://github.com/promptfoo/promptfoo/pull/4759

- #4675 - feat(cli): add abort controller for graceful evaluation cancellation - Implements graceful evaluation cancellation that preserves partial results and shows final reports when users need to stop evaluations.
https://github.com/promptfoo/promptfoo/pull/4675

- #4579 - feat(providers): add Variable Optimizer provider for automated prompt optimization - Introduces a Variable Optimizer provider for automated prompt optimization workflows.
https://github.com/promptfoo/promptfoo/pull/4579

- #4074 - chore(deps): update to react 19 - Updates the codebase to React 19.
https://github.com/promptfoo/promptfoo/pull/4074

Other PRs ready for review (by @faizanminhas):

- #5101 - feat: enhance redteam setup sidebar with completion indicators - Adds visual checkmark indicators for completed setup steps, modernizes sidebar design, and adds progress bar showing overall setup completion percentage.
https://github.com/promptfoo/promptfoo/pull/5101

- #5032 - feat: Apply plugin modifiers for crescendo - Adds plugin modifiers to test case metadata and incorporates them into the crescendo prompt for enhanced test case generation.
https://github.com/promptfoo/promptfoo/pull/5032