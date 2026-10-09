---
sidebar_label: On-Prem Installation
sidebar_position: 5
title: Install and operate Promptfoo Enterprise On-Prem
description: Install Promptfoo Enterprise On-Prem with the supplied Docker Compose or Helm assets, configure model credentials, and verify login, scans, and service health.
---

# Install and operate Promptfoo Enterprise On-Prem

Use the Enterprise images and deployment files supplied by your Promptfoo contact. The [open-source self-hosted server](/docs/usage/self-hosting/) is a different product and does not provide Enterprise authentication or team management.

The supplied Compose stack runs Promptfoo, FusionAuth, and PostgreSQL 16, with separate `promptfoo` and `fusionauth` databases. An external PostgreSQL service is also supported through the packaged external-database configuration. Use the database requirements and configuration delivered with your release.

In the supplied Compose and Helm deployments, the scan runner is bundled with the Promptfoo service. Server scans start worker processes inside the Promptfoo container or pod; no separate runner image is required. Give that container or pod network access to your targets and inference providers, and verify execution with a small [server scan](./red-teams.md#running-a-scan).

## Before installing

- Obtain your license, customer registry credentials, and bootstrap script from Promptfoo.
- Install Docker Engine with the Compose plugin, Bash, and OpenSSL for the Compose installation.
- Prepare application and authentication hostnames, DNS, and TLS for access beyond localhost.
- Make model credentials and network access available for the inference providers and targets you intend to use.

## Install with Docker Compose

1. Make `LICENSE_KEY` and `PROMPTFOO_REGISTRY_PASSWORD` available as environment variables through your secret-management workflow. If using deployment-level OpenAI credentials, also provide `OPENAI_API_KEY`.
2. For custom hostnames, set the [application URLs](#application-urls) first. Run the supplied script from the directory where you want the installation created:

   ```bash
   bash ./promptfoo-bootstrap.sh
   ```

   The current bootstrap pulls the supplied `promptfoo:stable` and `promptfoo-auth:stable` images, extracts their deployment files, and runs `install.sh`. It creates `promptfoo-onprem` by default; `PROMPTFOO_INSTALL_DIR` selects another location. It refuses to overwrite an existing directory.

3. Open the application URL printed by the installer. Sign in with the initial administrator credentials provided with the deployment, change the initial password, and configure users or your identity provider.
4. From the generated installation directory, check the services and the application health endpoint:

   ```bash
   docker compose ps
   curl -fsS http://localhost:3000/health
   ```

   Use your configured application URL when it differs from the local default. A healthy endpoint does not prove that model credentials or target connectivity work: complete an actual login and a small scan too.

## Application URLs

For custom hostnames, explicitly set all three browser-facing URLs before running the bootstrap, and configure DNS and TLS for those addresses:

```bash
export DOMAIN=promptfoo.example.com
export APP_URL=https://promptfoo.example.com
export API_URL=https://promptfoo.example.com
export FUSIONAUTH_APP_URL=https://auth.promptfoo.example.com
```

Setting `DOMAIN` alone does not replace existing URL values in the supplied configuration. Explicit URL environment variables take precedence.

| Setting                       | Purpose                                         | Local Compose default    |
| ----------------------------- | ----------------------------------------------- | ------------------------ |
| `APP_URL` / `API_URL`         | Browser-facing application and API              | `http://localhost:3000`  |
| `FUSIONAUTH_APP_URL`          | Browser-facing sign-in service                  | `http://localhost:9011`  |
| `FUSIONAUTH_API_URL`          | Promptfoo's server-to-server authentication API | `http://fusionauth:9011` |
| `FUSIONAUTH_INTERNAL_APP_URL` | Container-network URL used by FusionAuth        | `http://fusionauth:9011` |

Keep internal service addresses reachable within the container network. A browser-facing localhost URL is not a substitute for an internal service address. The installer saves configuration in `.env`; retain it securely with your deployment configuration.

## Configure inference

In **Organization → Global Providers**, configure the **Red Team Provider** used for attacks, generation, and grading. Separate **Test Generation Provider** and **Grading Provider** settings override it for those roles. An enabled team provider override can replace the primary provider for that team. If no provider setting is configured, deployment-level OpenAI credentials can supply the defaults.

Target credentials connect to the application being tested; they do not configure the generation or grading models. See [OpenAI connection settings](/docs/providers/openai/#connection-settings) and [running red teams](./red-teams.md).

For restricted networks, account for the registry, database, identity provider, model endpoints, and target endpoints used by your configuration. Mirroring container images alone does not make model inference offline. Use the supplied deployment guidance and [data-handling reference](/docs/red-team/troubleshooting/data-handling/) to review the features you enable.

## Kubernetes and secrets

Use the `promptfoo-enterprise-helm` chart extracted with your release and its packaged README and example values. The chart deploys the application and authentication services; provide PostgreSQL, registry pull credentials, and browser-facing routing/TLS for your cluster.

Use existing Kubernetes Secrets for credentials. The chart supports `promptfooServer.licenseKeySecret` and `promptfooServer.openaiApiKeySecret`. Versions with mounted-configuration support also accept `promptfooServer.envFileSecret` and `promptfooAuth.configFileSecret`; follow the packaged `values-example-mounted-secrets.yaml` and FusionAuth properties example instead of mixing file mode with secret-valued environment settings.

Render the configuration before applying it:

```bash
helm lint ./promptfoo-enterprise-helm --values ./deployment-values.yaml
helm template promptfoo ./promptfoo-enterprise-helm --namespace promptfoo \
  --values ./deployment-values.yaml
```

Keep secret values out of committed values files and `--set` arguments. Mounted server dotenv values still enter the application's process environment. Both services read configuration at startup, so restart the affected Deployment after rotating a mounted Secret; changing the Secret alone does not reload the application.

## API reference

Use the [interactive API reference](/docs/api-reference/) or the [public OpenAPI specification](https://api.promptfoo.app/static/openapi.json) for endpoint schemas. Your on-prem API also serves its bundled specification at `/static/openapi.json`, for example `https://promptfoo.example.com/static/openapi.json`. Prefer that copy when your installed release differs from the public reference.

Global provider configuration is documented under **Server Settings**; see **Get an on-prem server setting** and **Update an on-prem server setting** for the supported keys and value schemas.

## Upgrades and recovery

- Record the application and authentication image digests and retain the deployment files and configuration for that release. Confirm the supported image pair and migration instructions before upgrading.
- Back up both databases and preserve the configuration and secrets needed to restore them. The bundled Compose database uses the `postgres_data` named volume; application logs use `promptfoo_logs`. Include any separately configured storage in your recovery plan.
- Test upgrades and an isolated restore with your database administrator before changing production. Restoring only the Promptfoo database does not restore FusionAuth users and identity configuration. An image rollback alone does not reverse database migrations.
- For existing installations, follow the release's upgrade instructions rather than rerunning the fresh-install bootstrap over the installation directory. When changing Helm configuration modes, use a complete values file and follow the packaged guidance about retained values and secret rotation.
- After a change, verify `/health`, browser sign-in, and a small scan. Confirm the callback and shared-secret requirements in the packaged login-onboarding guide before a rolling authentication upgrade.

## Troubleshooting

| Symptom                      | Check                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| Image pull denied            | Customer registry credentials, their expiry, and access to both supplied images                |
| Sign-in or origin errors     | Browser-facing URLs, DNS/TLS, and the internal application/authentication network paths        |
| `/health` returns 503        | Service logs and FusionAuth login-onboarding readiness; a container being up is not sufficient |
| Scan fails during generation | Effective generation provider, model credentials, and outbound connectivity                    |

Use `docker compose logs --tail=100 promptfoo fusionauth` for initial Compose diagnostics. When contacting support, include the image versions, failed step, and relevant redacted logs; omit credentials and sensitive target responses.
