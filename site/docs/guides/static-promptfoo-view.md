---
title: Publish a Static Promptfoo View
description: Use Promptfoo's self-contained HTML output to publish eval results on static hosting such as GitHub Pages.
---

# Publish a Static Promptfoo View

If you want to review Promptfoo results in a browser without running `promptfoo view` as a long-lived server, you can already do that today with the built-in HTML output.

## Why this works

Promptfoo can write a self-contained HTML report when `outputPath` ends in `.html`.

That file includes:

- the rendered results table
- summary metrics
- sanitized config metadata
- no dependency on a running Promptfoo server

This makes it suitable for static hosting targets such as:

- GitHub Pages
- Netlify
- Vercel static deploys
- build artifacts attached to CI

## Review data before publishing publicly

Static HTML exports are convenient, but they can still expose sensitive evaluation material if you publish them to a public host.

Before uploading a report to GitHub Pages, Netlify, or another public static site, review the generated HTML and confirm that it does not include:

- proprietary prompts or test cases
- private model outputs
- confidential dataset rows
- environment metadata you would not want to publish

Promptfoo applies best-effort redaction, but HTML exports can still surface rendered result content and non-sensitive config metadata. If the eval contains sensitive material, prefer a private artifact store or an access-controlled static host instead of a public URL.

## Minimal example

```yaml
prompts:
  - 'Tell me a joke about {{topic}}'

providers:
  - openai:gpt-5-mini

tests:
  - vars:
      topic: databases

outputPath: output/latest-results.html
```

Then run:

```bash
promptfoo eval
```

Promptfoo will write `output/latest-results.html`, which you can publish as a static artifact.

## GitHub Pages workflow

A simple pattern is:

1. Run Promptfoo in CI
2. Write HTML output to a known path
3. Upload or publish that file to GitHub Pages

Example command:

```bash
promptfoo eval -c promptfooconfig.yaml -o output/latest-results.html --no-cache
```

## What you get vs `promptfoo view`

Static HTML is best when you want:

- a shareable browser-friendly artifact
- no running server
- easy CI publishing

`promptfoo view` is still better when you want:

- local interactive workflows
- browsing multiple historical evals from Promptfoo storage
- richer local development loops

## Recommended use cases

Static view is a good fit for:

- nightly benchmark reports
- pull request artifacts
- GitHub Pages publishing
- compliance evidence snapshots
- sharing results across teams that do not need live server access

## Example CI artifact strategy

```bash
promptfoo eval -c promptfooconfig.yaml -o output/latest-results.html --no-cache
```

Then publish `output/latest-results.html` as:

- a workflow artifact
- a Pages site file
- a file served by your static host

## Related docs

- [Command Line Usage](/docs/usage/command-line)
- [Outputs](/docs/configuration/outputs)
- [Web UI](/docs/usage/web-ui)
- [Self-hosting](/docs/usage/self-hosting)
