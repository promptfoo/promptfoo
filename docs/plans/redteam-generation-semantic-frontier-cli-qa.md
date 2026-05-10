# Semantic Frontier CLI QA

| Run                     | File logging mode                                                      | Live CLI report visible | Shutdown timeout |
| ----------------------- | ---------------------------------------------------------------------- | ----------------------- | ---------------- |
| default sandbox log dir | default `~/.promptfoo/logs`                                            | no                      | yes              |
| file logs disabled      | `PROMPTFOO_DISABLE_DEBUG_LOG=true`, `PROMPTFOO_DISABLE_ERROR_LOG=true` | yes                     | no               |
| writable temp log dir   | `PROMPTFOO_LOG_DIR=/private/tmp/promptfoo-iter182-logs`                | yes                     | no               |

## Reading

The missing live CLI report from iteration `181` was not a renderer failure. The same local-only `pii:social` portfolio run rendered the new `Semantic Frontier Diagnostics` table once the per-run file transports were either disabled or redirected to a writable temp directory. In this sandbox, the default `~/.promptfoo/logs` path is a QA confound because shutdown waits on file-transport cleanup and prints `closeLogger() timed out during shutdown`.

## Reliable Verification Command

```bash
PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION=true \
PROMPTFOO_DISABLE_UPDATE=true \
PROMPTFOO_DISABLE_TELEMETRY=true \
PROMPTFOO_LOG_DIR=/private/tmp/promptfoo-iter182-logs \
npm run local -- redteam generate \
  -c /private/tmp/promptfoo-pii-social-portfolio.yaml \
  -o /private/tmp/promptfoo-pii-social-portfolio.generated.yaml \
  --force --strict --no-cache --no-progress-bar \
  --env-file /Users/mdangelo/code/promptfoo/.env
```

With that harness, the live CLI report showed:

| Plugin       | Frontiers | Complete | Status   | Unreachable features |
| ------------ | --------: | -------: | -------- | -------------------- |
| `pii:social` |         1 |      1/1 | Complete | none                 |
