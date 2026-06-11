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
