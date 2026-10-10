---
sidebar_label: On-Prem Installation
sidebar_position: 5
title: Install and operate Promptfoo Enterprise On-Prem
description: Install Promptfoo Enterprise On-Prem with the supplied Docker Compose or Helm assets, configure model credentials, and verify login, scans, and service health.
---

# Install and operate Promptfoo Enterprise On-Prem

Use the Enterprise images and deployment files supplied by your Promptfoo contact. The [open-source self-hosted server](/docs/usage/self-hosting/) is a different product and does not provide Enterprise authentication or team management.

These instructions cover the **Enterprise release 125** deployment bundle: `install.sh`, `.env.example`, the Compose files, and `promptfoo-enterprise-helm`. Obtain the matching application and authentication image digests with that bundle; do not combine it with another release's chart or mutable `latest`/`stable` images. The chart's `version: 0.1.0` and `appVersion: 1.16.0` do not identify the Enterprise release. For another release, use its supplied instructions.

The supplied Compose stack runs Promptfoo, FusionAuth, and PostgreSQL 16, with separate `promptfoo` and `fusionauth` databases. An external PostgreSQL service is also supported through the packaged external-database configuration. Use the database requirements and configuration delivered with your release.

In this deployment, the scan runner is bundled with the Promptfoo service. Server scans start worker processes inside the Promptfoo container or pod; no separate runner image is required. Give that container or pod network access to your targets and inference providers, and complete the [server scan verification](#verify-a-server-scan).

## Before installing

- Obtain the release bundle, image digests, registry access instructions, deployment key, and deployment-key verification public key from Promptfoo. Treat the deployment key as a secret; it can contain prefilled setup credentials. The verification public key is a separate value.
- Install Docker Engine with the Compose plugin, Bash, and OpenSSL for the Compose installation.
- Prepare application and authentication hostnames, DNS, and TLS for access beyond localhost.
- Make model credentials and network access available for the inference providers and targets you intend to use.

## Install with Docker Compose

1. Authenticate Docker to the supplied registry. In the extracted bundle directory, copy `.env.example` to `.env`, restrict access with `chmod 600 .env`, and set `PROMPTFOO_IMAGE` and `PROMPTFOO_AUTH_IMAGE` to the supplied image digests. Save the supplied verification public key as `keys/onprem-license-public.pem`.
2. For custom hostnames, set the [application URLs](#application-urls) first. Preview the supplied installer from the bundle directory, then start the stack:

   ```bash
   DRY_RUN=true bash ./install.sh
   bash ./install.sh
   ```

   The dry run writes `.env` and generates missing passwords and session secrets without starting containers. Confirm that it prints **Deployment key verification: enabled**. The second command starts the bundled PostgreSQL stack with `docker compose`. For an external database, use the bundle's README and `docker-compose.external-db.yml` instead.

3. Open `/setup` at the printed application URL and enter the deployment key. Create the administrator with your own email and a strong password, then complete setup and optionally configure your identity provider. Fresh installations have no default administrator credentials. If you skip IdP setup, use the administrator account you created to sign in to Promptfoo and administer FusionAuth.
4. From the bundle directory, check the services, health endpoint, and installed release:

   ```bash
   docker compose ps
   curl -fsS http://localhost:3000/health
   curl -fsS http://localhost:3000/version
   ```

   Use your configured application URL when it differs from the local default. In release 125, `/health` returns HTTP 200 with `{"status":"OK"}` when the HTTP handler is available; it does not test FusionAuth, login, inference, or target connectivity. Confirm the release at `/version`, complete an actual login, and run a small server scan.

## Application URLs

For custom hostnames, explicitly set all three browser-facing URLs before running `install.sh`, and configure DNS and TLS for those addresses:

```bash
export DOMAIN=promptfoo.example.com
export APP_URL=https://promptfoo.example.com
export API_URL=https://promptfoo.example.com
export FUSIONAUTH_APP_URL=https://auth.promptfoo.example.com
```

Setting `DOMAIN` alone does not replace existing URL values in the supplied configuration. Explicit URL environment variables take precedence.

| Setting               | Purpose                                         | Local Compose default    |
| --------------------- | ----------------------------------------------- | ------------------------ |
| `APP_URL` / `API_URL` | Browser-facing application and API              | `http://localhost:3000`  |
| `FUSIONAUTH_APP_URL`  | Browser-facing sign-in service                  | `http://localhost:9011`  |
| `FUSIONAUTH_API_URL`  | Promptfoo's server-to-server authentication API | `http://fusionauth:9011` |

Keep internal service addresses reachable within the container network. A browser-facing localhost URL is not a substitute for an internal service address. The installer saves configuration in `.env`; retain it securely with your deployment configuration.

## Configure inference

Open the profile menu's **Red Team Providers** page. Configure the **Default Red Team Provider** and, when needed, separate **Test Generation Provider** and **Grading Provider** settings. For generation and grading in a team allowed to override providers, its role-specific provider takes precedence, followed by its Red Team Provider, the global role-specific provider, and the global Red Team Provider. If no provider is configured, defaults require deployment-level OpenAI credentials in the Promptfoo server environment; the bundled Compose files do not pass `OPENAI_API_KEY` through automatically.

Target credentials connect to the application being tested; they do not configure the generation or grading models. See [OpenAI connection settings](/docs/providers/openai/#connection-settings).

For restricted networks, account for the registry, database, identity provider, model endpoints, and target endpoints used by your configuration. Mirroring container images alone does not make model inference offline. The `*.promptfoo.app` allowlist in the hosted red-team guide is not an on-prem requirement. For air-gapped operation, use local inference and the release's offline configuration; review enabled features with the supplied deployment guidance and [data-handling reference](/docs/red-team/troubleshooting/data-handling/).

### Verify a server scan

1. In the on-prem UI, create or select a target reachable from the Promptfoo container and a small scan template.
2. Open **New Scan**, select that target and template, then choose **Run on Server → Run Red Team Scan**. If only **Run via CLI** is available, confirm server-side jobs are enabled and that the target supports server execution.
3. Open the resulting scan in **Scan History**. Confirm it completes, inspect its logs and results, and check for generation, grading, and target-connection errors. A scan run on the operator's laptop and uploaded afterward does not verify the server worker.

Example configuration in release 125 using synthetic customer-support data:

[![New Red Team Scan with a customer-support target and baseline scan template selected](/img/enterprise-docs/on-prem-scan-target.png)](/img/enterprise-docs/on-prem-scan-target.png)

[![Run on Server tab with the Run Red Team Scan button enabled](/img/enterprise-docs/on-prem-run-server.png)](/img/enterprise-docs/on-prem-run-server.png)

## Kubernetes and secrets

Use the `promptfoo-enterprise-helm` chart from the release 125 bundle. It deploys the application and authentication services; provide PostgreSQL, a namespace named `promptfoo`, registry pull Secrets, and routing/TLS for both browser-facing hostnames.

This chart does not consume `licenseKeySecret`, `openaiApiKeySecret`, `envFileSecret`, or `configFileSecret` values. Its `envFile` value sets a path only; it does not mount a Secret. The following reference overlay uses Kubernetes Secrets after rendering the chart. It is an example to adapt to your cluster, not an additional file supplied in the bundle.

Create these Secrets in the `promptfoo` namespace through your secret-management workflow:

| Secret                 | Required keys                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `promptfoo-server-env` | `API_URL`, `DB_CONNECTION_STRING`, `JWT_SECRET`, `SESSION_SECRET`, `TEAM_SECRET_ENCRYPTION_KEY`, `ONPREM_LICENSE_PUBLIC_KEY` |
| `promptfoo-auth-env`   | `DATABASE_USERNAME`, `DATABASE_PASSWORD`                                                                                     |

Set `API_URL` to the browser-facing API URL, use the supplied verification public key for `ONPREM_LICENSE_PUBLIC_KEY`, and persist the random secrets. Add any supplied `FUSIONAUTH_LICENSE_KEY`/`FUSIONAUTH_LICENSE` or deployment-level `OPENAI_API_KEY` to `promptfoo-server-env` as needed.

In `deployment-values.yaml`, set both image digests and `imagePullSecret` names, `promptfooServer.appUrl`, `promptfooServer.fusionAuthAppUrl`, and `promptfooAuth.dbUrl` (the FusionAuth JDBC URL). Set `promptfooServer.dbConnectionString`, `promptfooAuth.dbUsername`, and `promptfooAuth.dbPassword` to the non-secret placeholder `replaced-by-secret` to satisfy chart validation; the overlay below removes these literal environment entries. Leave `jwtSecret`, `sessionSecret`, `licenseKey`, `fusionAuthLicenseKey`, `fusionAuthLicense`, and `envFile` unset in values so they cannot override Secret-provided settings.

Create `overlay/kustomization.yaml`:

```yaml title="overlay/kustomization.yaml"
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: promptfoo
resources:
  - rendered.yaml
patches:
  - patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: promptfoo-server
      spec:
        template:
          spec:
            containers:
              - name: promptfoo-server
                env:
                  - name: DB_CONNECTION_STRING
                    $patch: delete
                  - name: FUSIONAUTH_LICENSE_KEY
                    $patch: delete
                envFrom:
                  - secretRef:
                      name: promptfoo-server-env
  - patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: promptfoo-auth
      spec:
        template:
          spec:
            containers:
              - name: promptfoo-auth
                env:
                  - name: DATABASE_USERNAME
                    $patch: delete
                  - name: DATABASE_PASSWORD
                    $patch: delete
                envFrom:
                  - secretRef:
                      name: promptfoo-auth-env
```

Render and inspect the final resources, then apply them:

```bash
helm lint ./promptfoo-enterprise-helm --values ./deployment-values.yaml
helm template promptfoo ./promptfoo-enterprise-helm --namespace promptfoo \
  --values ./deployment-values.yaml > ./overlay/rendered.yaml
kubectl kustomize ./overlay > ./deployment.yaml
# Inspect deployment.yaml: verify both Secret references and the absence of placeholders.
kubectl apply --namespace promptfoo -f ./deployment.yaml
kubectl rollout status --namespace promptfoo deployment/promptfoo-auth
kubectl rollout status --namespace promptfoo deployment/promptfoo-server
```

This procedure manages rendered resources with `kubectl`, not a Helm release. Retain the values and overlay for upgrades. Keep credentials out of values, generated manifests, and `--set` arguments. Restart the affected Deployment after changing a Secret because environment variables are read at startup. Complete `/setup`, login, and the server scan checks described above.

## Team secret encryption

Before using team secrets, configure `TEAM_SECRET_ENCRYPTION_KEY` in the Promptfoo server environment. Generate a strong random value once, for example with `openssl rand -hex 32`, and store it in your secret manager. Every server instance that reads the same database must use the same value.

For Compose, supply the value through your deployment's environment or protected `.env` file and explicitly pass it to the `promptfoo` service. The supplied Compose files do not currently pass this variable through. Add an override such as:

```yaml title="docker-compose.override.yml"
services:
  promptfoo:
    environment:
      TEAM_SECRET_ENCRYPTION_KEY: ${TEAM_SECRET_ENCRYPTION_KEY:?Set TEAM_SECRET_ENCRYPTION_KEY}
```

Recreate the Promptfoo container with both files:

```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml --env-file .env up -d promptfoo
```

For an external database, substitute `docker-compose.external-db.yml` for the first file. Keep including the override when you recreate the service; `install.sh` explicitly selects the base file and does not include it. Adding the value to `.env` without the service environment entry is insufficient.

For the Kubernetes reference overlay above, include `TEAM_SECRET_ENCRYPTION_KEY` in `promptfoo-server-env`, then restart the Promptfoo Deployment. Preserve the other required entries in that Secret.

Back up this key securely with the configuration required to restore the database. Losing or replacing it makes existing team secrets unreadable; changing the environment value does not re-encrypt stored secrets. Rotate individual provider credentials through the team secrets API instead of replacing this deployment key.

## API reference

Use the [interactive API reference](/docs/api-reference/) or the [public OpenAPI specification](https://api.promptfoo.app/static/openapi.json) for endpoint schemas. Your on-prem API also serves its bundled specification at `/static/openapi.json`, for example `https://promptfoo.example.com/static/openapi.json`. Prefer that copy when your installed release differs from the public reference.

Global provider configuration is documented under **Server Settings**; see **Get an on-prem server setting** and **Update an on-prem server setting** for the supported keys and value schemas.

## Upgrades and recovery

- Record the application and authentication image digests and retain the deployment files and configuration for that release. Confirm the supported image pair and migration instructions before upgrading.
- Back up both databases and preserve the configuration and secrets needed to restore them. The bundled Compose database uses the `postgres_data` named volume; application logs use `promptfoo_logs`. Include any separately configured storage in your recovery plan.
- Test upgrades and an isolated restore with your database administrator before changing production. Restoring only the Promptfoo database does not restore FusionAuth users and identity configuration. An image rollback alone does not reverse database migrations.
- For existing installations, follow the release's **Upgrading Existing Installations** section in the bundled README before replacing either image. Release 125 retires legacy default FusionAuth credentials; verify an administrator login with a password you control and follow the documented bootstrap API-key cleanup before upgrading.
- After a change, verify `/version`, `/health`, browser sign-in, and a small server scan.

## Troubleshooting

| Symptom                            | Check                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| Image pull denied                  | Customer registry credentials, their expiry, and access to both supplied images                 |
| Sign-in or origin errors           | Browser-facing URLs, DNS/TLS, and the internal application/authentication network paths         |
| `/health` succeeds but login fails | FusionAuth health and logs, setup completion, browser URLs, and identity-provider configuration |
| Setup rejects the deployment key   | The matching verification public key and the deployment key supplied for this installation      |
| Scan fails during generation       | Effective generation provider, model credentials, and outbound connectivity                     |

Use `docker compose logs --tail=100 promptfoo fusionauth` for initial Compose diagnostics. When contacting support, include the image versions, failed step, and relevant redacted logs; omit credentials and sensitive target responses.
