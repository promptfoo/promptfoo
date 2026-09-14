# Codex connection settings

Use values copied from the deployment, not this illustrative template. The
OAuth client ID is public; it is not a client secret. The callback belongs to
the user's Codex client and must already be registered by the administrator.

```toml
[mcp_servers.promptfoo-enterprise]
url = "https://promptfoo.example.com/api/v1/mcp"

[mcp_servers.promptfoo-enterprise.oauth]
client_id = "<deployment-provided-public-client-id>"
callback_url = "<deployment-provided-exact-callback-url>"
callback_port = 31337 # Use the deployment-provided port, not this default.
```

The initial team-listing integration uses:

```bash
codex mcp login promptfoo-enterprise --scopes openid,offline_access
```

Use the scopes supplied by the deployment if they differ; never invent broader
access. `offline_access` allows Codex to refresh its credentials. Promptfoo CLI
login and browser cookies do not authenticate this MCP connection. Current deployments
reuse the existing Promptfoo FusionAuth application and registration; no extra signup
or custom OAuth scope is required. Always use the client ID supplied by the deployment.

## Troubleshooting

| Symptom                                                                   | Next step                                                                                                                                                                             |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Only a deployment URL was supplied                                        | Ask for the public client ID, registered callback, port, and scopes from Coding Agent Setup or the administrator. Do not assume dynamic client registration is available.             |
| No Coding Agent Setup menu or MCP endpoint                                | Confirm that this deployment supports and enables Enterprise MCP. Installing the plugin cannot enable the server feature.                                                             |
| Invalid client, redirect mismatch, or application setup required          | Ask the administrator to verify the shared Promptfoo application's MCP configuration and exact registered callback. Do not substitute another client ID or relax redirect validation. |
| Callback port already in use                                              | Identify the listener without exposing its environment. Ask the user to free the port or have the administrator supply a newly registered callback.                                   |
| Login succeeds but the tool returns an authentication or permission error | Check the selected server and deployment. Ask the administrator to verify the user's MCP access; do not substitute a privileged token.                                                |
| MCP tools are unavailable in the current task                             | Reload the connection or use a new task. Report verification as pending until `list_teams` succeeds on `promptfoo-enterprise`.                                                        |
| Another `promptfoo` server exists                                         | Leave it unchanged. This integration uses the separate `promptfoo-enterprise` name.                                                                                                   |

For Codex configuration and OAuth behavior, consult the current
[Codex MCP documentation](https://developers.openai.com/codex/mcp).
