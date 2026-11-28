# Local Node.js and Promptfoo prerequisites

Use this shared check before running a bundled Node.js helper or Promptfoo CLI
command, and at the start of Enterprise setup. Reuse a successful check within
the same task, working directory, and Node environment. Repeat it after switching
runtimes or machines. Editing a config or explaining results alone does not
require installing tools.

## 1. Check Node.js and npm

Identify the operating system, shell, and any project runtime requirements.
Run these read-only checks separately so a missing command is easy to identify:

```bash
node --version
npm --version
```

Use the active runtime, not just an installed version listed by a version manager.
Promptfoo currently requires Node.js **22.22.0 or newer**; **Node.js 24 LTS** is
recommended. Compare the full version, including minor and patch, and check that
the release line is still maintained using the [Node.js release schedule](https://nodejs.org/en/about/previous-releases).
An end-of-life release such as Node.js 23 or 25 is not a supported choice merely
because its version is greater than the minimum. Refresh requirements from the
[Promptfoo installation guide](https://www.promptfoo.dev/docs/installation/) or
the selected package's `engines.node` rather than assuming this minimum never changes.

In a Promptfoo source checkout, follow its contributor instructions and `.nvmrc`.
For an existing nvm installation, the repo convention is
`source ~/.nvm/nvm.sh && nvm use`. Do not replace project runtime pins or install
a global Promptfoo copy to test source changes.

If Node is missing, incompatible, or end-of-life, give the installation steps
below before running npm installs, npx, helpers, or evals. If a compatible version
is already installed through a version manager, help activate it first. A missing
command can mean the shell has not loaded its version manager or updated PATH.
If Node works but npm does not, repair npm/PATH through the same approved Node
installation method before continuing.

## 2. Help install or update Node.js when needed

Include this callout before the steps:

> **Enterprise IT:** Check with your IT team for your enterprise's specific
> instructions for installing Node.js. Your organization may provide an approved
> installer, software center, version manager, or package registry.

Give a numbered walkthrough for the user's operating system. Reuse known IT
instructions; the callout alone does not require an extra approval round. If the
user reports that IT must install software, provide the requested version and
verification commands for IT and report local setup as pending. Do not bypass
that restriction.

For **Windows or macOS** without an existing approved version manager:

1. Use the enterprise software center or approved installer when available.
   Otherwise, if self-service installation is allowed, open the
   [official Node.js download page](https://nodejs.org/en/download).
2. Select a maintained LTS release compatible with Promptfoo (currently Node.js
   24 LTS), the operating system, and the machine's architecture.
3. Download and run the Windows `.msi` or macOS `.pkg` installer. Include npm
   and the installer's PATH integration. Follow any administrator prompts through
   the organization's normal process.
4. Open a new terminal or restart the coding agent's terminal session.
5. Run `node --version` and `npm --version` again. Confirm the active Node version
   meets the requirement before checking Promptfoo.

For an **existing approved version manager**, use the matching commands instead
of adding another installation method. For example, with nvm on macOS/Linux:

```bash
nvm install 24
nvm use 24
node --version
npm --version
```

For **Linux without a version manager**, identify the distribution and use IT's
approved package method. If self-service setup is allowed, consult the official
Node.js download instructions for that distribution and present the exact current
install, shell activation/PATH, and verification commands as numbered steps.
Do not stop at a download link or assume the distro's default `nodejs` package
meets Promptfoo's minimum. Do not present Unix nvm commands as Windows instructions.

Installation is complete only after the version checks succeed in the environment
that will run Promptfoo. If terminal access is unavailable, give the commands to
the user and ask for their output; do not claim to have checked the machine.

## 3. Check for an existing Promptfoo CLI

Once Node and npm work, prefer the source checkout or current project over a
global installation:

1. In the Promptfoo source repository, use `npm run local -- --version` after
   aligning Node and dependencies with its contributor instructions. Use this
   checkout even if another Promptfoo version is available globally.
2. Otherwise inspect the project's package manifest and lockfile, and use
   `npm ls promptfoo --depth=0` (or its existing package-manager equivalent) to
   check the installed dependency. When installed locally, verify it with
   `npm exec --no -- promptfoo --version` from that project.
3. If no project installation exists, run `promptfoo --version` to check the CLI
   on PATH. A working global install counts even when npm lists no local package.

Record the verified version and invocation. Preserve an existing working project
version; do not upgrade it just because `latest` is newer. If Promptfoo is declared
but dependencies are not installed, use the project's lockfile and package manager
to restore them rather than replacing the declared version. Distinguish a broken
installation or PATH problem from an absent package.
Inspect dependency errors from `npm ls`; a nonzero exit alone does not establish
that Promptfoo is absent.

Do not use bare `npx promptfoo` or `npx promptfoo@latest` as an installation check:
they can download and execute a package. The non-installing project invocation
above follows confirmation that the dependency exists.

## 4. Install the latest Promptfoo when absent

If no project, source, or PATH installation is usable and none is waiting on a
dependency/PATH repair, help install the latest published release:

1. Read the version and runtime requirement from the configured npm registry:

   ```bash
   npm view promptfoo@latest version engines.node --json
   ```

   Confirm the active Node version satisfies that requirement. If the registry
   cannot be reached, report the network/registry issue; do not claim a version
   is current or silently switch away from an enterprise registry.

2. For a normal CLI installation, run or guide the user through:

   ```bash
   npm install --global promptfoo@latest
   ```

   Honor existing authorization and installation policy. Do not add `sudo`,
   disable TLS verification, or change registry settings to work around errors.
   For permission errors, use the approved user-managed Node installation or
   ask IT for the supported installation method.

3. Verify the installed command:

   ```bash
   promptfoo --version
   ```

   Compare it with the registry version. If it differs, inspect PATH and the
   active Node environment for an older installation before claiming success.

If the user wants a project dependency instead, use that project's package manager
and install `promptfoo@latest` there (for npm, `npm install --save-dev promptfoo@latest`),
then verify with `npm exec --no -- promptfoo --version`. Do not edit a project's
manifest or lockfile merely to provide a machine-level CLI. An explicitly chosen
`npx promptfoo@latest` run is temporary execution, not a persistent installation.

## 5. Continue with the verified command

In the calling skill's examples, replace the `npx promptfoo` prefix with the
verified invocation: `npm exec --no -- promptfoo` for a project dependency,
`promptfoo` for a PATH installation, or `npm run local --` for source development.
Keep the equivalent project invocation when using another package manager.
Resume the original task and report Node/npm versions, Promptfoo version and
command, and any remaining setup issue.

Local CLI readiness and Enterprise MCP authentication are separate outcomes.
These tools prepare local eval and scan workflows; the remote MCP connection
does not itself require the Promptfoo CLI. If the user explicitly requests MCP-only setup or
declines local installation, report local readiness separately and continue the
Enterprise connection workflow within that scope.
