# OpenAI Codex Plugin

The `openai:codex-plugin` provider evaluates one trusted Codex plugin in an
isolated Codex runtime for each Promptfoo case. It installs the requested
package or path into a provider-owned `CODEX_HOME`, enables only that plugin,
trusts only the configured workspace, and removes the runtime after the result
is recorded.

```yaml
providers:
  - id: openai:codex-plugin
    config:
      plugin:
        path: ./plugins/codex-security
      skill: security-scan
      workspace: ./repo-under-test
      output_schema:
        type: object
```

Use `plugin.package` with `plugin.version` for reproducible package evals, or
`plugin.path` for a trusted local checkout. Set exactly one of `skill` or
`invocation`; `skill` renders `Use the <plugin>:<skill> skill.` before the test
prompt. Codex SDK options such as `model`, `sandbox_mode`, `approval_policy`,
`output_schema`, and `cli_config` are forwarded after Promptfoo injects the
isolated runtime paths.

Results include `metadata.codexPlugin` with plugin identity, invocation,
workspace, terminal status, duration, trace identity, and artifact references.
Plugins can write provider-owned artifacts under
`PROMPTFOO_CODEX_PLUGIN_ARTIFACT_DIR`; set `artifacts_dir` to copy those files to
a trusted caller-owned directory before runtime cleanup. Promptfoo does not
copy ambient Codex config, plugins, skills, memories, or sessions. It copies
only `auth.json` by default when present; set `copy_auth: false` to require API
key auth or an explicitly empty runtime.

Plugin packages and paths are executable inputs. Evaluate only trusted sources.
Promptfoo rejects plugin trees with symlinks, packs npm packages with scripts
disabled, validates archive paths before extraction, and never emits artifact
contents in provider metadata.
