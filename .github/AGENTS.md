# AGENTS.md

Guidance for AI agents working on GitHub Actions workflows.

## Workflow Security

- Keep actions SHA-pinned. Never use floating tags (`@v4`) or branches (`@main`).
- Do not expose write-capable tokens to third-party code, package installs, build tools, or formatters. If a step runs untrusted code (e.g., `npx prettier`, `npm install`), that step's `env:` must not contain `GH_TOKEN` / `GITHUB_TOKEN` / `NODE_AUTH_TOKEN`. Split format/commit from push so only the push step holds the credential.
- Use `persist-credentials: false` on `actions/checkout` whenever the workflow subsequently runs code or installs packages on a PR branch — otherwise `.git/config` holds the token for postinstall scripts to harvest.
- Pass credentials only to the exact git/API command that needs them. Prefer one-shot `git -c "http.https://github.com/.extraheader=AUTHORIZATION: bearer ${GH_TOKEN}" clone/push …` over writing tokens into the remote URL or into `.git/config` via `git config --local`.
- Treat pull request fields as untrusted input. Branch names, titles, labels, and file paths can contain shell metacharacters. Assign them to env vars (e.g., `HEAD_REF: ${{ github.event.pull_request.head.ref }}`) before referencing them in `run:` scripts — never interpolate `${{ … }}` directly into a shell command. actionlint enforces this.
- Avoid `pull_request_target` unless the workflow does not check out or execute PR-controlled code. Prefer `pull_request` with narrow permissions and `persist-credentials: false`.
- Add `timeout-minutes` to every job. Unbounded jobs can burn a full 6-hour runner on a hang.

## Release Workflows

- Release/publish workflows must use workflow-level `concurrency` with `cancel-in-progress: false`. Two pushes to `main` should serialize, not race a publish.
- Do not run CHANGELOG formatting inside `release-please.yml`. Release-please force-pushes its PR branch when new commits land on `main`, which wipes any formatter commit created inline in the release-please job. Keep release PR formatting in a separate `pull_request`-triggered workflow gated on the `release-please--` branch prefix so it self-heals after every force-push.
- For npm trusted publishing, set `permissions: id-token: write` on the publish job and do not configure long-lived npm tokens. When `actions/setup-node` is configured with `registry-url`, it writes a `${NODE_AUTH_TOKEN}` placeholder into `.npmrc` that prevents OIDC fallthrough — set `NODE_AUTH_TOKEN: ''` on the publish step to neutralize it (see [actions/setup-node#1440](https://github.com/actions/setup-node/issues/1440)).
- Pin exact versions for any tooling installed at workflow runtime (e.g., `prettier@3.8.1`, not `prettier@^3.8.1`, and `npm install -g npm@11.11.0`, not `npm@latest`). Semver ranges mean a future compromised patch release can alter published artifacts.
- Least-privilege every job. `publish-npm` does not need `packages: write`; only Docker jobs pushing to ghcr.io do.
